"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import type { MappingConfig } from "@/lib/import/types";
import { isHouseholdRestricted, requireAdvisor } from "@/server/auth/dal";
import { recategorizeTransaction } from "@/server/categorization";
import * as clients from "@/server/clients";
import { UnsupportedFileError } from "@/server/import/adapters";
import { commitImport, createPreview, undoImport, uploadStatement } from "@/server/import/service";
import { closeMonth } from "@/server/months";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import * as invest from "@/server/invest/service";
import * as debt from "@/server/debt/service";
import * as plan from "@/server/plan/service";
import * as reports from "@/server/reports/service";
import { parseAmount } from "@/lib/money";
import * as savings from "@/server/savings/service";
import { accountDetailsSchema, balanceSchema, recordBalance, updateAccountDetails } from "@/server/accounts";

/**
 * Advisor server actions for one household. Every action re-checks the advisor session
 * (requireAdvisor) — actions are public HTTP endpoints, never trust the page that rendered them.
 */
const hid = (f: FormData) => {
  const v = String(f.get("householdId") ?? "");
  if (!/^[a-z0-9]{20,40}$/.test(v)) throw new Error("bad household id");
  return v;
};
const obj = (f: FormData) => Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
const done = (householdId: string, message = "form.saved"): ActionState => {
  revalidatePath(`/advisor/clients/${householdId}`, "layout");
  return { ok: true, message };
};

async function run(f: FormData, fn: (householdId: string, user: Awaited<ReturnType<typeof requireAdvisor>>) => Promise<ActionState | void>): Promise<ActionState> {
  const user = await requireAdvisor();
  const householdId = hid(f);
  // A restricted household (privacy deletion request) accepts no processing at all.
  if (await isHouseholdRestricted(householdId)) return { error: "privacy.restrictedError" };
  try {
    return (await fn(householdId, user)) ?? done(householdId);
  } catch (e) {
    if (e instanceof UnsupportedFileError) return { error: `upload.errors.${e.code}` };
    if (e && typeof e === "object" && "digest" in e) throw e; // redirect()
    console.error(e);
    return { error: "form.error" };
  }
}

export async function updateProfileAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.profileSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await clients.updateProfile(u, h, v.data);
  });
}

export async function addMemberAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.memberSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await clients.addMember(u, h, v.data);
  });
}

export async function addIncomeAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.incomeSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await clients.addIncome(u, h, v.data);
  });
}

export async function addGoalAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.goalSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await clients.addGoal(u, h, v.data);
  });
}

export async function deleteRowAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const kind = String(f.get("kind"));
    if (kind !== "member" && kind !== "income" && kind !== "goal") return { error: "form.invalid" };
    await clients.deleteRow(u, h, kind, String(f.get("id")));
  });
}

export async function recordConsentAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const m = String(f.get("method"));
    if (m !== "SIGNED_FORM" && m !== "PORTAL_ACCEPTANCE" && m !== "RECORDED_VERBAL") return { error: "form.invalid" };
    await clients.recordConsent(u, h, m);
  });
}

export async function revokeConsentAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => clients.revokeConsent(u, h, String(f.get("consentId"))));
}

export async function createClientLoginAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.clientLoginSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    if (await db.user.findUnique({ where: { email: v.data.email } })) return { error: "form.invalid" };
    const r = await clients.createClientLogin(u, h, v.data);
    revalidatePath(`/advisor/clients/${h}`, "layout");
    return { ok: true, message: "profile.tempPassword", secret: `${r.email}  /  ${r.temporaryPassword}` };
  });
}

export async function addAccountAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.accountSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await clients.addAccount(u, h, v.data);
  });
}

export async function uploadAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "upload.errors.EMPTY" };
    await uploadStatement(u, h, file);
    return done(h, "upload.uploaded");
  });
}

const int = (v: FormDataEntryValue | null) => (v === null || v === "" ? undefined : Number(v));

/** Reads the wizard form into a MappingConfig (validated: indexes must be non-negative integers). */
function mappingFromForm(f: FormData): MappingConfig | null {
  const req = ["headerRowIndex", "dateColumn", "descriptionColumn"].map((k) => int(f.get(k)));
  if (req.some((v) => v === undefined || !Number.isInteger(v) || v! < 0)) return null;
  const mode = String(f.get("amountMode"));
  const amount: MappingConfig["amount"] | null =
    mode === "debitCredit"
      ? int(f.get("debitColumn")) !== undefined && int(f.get("creditColumn")) !== undefined
        ? { mode: "debitCredit", debitColumn: int(f.get("debitColumn"))!, creditColumn: int(f.get("creditColumn"))! }
        : null
      : int(f.get("amountColumn")) !== undefined
        ? { mode: "single", column: int(f.get("amountColumn"))!, negate: f.get("negate") === "on" }
        : null;
  if (!amount) return null;
  const fmt = String(f.get("dateFormat"));
  if (!["DD/MM/YYYY", "DD/MM/YY", "YYYY-MM-DD", "MM/DD/YYYY"].includes(fmt)) return null;
  const opt = (k: string) => (int(f.get(k)) !== undefined ? { [k]: int(f.get(k)) } : {});
  const skip = String(f.get("skipDescriptionsContaining") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    headerRowIndex: req[0]!,
    dateColumn: req[1]!,
    descriptionColumn: req[2]!,
    dateFormat: fmt as MappingConfig["dateFormat"],
    amount,
    ...opt("chargeDateColumn"),
    ...opt("installmentColumn"),
    ...opt("originalAmountColumn"),
    ...opt("originalCurrencyColumn"),
    ...(skip.length ? { skipDescriptionsContaining: skip } : {}),
  };
}

export async function previewImportAction(_p: ActionState, f: FormData) {
  let target = "";
  const r = await run(f, async (h, u) => {
    if (!(await clients.hasActiveConsent(h))) return { error: "upload.consentRequired" };
    const mapping = mappingFromForm(f);
    if (!mapping) return { error: "form.invalid" };
    const res = await createPreview(u, {
      householdId: h,
      accountId: String(f.get("accountId")),
      fileId: String(f.get("fileId")),
      sheetIndex: Number(f.get("sheetIndex") ?? 0),
      mapping,
      saveMapping: f.get("saveMapping") === "on",
    });
    target = `/advisor/clients/${h}/import/batch/${res.batchId}`;
  });
  if (target) redirect(target);
  return r;
}

export async function commitImportAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const r = await commitImport(u, h, String(f.get("batchId")));
    revalidatePath(`/advisor/clients/${h}`, "layout");
    return { ok: true, message: "preview.committed", values: { count: r.imported } };
  });
}

export async function undoImportAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    await undoImport(u, h, String(f.get("batchId")));
  });
}

export async function recategorizeAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const r = await recategorizeTransaction({
      householdId: h,
      transactionId: String(f.get("transactionId")),
      categoryId: String(f.get("categoryId")),
      applyToSimilar: f.get("applySimilar") === "on",
    });
    await audit({ action: "UPDATE", actorUserId: u.id, actorRole: u.role, entityType: "Transaction.category", entityId: String(f.get("transactionId")), householdId: h, metadata: { categoryId: String(f.get("categoryId")), learned: f.get("applySimilar") === "on", updatedOthers: r.updatedOthers } });
    revalidatePath(`/advisor/clients/${h}`, "layout");
    return { ok: true, message: "txn.updated", values: { count: r.updatedOthers } };
  });
}

export async function closeMonthAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    await closeMonth(u, h, String(f.get("period")));
  });
}

export async function setBudgetAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.budgetSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await clients.setBudget(u, h, v.data);
  });
}

export async function addNoteAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.noteSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await clients.addNote(u, h, v.data);
  });
}

export async function addTaskAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = clients.taskSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await clients.addTask(u, h, v.data);
  });
}

export async function setTaskStatusAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const s = String(f.get("status"));
    if (!["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].includes(s)) return { error: "form.invalid" };
    await clients.setTaskStatus(u, h, String(f.get("taskId")), s as "OPEN");
  });
}

// ── Phase 2: accounts details, balances, long-term savings ──────────────────

export async function accountDetailsAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = accountDetailsSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await updateAccountDetails(u, h, String(f.get("accountId")), v.data);
  });
}

export async function recordBalanceAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = balanceSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await recordBalance(u, h, String(f.get("accountId")), v.data);
  });
}

export async function saveProductAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = savings.productSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await savings.saveProduct(u, h, v.data, String(f.get("productId") ?? "") || undefined);
  });
}

export async function deleteProductAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => savings.deleteProduct(u, h, String(f.get("productId"))));
}

export async function saveAssumptionsAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = savings.assumptionsSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await savings.saveAssumptions(u, h, v.data);
  });
}

export async function importProductsAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u): Promise<ActionState> => {
    const file = f.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "upload.errors.EMPTY" };
    const r = await savings.importProductReport(u, h, file);
    if (r.issues.length) return { error: "savings.importIssues", values: { rows: r.issues.map((i) => `${i.row}:${i.field}`).slice(0, 10).join(", ") } };
    revalidatePath(`/advisor/clients/${h}`, "layout");
    return { ok: true, message: "savings.imported", values: { count: r.created } };
  });
}

// ── Phase 3b: investments ───────────────────────────────────────────────────

export async function savePropertyAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = invest.propertySchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await invest.saveProperty(u, h, v.data, String(f.get("propertyId") ?? "") || undefined);
  });
}

export async function deleteInvestAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const kind = String(f.get("kind"));
    if (!["property", "account", "deposit", "txn"].includes(kind)) return { error: "form.invalid" };
    await invest.deleteEntity(u, h, kind as "property", String(f.get("id")));
  });
}

export async function savePortfolioAccountAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u): Promise<ActionState> => {
    const v = invest.accountSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    const r = await invest.saveAccount(u, h, v.data, String(f.get("accountId") ?? "") || undefined);
    if (!r.ok) return { error: "invest.errors.target_sum" };
    revalidatePath(`/advisor/clients/${h}`, "layout");
    return { ok: true, message: "form.saved" };
  });
}

export async function addHoldingAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = invest.holdingSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await invest.addHolding(u, h, String(f.get("accountId")), v.data);
  });
}

export async function addPortfolioTxnAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = invest.txnSchema.safeParse(obj(f));
    if (!v.success) return { error: v.error.issues.some((i) => i.message === "holding_and_units_required") ? "invest.errors.holding_and_units" : "form.invalid" };
    await invest.addTxn(u, h, String(f.get("accountId")), v.data);
  });
}

export async function addValuationsAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const asOf = String(f.get("asOf") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return { error: "form.invalid" };
    const values: { holdingId: string; value: bigint }[] = [];
    for (const [k, v] of f.entries()) {
      if (!k.startsWith("val_") || !String(v).trim()) continue;
      try {
        values.push({ holdingId: k.slice(4), value: parseAmount(String(v)) });
      } catch {
        return { error: "form.invalid" };
      }
    }
    await invest.addValuations(u, h, String(f.get("accountId")), new Date(`${asOf}T00:00:00Z`), values);
  });
}

export async function saveDepositAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = invest.depositSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await invest.saveDeposit(u, h, v.data, String(f.get("depositId") ?? "") || undefined);
  });
}

// ── Phase 4: mortgage & debt, action plan, reports ──────────────────────────

export async function saveMortgageAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = debt.mortgageSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await debt.saveMortgage(u, h, v.data);
  });
}

export async function addTrackAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = debt.trackSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await debt.addTrack(u, h, String(f.get("mortgageId")), v.data);
  });
}

export async function saveLoanAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const v = debt.loanSchema.safeParse(obj(f));
    if (!v.success) return { error: "form.invalid" };
    await debt.saveLoan(u, h, v.data);
  });
}

export async function deleteDebtAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const kind = String(f.get("kind"));
    if (!["mortgage", "track", "loan"].includes(kind)) return { error: "form.invalid" };
    await debt.deleteDebtEntity(u, h, kind as "loan", String(f.get("id")));
  });
}

export async function regeneratePlanAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u): Promise<ActionState> => {
    const r = await plan.regeneratePlan(u, h);
    revalidatePath(`/advisor/clients/${h}`, "layout");
    return { ok: true, message: "plan.regenerated", values: { count: r.count } };
  });
}

export async function updateRecommendationAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => {
    const status = String(f.get("status") ?? "");
    const move = String(f.get("move") ?? "");
    const hasText = f.has("customTitle");
    await plan.updateRecommendation(u, h, String(f.get("recId")), {
      status: ["PROPOSED", "APPROVED", "IN_PROGRESS", "DONE", "DISMISSED"].includes(status) ? (status as "APPROVED") : undefined,
      move: move === "up" || move === "down" ? move : undefined,
      customTitle: hasText ? String(f.get("customTitle")).trim().slice(0, 200) || null : undefined,
      advisorNote: f.has("advisorNote") ? String(f.get("advisorNote")).trim().slice(0, 1000) || null : undefined,
    });
  });
}

export async function generateReportAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u): Promise<ActionState> => {
    const kind = String(f.get("type"));
    const locale = String(f.get("locale"));
    if ((kind !== "MONTHLY" && kind !== "FULL_REVIEW") || (locale !== "he" && locale !== "ar")) return { error: "form.invalid" };
    const period = String(f.get("period") ?? "") || null;
    try {
      await reports.generateReport(u, h, kind, locale, period && /^\d{4}-\d{2}$/.test(period) ? period : null);
    } catch (e) {
      console.error(e);
      return { error: "reports.error", values: { error: e instanceof Error ? e.message.slice(0, 120) : "?" } };
    }
    revalidatePath(`/advisor/clients/${h}/reports`);
    return { ok: true, message: "reports.generated" };
  });
}

export async function releaseReportAction(_p: ActionState, f: FormData) {
  return run(f, async (h, u) => reports.releaseReport(u, h, String(f.get("reportId"))));
}

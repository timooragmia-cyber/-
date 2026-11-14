import "server-only";
import JSZip from "jszip";
import { z } from "zod";
import { purgeEligibility, requestDueAt, type PurgeEligibility } from "@/lib/privacy/retention";
import { agorotToDecimal, toCsv, toExportJson, ymd } from "@/lib/privacy/serialize";
import { audit } from "@/server/audit";
import { assertHouseholdAccess, type CurrentUser } from "@/server/auth/dal";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { db } from "@/server/db";
import { deleteStored, readDecrypted } from "@/server/storage";

/**
 * Privacy module (Amendment 13 readiness): data-subject requests, export (right of access),
 * restriction and final purge. Every step is audited without copying personal data into the log.
 */

export type ExportScope = "client" | "full";

const RECOMMENDATION_CLIENT_STATUSES = ["APPROVED", "IN_PROGRESS", "DONE"] as const;

/** Never exported: credentials, secrets, internal storage paths, blind indexes. */
const SECRET_FIELDS = new Set(["passwordHash", "totpSecretEnc", "totpLastCounter", "nationalIdEnc", "nationalIdIndex", "storageKey", "dedupKey"]);
const strip = <T extends object>(rows: T[], extra: string[] = []): Partial<T>[] =>
  rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_FIELDS.has(k) && !extra.includes(k))) as Partial<T>);

const safeName = (s: string) => s.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) || "file";

/** Collects every row that belongs to the household. Client scope = what the client may see. */
async function collect(householdId: string, scope: ExportScope) {
  const h = { householdId };
  const client = scope === "client";
  const [household, users, members, incomeSources, goals, consents, accounts, balances, transactions, budgets, snapshots, products, productBalances, retirement,
    properties, portfolioAccounts, holdings, portfolioTxns, valuations, deposits, mortgages, tracks, loans, recommendations, actionItems, reports, files, privacyRequests] = await Promise.all([
    db.household.findUniqueOrThrow({ where: { id: householdId } }),
    db.user.findMany({ where: h, select: { id: true, email: true, role: true, displayName: true, locale: true, totpEnabledAt: true, lastLoginAt: true, createdAt: true } }),
    db.person.findMany({ where: h }),
    db.incomeSource.findMany({ where: h }),
    db.goal.findMany({ where: h }),
    db.consent.findMany({ where: h }),
    db.financialAccount.findMany({ where: h }),
    db.balanceSnapshot.findMany({ where: { account: h } }),
    db.transaction.findMany({ where: h, orderBy: { date: "asc" }, include: { category: { select: { key: true, nameHe: true, nameAr: true } }, account: { select: { nickname: true, last4: true } } } }),
    db.budget.findMany({ where: h }),
    db.monthlySnapshot.findMany({ where: h, orderBy: [{ period: "asc" }, { version: "asc" }] }),
    db.longTermProduct.findMany({ where: h }),
    db.productBalance.findMany({ where: { product: h } }),
    db.retirementAssumptions.findMany({ where: h }),
    db.property.findMany({ where: h }),
    db.portfolioAccount.findMany({ where: h }),
    db.portfolioHolding.findMany({ where: { account: h } }),
    db.portfolioTxn.findMany({ where: { account: h } }),
    db.holdingValuation.findMany({ where: { holding: { account: h } } }),
    db.savingsDeposit.findMany({ where: h }),
    db.mortgage.findMany({ where: h }),
    db.mortgageTrack.findMany({ where: { mortgage: h } }),
    db.loan.findMany({ where: h }),
    db.recommendation.findMany({ where: client ? { ...h, status: { in: [...RECOMMENDATION_CLIENT_STATUSES] } } : h, orderBy: { priority: "asc" } }),
    db.actionItem.findMany({ where: client ? { ...h, visibleToClient: true } : h }),
    db.report.findMany({ where: client ? { ...h, releasedAt: { not: null } } : h, orderBy: { createdAt: "asc" } }),
    db.uploadedFile.findMany({ where: h, orderBy: { createdAt: "asc" } }),
    db.privacyRequest.findMany({ where: h, orderBy: { receivedAt: "asc" } }),
  ]);
  // Advisor-internal working material: only in the full (advisor) export.
  const internal = client
    ? null
    : await Promise.all([
        db.advisorNote.findMany({ where: h }),
        db.calculationRun.findMany({ where: h }),
        db.importBatch.findMany({ where: h }),
        db.importMapping.findMany({ where: h }),
        db.categorizationRule.findMany({ where: h }),
        db.auditLog.findMany({ where: h, orderBy: { at: "asc" } }),
      ]);

  const data = {
    exportedAt: new Date().toISOString(),
    scope,
    household: strip([household])[0],
    users,
    members: strip(members),
    incomeSources,
    goals,
    consents,
    accounts,
    accountBalances: balances,
    budgets,
    monthlySnapshots: snapshots,
    longTermProducts: products,
    productBalances,
    retirementAssumptions: retirement,
    properties,
    portfolioAccounts,
    portfolioHoldings: holdings,
    portfolioTransactions: portfolioTxns,
    holdingValuations: valuations,
    deposits,
    mortgages,
    mortgageTracks: tracks,
    loans,
    recommendations: strip(recommendations, client ? ["advisorNote", "engineVersion", "dedupKey"] : []),
    tasks: actionItems,
    reports: strip(reports),
    uploadedFiles: strip(files),
    privacyRequests,
    ...(internal
      ? {
          advisorNotes: internal[0],
          calculationRuns: internal[1],
          importBatches: internal[2],
          importMappings: internal[3],
          categorizationRules: internal[4],
          auditLog: internal[5],
        }
      : {}),
  };
  return { data, transactions, reports, files, household };
}

const README = {
  he: `ייצוא מידע אישי — T.A Mortgages

data.json — כל המידע השמור על משק הבית (סכומים באגורות, תאריכים בפורמט ISO).
transactions.csv — תנועות החשבון והכרטיסים (נפתח באקסל).
files/ — הקבצים המקוריים שהועלו.
reports/ — דוחות PDF.

לא נכללים: סיסמאות, סודות אימות דו-שלבי ונתיבי אחסון פנימיים.
`,
  ar: `تصدير المعلومات الشخصية — T.A Mortgages

data.json — جميع المعلومات المحفوظة عن الأسرة (المبالغ بالأغورات، التواريخ بصيغة ISO).
transactions.csv — حركات الحساب والبطاقات (يُفتح في Excel).
files/ — الملفات الأصلية التي تم رفعها.
reports/ — تقارير PDF.

لا يشمل: كلمات المرور، أسرار التحقق بخطوتين ومسارات التخزين الداخلية.
`,
};

/**
 * Right of access: a ZIP of everything held about the household.
 * Client → own household, "client" scope. Advisor → "full" scope, also while restricted
 * (answering an access request is allowed during restriction).
 */
export async function exportHousehold(user: CurrentUser, householdId: string): Promise<{ filename: string; bytes: Uint8Array }> {
  const scope: ExportScope = user.role === "ADVISOR" ? "full" : "client";
  await assertHouseholdAccess(user, householdId, { allowRestricted: user.role === "ADVISOR" });
  const { data, transactions, reports, files, household } = await collect(householdId, scope);
  const zip = new JSZip();
  zip.file("README.txt", household.preferredLocale === "ar" ? README.ar + "\n" + README.he : README.he + "\n" + README.ar);
  zip.file("data.json", toExportJson(data));
  zip.file(
    "transactions.csv",
    toCsv(
      ["date", "charge_date", "account", "description", "amount_ils", "original_amount", "currency", "category", "installment", "transfer", "note"],
      transactions.map((t) => [
        ymd(t.date), ymd(t.chargeDate), `${t.account.nickname}${t.account.last4 ? ` ${t.account.last4}` : ""}`, t.description, agorotToDecimal(t.amount),
        t.originalAmount !== null ? agorotToDecimal(t.originalAmount) : "", t.originalCurrency ?? "",
        t.category ? (household.preferredLocale === "ar" ? t.category.nameAr : t.category.nameHe) : "",
        t.installmentTotal ? `${t.installmentNumber ?? ""}/${t.installmentTotal}` : "", t.isTransfer ? "1" : "", t.note ?? "",
      ]),
    ),
  );
  for (const f of files) {
    try {
      zip.file(`files/${f.createdAt.toISOString().slice(0, 10)}_${f.id.slice(-6)}_${safeName(f.originalName)}`, await readDecrypted(f.storageKey));
    } catch {
      zip.file(`files/MISSING_${f.id}.txt`, "The stored file could not be read.");
    }
  }
  for (const r of reports) {
    try {
      zip.file(`reports/${r.type.toLowerCase()}_${r.period ?? r.createdAt.toISOString().slice(0, 7)}_${r.locale}_${r.id.slice(-6)}.pdf`, await readDecrypted(r.storageKey));
    } catch {
      zip.file(`reports/MISSING_${r.id}.txt`, "The stored report could not be read.");
    }
  }
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  await audit({ action: "EXPORT", actorUserId: user.id, actorRole: user.role, entityType: "Household.privacyExport", householdId, metadata: { scope, files: files.length, reports: reports.length, transactions: transactions.length } });
  return { filename: `export_${ymd(new Date())}_${householdId.slice(-8)}.zip`, bytes };
}

// ── Data-subject requests ─────────────────────────────────────

export const requestSchema = z.object({
  type: z.enum(["ACCESS", "CORRECTION", "DELETION"]),
  details: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export async function createPrivacyRequest(user: CurrentUser, householdId: string, input: z.infer<typeof requestSchema>) {
  // The advisor may log a request (phone/letter) on a restricted file too.
  await assertHouseholdAccess(user, householdId, { allowRestricted: user.role === "ADVISOR" });
  const days = await getAdvisoryParameter<number>("privacy.request_response_days");
  const now = new Date();
  const r = await db.privacyRequest.create({
    data: { householdId, type: input.type, details: input.details, receivedAt: now, dueAt: requestDueAt(now, days), createdByUserId: user.id },
  });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "PrivacyRequest", entityId: r.id, householdId, metadata: { type: input.type } });
  return r;
}

export const resolveSchema = z.object({
  requestId: z.string().min(10).max(40),
  status: z.enum(["DONE", "REJECTED"]),
  resolution: z.string().trim().min(2).max(2000),
});

export async function resolvePrivacyRequest(user: CurrentUser, householdId: string, input: z.infer<typeof resolveSchema>) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await assertHouseholdAccess(user, householdId, { allowRestricted: true });
  const r = await db.privacyRequest.findFirstOrThrow({ where: { id: input.requestId, householdId, status: "OPEN" } });
  await db.privacyRequest.update({ where: { id: r.id }, data: { status: input.status, resolution: input.resolution, handledAt: new Date(), handledByUserId: user.id } });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "PrivacyRequest", entityId: r.id, householdId, metadata: { type: r.type, status: input.status } });
}

export async function listPrivacyRequests(user: CurrentUser, householdId: string) {
  await assertHouseholdAccess(user, householdId, { allowRestricted: user.role === "ADVISOR" });
  return db.privacyRequest.findMany({ where: { householdId }, orderBy: { receivedAt: "desc" } });
}

/** Open requests across all households, for the advisor dashboard (deadline tracking). */
export async function openPrivacyRequests(user: CurrentUser) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  return db.privacyRequest.findMany({ where: { status: "OPEN" }, orderBy: { dueAt: "asc" }, include: { household: { select: { displayName: true } } } });
}

// ── Restriction and purge ─────────────────────────────────────

export async function privacyStatus(user: CurrentUser, householdId: string, now = new Date()): Promise<{ displayName: string; restrictedAt: Date | null; restrictedReason: string | null; retentionYears: number | null; eligibility: PurgeEligibility }> {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await assertHouseholdAccess(user, householdId, { allowRestricted: true });
  const [h, years] = await Promise.all([
    db.household.findUniqueOrThrow({ where: { id: householdId }, select: { displayName: true, restrictedAt: true, restrictedReason: true } }),
    getAdvisoryParameter<number | null>("privacy.retention_years"),
  ]);
  return { ...h, retentionYears: years, eligibility: purgeEligibility(h.restrictedAt, years, now) };
}

export const restrictSchema = z.object({
  reason: z.string().trim().min(3).max(500),
  confirmName: z.string().trim(),
});

/** Immediately closes the file: no access for anyone, client logins disabled and signed out. */
export async function restrictHousehold(user: CurrentUser, householdId: string, input: z.infer<typeof restrictSchema>) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await assertHouseholdAccess(user, householdId, { allowRestricted: true });
  const h = await db.household.findUniqueOrThrow({ where: { id: householdId }, select: { displayName: true, restrictedAt: true } });
  if (h.restrictedAt) return;
  if (input.confirmName !== h.displayName.trim()) throw new PrivacyConfirmError();
  const clients = await db.user.findMany({ where: { householdId, role: "CLIENT" }, select: { id: true } });
  await db.$transaction([
    db.household.update({ where: { id: householdId }, data: { restrictedAt: new Date(), restrictedReason: input.reason } }),
    db.user.updateMany({ where: { householdId, role: "CLIENT" }, data: { isActive: false } }),
    db.session.deleteMany({ where: { userId: { in: clients.map((c) => c.id) } } }),
  ]);
  await audit({ action: "RESTRICT", actorUserId: user.id, actorRole: user.role, entityType: "Household", entityId: householdId, householdId, metadata: { clientLoginsDisabled: clients.length } });
}

export class PrivacyConfirmError extends Error {
  constructor() {
    super("Confirmation name does not match");
    this.name = "PrivacyConfirmError";
  }
}

/** Undo a restriction (e.g. the request was withdrawn). Client logins are re-enabled. */
export async function liftRestriction(user: CurrentUser, householdId: string) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await assertHouseholdAccess(user, householdId, { allowRestricted: true });
  await db.$transaction([
    db.household.update({ where: { id: householdId }, data: { restrictedAt: null, restrictedReason: null } }),
    db.user.updateMany({ where: { householdId, role: "CLIENT" }, data: { isActive: true } }),
  ]);
  await audit({ action: "UNRESTRICT", actorUserId: user.id, actorRole: user.role, entityType: "Household", entityId: householdId, householdId });
}

export class PurgeNotAllowedError extends Error {
  constructor(public readonly state: PurgeEligibility["state"]) {
    super(`Purge not allowed: ${state}`);
    this.name = "PurgeNotAllowedError";
  }
}

/**
 * Permanently deletes a restricted household whose retention period has passed: every row
 * (cascade; snapshots via the purge-only trigger bypass) and every stored file.
 * The audit log keeps only ids and counts.
 */
export async function purgeHousehold(actor: { userId: string | null; role: "ADVISOR" | null }, householdId: string, now = new Date()) {
  const [h, years] = await Promise.all([
    db.household.findUnique({ where: { id: householdId }, select: { restrictedAt: true } }),
    getAdvisoryParameter<number | null>("privacy.retention_years", now),
  ]);
  if (!h) return { purged: false as const };
  const e = purgeEligibility(h.restrictedAt, years, now);
  if (e.state !== "ELIGIBLE") throw new PurgeNotAllowedError(e.state);

  const [files, reports] = await Promise.all([
    db.uploadedFile.findMany({ where: { householdId }, select: { storageKey: true } }),
    db.report.findMany({ where: { householdId }, select: { storageKey: true } }),
  ]);
  const counts = await db.$transaction(async (tx) => {
    // Allows DELETE on the immutable monthly_snapshots table for this transaction only.
    await tx.$executeRawUnsafe("SET LOCAL app.allow_snapshot_purge = 'on'");
    const c = {
      transactions: await tx.transaction.count({ where: { householdId } }),
      snapshots: await tx.monthlySnapshot.count({ where: { householdId } }),
      users: await tx.user.count({ where: { householdId } }),
    };
    await tx.household.delete({ where: { id: householdId } });
    return c;
  });
  // Files after commit: a failed DB delete must not leave a household without its files.
  let fileErrors = 0;
  for (const { storageKey } of [...files, ...reports]) {
    try {
      await deleteStored(storageKey);
    } catch {
      fileErrors += 1;
    }
  }
  await audit({
    action: "PURGE",
    actorUserId: actor.userId,
    actorRole: actor.role,
    entityType: "Household",
    entityId: householdId,
    householdId,
    metadata: { ...counts, files: files.length, reports: reports.length, fileErrors, restrictedAt: h.restrictedAt!.toISOString(), retentionYears: years },
  });
  return { purged: true as const, ...counts, files: files.length + reports.length, fileErrors };
}

/** Scheduled job (npm run privacy:purge): purge every restricted household that is due. */
export async function purgeDueHouseholds(now = new Date()) {
  const years = await getAdvisoryParameter<number | null>("privacy.retention_years", now);
  const restricted = await db.household.findMany({ where: { restrictedAt: { not: null } }, select: { id: true, restrictedAt: true } });
  const due = restricted.filter((h) => purgeEligibility(h.restrictedAt, years, now).state === "ELIGIBLE");
  const results = [];
  for (const h of due) results.push({ id: h.id, ...(await purgeHousehold({ userId: null, role: null }, h.id, now)) });
  return { retentionYears: years, restricted: restricted.length, purged: results };
}

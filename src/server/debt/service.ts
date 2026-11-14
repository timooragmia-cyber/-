import "server-only";
import { z } from "zod";
import { mortgageSchedule, type RateScenario, type Track } from "@/lib/debt/amortization";
import { consolidate, optimizeMix, rankDebts, refinance, type Debt } from "@/lib/debt/strategies";
import { parseAmount, parsePercentToPpm } from "@/lib/money";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { db } from "@/server/db";

export type Scenarios = { baseInflationPpm: number; stress: RateScenario; falling: RateScenario };
export type BoiRate = { ratePpm: number; primeSpreadPpm: number; effectiveFrom: string; sourceUrl: string };

const toTrack = (t: { type: Track["type"]; method: Track["method"]; balance: bigint; remainingMonths: number; annualRatePpm: number; monthsToReset: number | null }): Track => ({
  type: t.type, method: t.method, balance: t.balance, remainingMonths: t.remainingMonths, annualRatePpm: t.annualRatePpm, monthsToReset: t.monthsToReset ?? undefined,
});

export async function debtOverview(user: CurrentUser, householdId: string) {
  await assertHouseholdAccess(user, householdId);
  const [mortgages, loans, banks, scenarios, boi, threshold] = await Promise.all([
    db.mortgage.findMany({ where: { householdId }, include: { tracks: true }, orderBy: { createdAt: "asc" } }),
    db.loan.findMany({ where: { householdId }, orderBy: { annualRatePpm: "desc" } }),
    db.financialAccount.findMany({ where: { householdId, kind: "BANK_ACCOUNT" }, include: { balances: { orderBy: { asOf: "desc" }, take: 1 } } }),
    getAdvisoryParameter<Scenarios>("mortgage.scenarios"),
    getAdvisoryParameter<BoiRate>("rates.bank_of_israel"),
    getAdvisoryParameter<number | null>("debt.expensive_threshold_ppm"),
  ]);
  const base: RateScenario = { primeDeltaPpm: 0, primeChangeAfter: 0, resetDeltaPpm: 0, inflationPpm: scenarios.baseInflationPpm };
  const mortgageViews = mortgages.map((m) => {
    const tracks = m.tracks.map(toTrack);
    return { mortgage: m, base: mortgageSchedule(tracks, base), stress: mortgageSchedule(tracks, scenarios.stress), falling: mortgageSchedule(tracks, scenarios.falling) };
  });
  // Overdrafts come from bank accounts (negative balance + configured overdraft rate) — no double entry.
  const overdrafts: Debt[] = banks
    .filter((b) => b.balances[0] && b.balances[0].balance < 0n && b.overdraftRatePpm)
    .map((b) => ({ id: `od:${b.id}`, label: b.nickname, kind: "OVERDRAFT" as const, balance: -b.balances[0]!.balance, annualRatePpm: b.overdraftRatePpm!, monthlyPayment: 0n, remainingMonths: null }));
  const debts: Debt[] = [
    ...overdrafts,
    ...loans.map((l) => ({ id: l.id, label: l.label, kind: l.kind, balance: l.balance, annualRatePpm: l.annualRatePpm, monthlyPayment: l.monthlyPayment, remainingMonths: l.remainingMonths })),
  ];
  await audit({ action: "VIEW", actorUserId: user.id, actorRole: user.role, entityType: "Debt", householdId });
  return { mortgages: mortgageViews, ranked: rankDebts(debts, threshold), debts, loans, scenarios, base, boi, threshold, primeToday: boi.ratePpm + boi.primeSpreadPpm };
}

// ── inputs ──
const money = (required = true) => z.string().trim().optional().transform((v, ctx) => {
  if (!v) { if (required) ctx.addIssue({ code: "custom", message: "required" }); return 0n; }
  try { const a = parseAmount(v); if (a < 0n) throw new Error(); return a; } catch { ctx.addIssue({ code: "custom", message: "amount" }); return z.NEVER; }
});
const pct = z.string().trim().transform((v, ctx) => {
  try { return parsePercentToPpm(v); } catch { ctx.addIssue({ code: "custom", message: "percent" }); return z.NEVER; }
});
const TRACKS = ["PRIME", "FIXED_UNLINKED", "FIXED_LINKED", "VARIABLE_5_UNLINKED", "VARIABLE_5_LINKED"] as const;

export const mortgageSchema = z.object({ lender: z.string().trim().min(1).max(80), asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), notes: z.string().trim().max(500).optional() });
export const trackSchema = z.object({
  type: z.enum(TRACKS), method: z.enum(["SPITZER", "EQUAL_PRINCIPAL"]), balance: money(), remainingMonths: z.coerce.number().int().min(1).max(480), annualRate: pct,
  monthsToReset: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(60).nullable()),
});
export const loanSchema = z.object({
  kind: z.enum(["CARD_CREDIT", "CONSUMER_LOAN", "CAR_LOAN", "OTHER"]), lender: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(120),
  balance: money(), annualRate: pct, monthlyPayment: money(false), remainingMonths: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(480).nullable()),
});

const guard = async (u: CurrentUser, h: string) => { if (u.role !== "ADVISOR") throw new Error("Advisor only"); await assertHouseholdAccess(u, h); };

export async function saveMortgage(u: CurrentUser, h: string, input: z.infer<typeof mortgageSchema>) {
  await guard(u, h);
  const m = await db.mortgage.create({ data: { householdId: h, lender: input.lender, asOf: new Date(`${input.asOf}T00:00:00Z`), notes: input.notes || null } });
  await audit({ action: "CREATE", actorUserId: u.id, actorRole: u.role, entityType: "Mortgage", entityId: m.id, householdId: h });
}
export async function addTrack(u: CurrentUser, h: string, mortgageId: string, t: z.infer<typeof trackSchema>) {
  await guard(u, h);
  const m = await db.mortgage.findFirstOrThrow({ where: { id: mortgageId, householdId: h } });
  await db.mortgageTrack.create({ data: { mortgageId: m.id, type: t.type, method: t.method, balance: t.balance, remainingMonths: t.remainingMonths, annualRatePpm: t.annualRate, monthsToReset: t.type.startsWith("VARIABLE_5") ? (t.monthsToReset ?? 60) : null } });
  await audit({ action: "CREATE", actorUserId: u.id, actorRole: u.role, entityType: "MortgageTrack", entityId: m.id, householdId: h });
}
export async function saveLoan(u: CurrentUser, h: string, l: z.infer<typeof loanSchema>) {
  await guard(u, h);
  const r = await db.loan.create({ data: { householdId: h, kind: l.kind, lender: l.lender, label: l.label, balance: l.balance, annualRatePpm: l.annualRate, monthlyPayment: l.monthlyPayment, remainingMonths: l.remainingMonths } });
  await audit({ action: "CREATE", actorUserId: u.id, actorRole: u.role, entityType: "Loan", entityId: r.id, householdId: h });
}
export async function deleteDebtEntity(u: CurrentUser, h: string, kind: "mortgage" | "track" | "loan", id: string) {
  await guard(u, h);
  if (kind === "mortgage") await db.mortgage.deleteMany({ where: { id, householdId: h } });
  if (kind === "track") await db.mortgageTrack.deleteMany({ where: { id, mortgage: { householdId: h } } });
  if (kind === "loan") await db.loan.deleteMany({ where: { id, householdId: h } });
  await audit({ action: "DELETE", actorUserId: u.id, actorRole: u.role, entityType: kind, entityId: id, householdId: h });
}

/** Refinance the whole mortgage into the advisor's proposed rates (same balances and terms unless changed). */
export async function refinanceSim(u: CurrentUser, h: string, mortgageId: string, proposedRates: Record<string, number>, newMonths: number | null, costs: { earlyRepaymentFee: bigint; openingCosts: bigint }) {
  await assertHouseholdAccess(u, h);
  const m = await db.mortgage.findFirstOrThrow({ where: { id: mortgageId, householdId: h }, include: { tracks: true } });
  const sc = await getAdvisoryParameter<Scenarios>("mortgage.scenarios");
  const current = m.tracks.map(toTrack);
  const proposed = current.map((t, i) => ({ ...t, annualRatePpm: proposedRates[m.tracks[i]!.id] ?? t.annualRatePpm, remainingMonths: newMonths ?? t.remainingMonths, monthsToReset: t.monthsToReset ? 60 : undefined }));
  return refinance(current, proposed, costs, { primeDeltaPpm: 0, primeChangeAfter: 0, resetDeltaPpm: 0, inflationPpm: sc.baseInflationPpm });
}

export async function optimizeSim(amount: bigint, months: number, rates: Record<(typeof TRACKS)[number], number>) {
  const [cons, sc] = await Promise.all([getAdvisoryParameter<{ minFixedPpm: number; maxVariablePpm: number }>("mortgage.mix_constraints"), getAdvisoryParameter<Scenarios>("mortgage.scenarios")]);
  return { result: optimizeMix(amount, months, rates, cons, { base: { primeDeltaPpm: 0, primeChangeAfter: 0, resetDeltaPpm: 0, inflationPpm: sc.baseInflationPpm }, stress: sc.stress, falling: sc.falling }), constraints: cons };
}

export async function consolidateSim(u: CurrentUser, h: string, debtIds: string[], loan: { annualRatePpm: number; months: number; fee: bigint }) {
  const o = await debtOverview(u, h);
  const picked = o.debts.filter((d) => debtIds.includes(d.id));
  return picked.length ? consolidate(picked, loan) : null;
}

import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { computeHealthScore, type HealthTargets, type HealthWeights } from "@/lib/analysis/health-score";
import { monthOverMonthHighlights } from "@/lib/analysis/highlights";
import { computeMonthClose, deserializeClose, serializeClose, type CloseCategory, type MonthCloseResult } from "@/lib/analysis/month-close";
import { detectRecurring, installmentBurden } from "@/lib/analysis/recurring";
import { addMonths, isPeriod } from "@/lib/domain/period";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal-guards";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { db } from "@/server/db";

/**
 * Period attribution: a transaction belongs to the month of its chargeDate when present
 * (credit cards: the month the money actually left the bank), otherwise its date.
 */
function periodBounds(period: string) {
  if (!isPeriod(period)) throw new Error("Invalid period");
  const start = new Date(`${period}-01T00:00:00Z`);
  const end = new Date(`${addMonths(period, 1)}-01T00:00:00Z`);
  return { start, end };
}

export function periodWhere(householdId: string, from: string, toInclusive: string): Prisma.TransactionWhereInput {
  const start = periodBounds(from).start;
  const end = periodBounds(toInclusive).end;
  return {
    householdId,
    OR: [
      { chargeDate: { gte: start, lt: end } },
      { chargeDate: null, date: { gte: start, lt: end } },
    ],
  };
}

export const attributionDate = (t: { date: Date; chargeDate: Date | null }) => (t.chargeDate ?? t.date).toISOString().slice(0, 10);

export async function loadCategories(): Promise<Map<string, CloseCategory & { nameHe: string; nameAr: string }>> {
  const cats = await db.category.findMany({ orderBy: { sortOrder: "asc" } });
  return new Map(cats.map((c) => [c.id, { id: c.id, key: c.key, kind: c.kind, nature: c.nature, nameHe: c.nameHe, nameAr: c.nameAr }]));
}

async function budgetsFor(householdId: string, period: string): Promise<Map<string, bigint>> {
  const rows = await db.budget.findMany({ where: { householdId, effectiveFrom: { lte: period } }, orderBy: { effectiveFrom: "desc" } });
  const m = new Map<string, bigint>();
  for (const b of rows) if (!m.has(b.categoryId)) m.set(b.categoryId, b.monthlyAmount);
  for (const [k, v] of m) if (v <= 0n) m.delete(k);
  return m;
}

export async function computeLiveClose(householdId: string, period: string): Promise<MonthCloseResult> {
  const [txns, categories, budgets] = await Promise.all([
    db.transaction.findMany({ where: periodWhere(householdId, period, period), include: { account: { select: { kind: true } } } }),
    loadCategories(),
    budgetsFor(householdId, period),
  ]);
  return computeMonthClose(
    period,
    txns.map((t) => ({ id: t.id, amount: t.amount, categoryId: t.categoryId, isTransfer: t.isTransfer, accountKind: t.account.kind })),
    categories,
    budgets,
  );
}

/** Close a month: writes a NEW immutable snapshot version (re-closing never edits history). */
export async function closeMonth(user: CurrentUser, householdId: string, period: string) {
  assertHouseholdAccess(user, householdId);
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const result = await computeLiveClose(householdId, period);
  if (result.transactionCount === 0) throw new Error("NO_TRANSACTIONS");
  const payload = serializeClose(result);
  const last = await db.monthlySnapshot.findFirst({ where: { householdId, period }, orderBy: { version: "desc" } });
  const snap = await db.monthlySnapshot.create({
    data: {
      householdId,
      period,
      version: (last?.version ?? 0) + 1,
      totalIncome: result.totalIncome,
      totalExpenses: result.totalExpenses,
      surplus: result.surplus,
      savingsRatePpm: result.savingsRatePpm ?? 0,
      payload: payload as Prisma.InputJsonValue,
      calcVersion: result.calcVersion,
      contentSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      closedByUserId: user.id,
    },
  });
  await db.household.update({ where: { id: householdId }, data: { status: "ACTIVE" } });
  await audit({ action: "MONTH_CLOSE", actorUserId: user.id, actorRole: user.role, entityType: "MonthlySnapshot", entityId: snap.id, householdId, metadata: { period, version: snap.version } });
  return snap;
}

export type ClosedMonth = { period: string; version: number; closedAt: Date; result: MonthCloseResult | null; totals: { income: bigint; expenses: bigint; surplus: bigint; savingsRatePpm: number } };

/** Latest version per period, newest first. `result` is null for legacy/seed payloads. */
export async function getClosedMonths(householdId: string, limit = 24): Promise<ClosedMonth[]> {
  const snaps = await db.monthlySnapshot.findMany({ where: { householdId }, orderBy: [{ period: "desc" }, { version: "desc" }] });
  const seen = new Set<string>();
  const out: ClosedMonth[] = [];
  for (const s of snaps) {
    if (seen.has(s.period)) continue;
    seen.add(s.period);
    out.push({
      period: s.period,
      version: s.version,
      closedAt: s.closedAt,
      result: deserializeClose(s.payload as Record<string, unknown>),
      totals: { income: s.totalIncome, expenses: s.totalExpenses, surplus: s.surplus, savingsRatePpm: s.savingsRatePpm },
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Periods that have transactions (for the month picker), newest first. */
export async function periodsWithData(householdId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ p: string }[]>`
    SELECT DISTINCT to_char(coalesce("chargeDate","date"), 'YYYY-MM') AS p
    FROM transactions WHERE "householdId" = ${householdId} ORDER BY p DESC LIMIT 36`;
  return rows.map((r) => r.p);
}

const avg = (vals: number[]) => (vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null);

export async function householdInsights(householdId: string) {
  const [closed, recurringParams, highlightParams, weights, targets] = await Promise.all([
    getClosedMonths(householdId, 12),
    getAdvisoryParameter<{ minMonths: number; tolerancePpm: number; lookbackMonths: number }>("recurring.detection"),
    getAdvisoryParameter<{ minChangePpm: number; minChangeAgorot: number; max: number }>("highlights.thresholds"),
    getAdvisoryParameter<HealthWeights>("health_score.weights"),
    getAdvisoryParameter<HealthTargets>("health_score.targets"),
  ]);

  const latestPeriod = (await periodsWithData(householdId))[0] ?? closed[0]?.period;
  let recurring: ReturnType<typeof detectRecurring> = [];
  let installments: ReturnType<typeof installmentBurden> = { plans: [], totalRemaining: 0n };
  if (latestPeriod) {
    const txns = await db.transaction.findMany({
      where: periodWhere(householdId, addMonths(latestPeriod, -(recurringParams.lookbackMonths - 1)), latestPeriod),
      include: { category: { select: { key: true } } },
    });
    const rows = txns.map((t) => ({
      date: attributionDate(t),
      amount: t.amount,
      description: t.description,
      categoryKey: t.category?.key ?? null,
      installmentTotal: t.installmentTotal,
      installmentNumber: t.installmentNumber,
    }));
    recurring = detectRecurring(rows, recurringParams);
    installments = installmentBurden(rows);
  }

  const [cur, prev] = closed;
  const highlights = cur?.result && prev?.result && prev.period === addMonths(cur.period, -1) ? monthOverMonthHighlights(cur.result, prev.result, highlightParams) : [];

  const last3 = closed.slice(0, 3);
  // Emergency fund = liquid money ÷ average monthly expenses (last 3 closed months).
  // Liquid = positive bank balances + money-market funds (daily liquidity) + deposits that
  // mature within 90 days (or have no fixed maturity).
  const avgExpenses = last3.length ? last3.reduce((s, m) => s + m.totals.expenses, 0n) / BigInt(last3.length) : 0n;
  const [banks, deposits] = await Promise.all([
    db.financialAccount.findMany({ where: { householdId, kind: "BANK_ACCOUNT" }, include: { balances: { orderBy: { asOf: "desc" }, take: 1 } } }),
    db.savingsDeposit.findMany({ where: { householdId } }),
  ]);
  const soon = new Date(Date.now() + 90 * 86_400_000);
  const withBal = banks.filter((b) => b.balances[0]);
  const liquidDeposits = deposits.filter((d) => d.kind === "MONEY_MARKET_FUND" || d.maturityDate === null || d.maturityDate <= soon);
  const liquid =
    withBal.reduce((s, b) => s + (b.balances[0]!.balance > 0n ? b.balances[0]!.balance : 0n), 0n) +
    liquidDeposits.reduce((s, d) => s + d.balance, 0n);
  const emergencyFundMonths = (withBal.length || liquidDeposits.length) && avgExpenses > 0n ? Number((liquid * 10n) / avgExpenses) / 10 : null;
  const health = computeHealthScore(
    {
      savingsRatePpm: avg(last3.map((m) => m.totals.savingsRatePpm)),
      fixedCostRatioPpm: avg(last3.flatMap((m) => (m.result?.fixedCostRatioPpm != null ? [m.result.fixedCostRatioPpm] : []))),
      emergencyFundMonths,
      debtServiceRatioPpm: null,
    },
    weights,
    targets,
  );

  const trend = [...closed].reverse().map((m) => ({
    period: m.period,
    income: m.totals.income,
    expenses: m.totals.expenses,
    surplus: m.totals.surplus,
    savingsRatePpm: m.totals.savingsRatePpm,
    fixedCostRatioPpm: m.result?.fixedCostRatioPpm ?? null,
    discretionaryRatioPpm: m.result?.discretionaryRatioPpm ?? null,
  }));
  const deficitMonths = (n: number) => closed.slice(0, n).filter((m) => m.totals.surplus < 0n).length;

  return { closed, recurring, installments, highlights, health, trend, emergencyFundMonths, deficitMonths: { m3: deficitMonths(3), m6: deficitMonths(6), m12: deficitMonths(12) } };
}

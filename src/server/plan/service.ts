import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { compareRoutes, type RouteDef } from "@/lib/invest/routes";
import { generatePlan, PLAN_ENGINE_VERSION, type PlanInput } from "@/lib/plan/engine";
import { addMonths, periodOf } from "@/lib/domain/period";
import { RuleUnavailableError } from "@/lib/tax/rules";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { db } from "@/server/db";
import { debtOverview } from "@/server/debt/service";
import { householdInsights, liquidAssets } from "@/server/months";
import { savingsOverview } from "@/server/savings/service";
import { loadTaxRows } from "@/server/tax/service";

async function buildInput(user: CurrentUser, householdId: string): Promise<{ input: PlanInput; thresholdSet: boolean }> {
  const [insights, liquid, debt, savings, household, ef, params, routes, assumptions, rows] = await Promise.all([
    householdInsights(householdId),
    liquidAssets(householdId),
    debtOverview(user, householdId),
    savingsOverview(user, householdId),
    db.household.findUniqueOrThrow({ where: { id: householdId }, select: { riskTolerance: true } }),
    getAdvisoryParameter<{ min: number; target: number }>("emergency_fund.months"),
    getAdvisoryParameter<{ savingsShareOfSurplusPpm: number; minSubscriptionAnnualAgorot: number }>("plan.params"),
    getAdvisoryParameter<RouteDef[]>("investment.routes"),
    getAdvisoryParameter<{ expectedInflationPpm: number }>("investment.assumptions"),
    loadTaxRows(),
  ]);
  const last3 = insights.closed.slice(0, 3);
  const avg = (f: (m: (typeof last3)[number]) => bigint) => (last3.length ? last3.reduce((s, m) => s + f(m), 0n) / BigInt(last3.length) : null);

  const since = new Date(`${addMonths(periodOf(new Date()), -3)}-01T00:00:00Z`);
  const [feeTx, savingsTx] = await Promise.all([
    db.transaction.aggregate({ where: { householdId, category: { key: "bank_fees" }, amount: { lt: 0n }, date: { gte: since } }, _sum: { amount: true } }),
    db.transaction.count({ where: { householdId, category: { key: "savings_transfer" }, date: { gte: since } } }),
  ]);

  let bestRoute: PlanInput["bestRoute"] = null;
  try {
    const cmp = compareRoutes(rows, routes, { amount: 10_000_000n, months: 12, expectedInflationPpm: assumptions.expectedInflationPpm, riskTolerance: household.riskTolerance, date: new Date().toISOString().slice(0, 10) });
    const best = cmp.results.find((r) => r.suitable);
    if (best) bestRoute = { key: best.key, netGainPerYearPer100k: best.finalNet - 10_000_000n };
  } catch (e) {
    if (!(e instanceof RuleUnavailableError)) throw e;
  }

  return {
    thresholdSet: debt.threshold !== null,
    input: {
      emergencyFundMonths: insights.emergencyFundMonths,
      emergencyTargetMonths: ef.target,
      avgMonthlyExpenses: avg((m) => m.totals.expenses),
      avgMonthlySurplus: avg((m) => m.totals.surplus),
      liquidAssets: liquid.amount,
      debts: debt.ranked.map((d) => ({ id: d.id, label: d.label, balance: d.balance, annualRatePpm: d.annualRatePpm, expensive: d.expensive })),
      feeProducts: savings.products.filter((p) => p.comparison).map((p) => ({ id: p.product.id, label: `${p.product.provider}`, gainAtHorizon: p.comparison!.gainAtHorizon, years: Math.round(p.months / 12) })),
      subscriptions: insights.recurring.filter((r) => r.isSubscriptionLike).map((r) => ({ key: r.merchantKey, label: r.sampleDescription, annualCost: r.annualCost })),
      monthlyBankFees: feeTx._sum.amount ? -feeTx._sum.amount / 3n : 0n,
      hasSavingsTransfer: savingsTx > 0,
      bestRoute,
      params: { savingsShareOfSurplusPpm: params.savingsShareOfSurplusPpm, minSubscriptionAnnual: BigInt(params.minSubscriptionAnnualAgorot) },
    },
  };
}

/**
 * Re-runs the rules and syncs recommendations:
 *  - new candidates → PROPOSED;
 *  - existing PROPOSED → reason / impact / priority refreshed;
 *  - approved / in-progress / done / dismissed → only reason and impact refreshed (advisor's
 *    order, wording and decision are kept);
 *  - PROPOSED items no longer produced by the rules → removed.
 */
export async function regeneratePlan(user: CurrentUser, householdId: string) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await assertHouseholdAccess(user, householdId);
  const { input, thresholdSet } = await buildInput(user, householdId);
  const recs = generatePlan(input);
  const existing = await db.recommendation.findMany({ where: { householdId } });
  const byKey = new Map(existing.map((r) => [r.dedupKey, r]));
  for (const r of recs) {
    const cur = byKey.get(r.dedupKey);
    const data = { ruleKey: r.ruleKey, reason: r.reason as Prisma.InputJsonValue, impactMonthly: r.impactMonthly, impactLifetime: r.impactLifetime, engineVersion: PLAN_ENGINE_VERSION };
    if (!cur) await db.recommendation.create({ data: { householdId, dedupKey: r.dedupKey, priority: r.priority, ...data } });
    else await db.recommendation.update({ where: { id: cur.id }, data: cur.status === "PROPOSED" ? { ...data, priority: r.priority } : data });
  }
  const keep = new Set(recs.map((r) => r.dedupKey));
  await db.recommendation.deleteMany({ where: { householdId, status: "PROPOSED", dedupKey: { notIn: [...keep] } } });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "Plan.regenerate", householdId, metadata: { count: recs.length } });
  return { count: recs.length, thresholdSet };
}

export async function listPlan(user: CurrentUser, householdId: string) {
  await assertHouseholdAccess(user, householdId);
  const where = user.role === "CLIENT" ? { householdId, status: { in: ["APPROVED", "IN_PROGRESS", "DONE"] as ("APPROVED" | "IN_PROGRESS" | "DONE")[] } } : { householdId };
  return db.recommendation.findMany({ where, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
}

export async function updateRecommendation(user: CurrentUser, householdId: string, id: string, change: { status?: "PROPOSED" | "APPROVED" | "IN_PROGRESS" | "DONE" | "DISMISSED"; customTitle?: string | null; advisorNote?: string | null; move?: "up" | "down" }) {
  await assertHouseholdAccess(user, householdId);
  const rec = await db.recommendation.findFirstOrThrow({ where: { id, householdId } });
  if (user.role === "CLIENT") {
    // Clients can only progress approved items they can see.
    if (!["APPROVED", "IN_PROGRESS", "DONE"].includes(rec.status) || !change.status || !["IN_PROGRESS", "DONE"].includes(change.status)) throw new Error("Forbidden");
    await db.recommendation.update({ where: { id }, data: { status: change.status } });
  } else {
    if (change.move) {
      const list = await db.recommendation.findMany({ where: { householdId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
      const idx = list.findIndex((r) => r.id === id);
      const swap = list[change.move === "up" ? idx - 1 : idx + 1];
      if (swap) {
        await db.$transaction([
          db.recommendation.update({ where: { id: rec.id }, data: { priority: swap.priority === rec.priority ? swap.priority + (change.move === "up" ? -1 : 1) : swap.priority } }),
          db.recommendation.update({ where: { id: swap.id }, data: { priority: rec.priority } }),
        ]);
      }
    }
    const data: Prisma.RecommendationUpdateInput = {};
    if (change.status) {
      data.status = change.status;
      if (change.status === "APPROVED") Object.assign(data, { approvedByUserId: user.id, approvedAt: new Date() });
    }
    if (change.customTitle !== undefined) data.customTitle = change.customTitle;
    if (change.advisorNote !== undefined) data.advisorNote = change.advisorNote;
    if (Object.keys(data).length) await db.recommendation.update({ where: { id }, data });
  }
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "Recommendation", entityId: id, householdId, // Free text (titles, notes) never goes into the audit log: it outlives a privacy purge.
    metadata: { status: change.status ?? null, move: change.move ?? null, changed: Object.keys(change).filter((k) => (change as Record<string, unknown>)[k] !== undefined) } });
}

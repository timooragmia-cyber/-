import "server-only";
import { z } from "zod";
import { addMonths, periodOf } from "@/lib/domain/period";
import { allocation, irrFlows, monthlySeries, replay, unrealizedTax, type AssetClass } from "@/lib/invest/portfolio";
import { appreciate, exitScenario, propertyYields, type PropertyInput } from "@/lib/invest/real-estate";
import { moneyWeightedReturn, timeWeightedReturn } from "@/lib/invest/returns";
import { compareRoutes, netAnnualYield, prerequisites, type RouteDef } from "@/lib/invest/routes";
import { parseAmount, parsePercentToPpm } from "@/lib/money";
import { resolveRule, RuleUnavailableError } from "@/lib/tax/rules";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { db } from "@/server/db";
import { householdInsights } from "@/server/months";
import { savingsOverview } from "@/server/savings/service";
import { loadTaxRows } from "@/server/tax/service";

export type InvestAssumptions = { expectedInflationPpm: number; sellingCostsPpm: number; appreciationScenariosPpm: number[]; exitHorizonYears: number };
const today = () => new Date().toISOString().slice(0, 10);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

function toPropertyInput(p: Awaited<ReturnType<typeof db.property.findMany>>[number]): PropertyInput {
  return {
    usage: p.usage, isOnlyApartment: p.isOnlyApartment, purchaseDate: ymd(p.purchaseDate), purchasePrice: p.purchasePrice, purchaseCosts: p.purchaseCosts,
    improvementCosts: p.improvementCosts, currentValue: p.currentValue, monthlyRent: p.monthlyRent, monthlyExpenses: p.monthlyExpenses,
    mortgageBalance: p.mortgageBalance, monthlyMortgagePayment: p.monthlyMortgagePayment,
  };
}

export async function investmentsOverview(user: CurrentUser, householdId: string) {
  await assertHouseholdAccess(user, householdId);
  const [props, accounts, deposits, assumptions, rows] = await Promise.all([
    db.property.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
    db.portfolioAccount.findMany({ where: { householdId }, include: { holdings: { include: { valuations: true } }, transactions: true }, orderBy: { createdAt: "asc" } }),
    db.savingsDeposit.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } }),
    getAdvisoryParameter<InvestAssumptions>("investment.assumptions"),
    loadTaxRows(),
  ]);
  const now = new Date();
  // Projection rule set: future exits assume TODAY's rules continue unchanged — the latest
  // version of each currently valid rule is extended; the screen states this assumption.
  const projectionRows = rows.map((r) => {
    const validToday = r.effectiveFrom <= now && (r.effectiveTo === null || r.effectiveTo >= now);
    const hasSuccessor = rows.some((o) => o.ruleKey === r.ruleKey && o.effectiveFrom > r.effectiveFrom);
    return validToday && !hasSuccessor ? { ...r, effectiveTo: null } : r;
  });
  const ruleOr = <K extends Parameters<typeof resolveRule>[1]>(k: K) => {
    try {
      return resolveRule(rows, k, now).params;
    } catch (e) {
      if (e instanceof RuleUnavailableError) return null;
      throw e;
    }
  };

  // Real estate: yields, appreciation scenarios, exit today and at the horizon (base scenario)
  const properties = props.map((p) => {
    const input = toPropertyInput(p);
    const horizon = assumptions.exitHorizonYears;
    const scenarios = assumptions.appreciationScenariosPpm.map((r) => ({ ratePpm: r, value: appreciate(p.currentValue, r, horizon) }));
    const base = scenarios[Math.floor(scenarios.length / 2)]!;
    const saleDate = `${now.getUTCFullYear() + horizon}-${today().slice(5)}`;
    const attempt = (fn: () => ReturnType<typeof exitScenario>) => {
      try {
        return { value: fn(), error: null as string | null };
      } catch (e) {
        return { value: null, error: e instanceof RuleUnavailableError ? `rule:${e.ruleKey}` : e instanceof Error ? e.message : "error" };
      }
    };
    const today0 = attempt(() => exitScenario(rows, input, { saleDate: today(), salePrice: p.currentValue, sellingCostsPpm: assumptions.sellingCostsPpm, expectedInflationPpm: assumptions.expectedInflationPpm }));
    const future = attempt(() => {
      const r = exitScenario(projectionRows, input, { saleDate, salePrice: base.value, sellingCostsPpm: assumptions.sellingCostsPpm, expectedInflationPpm: assumptions.expectedInflationPpm });
      return { ...r, warnings: [...r.warnings, "realEstate.rulesAssumedUnchanged"] };
    });
    return { property: p, yields: propertyYields(input), scenarios, horizon, exitNow: today0.value, exitHorizon: future.value, exitError: today0.error ?? future.error };
  });

  // Portfolios
  const cgRate = ruleOr("capital_gains.securities")?.individualRealPpm ?? null;
  const current = periodOf(now);
  const portfolios = accounts.map((a) => {
    const holdings = a.holdings.map((h) => ({ id: h.id, name: h.name, assetClass: h.assetClass as AssetClass }));
    const txns = a.transactions.map((t) => ({ date: ymd(t.date), type: t.type, holdingId: t.holdingId, units: t.units, amount: t.amount, feeKind: t.feeKind }));
    const vals = a.holdings.flatMap((h) => h.valuations.map((v) => ({ holdingId: h.id, asOf: ymd(v.asOf), value: v.value })));
    const r = replay(holdings, txns, vals);
    const first = txns.map((t) => t.date).sort()[0];
    const periods: string[] = [];
    if (first) for (let p = first.slice(0, 7); p <= current; p = addMonths(p, 1)) periods.push(p);
    const series = monthlySeries(holdings, txns, vals, periods);
    return {
      account: a,
      state: r,
      allocation: allocation(r.holdings, r.cash, (a.targetAllocation ?? {}) as Partial<Record<AssetClass, number>>),
      unrealizedTax: cgRate === null ? null : unrealizedTax(r.holdings, cgRate),
      twr: timeWeightedReturn(series),
      mwrPpm: moneyWeightedReturn(irrFlows(series)),
      months: periods.length,
    };
  });

  // Deposits & money-market funds
  const di = ruleOr("capital_gains.dividend_interest");
  const mm = ruleOr("money_market_fund.tax");
  const depositViews = deposits.map((d) => ({
    deposit: d,
    net: di && mm ? netAnnualYield(d.kind, d.annualRatePpm, d.feePpm, assumptions.expectedInflationPpm, { depositUnlinkedPpm: di.interestUnlinkedNominalPpm, mmfPpm: mm.ratePpm, mmfBasis: mm.basis }) : null,
  }));

  await audit({ action: "VIEW", actorUserId: user.id, actorRole: user.role, entityType: "Investments", householdId });
  return { properties, portfolios, deposits: depositViews, assumptions };
}

/** Route comparison with the conservative-order checklist built from the client's real data. */
export async function routesComparison(user: CurrentUser, householdId: string, amount: bigint, months: number) {
  await assertHouseholdAccess(user, householdId);
  const [household, routes, assumptions, ef, rows, insights, savings] = await Promise.all([
    db.household.findUniqueOrThrow({ where: { id: householdId }, select: { riskTolerance: true, displayName: true } }),
    getAdvisoryParameter<RouteDef[]>("investment.routes"),
    getAdvisoryParameter<InvestAssumptions>("investment.assumptions"),
    getAdvisoryParameter<{ min: number; target: number }>("emergency_fund.months"),
    loadTaxRows(),
    householdInsights(householdId),
    savingsOverview(user, householdId),
  ]);
  const last3 = insights.closed.slice(0, 3);
  const avgExpenses = last3.length ? last3.reduce((s, m) => s + m.totals.expenses, 0n) / BigInt(last3.length) : null;
  const pre = prerequisites({
    emergencyFundMonths: insights.emergencyFundMonths,
    emergencyTargetMonths: ef.target,
    avgMonthlyExpenses: avgExpenses,
    expensiveDebt: "UNKNOWN", // debt module arrives in Phase 4
    feeFlaggedProducts: savings.totals.flagged,
    riskAssessed: household.riskTolerance !== null,
  });
  const cmp = compareRoutes(rows, routes, { amount, months, expectedInflationPpm: assumptions.expectedInflationPpm, riskTolerance: household.riskTolerance, date: today() });
  return { household, prerequisites: pre, ...cmp, assumptions, routes };
}

// ── Mutations (advisor only) ────────────────────────────────────────────────

const money = (required = true) => z.string().trim().optional().transform((v, ctx) => {
  if (!v) {
    if (required) ctx.addIssue({ code: "custom", message: "required" });
    return 0n;
  }
  try {
    const a = parseAmount(v);
    if (a < 0n) throw new Error();
    return a;
  } catch {
    ctx.addIssue({ code: "custom", message: "amount" });
    return z.NEVER;
  }
});
const pct = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return 0;
  try {
    return parsePercentToPpm(v);
  } catch {
    ctx.addIssue({ code: "custom", message: "percent" });
    return z.NEVER;
  }
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((v) => new Date(`${v}T00:00:00Z`));
const ASSET = ["EQUITY_IL", "EQUITY_FOREIGN", "BONDS_GOV", "BONDS_CORP", "MONEY_MARKET", "CASH", "OTHER"] as const;

export const propertySchema = z.object({
  label: z.string().trim().min(1).max(120), city: z.string().trim().max(80).optional(), usage: z.enum(["RESIDENCE", "INVESTMENT"]),
  isOnlyApartment: z.string().optional().transform((v) => v === "on"), purchaseDate: date, purchasePrice: money(), purchaseCosts: money(false), improvementCosts: money(false),
  currentValue: money(), valueAsOf: date, monthlyRent: money(false), monthlyExpenses: money(false), mortgageBalance: money(false), monthlyMortgagePayment: money(false),
});

const guard = async (user: CurrentUser, householdId: string) => {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await assertHouseholdAccess(user, householdId);
};

export async function saveProperty(user: CurrentUser, householdId: string, input: z.infer<typeof propertySchema>, id?: string) {
  await guard(user, householdId);
  const data = { ...input, city: input.city || null };
  const p = id ? await db.property.update({ where: { id: (await db.property.findFirstOrThrow({ where: { id, householdId } })).id }, data }) : await db.property.create({ data: { householdId, ...data } });
  await audit({ action: id ? "UPDATE" : "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "Property", entityId: p.id, householdId });
}

export async function deleteEntity(user: CurrentUser, householdId: string, kind: "property" | "account" | "deposit" | "txn", id: string) {
  await guard(user, householdId);
  if (kind === "property") await db.property.deleteMany({ where: { id, householdId } });
  if (kind === "account") await db.portfolioAccount.deleteMany({ where: { id, householdId } });
  if (kind === "deposit") await db.savingsDeposit.deleteMany({ where: { id, householdId } });
  if (kind === "txn") await db.portfolioTxn.deleteMany({ where: { id, account: { householdId } } });
  await audit({ action: "DELETE", actorUserId: user.id, actorRole: user.role, entityType: kind, entityId: id, householdId });
}

export const accountSchema = z.object({
  name: z.string().trim().min(1).max(120), institution: z.string().trim().min(1).max(120),
  ...Object.fromEntries(ASSET.map((a) => [`t_${a}`, pct])),
}).transform((v) => {
  const target = Object.fromEntries(ASSET.map((a) => [a, (v as unknown as Record<string, number>)[`t_${a}`] ?? 0]).filter(([, x]) => (x as number) > 0));
  return { name: v.name, institution: v.institution, target };
});

export async function saveAccount(user: CurrentUser, householdId: string, input: z.infer<typeof accountSchema>, id?: string) {
  await guard(user, householdId);
  const sum = (Object.values(input.target) as number[]).reduce((s, x) => s + x, 0);
  if (sum !== 0 && sum !== 1_000_000) return { ok: false as const, error: "target_sum" };
  const data = { name: input.name, institution: input.institution, targetAllocation: sum ? input.target : undefined };
  const a = id ? await db.portfolioAccount.update({ where: { id: (await db.portfolioAccount.findFirstOrThrow({ where: { id, householdId } })).id }, data }) : await db.portfolioAccount.create({ data: { householdId, ...data } });
  await audit({ action: id ? "UPDATE" : "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "PortfolioAccount", entityId: a.id, householdId });
  return { ok: true as const };
}

export const holdingSchema = z.object({ name: z.string().trim().min(1).max(120), symbol: z.string().trim().max(30).optional(), assetClass: z.enum(ASSET) });

export async function addHolding(user: CurrentUser, householdId: string, accountId: string, input: z.infer<typeof holdingSchema>) {
  await guard(user, householdId);
  const acc = await db.portfolioAccount.findFirstOrThrow({ where: { id: accountId, householdId } });
  await db.portfolioHolding.create({ data: { accountId: acc.id, name: input.name, symbol: input.symbol || null, assetClass: input.assetClass } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "PortfolioHolding", entityId: acc.id, householdId });
}

const units = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return 0n;
  const m = /^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(v.replace(/,/g, ""));
  if (!m) {
    ctx.addIssue({ code: "custom", message: "units" });
    return z.NEVER;
  }
  return BigInt(m[1]!) * 1_000_000n + BigInt(((m[2] ?? "") + "000000").slice(0, 6));
});

export const txnSchema = z.object({
  date: date, type: z.enum(["DEPOSIT", "WITHDRAWAL", "BUY", "SELL", "DIVIDEND", "INTEREST", "FEE", "TAX"]),
  holdingId: z.string().optional().transform((v) => v || null), units, amount: money(), feeKind: z.enum(["", "MANAGEMENT", "TRADING", "CUSTODY", "OTHER"]).optional().transform((v) => (v ? v : null)),
  note: z.string().trim().max(200).optional(),
}).refine((v) => !["BUY", "SELL"].includes(v.type) || (v.holdingId && v.units > 0n), "holding_and_units_required");

export async function addTxn(user: CurrentUser, householdId: string, accountId: string, input: z.infer<typeof txnSchema>) {
  await guard(user, householdId);
  const acc = await db.portfolioAccount.findFirstOrThrow({ where: { id: accountId, householdId } });
  if (input.holdingId) await db.portfolioHolding.findFirstOrThrow({ where: { id: input.holdingId, accountId: acc.id } });
  await db.portfolioTxn.create({ data: { accountId: acc.id, holdingId: input.holdingId, date: input.date, type: input.type, units: input.units, amount: input.amount, feeKind: input.type === "FEE" ? (input.feeKind ?? "OTHER") : null, note: input.note || null, createdByUserId: user.id } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "PortfolioTxn", entityId: acc.id, householdId, metadata: { type: input.type } });
}

export async function addValuations(user: CurrentUser, householdId: string, accountId: string, asOf: Date, values: { holdingId: string; value: bigint }[]) {
  await guard(user, householdId);
  const acc = await db.portfolioAccount.findFirstOrThrow({ where: { id: accountId, householdId }, include: { holdings: { select: { id: true } } } });
  const allowed = new Set(acc.holdings.map((h) => h.id));
  for (const v of values) {
    if (!allowed.has(v.holdingId)) continue;
    await db.holdingValuation.upsert({ where: { holdingId_asOf: { holdingId: v.holdingId, asOf } }, update: { value: v.value }, create: { holdingId: v.holdingId, asOf, value: v.value } });
  }
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "HoldingValuation", entityId: acc.id, householdId, metadata: { count: values.length } });
}

export const depositSchema = z.object({
  kind: z.enum(["BANK_DEPOSIT", "MONEY_MARKET_FUND"]), institution: z.string().trim().min(1).max(120), label: z.string().trim().min(1).max(120),
  balance: money(), balanceAsOf: date, annualRate: pct, fee: pct, maturityDate: z.string().optional().transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null)),
});

export async function saveDeposit(user: CurrentUser, householdId: string, input: z.infer<typeof depositSchema>, id?: string) {
  await guard(user, householdId);
  const data = { kind: input.kind, institution: input.institution, label: input.label, balance: input.balance, balanceAsOf: input.balanceAsOf, annualRatePpm: input.annualRate, feePpm: input.fee, maturityDate: input.maturityDate };
  const d = id ? await db.savingsDeposit.update({ where: { id: (await db.savingsDeposit.findFirstOrThrow({ where: { id, householdId } })).id }, data }) : await db.savingsDeposit.create({ data: { householdId, ...data } });
  await audit({ action: id ? "UPDATE" : "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "SavingsDeposit", entityId: d.id, householdId });
}

import { divRound, type Agorot } from "@/lib/money";
import { FACTOR_SCALE, monthlyFactorFromAnnualPpm } from "@/lib/math/fixed";
import { resolveRule, type RuleUsed, type TaxRuleRow } from "@/lib/tax/rules";

export const ROUTES_VERSION = "routes@1";

export type RiskLevel = "VERY_LOW" | "LOW" | "MEDIUM" | "HIGH";
export type TaxTreatment = "DEPOSIT_UNLINKED" | "MONEY_MARKET" | "SECURITIES_REAL" | "STUDY_FUND_EXEMPT";

/** A route definition — assumptions live in AdvisoryParameter "investment.routes" (advisor-owned). */
export type RouteDef = {
  key: string;
  expectedReturnPpm: number; // nominal annual, BEFORE fees (assumption)
  feePpm: number; // annual
  tax: TaxTreatment;
  risk: RiskLevel;
  liquidity: "DAILY" | "AT_MATURITY" | "YEARS";
  /** Annual contribution cap for routes with a tax-benefit ceiling (study fund), agorot; null = none. */
  maxAnnualContribution?: number | null;
};

export type RouteResult = {
  key: string;
  finalGross: Agorot;
  gain: Agorot;
  tax: Agorot;
  finalNet: Agorot;
  netAnnualPpm: number;
  realNetAnnualPpm: number;
  risk: RiskLevel;
  liquidity: RouteDef["liquidity"];
  suitable: boolean; // within the client's risk tolerance
  note: string | null;
};

const RISK_ORDER: RiskLevel[] = ["VERY_LOW", "LOW", "MEDIUM", "HIGH"];

const grow = (amount: Agorot, annualPpm: number, months: number) => {
  const f = monthlyFactorFromAnnualPpm(annualPpm);
  let v = amount * 1_000_000n;
  for (let i = 0; i < months; i++) v = (v * f) / FACTOR_SCALE;
  return divRound(v, 1_000_000n);
};

function annualized(start: Agorot, end: Agorot, months: number): number {
  // (end/start)^(12/months) − 1 by bisection on the monthly factor (fixed point)
  if (start <= 0n || months <= 0) return 0;
  const S = 10n ** 12n;
  const target = (end * S) / start;
  let lo = 0n, hi = 2n * S;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2n;
    let p = S;
    for (let j = 0; j < months; j++) p = (p * mid) / S;
    if (p > target) hi = mid; else lo = mid;
  }
  let a = S;
  for (let j = 0; j < 12; j++) a = (a * lo) / S;
  return Number(((a - S) * 1_000_000n) / S);
}

/**
 * Compare routes for a lump sum over a horizon: after fees, after tax (rules valid on `date`),
 * nominal and real annualized net return, risk label and liquidity, suitability vs the
 * client's advisor-assigned risk tolerance. Pure.
 */
export function compareRoutes(
  rows: readonly TaxRuleRow[],
  routes: readonly RouteDef[],
  input: { amount: Agorot; months: number; expectedInflationPpm: number; riskTolerance: RiskLevel | null; date: string },
): { results: RouteResult[]; rulesUsed: RuleUsed[] } {
  const on = new Date(`${input.date}T00:00:00Z`);
  const used = new Map<string, RuleUsed>();
  const rule = <K extends Parameters<typeof resolveRule>[1]>(k: K) => {
    const r = resolveRule(rows, k, on);
    used.set(r.used.ruleKey, r.used);
    return r.params;
  };
  const inflation = grow(input.amount, input.expectedInflationPpm, input.months) - input.amount;
  const maxRisk = input.riskTolerance ? RISK_ORDER.indexOf(input.riskTolerance) : -1;

  const results = routes.map((r): RouteResult => {
    const gross = grow(input.amount, r.expectedReturnPpm - r.feePpm, input.months);
    const gain = gross - input.amount;
    let tax = 0n;
    let note: string | null = null;
    switch (r.tax) {
      case "DEPOSIT_UNLINKED":
        tax = divRound((gain > 0n ? gain : 0n) * BigInt(rule("capital_gains.dividend_interest").interestUnlinkedNominalPpm), 1_000_000n);
        break;
      case "MONEY_MARKET": {
        const p = rule("money_market_fund.tax");
        const base = p.basis === "REAL" ? gain - inflation : gain;
        tax = divRound((base > 0n ? base : 0n) * BigInt(p.ratePpm), 1_000_000n);
        break;
      }
      case "SECURITIES_REAL": {
        const base = gain - inflation;
        tax = divRound((base > 0n ? base : 0n) * BigInt(rule("capital_gains.securities").individualRealPpm), 1_000_000n);
        break;
      }
      case "STUDY_FUND_EXEMPT":
        note = "studyFundCap";
        if (r.maxAnnualContribution !== null && r.maxAnnualContribution !== undefined && input.amount > BigInt(r.maxAnnualContribution)) note = "studyFundAboveCap";
        break;
    }
    const net = gross - tax;
    const netAnnual = annualized(input.amount, net, input.months);
    const realEnd = input.amount + inflation > 0n ? (net * input.amount) / (input.amount + inflation) : net;
    return {
      key: r.key,
      finalGross: gross,
      gain,
      tax,
      finalNet: net,
      netAnnualPpm: netAnnual,
      realNetAnnualPpm: annualized(input.amount, realEnd, input.months),
      risk: r.risk,
      liquidity: r.liquidity,
      suitable: maxRisk < 0 ? false : RISK_ORDER.indexOf(r.risk) <= maxRisk,
      note,
    };
  });
  return { results: results.sort((a, b) => (a.finalNet > b.finalNet ? -1 : a.finalNet < b.finalNet ? 1 : 0)), rulesUsed: [...used.values()] };
}

export type Prerequisite = { key: "EMERGENCY_FUND" | "EXPENSIVE_DEBT" | "FEES" | "RISK_ASSESSED"; status: "OK" | "MISSING" | "UNKNOWN"; detail?: Record<string, string | number> };

/**
 * Conservative order (product principle): emergency fund → expensive debt → fees → only then
 * investment routes. The comparison is still shown, but the checklist comes first and the
 * recommended amount for investing excludes the missing emergency-fund part.
 */
export function prerequisites(input: {
  emergencyFundMonths: number | null;
  emergencyTargetMonths: number;
  avgMonthlyExpenses: Agorot | null;
  expensiveDebt: "NONE" | "PRESENT" | "UNKNOWN";
  feeFlaggedProducts: number;
  riskAssessed: boolean;
}): { items: Prerequisite[]; emergencyGap: Agorot } {
  const ef = input.emergencyFundMonths;
  const gapMonths = ef === null ? input.emergencyTargetMonths : Math.max(0, input.emergencyTargetMonths - ef);
  const emergencyGap = input.avgMonthlyExpenses ? divRound(input.avgMonthlyExpenses * BigInt(Math.round(gapMonths * 10)), 10n) : 0n;
  return {
    items: [
      { key: "EMERGENCY_FUND", status: ef === null ? "UNKNOWN" : ef >= input.emergencyTargetMonths ? "OK" : "MISSING", detail: { months: ef ?? 0, target: input.emergencyTargetMonths } },
      { key: "EXPENSIVE_DEBT", status: input.expensiveDebt === "NONE" ? "OK" : input.expensiveDebt === "PRESENT" ? "MISSING" : "UNKNOWN" },
      { key: "FEES", status: input.feeFlaggedProducts === 0 ? "OK" : "MISSING", detail: { count: input.feeFlaggedProducts } },
      { key: "RISK_ASSESSED", status: input.riskAssessed ? "OK" : "MISSING" },
    ],
    emergencyGap,
  };
}

/** Net annual yield of a deposit / money-market holding after fee and tax (simple annual view). */
export function netAnnualYield(kind: "BANK_DEPOSIT" | "MONEY_MARKET_FUND", ratePpm: number, feePpm: number, expectedInflationPpm: number, taxRates: { depositUnlinkedPpm: number; mmfPpm: number; mmfBasis: "REAL" | "NOMINAL" }): { netPpm: number; realNetPpm: number } {
  const gross = ratePpm - feePpm;
  let tax: number;
  if (kind === "BANK_DEPOSIT") tax = Math.round((Math.max(0, gross) * taxRates.depositUnlinkedPpm) / 1_000_000);
  else tax = Math.round((Math.max(0, taxRates.mmfBasis === "REAL" ? gross - expectedInflationPpm : gross) * taxRates.mmfPpm) / 1_000_000);
  const net = gross - tax;
  return { netPpm: net, realNetPpm: net - expectedInflationPpm };
}

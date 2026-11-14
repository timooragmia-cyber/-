import { divRound, type Agorot } from "@/lib/money";

export const PLAN_ENGINE_VERSION = "plan-engine@1";

/**
 * Rule-based recommendations (no AI-generated numbers). Order follows the advisory philosophy:
 *   1 emergency fund → 2 expensive debt → 3 management fees → 4 spending leaks →
 *   5 automate savings → 6 invest (only when 1–2 are satisfied).
 * Every recommendation carries: rule key, a stable dedup key, reason parameters (rendered via
 * i18n), monthly and/or lifetime shekel impact, and a priority.
 */
export type PlanInput = {
  emergencyFundMonths: number | null;
  emergencyTargetMonths: number;
  avgMonthlyExpenses: Agorot | null;
  avgMonthlySurplus: Agorot | null;
  liquidAssets: Agorot; // bank + money-market + short deposits
  debts: { id: string; label: string; balance: Agorot; annualRatePpm: number; expensive: boolean | null }[];
  feeProducts: { id: string; label: string; gainAtHorizon: Agorot; years: number }[];
  subscriptions: { key: string; label: string; annualCost: Agorot }[];
  monthlyBankFees: Agorot; // average account fees + interest per month
  hasSavingsTransfer: boolean;
  bestRoute: { key: string; netGainPerYearPer100k: Agorot } | null;
  params: { savingsShareOfSurplusPpm: number; minSubscriptionAnnual: Agorot };
};

export type Recommendation = {
  ruleKey: "EMERGENCY_FUND" | "EXPENSIVE_DEBT" | "REDUCE_FEES" | "CUT_LEAK" | "BANK_FEES" | "AUTOMATE_SAVINGS" | "INVEST_SURPLUS";
  dedupKey: string;
  priority: number;
  reason: Record<string, string | number>;
  impactMonthly: Agorot | null;
  impactLifetime: Agorot | null;
};

export function generatePlan(i: PlanInput): Recommendation[] {
  const out: Recommendation[] = [];
  let p = 0;
  const next = () => (p += 10);

  // 1. Emergency fund
  const efMissing = i.emergencyFundMonths === null || i.emergencyFundMonths < i.emergencyTargetMonths;
  if (efMissing && i.avgMonthlyExpenses && i.avgMonthlyExpenses > 0n) {
    const target = i.avgMonthlyExpenses * BigInt(i.emergencyTargetMonths);
    const gap = target > i.liquidAssets ? target - i.liquidAssets : 0n;
    if (gap > 0n) {
      const monthly = i.avgMonthlySurplus && i.avgMonthlySurplus > 0n ? divRound(i.avgMonthlySurplus * BigInt(i.params.savingsShareOfSurplusPpm), 1_000_000n) : null;
      out.push({
        ruleKey: "EMERGENCY_FUND", dedupKey: "EMERGENCY_FUND", priority: next(),
        reason: { months: i.emergencyFundMonths ?? 0, target: i.emergencyTargetMonths, gap: gap.toString(), monthly: monthly?.toString() ?? "0", monthsToGoal: monthly && monthly > 0n ? Number((gap + monthly - 1n) / monthly) : 0 },
        impactMonthly: monthly, impactLifetime: null,
      });
    }
  }

  // 2. Expensive debt (highest rate first)
  for (const d of i.debts.filter((x) => x.expensive).sort((a, b) => b.annualRatePpm - a.annualRatePpm)) {
    const yearly = divRound(d.balance * BigInt(d.annualRatePpm), 1_000_000n);
    out.push({ ruleKey: "EXPENSIVE_DEBT", dedupKey: `EXPENSIVE_DEBT:${d.id}`, priority: next(), reason: { label: d.label, rate: d.annualRatePpm, balance: d.balance.toString(), yearly: yearly.toString() }, impactMonthly: divRound(yearly, 12n), impactLifetime: yearly });
  }

  // 3. Fees above benchmark
  for (const f of [...i.feeProducts].filter((x) => x.gainAtHorizon > 0n).sort((a, b) => (a.gainAtHorizon > b.gainAtHorizon ? -1 : 1))) {
    out.push({ ruleKey: "REDUCE_FEES", dedupKey: `REDUCE_FEES:${f.id}`, priority: next(), reason: { label: f.label, gain: f.gainAtHorizon.toString(), years: f.years }, impactMonthly: null, impactLifetime: f.gainAtHorizon });
  }

  // 4. Leaks: subscriptions worth reviewing
  for (const s of i.subscriptions.filter((x) => x.annualCost >= i.params.minSubscriptionAnnual)) {
    out.push({ ruleKey: "CUT_LEAK", dedupKey: `CUT_LEAK:${s.key}`, priority: next(), reason: { label: s.label, annual: s.annualCost.toString() }, impactMonthly: divRound(s.annualCost, 12n), impactLifetime: s.annualCost });
  }
  if (i.monthlyBankFees > 0n) {
    out.push({ ruleKey: "BANK_FEES", dedupKey: "BANK_FEES", priority: next(), reason: { monthly: i.monthlyBankFees.toString() }, impactMonthly: i.monthlyBankFees, impactLifetime: i.monthlyBankFees * 12n });
  }

  // 5. Automate savings
  if (!i.hasSavingsTransfer && i.avgMonthlySurplus && i.avgMonthlySurplus > 0n) {
    const amount = divRound(i.avgMonthlySurplus * BigInt(i.params.savingsShareOfSurplusPpm), 1_000_000n);
    out.push({ ruleKey: "AUTOMATE_SAVINGS", dedupKey: "AUTOMATE_SAVINGS", priority: next(), reason: { amount: amount.toString(), surplus: i.avgMonthlySurplus.toString() }, impactMonthly: amount, impactLifetime: amount * 12n });
  }

  // 6. Invest — only when the emergency fund is complete and no expensive debt remains
  const debtClear = i.debts.every((d) => d.expensive === false);
  if (!efMissing && debtClear && i.bestRoute && i.avgMonthlyExpenses) {
    const reserve = i.avgMonthlyExpenses * BigInt(i.emergencyTargetMonths);
    const excess = i.liquidAssets > reserve ? i.liquidAssets - reserve : 0n;
    if (excess > 0n) {
      const gain = divRound(excess * i.bestRoute.netGainPerYearPer100k, 10_000_000n);
      out.push({ ruleKey: "INVEST_SURPLUS", dedupKey: `INVEST_SURPLUS:${i.bestRoute.key}`, priority: next(), reason: { amount: excess.toString(), route: i.bestRoute.key }, impactMonthly: null, impactLifetime: gain });
    }
  }
  return out;
}

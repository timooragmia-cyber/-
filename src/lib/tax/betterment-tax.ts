import { divRound, type Agorot } from "@/lib/money";
import { addMonthsToDate, daysBetween, type CalcResult, type Step } from "./common";
import { cpiFor, inflationaryAmount, knownIndexPeriod, type CpiPoint } from "./cpi";
import { resolveRule, type RuleUsed, type TaxRuleRow } from "./rules";

export const BETTERMENT_VERSION = "betterment-tax@1";

/**
 * Scope (v1): residential apartment sold by an individual. Out of scope → explicit warning.
 *  - Regular linear computation by holding periods (rates from betterment_tax.rates).
 *  - Linear-beneficial (לינארי מוטב) for a qualifying residential apartment: gain attributed
 *    to the period up to linearExemptUntil is exempt; the rest is taxed at the 2012+ rate.
 *  - Single-residence exemption (49ב(2)) up to the ceiling; above it, the proportional part
 *    of the gain above the ceiling is taxed by linear-beneficial.
 *  - Inheritance (49ב(5)) and gift-to-relative (62) are flagged as exemption routes for the
 *    advisor to confirm; the calculator shows the regular result next to them.
 */
export type BettermentInput = {
  purchaseDate: string;
  saleDate: string;
  purchasePrice: Agorot;
  salePrice: Agorot;
  /** Purchase costs + improvements, indexed from the purchase date (v1 simplification). */
  deductibleCosts: Agorot;
  /** Selling costs (brokerage, lawyer) — deducted, not indexed. */
  saleCosts: Agorot;
  route: "REGULAR" | "LINEAR_BENEFICIAL" | "SINGLE_RESIDENCE_EXEMPTION";
  /** Facts the advisor attests for the exemption route. */
  onlyApartment?: boolean;
  transfer?: "SALE" | "INHERITANCE" | "GIFT_TO_RELATIVE";
  /** Marginal rate for the pre-7.11.2001 period, when the rule leaves it to the advisor. */
  preNov2001RatePpm?: number;
  /** Optional manual CPI overrides (×1000, same base as the series). */
  cpiPurchase?: CpiPoint;
  cpiSale?: CpiPoint;
};

export type BettermentResult = {
  nominalGain: Agorot;
  inflationaryAmount: Agorot;
  realGain: Agorot;
  exemptGain: Agorot;
  taxableGain: Agorot;
  tax: Agorot;
};

export class BettermentInputError extends Error {}

export function bettermentTax(rows: readonly TaxRuleRow[], cpi: readonly CpiPoint[], input: BettermentInput): CalcResult<BettermentResult> {
  if (input.saleDate <= input.purchaseDate) throw new BettermentInputError("saleBeforePurchase");
  const on = new Date(`${input.saleDate}T00:00:00Z`);
  const rates = resolveRule(rows, "betterment_tax.rates", on);
  const rulesUsed: RuleUsed[] = [rates.used];
  const warnings: string[] = [];
  const steps: Step[] = [];
  const r = rates.params;

  if (input.purchaseDate < "1994-01-01") warnings.push("betterment.pre1994NotSupported");
  if (input.transfer === "INHERITANCE") warnings.push("betterment.inheritanceRoute");
  if (input.transfer === "GIFT_TO_RELATIVE") warnings.push("betterment.giftRoute");

  // 1. Gains
  const cpiStart = input.cpiPurchase ?? cpiFor(cpi, knownIndexPeriod(input.purchaseDate));
  const cpiEnd = input.cpiSale ?? cpiFor(cpi, knownIndexPeriod(input.saleDate));
  const cost = input.purchasePrice + input.deductibleCosts;
  const nominal = input.salePrice - input.saleCosts - cost;
  const infl = nominal > 0n ? inflationaryAmount(cost, cpiStart, cpiEnd) : 0n;
  const real = nominal - infl > 0n ? nominal - infl : 0n;
  steps.push({ key: "nominalGain", values: { sale: input.salePrice.toString(), saleCosts: input.saleCosts.toString(), cost: cost.toString() }, amount: nominal });
  steps.push({ key: "inflationary", values: { cpiStart: cpiStart.valueMilli, cpiEnd: cpiEnd.valueMilli, periodStart: cpiStart.period, periodEnd: cpiEnd.period }, amount: infl });
  steps.push({ key: "realGain", amount: real });

  const total = daysBetween(input.purchaseDate, input.saleDate);
  const seg = (from: string, to: string) => Math.max(0, daysBetween(from < input.purchaseDate ? input.purchaseDate : from, to > input.saleDate ? input.saleDate : to));
  const share = (gain: Agorot, days: number) => divRound(gain * BigInt(days), BigInt(total));

  /** Linear split of `gain` over the holding periods → tax. */
  const linearTax = (gain: Agorot, beneficial: boolean): { tax: Agorot; exempt: Agorot } => {
    const d2012 = seg(r.period2012Start, input.saleDate);
    if (beneficial) {
      const ex = resolveRule(rows, "betterment_tax.single_residence_exemption", on);
      if (!rulesUsed.find((u) => u.ruleKey === ex.used.ruleKey)) rulesUsed.push(ex.used);
      const exemptDays = seg(input.purchaseDate, ex.params.linearExemptUntil);
      const taxedDays = total - exemptDays;
      const exempt = share(gain, exemptDays);
      const taxed = gain - exempt;
      const tax = divRound(taxed * BigInt(r.from2012Ppm), 1_000_000n);
      steps.push({ key: "linearBeneficial", values: { exemptDays, taxedDays, totalDays: total, until: ex.params.linearExemptUntil, rate: r.from2012Ppm }, amount: tax });
      return { tax, exempt };
    }
    const dPre = seg(input.purchaseDate, r.period2001Start);
    const d2001 = seg(r.period2001Start, r.period2012Start);
    let acc = 0n;
    if (dPre > 0) {
      const rate = r.preNov2001Ppm ?? input.preNov2001RatePpm;
      if (rate === undefined || rate === null) throw new BettermentInputError("preNov2001RateRequired");
      const part = share(gain, dPre);
      const t = divRound(part * BigInt(rate), 1_000_000n);
      steps.push({ key: "periodPre2001", values: { days: dPre, totalDays: total, rate }, amount: t });
      acc += t;
    }
    if (d2001 > 0) {
      const part = share(gain, d2001);
      const t = divRound(part * BigInt(r.from2001Ppm), 1_000_000n);
      steps.push({ key: "period2001", values: { days: d2001, totalDays: total, rate: r.from2001Ppm }, amount: t });
      acc += t;
    }
    if (d2012 > 0) {
      const part = gain - (dPre > 0 ? share(gain, dPre) : 0n) - (d2001 > 0 ? share(gain, d2001) : 0n);
      const t = divRound(part * BigInt(r.from2012Ppm), 1_000_000n);
      steps.push({ key: "period2012", values: { days: d2012, totalDays: total, rate: r.from2012Ppm }, amount: t });
      acc += t;
    }
    return { tax: acc, exempt: 0n };
  };

  let tax = 0n;
  let exempt = 0n;
  if (real === 0n) {
    steps.push({ key: "noGain" });
  } else if (input.route === "SINGLE_RESIDENCE_EXEMPTION") {
    const ex = resolveRule(rows, "betterment_tax.single_residence_exemption", on);
    rulesUsed.push(ex.used);
    const heldEnough = addMonthsToDate(input.purchaseDate, ex.params.minHoldingMonths) <= input.saleDate;
    if (!input.onlyApartment) warnings.push("betterment.onlyApartmentRequired");
    if (!heldEnough) warnings.push("betterment.minHolding");
    const ceiling = BigInt(ex.params.ceiling);
    if (input.salePrice <= ceiling) {
      exempt = real;
      steps.push({ key: "fullExemption", values: { ceiling: ceiling.toString() }, amount: 0n });
    } else {
      // Gain attributable to the part of the price above the ceiling is taxable (linear-beneficial).
      const aboveShare = divRound(real * (input.salePrice - ceiling), input.salePrice);
      steps.push({ key: "aboveCeiling", values: { ceiling: ceiling.toString(), price: input.salePrice.toString() }, amount: aboveShare });
      const lt = linearTax(aboveShare, true);
      tax = lt.tax;
      exempt = real - aboveShare + lt.exempt;
    }
  } else {
    const lt = linearTax(real, input.route === "LINEAR_BENEFICIAL");
    tax = lt.tax;
    exempt = lt.exempt;
  }
  steps.push({ key: "totalTax", amount: tax });
  return {
    calculator: "betterment-tax",
    version: BETTERMENT_VERSION,
    rulesUsed,
    steps,
    result: { nominalGain: nominal, inflationaryAmount: infl, realGain: real, exemptGain: exempt, taxableGain: real - exempt, tax },
    warnings,
  };
}

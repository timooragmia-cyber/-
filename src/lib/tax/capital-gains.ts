import { divRound, type Agorot } from "@/lib/money";
import type { CalcResult, Step } from "./common";
import { cpiFor, inflationaryAmount, knownIndexPeriod, type CpiPoint } from "./cpi";
import { surtax } from "./income-tax";
import { resolveRule, type RuleUsed, type TaxRuleRow } from "./rules";

export const CAPITAL_GAINS_VERSION = "capital-gains@1";

/**
 * Sale of securities by an individual + dividend / interest income of the same year.
 * Indexation: CPI (Israeli CPI-linked computation), FX (foreign security: exchange-rate
 * linkage; falling currency → no inflationary amount), or NONE (nominal).
 * Losses: current real loss is offset against this sale's gain first; carried-forward losses
 * reduce the taxable gain; any remaining loss carries forward. Offsetting against dividends /
 * interest is shown as a note for the advisor (rate-dependent rules).
 */
export type CapitalGainsInput = {
  buyDate: string;
  sellDate: string;
  cost: Agorot; // incl. purchase commissions
  proceeds: Agorot; // net of sale commissions
  indexation: "CPI" | "FX" | "NONE";
  fxBuy?: number; // ILS per unit × 10,000 (e.g. 3.7000 → 37000)
  fxSell?: number;
  substantialShareholder: boolean;
  carriedLoss: Agorot;
  dividends: Agorot;
  dividendsSubstantial: boolean;
  interestUnlinked: Agorot;
  interestLinkedReal: Agorot;
  /** Other taxable income of the year (work, business) for the surtax test. */
  otherAnnualIncome?: Agorot;
  cpiBuy?: CpiPoint;
  cpiSell?: CpiPoint;
};

export type CapitalGainsResult = {
  nominalGain: Agorot;
  inflationaryAmount: Agorot;
  realGain: Agorot;
  lossUsed: Agorot;
  taxableGain: Agorot;
  gainTax: Agorot;
  dividendTax: Agorot;
  interestTax: Agorot;
  surtax: Agorot;
  totalTax: Agorot;
  lossCarriedForward: Agorot;
};

export function capitalGains(rows: readonly TaxRuleRow[], cpi: readonly CpiPoint[], input: CapitalGainsInput): CalcResult<CapitalGainsResult> {
  const on = new Date(`${input.sellDate}T00:00:00Z`);
  const sec = resolveRule(rows, "capital_gains.securities", on);
  const di = resolveRule(rows, "capital_gains.dividend_interest", on);
  const rulesUsed: RuleUsed[] = [sec.used, di.used];
  const steps: Step[] = [];
  const warnings: string[] = [];

  const nominal = input.proceeds - input.cost;
  let infl = 0n;
  if (nominal > 0n && input.indexation === "CPI") {
    const a = input.cpiBuy ?? cpiFor(cpi, knownIndexPeriod(input.buyDate));
    const b = input.cpiSell ?? cpiFor(cpi, knownIndexPeriod(input.sellDate));
    infl = inflationaryAmount(input.cost, a, b);
    steps.push({ key: "inflationaryCpi", values: { cpiStart: a.valueMilli, cpiEnd: b.valueMilli }, amount: infl });
  } else if (nominal > 0n && input.indexation === "FX") {
    if (!input.fxBuy || !input.fxSell) throw new Error("fxRequired");
    infl = input.fxSell > input.fxBuy ? divRound(input.cost * BigInt(input.fxSell - input.fxBuy), BigInt(input.fxBuy)) : 0n;
    steps.push({ key: "inflationaryFx", values: { fxBuy: input.fxBuy, fxSell: input.fxSell }, amount: infl });
    warnings.push("capitalGains.fxSimplified");
  }
  if (infl > nominal && nominal > 0n) infl = nominal; // inflationary amount never creates a loss
  const real = nominal - infl;
  steps.push({ key: "nominalGain", amount: nominal });
  steps.push({ key: "realGain", amount: real });

  let lossCarry = input.carriedLoss;
  let taxable = 0n;
  let lossUsed = 0n;
  if (real > 0n) {
    lossUsed = lossCarry < real ? lossCarry : real;
    taxable = real - lossUsed;
    lossCarry -= lossUsed;
    if (lossUsed > 0n) steps.push({ key: "lossOffset", amount: lossUsed });
  } else {
    lossCarry += -real;
    steps.push({ key: "realLoss", amount: -real });
  }
  const gainRate = input.substantialShareholder ? sec.params.substantialShareholderPpm : sec.params.individualRealPpm;
  const gainTax = divRound(taxable * BigInt(gainRate), 1_000_000n);
  steps.push({ key: "gainTax", values: { rate: gainRate }, amount: gainTax });

  const dividendTax = divRound(input.dividends * BigInt(input.dividendsSubstantial ? di.params.dividendSubstantialPpm : di.params.dividendPpm), 1_000_000n);
  if (input.dividends > 0n) steps.push({ key: "dividendTax", values: { rate: input.dividendsSubstantial ? di.params.dividendSubstantialPpm : di.params.dividendPpm }, amount: dividendTax });
  const interestTax =
    divRound(input.interestUnlinked * BigInt(di.params.interestUnlinkedNominalPpm), 1_000_000n) +
    divRound(input.interestLinkedReal * BigInt(di.params.interestLinkedRealPpm), 1_000_000n);
  if (interestTax > 0n) steps.push({ key: "interestTax", values: { unlinkedRate: di.params.interestUnlinkedNominalPpm, linkedRate: di.params.interestLinkedRealPpm }, amount: interestTax });
  if (lossCarry > 0n && (input.dividends > 0n || input.interestUnlinked > 0n || input.interestLinkedReal > 0n)) warnings.push("capitalGains.lossAgainstDividends");

  let sur = 0n;
  if (input.otherAnnualIncome !== undefined) {
    const st = resolveRule(rows, "surtax.high_income", on);
    rulesUsed.push(st.used);
    const capital = taxable + input.dividends + input.interestUnlinked + input.interestLinkedReal;
    const s = surtax(input.otherAnnualIncome + capital, capital, st.params);
    sur = s.tax;
    steps.push({ key: "surtax", values: { threshold: String(st.params.thresholdAnnual), above: s.base.toString(), capitalAbove: s.capitalAbove.toString() }, amount: sur });
  } else {
    warnings.push("capitalGains.surtaxNotChecked");
  }
  const total = gainTax + dividendTax + interestTax + sur;
  steps.push({ key: "totalTax", amount: total });
  return {
    calculator: "capital-gains",
    version: CAPITAL_GAINS_VERSION,
    rulesUsed,
    steps,
    result: { nominalGain: nominal, inflationaryAmount: infl, realGain: real, lossUsed, taxableGain: taxable, gainTax, dividendTax, interestTax, surtax: sur, totalTax: total, lossCarriedForward: lossCarry },
    warnings,
  };
}

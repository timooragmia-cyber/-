import { divRound, type Agorot } from "@/lib/money";
import { FACTOR_SCALE, monthlyFactorFromAnnualPpm } from "@/lib/math/fixed";
import type { CalcResult } from "./common";
import { resolveRule, type TaxRuleRow } from "./rules";

export const MONEY_MARKET_VERSION = "money-market@1";

/**
 * Money-market fund (קרן כספית) vs bank deposit over the same horizon.
 * Fund: compounds monthly at (gross yield − management fee); tax on the gain on the basis
 * configured in money_market_fund.tax (REAL → gain minus expected inflation on principal).
 * Deposit: compounds monthly at its rate; interest taxed at the unlinked nominal rate.
 * Expected inflation is an advisor input (shown), never a hidden assumption.
 */
export type MoneyMarketInput = { amount: Agorot; months: number; fundGrossYieldPpm: number; fundFeePpm: number; depositRatePpm: number; expectedInflationPpm: number; date: string };

const grow = (amount: Agorot, annualPpm: number, months: number) => {
  const f = monthlyFactorFromAnnualPpm(annualPpm);
  let v = amount * 1_000_000n;
  for (let i = 0; i < months; i++) v = (v * f) / FACTOR_SCALE;
  return divRound(v, 1_000_000n);
};

export function moneyMarketVsDeposit(rows: readonly TaxRuleRow[], input: MoneyMarketInput): CalcResult<{ fundNet: Agorot; depositNet: Agorot; fundTax: Agorot; depositTax: Agorot; difference: Agorot; fundNetAnnualPpm: number; depositNetAnnualPpm: number }> {
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 600) throw new Error("monthsRange");
  const on = new Date(`${input.date}T00:00:00Z`);
  const mm = resolveRule(rows, "money_market_fund.tax", on);
  const di = resolveRule(rows, "capital_gains.dividend_interest", on);
  const fundGross = grow(input.amount, input.fundGrossYieldPpm - input.fundFeePpm, input.months);
  const fundGain = fundGross - input.amount;
  const inflAmount = grow(input.amount, input.expectedInflationPpm, input.months) - input.amount;
  const fundTaxBase = mm.params.basis === "REAL" ? (fundGain - inflAmount > 0n ? fundGain - inflAmount : 0n) : fundGain > 0n ? fundGain : 0n;
  const fundTax = divRound(fundTaxBase * BigInt(mm.params.ratePpm), 1_000_000n);
  const depositGross = grow(input.amount, input.depositRatePpm, input.months);
  const depositInterest = depositGross - input.amount;
  const depositTax = divRound((depositInterest > 0n ? depositInterest : 0n) * BigInt(di.params.interestUnlinkedNominalPpm), 1_000_000n);
  const fundNet = fundGross - fundTax;
  const depositNet = depositGross - depositTax;
  const annualize = (net: Agorot) => (input.amount > 0n ? Number(((net - input.amount) * 1_000_000n * 12n) / (input.amount * BigInt(input.months))) : 0);
  return {
    calculator: "money-market",
    version: MONEY_MARKET_VERSION,
    rulesUsed: [mm.used, di.used],
    steps: [
      { key: "fundGrowth", values: { yieldPpm: input.fundGrossYieldPpm, feePpm: input.fundFeePpm, months: input.months }, amount: fundGain },
      { key: "inflationOnPrincipal", values: { inflationPpm: input.expectedInflationPpm }, amount: inflAmount },
      { key: "fundTax", values: { rate: mm.params.ratePpm, basis: mm.params.basis }, amount: fundTax },
      { key: "depositInterest", values: { ratePpm: input.depositRatePpm }, amount: depositInterest },
      { key: "depositTax", values: { rate: di.params.interestUnlinkedNominalPpm }, amount: depositTax },
      { key: "difference", amount: fundNet - depositNet },
    ],
    result: { fundNet, depositNet, fundTax, depositTax, difference: fundNet - depositNet, fundNetAnnualPpm: annualize(fundNet), depositNetAnnualPpm: annualize(depositNet) },
    warnings: ["moneyMarket.simpleAnnualized"],
  };
}

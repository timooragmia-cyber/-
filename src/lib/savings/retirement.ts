import { divRound, type Agorot } from "@/lib/money";
import { simulate } from "./fee-simulator";

export const ANNUITY_TYPES = new Set(["PENSION_COMPREHENSIVE", "PENSION_GENERAL", "MANAGERS_INSURANCE", "PROVIDENT_FUND"]);

export type ProjectionProduct = {
  id: string;
  productType: string;
  balance: Agorot;
  monthlyDeposit: Agorot; // total; used only while isActive
  isActive: boolean;
  feeDepositsPpm: number;
  feeAccumulationPpm: number;
};

export type Scenario = "conservative" | "base" | "optimistic";
export type Assumptions = {
  retirementAge: number;
  returns: Record<Scenario, number>; // real annual ppm
  depositGrowthPpm: number;
  annuityFactorMilli: number; // e.g. 200000 = 200.000
};

export type ScenarioResult = {
  scenario: Scenario;
  annuityCapital: Agorot;
  lumpSum: Agorot;
  /** Monthly pension in today's shekels, BEFORE tax (pension tax is Phase 3). */
  monthlyPension: Agorot;
  perProduct: { id: string; finalBalance: Agorot; totalFees: Agorot }[];
};

/** Months from asOf until the person reaches retirementAge (birthday month unknown → mid-year). */
export function monthsToRetirement(birthYear: number, retirementAge: number, asOf: Date): number {
  const months = (birthYear + retirementAge - asOf.getUTCFullYear()) * 12 + (6 - (asOf.getUTCMonth() + 1));
  return Math.max(0, months);
}

/**
 * Retirement projection for one person under three scenarios. Results are in REAL terms
 * (today's shekels) and before tax. Annuity products → capital ÷ annuity factor;
 * study funds and investment provident funds → lump sum.
 */
export function projectRetirement(products: readonly ProjectionProduct[], months: number, a: Assumptions): ScenarioResult[] {
  return (["conservative", "base", "optimistic"] as const).map((scenario) => {
    let annuityCapital = 0n;
    let lumpSum = 0n;
    const perProduct = products.map((p) => {
      const r = simulate({
        startBalance: p.balance,
        monthlyDeposit: p.isActive ? p.monthlyDeposit : 0n,
        months,
        annualReturnPpm: a.returns[scenario],
        depositGrowthPpm: a.depositGrowthPpm,
        feeDepositsPpm: p.feeDepositsPpm,
        feeAccumulationPpm: p.feeAccumulationPpm,
      });
      if (ANNUITY_TYPES.has(p.productType)) annuityCapital += r.finalBalance;
      else lumpSum += r.finalBalance;
      return { id: p.id, finalBalance: r.finalBalance, totalFees: r.totalFees };
    });
    const monthlyPension = a.annuityFactorMilli > 0 ? divRound(annuityCapital * 1000n, BigInt(a.annuityFactorMilli)) : 0n;
    return { scenario, annuityCapital, lumpSum, monthlyPension, perProduct };
  });
}

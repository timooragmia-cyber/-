import { divRound, type Agorot, type Ppm } from "@/lib/money";
import { FACTOR_SCALE, monthlyFactorFromAnnualPpm } from "@/lib/math/fixed";

export const FEE_SIM_VERSION = "fee-sim@1";

/**
 * Long-term savings projection with management fees (pure, integer-only).
 *
 * Monthly order (documented, shown on screen):
 *   1. deposit arrives;  2. deposit fee = deposit × feeDeposits is deducted;
 *   3. real return for the month: balance × (1 + r)^(1/12);
 *   4. accumulation fee for the month = balance × feeAccumulation / 12 is deducted
 *      (Israeli funds charge the annual accumulation fee monthly, pro rata).
 * Deposits grow once a year by depositGrowthPpm (real salary growth). Returns are REAL
 * (after inflation), so results are in today's shekels.
 * Internal precision: 1/1,000,000 agora; results rounded HALF_UP to whole agorot.
 */
export type SimInput = {
  startBalance: Agorot;
  monthlyDeposit: Agorot;
  months: number;
  annualReturnPpm: Ppm;
  depositGrowthPpm?: Ppm;
  feeDepositsPpm: Ppm;
  feeAccumulationPpm: Ppm;
};

export type SimYear = { year: number; endBalance: Agorot; deposits: Agorot; feesPaid: Agorot };
export type SimResult = {
  finalBalance: Agorot;
  totalDeposits: Agorot;
  feesFromDeposits: Agorot;
  feesFromAccumulation: Agorot;
  totalFees: Agorot;
  years: SimYear[];
  version: string;
};

const MICRO = 1_000_000n; // micro-agorot per agora
const out = (micro: bigint) => divRound(micro, MICRO, "HALF_UP");

export function simulate(input: SimInput): SimResult {
  if (!Number.isInteger(input.months) || input.months < 0 || input.months > 12 * 80) throw new Error("months out of range");
  for (const f of [input.feeDepositsPpm, input.feeAccumulationPpm]) if (!Number.isInteger(f) || f < 0 || f > 1_000_000) throw new Error("fee out of range");
  const factor = monthlyFactorFromAnnualPpm(input.annualReturnPpm);
  const growth = BigInt(input.depositGrowthPpm ?? 0);
  const feeDep = BigInt(input.feeDepositsPpm);
  const feeAcc = BigInt(input.feeAccumulationPpm);

  let bal = input.startBalance * MICRO;
  let deposit = input.monthlyDeposit * MICRO;
  let totalDep = 0n, feeD = 0n, feeA = 0n;
  let yDep = 0n, yFees = 0n;
  const years: SimYear[] = [];

  for (let m = 1; m <= input.months; m++) {
    const df = (deposit * feeDep) / 1_000_000n;
    bal += deposit - df;
    totalDep += deposit;
    yDep += deposit;
    feeD += df;
    yFees += df;
    bal = (bal * factor) / FACTOR_SCALE;
    const af = (bal * feeAcc) / 12_000_000n;
    bal -= af;
    feeA += af;
    yFees += af;
    if (m % 12 === 0 || m === input.months) {
      years.push({ year: Math.ceil(m / 12), endBalance: out(bal), deposits: out(yDep), feesPaid: out(yFees) });
      yDep = 0n;
      yFees = 0n;
      if (m % 12 === 0) deposit = deposit + (deposit * growth) / 1_000_000n;
    }
  }
  return {
    finalBalance: out(bal),
    totalDeposits: out(totalDep),
    feesFromDeposits: out(feeD),
    feesFromAccumulation: out(feeA),
    totalFees: out(feeD + feeA),
    years,
    version: FEE_SIM_VERSION,
  };
}

export type FeeComparison = {
  current: SimResult;
  target: SimResult;
  /** Extra balance at the horizon thanks to lower fees (today's shekels). */
  gainAtHorizon: Agorot;
  /** Fees avoided over the horizon. */
  feesSaved: Agorot;
  /** Average gain per year of the horizon. */
  gainPerYear: Agorot;
};

export function compareFees(base: Omit<SimInput, "feeDepositsPpm" | "feeAccumulationPpm">, current: { dep: Ppm; acc: Ppm }, target: { dep: Ppm; acc: Ppm }): FeeComparison {
  const c = simulate({ ...base, feeDepositsPpm: current.dep, feeAccumulationPpm: current.acc });
  const t = simulate({ ...base, feeDepositsPpm: target.dep, feeAccumulationPpm: target.acc });
  const gain = t.finalBalance - c.finalBalance;
  const yrs = BigInt(Math.max(1, Math.ceil(base.months / 12)));
  return { current: c, target: t, gainAtHorizon: gain, feesSaved: c.totalFees - t.totalFees, gainPerYear: divRound(gain, yrs) };
}

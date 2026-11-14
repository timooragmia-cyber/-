import { describe, expect, it } from "vitest";
import { FACTOR_SCALE, integerRoot, monthlyFactorFromAnnualPpm } from "@/lib/math/fixed";
import { feeFlags, targetFees, type FeeBenchmarkRow } from "@/lib/savings/fee-flags";
import { compareFees, simulate } from "@/lib/savings/fee-simulator";
import { monthsToRetirement, projectRetirement } from "@/lib/savings/retirement";

const sh = (v: number) => BigInt(Math.round(v * 100));
const within = (a: bigint, b: bigint, agorot = 1n) => expect(a > b ? a - b : b - a).toBeLessThanOrEqual(agorot);

describe("fixed-point math", () => {
  it("integer roots are exact", () => {
    expect(integerRoot(27n, 3)).toBe(3n);
    expect(integerRoot(26n, 3)).toBe(2n);
    expect(integerRoot(2n ** 120n, 12)).toBe(2n ** 10n);
    expect(integerRoot(10n ** 180n, 12)).toBe(10n ** 15n);
  });
  it("monthly factor^12 equals (1 + annual)", () => {
    const f = monthlyFactorFromAnnualPpm(35_000);
    const back = f ** 12n / FACTOR_SCALE ** 11n; // ≈ 1.035 × 10^15
    expect(Number(back - 1_035_000_000_000_000n)).toBeLessThanOrEqual(0);
    expect(Number(1_035_000_000_000_000n - back)).toBeLessThan(20);
    expect(monthlyFactorFromAnnualPpm(0)).toBe(FACTOR_SCALE);
  });
});

/*
 * Oracle: the same documented algorithm computed independently with 60-digit decimals
 * (Python `decimal`), see docs/calculations/fee-simulator.md.
 */
describe("fee simulator — hand-calculated examples", () => {
  it("return only: ₪100,000 at 12% real for 12 months = ₪112,000.00", () => {
    expect(simulate({ startBalance: sh(100_000), monthlyDeposit: 0n, months: 12, annualReturnPpm: 120_000, feeDepositsPpm: 0, feeAccumulationPpm: 0 }).finalBalance).toBe(sh(112_000));
  });
  it("deposit fee only: 12 × ₪1,000 at 2% = ₪11,760.00, fees ₪240.00", () => {
    const r = simulate({ startBalance: 0n, monthlyDeposit: sh(1000), months: 12, annualReturnPpm: 0, feeDepositsPpm: 20_000, feeAccumulationPpm: 0 });
    expect([r.finalBalance, r.feesFromDeposits, r.totalDeposits]).toEqual([sh(11_760), sh(240), sh(12_000)]);
  });
  it("accumulation fee only: ₪100,000 × (1 − 1.2%/12)^12 = ₪98,806.58", () => {
    const r = simulate({ startBalance: sh(100_000), monthlyDeposit: 0n, months: 12, annualReturnPpm: 0, feeDepositsPpm: 0, feeAccumulationPpm: 12_000 });
    expect(r.finalBalance).toBe(sh(98_806.58));
    expect(r.feesFromAccumulation).toBe(sh(1_193.42));
  });
  it("deposits grow once a year", () => {
    const r = simulate({ startBalance: 0n, monthlyDeposit: sh(1000), months: 24, annualReturnPpm: 0, depositGrowthPpm: 20_000, feeDepositsPpm: 0, feeAccumulationPpm: 0 });
    expect(r.totalDeposits).toBe(sh(24_240));
  });
  it("25-year comparison: 1.5%/0.30% → 1.0%/0.15%, ₪300k + ₪3k/month, 3.5% real", () => {
    const c = compareFees({ startBalance: sh(300_000), monthlyDeposit: sh(3_000), months: 300, annualReturnPpm: 35_000 }, { dep: 15_000, acc: 3_000 }, { dep: 10_000, acc: 1_500 });
    within(c.current.finalBalance, sh(2_006_106.4));
    within(c.target.finalBalance, sh(2_067_267.12));
    within(c.gainAtHorizon, sh(61_160.72), 2n);
    within(c.feesSaved, sh(42_916.26), 2n);
    expect(c.current.years).toHaveLength(25);
    expect(c.current.years.at(-1)!.endBalance).toBe(c.current.finalBalance);
  });
  it("rejects invalid input", () => {
    expect(() => simulate({ startBalance: 0n, monthlyDeposit: 0n, months: -1, annualReturnPpm: 0, feeDepositsPpm: 0, feeAccumulationPpm: 0 })).toThrow();
    expect(() => simulate({ startBalance: 0n, monthlyDeposit: 0n, months: 1, annualReturnPpm: 0, feeDepositsPpm: 2_000_000, feeAccumulationPpm: 0 })).toThrow();
  });
});

describe("fee flags", () => {
  const rows: FeeBenchmarkRow[] = [
    { productType: "PENSION_COMPREHENSIVE", feeBase: "DEPOSITS", benchmarkPpm: 10_000, legalCeilingPpm: 60_000, status: "UNVERIFIED" },
    { productType: "PENSION_COMPREHENSIVE", feeBase: "ACCUMULATION", benchmarkPpm: 1_500, legalCeilingPpm: 5_000, status: "UNVERIFIED" },
    { productType: "STUDY_FUND", feeBase: "ACCUMULATION", benchmarkPpm: 5_000, legalCeilingPpm: null, status: "MISSING" },
  ];
  it("flags above benchmark, above ceiling, ok and missing benchmark", () => {
    const f = feeFlags("PENSION_COMPREHENSIVE", { dep: 20_000, acc: 6_000 }, rows);
    expect(f.map((x) => [x.feeBase, x.level, x.gapPpm])).toEqual([["DEPOSITS", "ABOVE_BENCHMARK", 10_000], ["ACCUMULATION", "ABOVE_CEILING", 4_500]]);
    expect(feeFlags("PENSION_COMPREHENSIVE", { dep: 10_000, acc: 1_000 }, rows).map((x) => x.level)).toEqual(["OK", "OK"]);
    expect(feeFlags("STUDY_FUND", { dep: 0, acc: 7_000 }, rows).map((x) => x.level)).toEqual(["NO_BENCHMARK", "ABOVE_BENCHMARK"]);
  });
  it("target fees never exceed actual", () => {
    const f = feeFlags("PENSION_COMPREHENSIVE", { dep: 5_000, acc: 2_500 }, rows);
    expect(targetFees({ dep: 5_000, acc: 2_500 }, f)).toEqual({ dep: 5_000, acc: 1_500 });
  });
});

describe("retirement projection", () => {
  it("months to retirement (mid-year birthday convention)", () => {
    expect(monthsToRetirement(1984, 67, new Date("2026-11-14"))).toBe(25 * 12 - 5);
    expect(monthsToRetirement(1950, 67, new Date("2026-11-14"))).toBe(0);
  });
  it("annuity vs lump sum and monthly pension = capital ÷ factor", () => {
    const products = [
      { id: "p", productType: "PENSION_COMPREHENSIVE", balance: sh(100_000), monthlyDeposit: 0n, isActive: false, feeDepositsPpm: 0, feeAccumulationPpm: 0 },
      { id: "s", productType: "STUDY_FUND", balance: sh(50_000), monthlyDeposit: 0n, isActive: false, feeDepositsPpm: 0, feeAccumulationPpm: 0 },
    ];
    const r = projectRetirement(products, 0, { retirementAge: 67, returns: { conservative: 0, base: 0, optimistic: 0 }, depositGrowthPpm: 0, annuityFactorMilli: 200_000 });
    expect(r[1]).toMatchObject({ scenario: "base", annuityCapital: sh(100_000), lumpSum: sh(50_000), monthlyPension: sh(500) });
  });
  it("scenarios are ordered conservative ≤ base ≤ optimistic", () => {
    const products = [{ id: "p", productType: "PENSION_COMPREHENSIVE", balance: sh(200_000), monthlyDeposit: sh(2_500), isActive: true, feeDepositsPpm: 15_000, feeAccumulationPpm: 2_000 }];
    const r = projectRetirement(products, 240, { retirementAge: 67, returns: { conservative: 20_000, base: 35_000, optimistic: 50_000 }, depositGrowthPpm: 0, annuityFactorMilli: 200_000 });
    expect(r[0]!.annuityCapital < r[1]!.annuityCapital && r[1]!.annuityCapital < r[2]!.annuityCapital).toBe(true);
  });
});

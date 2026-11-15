import { describe, expect, it } from "vitest";
import { BASE_SCENARIO, mortgageSchedule, schedule, spitzerPayment, type Track } from "@/lib/debt/amortization";
import { consolidate, optimizeMix, rankDebts, refinance, type Debt } from "@/lib/debt/strategies";

const sh = (v: number) => BigInt(Math.round(v * 100));
const within = (a: bigint, b: bigint, tol = 1n) => expect(a > b ? a - b : b - a).toBeLessThanOrEqual(tol);

describe("Spitzer amortization (oracle: Python decimals)", () => {
  it("₪1,000,000 · 4.75% · 30 years → ₪5,216.47/month", () => {
    expect(spitzerPayment(sh(1_000_000), 47_500, 360)).toBe(sh(5_216.47));
  });
  it("₪500,000 · 5% · 20 years → ₪3,299.78/month", () => {
    expect(spitzerPayment(sh(500_000), 50_000, 240)).toBe(sh(3_299.78));
  });
  it("full schedule pays off exactly; total interest ≈ ₪877,930.62", () => {
    const s = schedule({ type: "FIXED_UNLINKED", balance: sh(1_000_000), remainingMonths: 360, annualRatePpm: 47_500, method: "SPITZER" });
    expect(s.rows).toHaveLength(360);
    expect(s.rows.at(-1)!.balance).toBe(0n);
    within(s.totalInterest, sh(877_930.62), 400n); // per-month rounding differs from the oracle by cents
    expect(s.totalPaid).toBe(sh(1_000_000) + s.totalInterest);
  });
  it("equal principal: ₪120,000 at 0% over 12 months = ₪10,000 each", () => {
    const s = schedule({ type: "FIXED_UNLINKED", balance: sh(120_000), remainingMonths: 12, annualRatePpm: 0, method: "EQUAL_PRINCIPAL" });
    expect(new Set(s.rows.map((r) => r.payment))).toEqual(new Set([sh(10_000)]));
  });
});

describe("linked and variable tracks", () => {
  const linked: Track = { type: "FIXED_LINKED", balance: sh(300_000), remainingMonths: 120, annualRatePpm: 30_000, method: "SPITZER" };
  it("CPI-linked: indexation adds to the balance; total paid = principal + interest + indexation", () => {
    const s = schedule(linked, { ...BASE_SCENARIO, inflationPpm: 30_000 });
    expect(s.totalIndexation > 0n).toBe(true);
    expect(s.totalPaid).toBe(sh(300_000) + s.totalInterest + s.totalIndexation);
    expect(s.rows.at(-1)!.payment > s.firstPayment).toBe(true); // payments rise with CPI
  });
  it("prime falling by 1% after 12 months lowers later payments", () => {
    const prime: Track = { type: "PRIME", balance: sh(400_000), remainingMonths: 240, annualRatePpm: 47_500, method: "SPITZER" };
    const s = schedule(prime, { ...BASE_SCENARIO, primeDeltaPpm: -10_000, primeChangeAfter: 12 });
    expect(s.rows[12]!.ratePpm).toBe(37_500);
    expect(s.rows[12]!.payment < s.rows[11]!.payment).toBe(true);
  });
  it("variable-5 resets at month 61 by the scenario delta", () => {
    const v: Track = { type: "VARIABLE_5_UNLINKED", balance: sh(200_000), remainingMonths: 180, annualRatePpm: 50_000, method: "SPITZER", monthsToReset: 60 };
    const s = schedule(v, { ...BASE_SCENARIO, resetDeltaPpm: 10_000 });
    expect([s.rows[59]!.ratePpm, s.rows[60]!.ratePpm]).toEqual([50_000, 60_000]);
  });
});

describe("refinance, mix, debts", () => {
  const current: Track[] = [{ type: "FIXED_UNLINKED", balance: sh(600_000), remainingMonths: 240, annualRatePpm: 60_000, method: "SPITZER" }];
  const proposed: Track[] = [{ type: "FIXED_UNLINKED", balance: sh(600_000), remainingMonths: 240, annualRatePpm: 48_000, method: "SPITZER" }];
  it("refinance: lower monthly payment, break-even month after one-off costs", () => {
    const r = refinance(current, proposed, { earlyRepaymentFee: sh(12_000), openingCosts: sh(3_000) }, BASE_SCENARIO);
    expect(r.monthlyChange < 0n).toBe(true);
    const monthlySaving = -r.monthlyChange;
    expect(r.breakEvenMonths).toBe(Number((sh(15_000) + monthlySaving - 1n) / monthlySaving));
    expect(r.totalSaving).toBe(mortgageSchedule(current).totalPaid - mortgageSchedule(proposed).totalPaid - sh(15_000));
  });
  it("mix optimizer respects the configured constraints", () => {
    const r = optimizeMix(sh(1_000_000), 300, { PRIME: 47_500, FIXED_UNLINKED: 50_000, FIXED_LINKED: 35_000, VARIABLE_5_UNLINKED: 46_000, VARIABLE_5_LINKED: 34_000 }, { minFixedPpm: 333_333, maxVariablePpm: 666_667 }, {
      base: { ...BASE_SCENARIO, inflationPpm: 25_000 },
      stress: { primeDeltaPpm: 20_000, primeChangeAfter: 12, resetDeltaPpm: 20_000, inflationPpm: 40_000 },
      falling: { primeDeltaPpm: -10_000, primeChangeAfter: 12, resetDeltaPpm: -10_000, inflationPpm: 20_000 },
    })!;
    for (const pick of [r.cheapest, r.safest, r.balanced]) {
      expect(pick.mix.FIXED_UNLINKED! + pick.mix.FIXED_LINKED!).toBeGreaterThanOrEqual(333_333);
      expect(pick.mix.PRIME!).toBeLessThanOrEqual(666_667);
    }
    expect(r.safest.stressMax <= r.cheapest.stressMax).toBe(true);
    expect(r.cheapest.baseTotal <= r.safest.baseTotal).toBe(true);
  });
  it("optimizer fast path equals the full mortgageSchedule() for its picks, and is fast", () => {
    const rates = { PRIME: 47_500, FIXED_UNLINKED: 50_000, FIXED_LINKED: 35_000, VARIABLE_5_UNLINKED: 46_000, VARIABLE_5_LINKED: 34_000 };
    const sc = {
      base: { ...BASE_SCENARIO, inflationPpm: 25_000 },
      stress: { primeDeltaPpm: 20_000, primeChangeAfter: 12, resetDeltaPpm: 20_000, inflationPpm: 40_000 },
      falling: { primeDeltaPpm: -10_000, primeChangeAfter: 12, resetDeltaPpm: -10_000, inflationPpm: 20_000 },
    };
    const t0 = performance.now();
    const r = optimizeMix(sh(1_000_000), 300, rates, { minFixedPpm: 333_333, maxVariablePpm: 666_667 }, sc)!;
    expect(performance.now() - t0).toBeLessThan(3_000);
    const types = ["PRIME", "FIXED_UNLINKED", "FIXED_LINKED", "VARIABLE_5_UNLINKED"] as const;
    for (const pick of [r.cheapest, r.safest, r.balanced]) {
      const tracks = types
        .map((type) => ({ type, balance: (sh(1_000_000) * BigInt(pick.mix[type]! / 100_000) + 5n) / 10n, remainingMonths: 300, annualRatePpm: rates[type], method: "SPITZER" as const }))
        .filter((t) => t.balance > 0n);
      expect(pick.baseTotal).toBe(mortgageSchedule(tracks, sc.base).totalPaid);
      expect(pick.stressMax).toBe(mortgageSchedule(tracks, sc.stress).maxPayment);
      expect(pick.fallingTotal).toBe(mortgageSchedule(tracks, sc.falling).totalPaid);
      expect(pick.firstPayment).toBe(mortgageSchedule(tracks, sc.base).firstPayment);
    }
  });
  const debts: Debt[] = [
    { id: "car", label: "רכב", kind: "CAR_LOAN", balance: sh(40_000), annualRatePpm: 69_000, monthlyPayment: sh(1_350), remainingMonths: 32 },
    { id: "od", label: "מינוס", kind: "OVERDRAFT", balance: sh(11_800), annualRatePpm: 129_000, monthlyPayment: 0n, remainingMonths: null },
    { id: "cons", label: "הלוואה צרכנית", kind: "CONSUMER_LOAN", balance: sh(25_000), annualRatePpm: 95_000, monthlyPayment: sh(1_600), remainingMonths: 17 },
  ];
  it("ranks debts by effective interest and flags expensive ones", () => {
    const r = rankDebts(debts, 80_000);
    expect(r.map((d) => [d.id, d.expensive])).toEqual([["od", true], ["cons", true], ["car", false]]);
    expect(r[0]!.annualInterest).toBe(sh(1_522.2));
    expect(rankDebts(debts, null)[0]!.expensive).toBeNull();
  });
  it("consolidation: before/after monthly payment and total cost", () => {
    const c = consolidate(debts.filter((d) => d.id !== "car"), { annualRatePpm: 70_000, months: 36, fee: sh(500) });
    expect(c.balance).toBe(sh(37_300));
    expect(c.afterMonthly).toBe(spitzerPayment(sh(37_300), 70_000, 36));
    expect(c.beforeMonthly).toBe(sh(1_600));
    expect(c.afterTotal).toBe(c.afterMonthly * 36n);
  });
});

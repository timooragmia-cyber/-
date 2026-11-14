import { describe, expect, it } from "vitest";
import { generatePlan, type PlanInput } from "@/lib/plan/engine";

const sh = (v: number) => BigInt(Math.round(v * 100));
const base: PlanInput = {
  emergencyFundMonths: 0.5, emergencyTargetMonths: 6, avgMonthlyExpenses: sh(20_000), avgMonthlySurplus: sh(4_000), liquidAssets: sh(10_000),
  debts: [{ id: "od", label: "מינוס", balance: sh(11_800), annualRatePpm: 129_000, expensive: true }, { id: "car", label: "רכב", balance: sh(40_000), annualRatePpm: 69_000, expensive: false }],
  feeProducts: [{ id: "p1", label: "פנסיה", gainAtHorizon: sh(25_710), years: 25 }, { id: "p2", label: "השתלמות", gainAtHorizon: 0n, years: 28 }],
  subscriptions: [{ key: "gym", label: "הולמס פלייס", annualCost: sh(2_988) }, { key: "tiny", label: "אפליקציה", annualCost: sh(60) }],
  monthlyBankFees: sh(130), hasSavingsTransfer: false, bestRoute: { key: "money_market", netGainPerYearPer100k: sh(2_900) },
  params: { savingsShareOfSurplusPpm: 500_000, minSubscriptionAnnual: sh(300) },
};

describe("action plan engine — conservative order", () => {
  const plan = generatePlan(base);
  it("orders: emergency fund → expensive debt → fees → leaks → bank fees → automate (no invest yet)", () => {
    expect(plan.map((r) => r.ruleKey)).toEqual(["EMERGENCY_FUND", "EXPENSIVE_DEBT", "REDUCE_FEES", "CUT_LEAK", "BANK_FEES", "AUTOMATE_SAVINGS"]);
    expect(plan.map((r) => r.priority)).toEqual([10, 20, 30, 40, 50, 60]);
  });
  it("emergency fund: gap = 6 × 20,000 − 10,000 = ₪110,000; 50% of surplus = ₪2,000/month → 55 months", () => {
    expect(plan[0]).toMatchObject({ reason: { gap: sh(110_000).toString(), monthly: sh(2_000).toString(), monthsToGoal: 55 }, impactMonthly: sh(2_000) });
  });
  it("expensive debt impact = yearly interest avoided (11,800 × 12.9% = ₪1,522.20)", () => {
    expect(plan[1]).toMatchObject({ dedupKey: "EXPENSIVE_DEBT:od", impactLifetime: sh(1_522.2) });
  });
  it("only fee products with a real gain, and only subscriptions above the minimum", () => {
    expect(plan.filter((r) => r.ruleKey === "REDUCE_FEES").map((r) => r.dedupKey)).toEqual(["REDUCE_FEES:p1"]);
    expect(plan.filter((r) => r.ruleKey === "CUT_LEAK").map((r) => r.dedupKey)).toEqual(["CUT_LEAK:gym"]);
  });
  it("invest only after the emergency fund is complete and no expensive debt remains", () => {
    const ready = generatePlan({ ...base, emergencyFundMonths: 8, liquidAssets: sh(160_000), debts: [{ id: "car", label: "רכב", balance: sh(40_000), annualRatePpm: 69_000, expensive: false }], hasSavingsTransfer: true });
    const inv = ready.find((r) => r.ruleKey === "INVEST_SURPLUS")!;
    expect(inv.reason).toMatchObject({ amount: sh(40_000).toString(), route: "money_market" }); // 160k − 6 × 20k
    expect(inv.impactLifetime).toBe(sh(1_160)); // 40,000 × 2,900/100,000
    expect(ready.some((r) => r.ruleKey === "EMERGENCY_FUND" || r.ruleKey === "EXPENSIVE_DEBT")).toBe(false);
  });
  it("unknown debt status blocks investing (conservative)", () => {
    const unknown = generatePlan({ ...base, emergencyFundMonths: 8, liquidAssets: sh(160_000), debts: [{ id: "x", label: "?", balance: sh(1), annualRatePpm: 50_000, expensive: null }] });
    expect(unknown.some((r) => r.ruleKey === "INVEST_SURPLUS")).toBe(false);
  });
});

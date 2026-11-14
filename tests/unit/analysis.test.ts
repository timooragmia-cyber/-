import { describe, expect, it } from "vitest";
import { computeHealthScore } from "@/lib/analysis/health-score";
import { monthOverMonthHighlights } from "@/lib/analysis/highlights";
import { computeMonthClose, deserializeClose, serializeClose, type CloseCategory, type CloseTxn } from "@/lib/analysis/month-close";
import { detectRecurring, installmentBurden } from "@/lib/analysis/recurring";

const cats = new Map<string, CloseCategory>([
  ["sal", { id: "sal", key: "income_salary", kind: "INCOME", nature: null }],
  ["gro", { id: "gro", key: "groceries", kind: "EXPENSE", nature: "VARIABLE" }],
  ["hou", { id: "hou", key: "housing", kind: "EXPENSE", nature: "FIXED" }],
  ["lei", { id: "lei", key: "leisure", kind: "EXPENSE", nature: "DISCRETIONARY" }],
  ["cp", { id: "cp", key: "card_payment", kind: "TRANSFER", nature: null }],
]);
const tx = (id: string, amount: bigint, categoryId: string | null, accountKind: CloseTxn["accountKind"] = "BANK_ACCOUNT"): CloseTxn => ({ id, amount, categoryId, accountKind, isTransfer: false });

/*
 * Hand-calculated example (documented):
 *   Salary            +20,000.00
 *   Rent               -6,000.00 (fixed)
 *   Card: groceries    -3,000.00, refund +200.00 → groceries 2,800.00
 *   Card: leisure      -1,200.00 (discretionary)
 *   Bank: card payment -4,000.00 → TRANSFER, excluded (counted via card lines)
 *   Unknown outflow      -500.00 → uncategorized
 *   Income 20,000 | Expenses 6,000+2,800+1,200+500 = 10,500 | Surplus 9,500
 *   Savings rate 9,500/20,000 = 47.5% = 475,000 ppm
 *   Fixed ratio 6,000/20,000 = 30% ; Discretionary 1,200/20,000 = 6%
 *   Variable = groceries 2,800 + uncategorized 500 = 3,300
 */
describe("computeMonthClose — documented example", () => {
  const txns = [
    tx("1", 2_000_000n, "sal"),
    tx("2", -600_000n, "hou"),
    tx("3", -300_000n, "gro", "CREDIT_CARD"),
    tx("4", 20_000n, "gro", "CREDIT_CARD"),
    tx("5", -120_000n, "lei", "CREDIT_CARD"),
    tx("6", -400_000n, "cp"),
    tx("7", -50_000n, null),
  ];
  const r = computeMonthClose("2026-10", txns, cats, new Map([["gro", 250_000n], ["hou", 600_000n]]));

  it("totals", () => {
    expect(r.totalIncome).toBe(2_000_000n);
    expect(r.totalExpenses).toBe(1_050_000n);
    expect(r.surplus).toBe(950_000n);
    expect(r.savingsRatePpm).toBe(475_000);
    expect(r.fixedCostRatioPpm).toBe(300_000);
    expect(r.discretionaryRatioPpm).toBe(60_000);
    expect(r.byNature).toEqual({ FIXED: 600_000n, VARIABLE: 330_000n, DISCRETIONARY: 120_000n });
  });
  it("excludes transfers and explains it", () => {
    expect(r.excludedTransfers).toEqual({ count: 1, amount: -400_000n });
  });
  it("where did the money go — sorted, with budget vs actual", () => {
    expect(r.expenses.map((l) => [l.key, l.amount, l.budget])).toEqual([
      ["housing", 600_000n, 600_000n],
      ["groceries", 280_000n, 250_000n],
      ["leisure", 120_000n, null],
      ["uncategorized", 50_000n, null],
    ]);
  });
  it("warnings", () => {
    expect(r.warnings).toEqual(["UNCATEGORIZED"]);
    expect(r.uncategorizedCount).toBe(1);
  });
  it("is deterministic and serializes losslessly", () => {
    const again = computeMonthClose("2026-10", [...txns].reverse(), cats, new Map([["gro", 250_000n], ["hou", 600_000n]]));
    expect(again.transactionsSha256).toBe(r.transactionsSha256);
    expect(deserializeClose(serializeClose(r))).toEqual(r);
  });
  it("flags card payment without card data and empty month", () => {
    expect(computeMonthClose("2026-10", [tx("a", 100n, "sal"), tx("b", -50n, "cp")], cats, new Map()).warnings).toContain("CARD_PAYMENT_WITHOUT_CARD_DATA");
    expect(computeMonthClose("2026-10", [], cats, new Map())).toMatchObject({ savingsRatePpm: null, warnings: ["NO_TRANSACTIONS"] });
  });
});

describe("recurring & installments", () => {
  const row = (date: string, amount: bigint, description: string, extra: Partial<{ installmentNumber: number; installmentTotal: number; categoryKey: string }> = {}) => ({
    date, amount, description, categoryKey: extra.categoryKey ?? null, installmentTotal: extra.installmentTotal ?? null, installmentNumber: extra.installmentNumber ?? null,
  });
  const txns = [
    row("2026-07-03", -5490n, "NETFLIX.COM 1", { categoryKey: "subscriptions" }),
    row("2026-08-03", -5490n, "NETFLIX.COM 2", { categoryKey: "subscriptions" }),
    row("2026-09-03", -5990n, "NETFLIX.COM 3", { categoryKey: "subscriptions" }),
    row("2026-07-10", -40000n, "שופרסל"),
    row("2026-08-10", -90000n, "שופרסל"),
    row("2026-09-10", -30000n, "שופרסל"),
    row("2026-08-01", -12900n, "ספוטיפיי"),
    row("2026-08-15", -30000n, "ACE", { installmentNumber: 2, installmentTotal: 12 }),
    row("2026-09-15", -30000n, "ACE", { installmentNumber: 3, installmentTotal: 12 }),
    row("2026-09-20", -50000n, "מחשב KSP", { installmentNumber: 6, installmentTotal: 6 }),
  ];
  it("weekly shopping with a stable monthly total is NOT a recurring charge", () => {
    const weekly = ["07", "08", "09"].flatMap((m) => [3, 10, 17, 24].map((d) => row(`2026-${m}-${d}`, -50000n, "רמי לוי")));
    expect(detectRecurring(weekly, { minMonths: 3, tolerancePpm: 150_000 })).toEqual([]);
  });
  it("detects stable monthly charges only (variable groceries and one-offs excluded)", () => {
    const r = detectRecurring(txns, { minMonths: 3, tolerancePpm: 150_000 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ merchantKey: "netflix com", typicalAmount: 5490n, annualCost: 65880n, isSubscriptionLike: true });
  });
  it("installment burden: latest payment, remaining = (12-3) × 300 = 2,700; finished plans dropped", () => {
    const b = installmentBurden(txns);
    expect(b.plans).toHaveLength(1);
    expect(b.plans[0]).toMatchObject({ paid: 3, total: 12, remainingPayments: 9, remainingAmount: 270000n });
    expect(b.totalRemaining).toBe(270000n);
  });
});

describe("highlights", () => {
  it("groceries down 12% → favorable, small moves ignored", () => {
    const base = computeMonthClose("2026-09", [tx("1", 2_000_000n, "sal"), tx("2", -500_000n, "gro"), tx("3", -100_000n, "lei")], cats, new Map());
    const cur = computeMonthClose("2026-10", [tx("1", 2_000_000n, "sal"), tx("2", -440_000n, "gro"), tx("3", -101_000n, "lei")], cats, new Map());
    const h = monthOverMonthHighlights(cur, base, { minChangePpm: 50_000, minChangeAgorot: 20_000, max: 5 });
    expect(h).toEqual([{ categoryKey: "groceries", direction: "DOWN", changePpm: 120_000, delta: -60_000n, favorable: true, kind: "EXPENSE" }]);
  });
});

describe("health score", () => {
  const w = { savingsRate: 30, emergencyFund: 25, debtLoad: 25, fixedCostRatio: 20 };
  const t = { savingsRateGoodPpm: 200_000, fixedCostRatioGoodPpm: 500_000, fixedCostRatioBadPpm: 800_000, emergencyFundGoodMonths: 6 };
  it("uses only available components and re-normalizes weights", () => {
    // savings 10% → 50 ; fixed 65% → 50 ; weights 30/20 → (50*30+50*20)/50 = 50
    const r = computeHealthScore({ savingsRatePpm: 100_000, fixedCostRatioPpm: 650_000, emergencyFundMonths: null, debtServiceRatioPpm: null }, w, t);
    expect(r.score).toBe(50);
    expect(r.components.filter((c) => c.score === null).map((c) => c.key)).toEqual(["emergencyFund", "debtLoad"]);
  });
  it("clamps and handles deficits", () => {
    const r = computeHealthScore({ savingsRatePpm: -150_000, fixedCostRatioPpm: 400_000, emergencyFundMonths: null, debtServiceRatioPpm: null }, w, t);
    // savings 0 (×30), fixed 100 (×20) → 2000/50 = 40
    expect(r.score).toBe(40);
  });
  it("null when nothing is known", () => {
    expect(computeHealthScore({ savingsRatePpm: null, fixedCostRatioPpm: null, emergencyFundMonths: null, debtServiceRatioPpm: null }, w, t).score).toBeNull();
  });
});

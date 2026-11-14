import { describe, expect, it } from "vitest";
import { taxRules } from "../../prisma/seed/tax-rules";
import { allocation, irrFlows, monthlySeries, replay, unrealizedTax, type PHolding, type PTxn } from "@/lib/invest/portfolio";
import { appreciate, exitScenario, propertyYields, type PropertyInput } from "@/lib/invest/real-estate";
import { moneyWeightedReturn, timeWeightedReturn } from "@/lib/invest/returns";
import { compareRoutes, netAnnualYield, prerequisites, type RouteDef } from "@/lib/invest/routes";
import type { TaxRuleRow } from "@/lib/tax/rules";

const rows: TaxRuleRow[] = taxRules.map((r, i) => ({ id: `r${i}`, ruleKey: r.ruleKey, parameters: r.params, effectiveFrom: new Date(`${r.effectiveFrom}T00:00:00Z`), effectiveTo: r.effectiveTo ? new Date(`${r.effectiveTo}T00:00:00Z`) : null, status: r.params === null ? "MISSING" : "UNVERIFIED", sourceUrl: r.sourceUrl }));
const sh = (v: number) => BigInt(Math.round(v * 100));
const near = (a: number, b: number, tol = 2) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

describe("real estate", () => {
  const p: PropertyInput = {
    usage: "INVESTMENT", isOnlyApartment: false, purchaseDate: "2015-01-01", purchasePrice: sh(1_000_000), purchaseCosts: sh(80_000), improvementCosts: sh(20_000),
    currentValue: sh(1_800_000), monthlyRent: sh(5_000), monthlyExpenses: sh(600), mortgageBalance: sh(900_000), monthlyMortgagePayment: sh(4_200),
  };
  it("yields: gross 3.333%, net 2.933%, cash on equity 0.267%", () => {
    const y = propertyYields(p);
    expect(y).toMatchObject({ grossYieldPpm: 33_333, netYieldPpm: 29_333, equity: sh(900_000), annualNetCashflow: sh(2_400), cashOnEquityPpm: 2_667, totalInvested: sh(1_100_000), unrealizedGain: sh(700_000) });
  });
  it("appreciation: ₪1,000,000 at 3% for 10 years = ₪1,343,916.38", () => {
    expect(appreciate(sh(1_000_000), 30_000, 10)).toBe(sh(1_343_916.38));
  });
  it("exit: sale ₪1.6M, 2% costs, CPI 100→110, linear-beneficial (post-2014: all taxed 25%), mortgage ₪400k", () => {
    const e = exitScenario(rows, { ...p, mortgageBalance: sh(400_000) }, {
      saleDate: "2026-01-01", salePrice: sh(1_600_000), sellingCostsPpm: 20_000, expectedInflationPpm: 0,
      cpiAtPurchase: { period: "a", valueMilli: 100_000, base: "T" }, cpiAtSale: { period: "b", valueMilli: 110_000, base: "T" },
    });
    expect(e).toMatchObject({ route: "LINEAR_BENEFICIAL", sellingCosts: sh(32_000), bettermentTax: sh(89_500), netProceeds: sh(1_078_500), profitAfterAll: sh(378_500) });
  });
  it("owner's only residence uses the single-residence exemption route", () => {
    const e = exitScenario(rows, { ...p, usage: "RESIDENCE", isOnlyApartment: true }, { saleDate: "2026-01-01", salePrice: sh(1_600_000), sellingCostsPpm: 0, expectedInflationPpm: 20_000 });
    expect(e.route).toBe("SINGLE_RESIDENCE_EXEMPTION");
    expect(e.bettermentTax).toBe(0n);
    expect(e.warnings).toContain("realEstate.cpiProjected");
  });
});

describe("returns", () => {
  it("TWR (Modified Dietz chained): +10% then +7.78% with a mid-month deposit = 18.556%", () => {
    const r = timeWeightedReturn([
      { period: "2026-01", value: sh(100_000), netFlow: 0n },
      { period: "2026-02", value: sh(110_000), netFlow: 0n },
      { period: "2026-03", value: sh(170_500), netFlow: sh(50_000) },
    ])!;
    near(r.cumulativePpm, 185_556, 1);
    expect(r.annualizedPpm).toBeNull(); // < 12 months: not annualized
  });
  it("IRR: −100,000 then +112,000 after 12 months = 12%/year", () => {
    const flows = [-sh(100_000), ...Array(11).fill(0n), sh(112_000)];
    near(moneyWeightedReturn(flows)!, 120_000, 2);
  });
  it("IRR undefined without both signs", () => {
    expect(moneyWeightedReturn([sh(1), sh(2)])).toBeNull();
  });
});

describe("portfolio", () => {
  const holdings: PHolding[] = [{ id: "A", name: "קרן מחקה ת\"א 125", assetClass: "EQUITY_IL" }, { id: "B", name: "אג\"ח ממשלתי", assetClass: "BONDS_GOV" }];
  const U = (n: number) => BigInt(n) * 1_000_000n;
  const txns: PTxn[] = [
    { date: "2026-01-02", type: "DEPOSIT", holdingId: null, units: 0n, amount: sh(100_000), feeKind: null },
    { date: "2026-01-03", type: "BUY", holdingId: "A", units: U(600), amount: sh(60_000), feeKind: null },
    { date: "2026-01-03", type: "BUY", holdingId: "B", units: U(300), amount: sh(30_000), feeKind: null },
    { date: "2026-01-31", type: "FEE", holdingId: null, units: 0n, amount: sh(100), feeKind: "CUSTODY" },
    { date: "2026-02-10", type: "SELL", holdingId: "A", units: U(300), amount: sh(33_000), feeKind: null },
    { date: "2026-02-20", type: "DIVIDEND", holdingId: "A", units: 0n, amount: sh(500), feeKind: null },
  ];
  const vals = [{ holdingId: "A", asOf: "2026-02-28", value: sh(32_000) }, { holdingId: "B", asOf: "2026-02-28", value: sh(31_000) }];
  it("average cost, realized/unrealized, cash and fees", () => {
    const r = replay(holdings, txns, vals);
    expect(r.holdings.map((h) => [h.holding.id, h.costBasis, h.realizedGain, h.unrealizedGain])).toEqual([["A", sh(30_000), sh(3_000), sh(2_000)], ["B", sh(30_000), 0n, sh(1_000)]]);
    expect(r).toMatchObject({ cash: sh(43_400), totalValue: sh(106_400), totalFees: sh(100), dividends: sh(500), realizedGain: sh(3_000), unrealizedGain: sh(3_000) });
    expect(unrealizedTax(r.holdings, 250_000)).toBe(sh(750));
  });
  it("detects overselling instead of producing negative units", () => {
    expect(replay(holdings, [...txns, { date: "2026-03-01", type: "SELL", holdingId: "B", units: U(999), amount: sh(1), feeKind: null }], vals).errors).toEqual(["oversell:2026-03-01"]);
  });
  it("allocation vs target with drift", () => {
    const r = replay(holdings, txns, vals);
    const a = allocation(r.holdings, r.cash, { EQUITY_IL: 600_000, BONDS_GOV: 300_000, CASH: 100_000 });
    const cash = a.find((x) => x.assetClass === "CASH")!;
    expect(cash.actualPpm).toBe(407_895); // 43,400 / 106,400
    expect(cash.driftPpm).toBe(307_895);
  });
  it("monthly series and IRR flows", () => {
    const s = monthlySeries(holdings, txns, vals, ["2026-01", "2026-02"]);
    expect(s[0]).toMatchObject({ netFlow: sh(100_000), value: sh(99_900) }); // unvalued holdings at cost, minus fee
    expect(s[1]!.value).toBe(sh(106_400));
    expect(irrFlows(s)).toEqual([-sh(100_000), sh(106_400)]);
  });
});

describe("route comparison", () => {
  const routes: RouteDef[] = [
    { key: "deposit", expectedReturnPpm: 42_000, feePpm: 0, tax: "DEPOSIT_UNLINKED", risk: "VERY_LOW", liquidity: "AT_MATURITY" },
    { key: "mmf", expectedReturnPpm: 45_000, feePpm: 2_500, tax: "MONEY_MARKET", risk: "VERY_LOW", liquidity: "DAILY" },
    { key: "equity", expectedReturnPpm: 70_000, feePpm: 5_000, tax: "SECURITIES_REAL", risk: "MEDIUM", liquidity: "DAILY" },
    { key: "study", expectedReturnPpm: 60_000, feePpm: 5_000, tax: "STUDY_FUND_EXEMPT", risk: "MEDIUM", liquidity: "YEARS", maxAnnualContribution: Number(sh(20_566)) },
  ];
  it("₪100,000 for 12 months, inflation 3%: after-fee, after-tax, sorted, suitability for LOW tolerance", () => {
    const { results, rulesUsed } = compareRoutes(rows, routes, { amount: sh(100_000), months: 12, expectedInflationPpm: 30_000, riskTolerance: "LOW", date: "2026-06-01" });
    expect(results.map((r) => [r.key, r.finalNet, r.tax, r.suitable])).toEqual([
      ["equity", sh(105_625), sh(875), false],
      ["study", sh(105_500), 0n, false],
      ["mmf", sh(103_937.5), sh(312.5), true],
      ["deposit", sh(103_570), sh(630), true],
    ]);
    expect(results.find((r) => r.key === "study")!.note).toBe("studyFundAboveCap");
    expect(rulesUsed.map((r) => r.ruleKey).sort()).toEqual(["capital_gains.dividend_interest", "capital_gains.securities", "money_market_fund.tax"]);
  });
  it("no risk tolerance assigned → nothing is marked suitable", () => {
    expect(compareRoutes(rows, routes, { amount: sh(1_000), months: 12, expectedInflationPpm: 0, riskTolerance: null, date: "2026-06-01" }).results.every((r) => !r.suitable)).toBe(true);
  });
  it("conservative order: missing emergency fund → gap amount", () => {
    const p = prerequisites({ emergencyFundMonths: 1.5, emergencyTargetMonths: 6, avgMonthlyExpenses: sh(20_000), expensiveDebt: "UNKNOWN", feeFlaggedProducts: 2, riskAssessed: true });
    expect(p.items.map((i) => [i.key, i.status])).toEqual([["EMERGENCY_FUND", "MISSING"], ["EXPENSIVE_DEBT", "UNKNOWN"], ["FEES", "MISSING"], ["RISK_ASSESSED", "OK"]]);
    expect(p.emergencyGap).toBe(sh(90_000));
  });
  it("net annual yield for deposits / money-market", () => {
    expect(netAnnualYield("BANK_DEPOSIT", 42_000, 0, 30_000, { depositUnlinkedPpm: 150_000, mmfPpm: 250_000, mmfBasis: "REAL" })).toEqual({ netPpm: 35_700, realNetPpm: 5_700 });
    expect(netAnnualYield("MONEY_MARKET_FUND", 45_000, 2_500, 30_000, { depositUnlinkedPpm: 150_000, mmfPpm: 250_000, mmfBasis: "REAL" })).toEqual({ netPpm: 39_375, realNetPpm: 9_375 });
  });
});

import { describe, expect, it } from "vitest";
import { taxRules } from "../../prisma/seed/tax-rules";
import { bettermentTax } from "@/lib/tax/betterment-tax";
import { capitalGains } from "@/lib/tax/capital-gains";
import { knownIndexPeriod, type CpiPoint } from "@/lib/tax/cpi";
import { surtax } from "@/lib/tax/income-tax";
import { moneyMarketVsDeposit } from "@/lib/tax/money-market";
import { pensionDepositCredit, pensionTax, studyFund } from "@/lib/tax/provident";
import { purchaseTax } from "@/lib/tax/purchase-tax";
import { rentalRoutes } from "@/lib/tax/rental";
import { RULE_SCHEMAS, RuleUnavailableError, type TaxRuleRow } from "@/lib/tax/rules";

/*
 * Every expected value below is a documented hand calculation (docs/calculations/tax-examples.md),
 * reproduced independently with exact rational arithmetic (Python fractions).
 * Rules = the seeded configuration rows. CPI values are SYNTHETIC test fixtures (not real CBS data).
 */
const rows: TaxRuleRow[] = taxRules.map((r, i) => ({
  id: `r${i}`,
  ruleKey: r.ruleKey,
  parameters: r.params,
  effectiveFrom: new Date(`${r.effectiveFrom}T00:00:00Z`),
  effectiveTo: r.effectiveTo ? new Date(`${r.effectiveTo}T00:00:00Z`) : null,
  status: r.params === null ? "MISSING" : "UNVERIFIED",
  sourceUrl: r.sourceUrl,
}));
const sh = (v: number) => BigInt(Math.round(v * 100));
const cpi = (period: string, value: number): CpiPoint => ({ period, valueMilli: Math.round(value * 1000), base: "TEST" });

describe("seeded rules match their schemas", () => {
  it.each(taxRules.filter((r) => r.params !== null))("$ruleKey", (r) => {
    expect(RULE_SCHEMAS[r.ruleKey as keyof typeof RULE_SCHEMAS].safeParse(r.params).success).toBe(true);
  });
});

describe("purchase tax", () => {
  it("single apartment ₪2,500,000 → ₪20,538.33 (matches published example ₪20,538)", () => {
    const r = purchaseTax(rows, { value: sh(2_500_000), date: "2026-06-01", kind: "SINGLE_RESIDENCE" });
    expect(r.result.tax).toBe(sh(20_538.33));
    expect(r.rulesUsed[0]).toMatchObject({ ruleKey: "purchase_tax.single_residence", effectiveFrom: "2026-01-16" });
    expect(r.steps.filter((s) => s.key === "bracket")).toHaveLength(3);
  });
  it("single apartment ₪7,000,000 → ₪273,886.23", () => {
    expect(purchaseTax(rows, { value: sh(7_000_000), date: "2026-06-01", kind: "SINGLE_RESIDENCE" }).result.tax).toBe(sh(273_886.23));
  });
  it("additional apartment ₪2,500,000 → ₪200,000", () => {
    expect(purchaseTax(rows, { value: sh(2_500_000), date: "2026-06-01", kind: "ADDITIONAL_RESIDENCE" }).result.tax).toBe(sh(200_000));
  });
  it("new immigrant ₪3,000,000 → ₪5,106.28", () => {
    const r = purchaseTax(rows, { value: sh(3_000_000), date: "2026-06-01", kind: "NEW_IMMIGRANT", yearsSinceAliyah: 2 });
    expect(r.result.tax).toBe(sh(5_106.28));
    expect(r.warnings).toEqual([]);
  });
  it("refuses outside the rule's validity and for MISSING rules", () => {
    expect(() => purchaseTax(rows, { value: sh(2_500_000), date: "2027-03-01", kind: "ADDITIONAL_RESIDENCE" })).toThrow(RuleUnavailableError);
    expect(() => purchaseTax(rows, { value: sh(2_500_000), date: "2026-06-01", kind: "DISABLED" })).toThrow(/MISSING/);
  });
});

describe("betterment tax (residential, individual)", () => {
  const series = [cpi("2010-04", 100), cpi("2026-04", 130)];
  const base = {
    purchaseDate: "2010-06-30",
    saleDate: "2026-06-30",
    purchasePrice: sh(1_000_000),
    salePrice: sh(2_600_000),
    deductibleCosts: sh(100_000),
    saleCosts: sh(40_000),
  } as const;
  it("known-index convention: before the 15th → two months back", () => {
    expect(knownIndexPeriod("2026-06-30")).toBe("2026-05");
    expect(knownIndexPeriod("2026-06-10")).toBe("2026-04");
  });
  it("regular linear: real gain ₪1,130,000 → tax ₪277,182.58 (550 days at 20%, 5,294 at 25%)", () => {
    const r = bettermentTax(rows, series, { ...base, route: "REGULAR", cpiPurchase: cpi("2010-04", 100), cpiSale: cpi("2026-04", 130) });
    expect(r.result).toMatchObject({ nominalGain: sh(1_460_000), inflationaryAmount: sh(330_000), realGain: sh(1_130_000), tax: sh(277_182.58) });
  });
  it("linear-beneficial: 1,281 days exempt (to 1.1.2014) → tax ₪220,576.23", () => {
    const r = bettermentTax(rows, series, { ...base, route: "LINEAR_BENEFICIAL", cpiPurchase: cpi("2010-04", 100), cpiSale: cpi("2026-04", 130) });
    expect(r.result.tax).toBe(sh(220_576.23));
    expect(r.result.exemptGain).toBe(sh(247_695.07));
  });
  it("single-residence exemption: under the ceiling → 0; above → only the part above the ceiling", () => {
    const under = bettermentTax(rows, series, { ...base, route: "SINGLE_RESIDENCE_EXEMPTION", onlyApartment: true, cpiPurchase: cpi("2010-04", 100), cpiSale: cpi("2026-04", 130) });
    expect(under.result.tax).toBe(0n);
    expect(under.warnings).toEqual([]);
    const above = bettermentTax(rows, series, { ...base, salePrice: sh(6_000_000), route: "SINGLE_RESIDENCE_EXEMPTION", onlyApartment: true, cpiPurchase: cpi("2010-04", 100), cpiSale: cpi("2026-04", 130) });
    expect(above.result.realGain).toBe(sh(4_530_000));
    expect(above.result.tax).toBe(sh(146_197.15));
  });
  it("pre-7.11.2001 purchase needs the advisor's marginal rate; with 47% → ₪260,551.49", () => {
    const old = { purchaseDate: "1998-03-15", saleDate: "2026-03-15", purchasePrice: sh(500_000), salePrice: sh(1_500_000), deductibleCosts: 0n, saleCosts: 0n, route: "REGULAR" as const, cpiPurchase: cpi("1998-01", 100), cpiSale: cpi("2026-01", 100) };
    expect(() => bettermentTax(rows, [], old)).toThrow(/preNov2001RateRequired/);
    expect(bettermentTax(rows, [], { ...old, preNov2001RatePpm: 470_000 }).result.tax).toBe(sh(260_551.49));
  });
  it("flags missing conditions and unsupported cases instead of guessing", () => {
    const r = bettermentTax(rows, series, { ...base, purchaseDate: "2025-12-01", saleDate: "2026-06-30", route: "SINGLE_RESIDENCE_EXEMPTION", onlyApartment: false, cpiPurchase: cpi("x", 100), cpiSale: cpi("y", 101) });
    expect(r.warnings).toEqual(expect.arrayContaining(["betterment.onlyApartmentRequired", "betterment.minHolding"]));
    expect(() => bettermentTax(rows, [], { ...base, route: "REGULAR" })).toThrow(/CPI/);
  });
});

describe("capital gains", () => {
  const base = { buyDate: "2024-01-20", sellDate: "2026-01-20", cost: sh(100_000), proceeds: sh(150_000), substantialShareholder: false, carriedLoss: 0n, dividends: 0n, dividendsSubstantial: false, interestUnlinked: 0n, interestLinkedReal: 0n, cpiBuy: cpi("a", 100), cpiSell: cpi("b", 108) };
  it("CPI-indexed: real gain ₪42,000 → ₪10,500", () => {
    const r = capitalGains(rows, [], { ...base, indexation: "CPI" });
    expect(r.result).toMatchObject({ realGain: sh(42_000), gainTax: sh(10_500), totalTax: sh(10_500) });
    expect(r.warnings).toContain("capitalGains.surtaxNotChecked");
  });
  it("carried loss offsets the gain; leftover loss carries forward", () => {
    const r = capitalGains(rows, [], { ...base, indexation: "CPI", carriedLoss: sh(50_000) });
    expect(r.result).toMatchObject({ lossUsed: sh(42_000), taxableGain: 0n, gainTax: 0n, lossCarriedForward: sh(8_000) });
  });
  it("substantial shareholder 30%, dividend 25%, unlinked interest 15%", () => {
    const r = capitalGains(rows, [], { ...base, indexation: "NONE", substantialShareholder: true, dividends: sh(10_000), interestUnlinked: sh(2_000) });
    expect(r.result).toMatchObject({ gainTax: sh(15_000), dividendTax: sh(2_500), interestTax: sh(300) });
  });
  it("FX-linked foreign security: falling currency → no inflationary amount", () => {
    expect(capitalGains(rows, [], { ...base, indexation: "FX", fxBuy: 37_000, fxSell: 36_000 }).result.inflationaryAmount).toBe(0n);
    expect(capitalGains(rows, [], { ...base, indexation: "FX", fxBuy: 36_000, fxSell: 37_800 }).result.inflationaryAmount).toBe(sh(5_000));
  });
  it("real loss is reported and carried", () => {
    expect(capitalGains(rows, [], { ...base, proceeds: sh(80_000), indexation: "CPI" }).result).toMatchObject({ realGain: -sh(20_000), lossCarriedForward: sh(20_000), totalTax: 0n });
  });
  it("surtax: other income ₪700,000 + capital ₪100,000 → 3%×78,440 + 2%×78,440 = ₪3,922", () => {
    expect(surtax(sh(800_000), sh(100_000), { thresholdAnnual: Number(sh(721_560)), ratePpm: 30_000, capitalAdditionalPpm: 20_000 }).tax).toBe(sh(3_922));
  });
});

describe("money-market fund vs deposit", () => {
  it("₪100,000 · 12 months · fund 4.5% − 0.25% fee vs deposit 4.2%, inflation 3%", () => {
    const r = moneyMarketVsDeposit(rows, { amount: sh(100_000), months: 12, fundGrossYieldPpm: 45_000, fundFeePpm: 2_500, depositRatePpm: 42_000, expectedInflationPpm: 30_000, date: "2026-06-01" });
    expect(r.result).toMatchObject({ fundTax: sh(312.5), fundNet: sh(103_937.5), depositTax: sh(630), depositNet: sh(103_570), difference: sh(367.5) });
  });
});

describe("rental income routes", () => {
  it("rent ₪7,000/month, other income ₪228,000: exempt route ₪10,014.24 · 10% ₪8,400 · regular ₪18,290 → 10% cheapest", () => {
    const r = rentalRoutes(rows, { monthlyRent: sh(7_000), otherAnnualIncome: sh(228_000), annualExpenses: sh(10_000), annualDepreciation: sh(15_000), year: 2026 });
    expect(r.result.routes.map((x) => [x.route, x.taxAnnual])).toEqual([["EXEMPT", sh(10_014.24)], ["FLAT", sh(8_400)], ["REGULAR", sh(18_290)]]);
    expect(r.result.cheapest).toBe("FLAT");
  });
  it("rent at or below the ceiling is fully exempt", () => {
    const r = rentalRoutes(rows, { monthlyRent: sh(5_000), otherAnnualIncome: sh(150_000), annualExpenses: 0n, annualDepreciation: 0n, year: 2026 });
    expect(r.result.cheapest).toBe("EXEMPT");
    expect(r.result.routes[0]!.taxAnnual).toBe(0n);
  });
});

describe("provident & pension", () => {
  it("qualifying pension ₪15,000/month, 2.25 credit points → ₪6,271.03/year (₪522.59/month)", () => {
    const r = pensionTax(rows, { monthlyPension: sh(15_000), creditPoints: 2.25, year: 2026, otherAnnualIncome: 0n });
    expect(r.result).toMatchObject({ exemptMonthly: sh(5_375.1), taxableAnnual: sh(115_498.8), annualTax: sh(6_271.03), monthlyTax: sh(522.59) });
  });
  it("study fund: liquid after 6 years; before that no tax figure", () => {
    expect(studyFund(rows, { seniorityDate: "2019-03-01", withdrawalDate: "2026-11-14", atRetirementAge: false, gainsOnNonExemptDeposits: sh(3_000) }).result).toEqual({ liquidDate: "2025-03-01", liquid: true, tax: sh(750) });
    expect(studyFund(rows, { seniorityDate: "2022-03-01", withdrawalDate: "2026-11-14", atRetirementAge: false, gainsOnNonExemptDeposits: 0n }).result).toMatchObject({ liquid: false, tax: null });
  });
  it("pension-deposit credit refuses: rule is MISSING", () => {
    expect(() => pensionDepositCredit(rows, { monthlySalary: sh(15_000), monthlyEmployeeDeposit: sh(900), year: 2026 })).toThrow(RuleUnavailableError);
  });
});

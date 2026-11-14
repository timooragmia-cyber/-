import { divRound, ratioPpm, type Agorot } from "@/lib/money";
import { FACTOR_SCALE, monthlyFactorFromAnnualPpm } from "@/lib/math/fixed";
import { bettermentTax, type BettermentInput } from "@/lib/tax/betterment-tax";
import type { CpiPoint } from "@/lib/tax/cpi";
import type { TaxRuleRow } from "@/lib/tax/rules";

export const REAL_ESTATE_VERSION = "real-estate@1";

export type PropertyInput = {
  usage: "RESIDENCE" | "INVESTMENT";
  isOnlyApartment: boolean;
  purchaseDate: string;
  purchasePrice: Agorot;
  purchaseCosts: Agorot; // purchase tax, lawyer, broker
  improvementCosts: Agorot;
  currentValue: Agorot;
  monthlyRent: Agorot;
  monthlyExpenses: Agorot; // maintenance, insurance, management, vacancy allowance
  mortgageBalance: Agorot;
  monthlyMortgagePayment: Agorot;
};

export type Yields = {
  grossYieldPpm: number | null; // annual rent / current value
  netYieldPpm: number | null; // (rent − expenses) / current value
  equity: Agorot; // value − mortgage
  annualNetCashflow: Agorot; // (rent − expenses − mortgage payment) × 12
  cashOnEquityPpm: number | null;
  totalInvested: Agorot;
  unrealizedGain: Agorot; // value − (price + costs + improvements)
};

/** Rental yields and equity (pure). */
export function propertyYields(p: PropertyInput): Yields {
  const annualRent = p.monthlyRent * 12n;
  const annualNet = (p.monthlyRent - p.monthlyExpenses) * 12n;
  const equity = p.currentValue - p.mortgageBalance;
  const cash = annualNet - p.monthlyMortgagePayment * 12n;
  const invested = p.purchasePrice + p.purchaseCosts + p.improvementCosts;
  return {
    grossYieldPpm: p.currentValue > 0n ? ratioPpm(annualRent, p.currentValue) : null,
    netYieldPpm: p.currentValue > 0n ? ratioPpm(annualNet, p.currentValue) : null,
    equity,
    annualNetCashflow: cash,
    cashOnEquityPpm: equity > 0n ? ratioPpm(cash, equity) : null,
    totalInvested: invested,
    unrealizedGain: p.currentValue - invested,
  };
}

/** Value after `years` at an annual appreciation rate (exact monthly compounding). */
export function appreciate(value: Agorot, annualPpm: number, years: number): Agorot {
  const f = monthlyFactorFromAnnualPpm(annualPpm);
  let v = value * 1_000_000n;
  for (let i = 0; i < years * 12; i++) v = (v * f) / FACTOR_SCALE;
  return divRound(v, 1_000_000n);
}

export type ExitParams = {
  saleDate: string;
  salePrice: Agorot;
  /** Selling costs as a share of the price (brokerage + lawyer), ppm. */
  sellingCostsPpm: number;
  /** Expected annual inflation from purchase to sale, used to project the CPI ratio when the sale is in the future. */
  expectedInflationPpm: number;
  /** CPI known at purchase (from the table) if available; else a 100 base is used with projected inflation. */
  cpiAtPurchase?: CpiPoint;
  cpiAtSale?: CpiPoint;
  preNov2001RatePpm?: number;
};

export type ExitResult = {
  salePrice: Agorot;
  sellingCosts: Agorot;
  bettermentTax: Agorot;
  route: BettermentInput["route"];
  mortgagePayoff: Agorot;
  netProceeds: Agorot;
  profitAfterAll: Agorot; // net proceeds + mortgage payoff − total invested
  warnings: string[];
  rulesUsed: { ruleKey: string; effectiveFrom: string; status: string }[];
};

/**
 * Exit scenario: sale price − selling costs − betterment tax − mortgage payoff = net cash.
 * Betterment route: single-residence exemption for the owner's only residence; otherwise
 * linear-beneficial (residential apartment) — the advisor reviews the route.
 * When the sale is in the future the CPI at sale is projected from expected inflation (shown).
 */
export function exitScenario(rows: readonly TaxRuleRow[], p: PropertyInput, e: ExitParams): ExitResult {
  const sellingCosts = divRound(e.salePrice * BigInt(e.sellingCostsPpm), 1_000_000n);
  const route: BettermentInput["route"] = p.usage === "RESIDENCE" && p.isOnlyApartment ? "SINGLE_RESIDENCE_EXEMPTION" : "LINEAR_BENEFICIAL";
  const years = Math.max(0, (Date.parse(e.saleDate) - Date.parse(p.purchaseDate)) / (365.25 * 86_400_000));
  const start = e.cpiAtPurchase ?? { period: "projected-start", valueMilli: 100_000, base: "projection" };
  const end =
    e.cpiAtSale ??
    (e.cpiAtPurchase
      ? undefined
      : { period: "projected-end", valueMilli: Number(appreciate(100_000n, e.expectedInflationPpm, Math.round(years))), base: "projection" });
  const warnings: string[] = [];
  if (!e.cpiAtSale) warnings.push("realEstate.cpiProjected");
  const bt = bettermentTax(rows, [], {
    purchaseDate: p.purchaseDate,
    saleDate: e.saleDate,
    purchasePrice: p.purchasePrice,
    salePrice: e.salePrice,
    deductibleCosts: p.purchaseCosts + p.improvementCosts,
    saleCosts: sellingCosts,
    route,
    onlyApartment: p.isOnlyApartment,
    preNov2001RatePpm: e.preNov2001RatePpm,
    cpiPurchase: start,
    cpiSale: end ?? start,
  });
  warnings.push(...bt.warnings);
  const net = e.salePrice - sellingCosts - bt.result.tax - p.mortgageBalance;
  return {
    salePrice: e.salePrice,
    sellingCosts,
    bettermentTax: bt.result.tax,
    route,
    mortgagePayoff: p.mortgageBalance,
    netProceeds: net,
    profitAfterAll: net + p.mortgageBalance - (p.purchasePrice + p.purchaseCosts + p.improvementCosts),
    warnings,
    rulesUsed: bt.rulesUsed.map((r) => ({ ruleKey: r.ruleKey, effectiveFrom: r.effectiveFrom, status: r.status })),
  };
}

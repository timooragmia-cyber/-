import { divRound, type Agorot } from "@/lib/money";
import type { CalcResult } from "./common";
import { marginalTaxOn } from "./income-tax";
import { resolveRule, type TaxRuleRow } from "./rules";

export const RENTAL_VERSION = "rental@1";

/**
 * Residential rental income — three routes side by side, cheapest highlighted:
 *  EXEMPT: monthly rent up to the ceiling is exempt; between 1× and 2× the ceiling the
 *          exemption shrinks shekel-for-shekel (exempt = 2×ceiling − rent); above 2× none.
 *          The taxable part is taxed at the owner's marginal rates.
 *  FLAT:   flat rate on gross rent, no deductions.
 *  REGULAR: (rent − expenses − depreciation) at marginal rates.
 * Marginal tax = tax(other income + rental part) − tax(other income); credit points are
 * assumed to be used by the other income (warning shown when other income is low).
 */
export type RentalInput = { monthlyRent: Agorot; otherAnnualIncome: Agorot; annualExpenses: Agorot; annualDepreciation: Agorot; year: number };
export type RouteResult = { route: "EXEMPT" | "FLAT" | "REGULAR"; taxableAnnual: Agorot; taxAnnual: Agorot };

export function rentalRoutes(rows: readonly TaxRuleRow[], input: RentalInput): CalcResult<{ routes: RouteResult[]; cheapest: RouteResult["route"]; annualRent: Agorot }> {
  const on = new Date(`${input.year}-12-31T00:00:00Z`);
  const ceil = resolveRule(rows, "rental_income.exempt_ceiling", on);
  const flat = resolveRule(rows, "rental_income.flat_rate", on);
  const it = resolveRule(rows, "income_tax.brackets", on);
  const c = BigInt(ceil.params.monthlyCeiling);
  const rent = input.monthlyRent;
  const annual = rent * 12n;
  const exemptMonthly = rent <= c ? rent : rent >= 2n * c ? 0n : 2n * c - rent;
  const taxableExemptRoute = (rent - exemptMonthly) * 12n;
  const exemptRoute: RouteResult = { route: "EXEMPT", taxableAnnual: taxableExemptRoute, taxAnnual: marginalTaxOn(taxableExemptRoute, input.otherAnnualIncome, it.params.brackets) };
  const flatRoute: RouteResult = { route: "FLAT", taxableAnnual: annual, taxAnnual: divRound(annual * BigInt(flat.params.ratePpm), 1_000_000n) };
  const net = annual - input.annualExpenses - input.annualDepreciation;
  const regTaxable = net > 0n ? net : 0n;
  const regularRoute: RouteResult = { route: "REGULAR", taxableAnnual: regTaxable, taxAnnual: marginalTaxOn(regTaxable, input.otherAnnualIncome, it.params.brackets) };
  const routes = [exemptRoute, flatRoute, regularRoute];
  const cheapest = [...routes].sort((a, b) => (a.taxAnnual < b.taxAnnual ? -1 : a.taxAnnual > b.taxAnnual ? 1 : 0))[0]!.route;
  const warnings = ["rental.routeConditions"];
  if (input.otherAnnualIncome < 100_000_00n) warnings.push("rental.creditPointsAssumption");
  return {
    calculator: "rental",
    version: RENTAL_VERSION,
    rulesUsed: [ceil.used, flat.used, it.used],
    steps: [
      { key: "exemptPortion", values: { ceiling: c.toString(), rent: rent.toString() }, amount: exemptMonthly },
      { key: "exemptRoute", amount: exemptRoute.taxAnnual },
      { key: "flatRoute", values: { rate: flat.params.ratePpm }, amount: flatRoute.taxAnnual },
      { key: "regularRoute", values: { expenses: input.annualExpenses.toString(), depreciation: input.annualDepreciation.toString() }, amount: regularRoute.taxAnnual },
    ],
    result: { routes, cheapest, annualRent: annual },
    warnings,
  };
}

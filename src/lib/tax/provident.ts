import { divRound, type Agorot } from "@/lib/money";
import { addYears, type CalcResult } from "./common";
import { annualIncomeTax } from "./income-tax";
import { resolveRule, type TaxRuleRow } from "./rules";

export const PROVIDENT_VERSION = "provident@1";

/**
 * Study fund (קרן השתלמות): liquidity date and tax on withdrawal.
 * - Liquid after N years from the seniority date (or the shorter period at retirement age).
 * - Gains on exempt deposits: exempt. Gains on deposits above the tax-benefit ceiling: taxed at
 *   the capital-gains rate configured in provident.withdrawal_rules.
 * - Before liquidity: no computation (rates up to the maximal marginal rate) — the result says so.
 */
export type StudyFundInput = { seniorityDate: string; withdrawalDate: string; atRetirementAge: boolean; gainsOnNonExemptDeposits: Agorot };

export function studyFund(rows: readonly TaxRuleRow[], input: StudyFundInput): CalcResult<{ liquidDate: string; liquid: boolean; tax: Agorot | null }> {
  const on = new Date(`${input.withdrawalDate}T00:00:00Z`);
  const r = resolveRule(rows, "provident.withdrawal_rules", on);
  const years = input.atRetirementAge ? r.params.studyFundLiquidYearsAtRetirement : r.params.studyFundLiquidYears;
  const liquidDate = addYears(input.seniorityDate, years);
  const liquid = input.withdrawalDate >= liquidDate;
  const tax = liquid ? divRound(input.gainsOnNonExemptDeposits * BigInt(r.params.gainsTaxPpm), 1_000_000n) : null;
  return {
    calculator: "study-fund",
    version: PROVIDENT_VERSION,
    rulesUsed: [r.used],
    steps: [
      { key: "liquidDate", values: { years, date: liquidDate } },
      ...(liquid ? [{ key: "gainsTax", values: { rate: r.params.gainsTaxPpm }, amount: tax! }] : [{ key: "notLiquid" }]),
    ],
    result: { liquidDate, liquid, tax },
    warnings: liquid ? ["studyFund.verifyExemptPortion"] : ["studyFund.earlyWithdrawal"],
  };
}

/**
 * Tax on a qualifying pension (קצבה מזכה): exempt share up to the monthly ceiling, the rest
 * taxed with the annual income-tax brackets and the member's credit points.
 */
export type PensionInput = { monthlyPension: Agorot; creditPoints: number; year: number; otherAnnualIncome: Agorot };

export function pensionTax(rows: readonly TaxRuleRow[], input: PensionInput): CalcResult<{ exemptMonthly: Agorot; taxableAnnual: Agorot; annualTax: Agorot; monthlyTax: Agorot; netMonthly: Agorot }> {
  const on = new Date(`${input.year}-12-31T00:00:00Z`);
  const ex = resolveRule(rows, "pension.income_exemption", on);
  const it = resolveRule(rows, "income_tax.brackets", on);
  const cap = BigInt(ex.params.monthlyCeiling);
  const base = input.monthlyPension < cap ? input.monthlyPension : cap;
  const exemptMonthly = divRound(base * BigInt(ex.params.exemptionPpm), 1_000_000n);
  const taxableAnnual = (input.monthlyPension - exemptMonthly) * 12n + input.otherAnnualIncome;
  const t = annualIncomeTax(taxableAnnual, it.params.brackets, BigInt(it.params.creditPointAnnual), input.creditPoints);
  // Tax attributable to the pension when there is other income: total − tax on other income alone.
  const other = input.otherAnnualIncome > 0n ? annualIncomeTax(input.otherAnnualIncome, it.params.brackets, BigInt(it.params.creditPointAnnual), input.creditPoints).net : 0n;
  const annualTax = t.net - other;
  const monthlyTax = divRound(annualTax, 12n);
  return {
    calculator: "pension-tax",
    version: PROVIDENT_VERSION,
    rulesUsed: [ex.used, it.used],
    steps: [
      { key: "exemptPortion", values: { ceiling: cap.toString(), rate: ex.params.exemptionPpm }, amount: exemptMonthly },
      { key: "taxableAnnual", amount: taxableAnnual },
      { key: "grossTax", amount: t.gross },
      { key: "credits", values: { points: input.creditPoints }, amount: t.credits },
      { key: "annualTax", amount: annualTax },
    ],
    result: { exemptMonthly, taxableAnnual, annualTax, monthlyTax, netMonthly: input.monthlyPension - monthlyTax },
    warnings: ["pension.gross"],
  };
}

/** Credit for employee pension deposits — refuses when the rule is not configured (MISSING). */
export function pensionDepositCredit(rows: readonly TaxRuleRow[], input: { monthlySalary: Agorot; monthlyEmployeeDeposit: Agorot; year: number }): CalcResult<{ annualCredit: Agorot }> {
  const on = new Date(`${input.year}-12-31T00:00:00Z`);
  const r = resolveRule(rows, "income_tax.pension_deposit_credit", on);
  const salary = input.monthlySalary < BigInt(r.params.monthlySalaryCeiling) ? input.monthlySalary : BigInt(r.params.monthlySalaryCeiling);
  const maxDep = divRound(salary * BigInt(r.params.maxShareOfSalaryPpm), 1_000_000n);
  const dep = input.monthlyEmployeeDeposit < maxDep ? input.monthlyEmployeeDeposit : maxDep;
  const credit = divRound(dep * 12n * BigInt(r.params.creditPpm), 1_000_000n);
  return { calculator: "pension-credit", version: PROVIDENT_VERSION, rulesUsed: [r.used], steps: [{ key: "eligibleDeposit", amount: dep }, { key: "credit", amount: credit }], result: { annualCredit: credit }, warnings: [] };
}

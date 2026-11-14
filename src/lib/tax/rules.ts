import { z } from "zod";
import { selectEffective } from "@/lib/config/effective";

/**
 * Tax rule parameter schemas. Every rate is ppm, every amount is integer agorot (JSON number;
 * all thresholds fit safely below 2^53), every date is "YYYY-MM-DD".
 * A rule row whose parameters do not match its schema is treated as unavailable.
 */
const agorot = z.number().int().nonnegative();
const ppm = z.number().int().min(0).max(1_000_000);
const brackets = z.array(z.object({ upTo: agorot.nullable(), ratePpm: ppm })).min(1).refine((b) => b.at(-1)!.upTo === null, "last bracket must be open-ended");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const RULE_SCHEMAS = {
  "purchase_tax.single_residence": z.object({ brackets }),
  "purchase_tax.additional_residence": z.object({ brackets }),
  "purchase_tax.new_immigrant": z.object({ brackets, maxValue: agorot, yearsFromAliyah: z.number().int().min(1).max(20) }),
  "purchase_tax.disabled": z.object({ brackets }),
  "betterment_tax.rates": z.object({
    preNov2001Ppm: ppm.nullable(), // marginal for individuals — advisor input when null
    from2001Ppm: ppm,
    from2012Ppm: ppm,
    period2001Start: date,
    period2012Start: date,
    inflationaryPre1994Ppm: ppm.nullable(),
  }),
  "betterment_tax.single_residence_exemption": z.object({ ceiling: agorot, minHoldingMonths: z.number().int().min(0).max(120), linearExemptUntil: date }),
  "capital_gains.securities": z.object({ individualRealPpm: ppm, substantialShareholderPpm: ppm }),
  "capital_gains.dividend_interest": z.object({ dividendPpm: ppm, dividendSubstantialPpm: ppm, interestLinkedRealPpm: ppm, interestUnlinkedNominalPpm: ppm }),
  "surtax.high_income": z.object({ thresholdAnnual: agorot, ratePpm: ppm, capitalAdditionalPpm: ppm }),
  "money_market_fund.tax": z.object({ ratePpm: ppm, basis: z.enum(["REAL", "NOMINAL"]) }),
  "rental_income.exempt_ceiling": z.object({ monthlyCeiling: agorot }),
  "rental_income.flat_rate": z.object({ ratePpm: ppm }),
  "income_tax.brackets": z.object({ brackets, creditPointAnnual: agorot }),
  "provident.withdrawal_rules": z.object({ studyFundLiquidYears: z.number().int().min(1).max(20), studyFundLiquidYearsAtRetirement: z.number().int().min(0).max(20), gainsTaxPpm: ppm }),
  "pension.income_exemption": z.object({ monthlyCeiling: agorot, exemptionPpm: ppm }),
  "income_tax.pension_deposit_credit": z.object({ creditPpm: ppm, maxShareOfSalaryPpm: ppm, monthlySalaryCeiling: agorot }),
} as const;

export type RuleKey = keyof typeof RULE_SCHEMAS;
export type RuleParams<K extends RuleKey> = z.infer<(typeof RULE_SCHEMAS)[K]>;

export type TaxRuleRow = {
  id: string;
  ruleKey: string;
  parameters: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: "VERIFIED" | "UNVERIFIED" | "MISSING";
  sourceUrl: string | null;
};

export type RuleUsed = { ruleKey: string; id: string; effectiveFrom: string; status: TaxRuleRow["status"]; sourceUrl: string | null };

export class RuleUnavailableError extends Error {
  constructor(public readonly ruleKey: string, public readonly reason: "NOT_FOUND" | "MISSING" | "INVALID", public readonly on: string) {
    super(`Tax rule ${ruleKey} unavailable on ${on}: ${reason}`);
    this.name = "RuleUnavailableError";
  }
}

/**
 * Resolve a rule valid on the transaction date. MISSING or malformed rules throw — a
 * calculator never falls back to a number that is not in the configuration table.
 */
export function resolveRule<K extends RuleKey>(rows: readonly TaxRuleRow[], key: K, on: Date): { params: RuleParams<K>; used: RuleUsed } {
  const day = on.toISOString().slice(0, 10);
  const row = selectEffective(rows.filter((r) => r.ruleKey === key), on);
  if (!row) throw new RuleUnavailableError(key, "NOT_FOUND", day);
  if (row.status === "MISSING" || row.parameters === null || row.parameters === undefined) throw new RuleUnavailableError(key, "MISSING", day);
  const parsed = RULE_SCHEMAS[key].safeParse(row.parameters);
  if (!parsed.success) throw new RuleUnavailableError(key, "INVALID", day);
  return {
    params: parsed.data as RuleParams<K>,
    used: { ruleKey: key, id: row.id, effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10), status: row.status, sourceUrl: row.sourceUrl },
  };
}

import type { Agorot } from "@/lib/money";
import { progressiveTax, type CalcResult } from "./common";
import { resolveRule, type TaxRuleRow } from "./rules";

export const PURCHASE_TAX_VERSION = "purchase-tax@1";

export type PurchaseKind = "SINGLE_RESIDENCE" | "ADDITIONAL_RESIDENCE" | "NEW_IMMIGRANT" | "DISABLED";
export type PurchaseInput = { value: Agorot; date: string; kind: PurchaseKind; yearsSinceAliyah?: number };

const KEY = {
  SINGLE_RESIDENCE: "purchase_tax.single_residence",
  ADDITIONAL_RESIDENCE: "purchase_tax.additional_residence",
  NEW_IMMIGRANT: "purchase_tax.new_immigrant",
  DISABLED: "purchase_tax.disabled",
} as const;

/** Purchase tax (מס רכישה) on a residential apartment — brackets from the rule valid on the purchase date. */
export function purchaseTax(rows: readonly TaxRuleRow[], input: PurchaseInput): CalcResult<{ tax: Agorot; effectiveRatePpm: number }> {
  const on = new Date(`${input.date}T00:00:00Z`);
  const warnings: string[] = [];
  const { params, used } = resolveRule(rows, KEY[input.kind], on);
  const rulesUsed = [used];
  if (input.kind === "NEW_IMMIGRANT") {
    const p = params as { maxValue: number; yearsFromAliyah: number };
    if (input.value > BigInt(p.maxValue)) warnings.push("purchase.newImmigrantAboveMax");
    if (input.yearsSinceAliyah === undefined || input.yearsSinceAliyah > p.yearsFromAliyah) warnings.push("purchase.newImmigrantYears");
  }
  if (input.kind === "SINGLE_RESIDENCE") warnings.push("purchase.singleConditions");
  const { tax, parts } = progressiveTax(input.value, params.brackets);
  return {
    calculator: "purchase-tax",
    version: PURCHASE_TAX_VERSION,
    rulesUsed,
    steps: [
      ...parts.map((p) => ({ key: "bracket", values: { from: p.from.toString(), to: p.to.toString(), rate: p.ratePpm }, amount: p.tax })),
      { key: "total", amount: tax },
    ],
    result: { tax, effectiveRatePpm: input.value > 0n ? Number((tax * 1_000_000n) / input.value) : 0 },
    warnings,
  };
}

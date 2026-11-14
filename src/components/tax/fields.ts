import type { CalculatorName } from "@/server/tax/calculators";

export type FieldType = "money" | "percent" | "date" | "int" | "index" | "fx" | "checkbox" | { select: string[] };
export type FieldSpec = { name: string; type: FieldType; required?: boolean; def?: string };

const today = () => new Date().toISOString().slice(0, 10);

/** Form fields per calculator (labels come from messages: tax.fields.<name>). */
export function fieldsFor(calc: CalculatorName): FieldSpec[] {
  switch (calc) {
    case "purchase-tax":
      return [
        { name: "kind", type: { select: ["SINGLE_RESIDENCE", "ADDITIONAL_RESIDENCE", "NEW_IMMIGRANT", "DISABLED"] } },
        { name: "value", type: "money", required: true },
        { name: "date", type: "date", required: true, def: today() },
        { name: "yearsSinceAliyah", type: "int" },
      ];
    case "betterment-tax":
      return [
        { name: "route", type: { select: ["REGULAR", "LINEAR_BENEFICIAL", "SINGLE_RESIDENCE_EXEMPTION"] } },
        { name: "transfer", type: { select: ["SALE", "INHERITANCE", "GIFT_TO_RELATIVE"] } },
        { name: "purchaseDate", type: "date", required: true },
        { name: "saleDate", type: "date", required: true, def: today() },
        { name: "purchasePrice", type: "money", required: true },
        { name: "salePrice", type: "money", required: true },
        { name: "deductibleCosts", type: "money", def: "0" },
        { name: "saleCosts", type: "money", def: "0" },
        { name: "cpiPurchase", type: "index" },
        { name: "cpiSale", type: "index" },
        { name: "preNov2001Rate", type: "percent" },
        { name: "onlyApartment", type: "checkbox" },
      ];
    case "capital-gains":
      return [
        { name: "indexation", type: { select: ["CPI", "FX", "NONE"] } },
        { name: "buyDate", type: "date", required: true },
        { name: "sellDate", type: "date", required: true, def: today() },
        { name: "cost", type: "money", required: true },
        { name: "proceeds", type: "money", required: true },
        { name: "cpiBuy", type: "index" },
        { name: "cpiSell", type: "index" },
        { name: "fxBuy", type: "fx" },
        { name: "fxSell", type: "fx" },
        { name: "carriedLoss", type: "money", def: "0" },
        { name: "dividends", type: "money", def: "0" },
        { name: "interestUnlinked", type: "money", def: "0" },
        { name: "interestLinkedReal", type: "money", def: "0" },
        { name: "otherAnnualIncome", type: "money" },
        { name: "substantialShareholder", type: "checkbox" },
        { name: "dividendsSubstantial", type: "checkbox" },
      ];
    case "money-market":
      return [
        { name: "amount", type: "money", required: true, def: "100000" },
        { name: "months", type: "int", required: true, def: "12" },
        { name: "fundGrossYield", type: "percent", required: true },
        { name: "fundFee", type: "percent", required: true },
        { name: "depositRate", type: "percent", required: true },
        { name: "expectedInflation", type: "percent", required: true },
        { name: "date", type: "date", required: true, def: today() },
      ];
    case "rental":
      return [
        { name: "monthlyRent", type: "money", required: true },
        { name: "otherAnnualIncome", type: "money", required: true },
        { name: "annualExpenses", type: "money", def: "0" },
        { name: "annualDepreciation", type: "money", def: "0" },
        { name: "year", type: "int", required: true, def: today().slice(0, 4) },
      ];
    case "pension-tax":
      return [
        { name: "monthlyPension", type: "money", required: true },
        { name: "creditPoints", type: "index", required: true, def: "2.25" },
        { name: "otherAnnualIncome", type: "money", def: "0" },
        { name: "year", type: "int", required: true, def: today().slice(0, 4) },
      ];
    case "study-fund":
      return [
        { name: "seniorityDate", type: "date", required: true },
        { name: "withdrawalDate", type: "date", required: true, def: today() },
        { name: "gainsOnNonExemptDeposits", type: "money", def: "0" },
        { name: "atRetirementAge", type: "checkbox" },
      ];
  }
}

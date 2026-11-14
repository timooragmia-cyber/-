import { z } from "zod";
import { parseAmount, parsePercentToPpm } from "@/lib/money";
import { bettermentTax } from "@/lib/tax/betterment-tax";
import { capitalGains } from "@/lib/tax/capital-gains";
import type { CalcResult } from "@/lib/tax/common";
import type { CpiPoint } from "@/lib/tax/cpi";
import { moneyMarketVsDeposit } from "@/lib/tax/money-market";
import { pensionTax, studyFund } from "@/lib/tax/provident";
import { purchaseTax } from "@/lib/tax/purchase-tax";
import { rentalRoutes } from "@/lib/tax/rental";
import type { TaxRuleRow } from "@/lib/tax/rules";

/** Input parsing for calculator forms (all values arrive as strings; no floats for money). */
const money = z.string().trim().transform((v, ctx) => {
  try {
    const a = parseAmount(v || "0");
    if (a < 0n) throw new Error();
    return a;
  } catch {
    ctx.addIssue({ code: "custom", message: "amount" });
    return z.NEVER;
  }
});
const pct = z.string().trim().transform((v, ctx) => {
  try {
    return parsePercentToPpm(v || "0");
  } catch {
    ctx.addIssue({ code: "custom", message: "percent" });
    return z.NEVER;
  }
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bool = z.string().optional().transform((v) => v === "on" || v === "true" || v === "1");
const optIndex = z.string().optional().transform((v, ctx) => {
  if (!v) return undefined;
  const m = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(v.trim());
  if (!m) {
    ctx.addIssue({ code: "custom", message: "index" });
    return z.NEVER;
  }
  return Number(m[1]) * 1000 + Number(((m[2] ?? "") + "000").slice(0, 3));
});
const fx = z.string().optional().transform((v, ctx) => {
  if (!v) return undefined;
  const m = /^(\d{1,3})(?:\.(\d{1,4}))?$/.exec(v.trim());
  if (!m) {
    ctx.addIssue({ code: "custom", message: "fx" });
    return z.NEVER;
  }
  return Number(m[1]) * 10_000 + Number(((m[2] ?? "") + "0000").slice(0, 4));
});

type Calc = { schema: z.ZodType; run: (rows: TaxRuleRow[], cpi: CpiPoint[], input: never) => CalcResult<unknown> };

const manualCpi = (period: string, valueMilli: number | undefined): CpiPoint | undefined => (valueMilli ? { period, valueMilli, base: "manual" } : undefined);

export const CALCULATORS = {
  "purchase-tax": {
    schema: z.object({ value: money, date, kind: z.enum(["SINGLE_RESIDENCE", "ADDITIONAL_RESIDENCE", "NEW_IMMIGRANT", "DISABLED"]), yearsSinceAliyah: z.string().optional().transform((v) => (v ? Number(v) : undefined)) }),
    run: (rows, _c, i: Parameters<typeof purchaseTax>[1]) => purchaseTax(rows, i),
  },
  "betterment-tax": {
    schema: z
      .object({
        purchaseDate: date, saleDate: date, purchasePrice: money, salePrice: money, deductibleCosts: money, saleCosts: money,
        route: z.enum(["REGULAR", "LINEAR_BENEFICIAL", "SINGLE_RESIDENCE_EXEMPTION"]),
        onlyApartment: bool, transfer: z.enum(["SALE", "INHERITANCE", "GIFT_TO_RELATIVE"]).default("SALE"),
        preNov2001Rate: z.string().optional(), cpiPurchase: optIndex, cpiSale: optIndex,
      })
      .transform((v) => ({
        ...v,
        preNov2001RatePpm: v.preNov2001Rate ? parsePercentToPpm(v.preNov2001Rate) : undefined,
        // Manual CPI overrides must be given together (same base).
        cpiPurchase: v.cpiPurchase && v.cpiSale ? manualCpi("manual-purchase", v.cpiPurchase) : undefined,
        cpiSale: v.cpiPurchase && v.cpiSale ? manualCpi("manual-sale", v.cpiSale) : undefined,
      })),
    run: (rows, cpi, i: Parameters<typeof bettermentTax>[2]) => bettermentTax(rows, cpi, i),
  },
  "capital-gains": {
    schema: z
      .object({
        buyDate: date, sellDate: date, cost: money, proceeds: money, indexation: z.enum(["CPI", "FX", "NONE"]),
        fxBuy: fx, fxSell: fx, substantialShareholder: bool, carriedLoss: money, dividends: money, dividendsSubstantial: bool,
        interestUnlinked: money, interestLinkedReal: money, otherAnnualIncome: z.string().optional(), cpiBuy: optIndex, cpiSell: optIndex,
      })
      .transform((v) => ({
        ...v,
        otherAnnualIncome: v.otherAnnualIncome ? parseAmount(v.otherAnnualIncome) : undefined,
        cpiBuy: v.cpiBuy && v.cpiSell ? manualCpi("manual-buy", v.cpiBuy) : undefined,
        cpiSell: v.cpiBuy && v.cpiSell ? manualCpi("manual-sell", v.cpiSell) : undefined,
      })),
    run: (rows, cpi, i: Parameters<typeof capitalGains>[2]) => capitalGains(rows, cpi, i),
  },
  "money-market": {
    schema: z.object({ amount: money, months: z.coerce.number().int().min(1).max(600), fundGrossYield: pct, fundFee: pct, depositRate: pct, expectedInflation: pct, date }).transform((v) => ({
      amount: v.amount, months: v.months, fundGrossYieldPpm: v.fundGrossYield, fundFeePpm: v.fundFee, depositRatePpm: v.depositRate, expectedInflationPpm: v.expectedInflation, date: v.date,
    })),
    run: (rows, _c, i: Parameters<typeof moneyMarketVsDeposit>[1]) => moneyMarketVsDeposit(rows, i),
  },
  rental: {
    schema: z.object({ monthlyRent: money, otherAnnualIncome: money, annualExpenses: money, annualDepreciation: money, year: z.coerce.number().int().min(2020).max(2100) }),
    run: (rows, _c, i: Parameters<typeof rentalRoutes>[1]) => rentalRoutes(rows, i),
  },
  "pension-tax": {
    schema: z.object({ monthlyPension: money, creditPoints: z.coerce.number().min(0).max(20), year: z.coerce.number().int().min(2020).max(2100), otherAnnualIncome: money }),
    run: (rows, _c, i: Parameters<typeof pensionTax>[1]) => pensionTax(rows, i),
  },
  "study-fund": {
    schema: z.object({ seniorityDate: date, withdrawalDate: date, atRetirementAge: bool, gainsOnNonExemptDeposits: money }),
    run: (rows, _c, i: Parameters<typeof studyFund>[1]) => studyFund(rows, i),
  },
} satisfies Record<string, Calc>;

export type CalculatorName = keyof typeof CALCULATORS;
export const CALCULATOR_NAMES = Object.keys(CALCULATORS) as CalculatorName[];
export const isCalculator = (v: string): v is CalculatorName => v in CALCULATORS;

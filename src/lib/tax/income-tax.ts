import { divRound, type Agorot } from "@/lib/money";
import { progressiveTax, type Bracket } from "./common";

/** Annual income tax on taxable income, minus credit points (never below zero). */
export function annualIncomeTax(taxable: Agorot, brackets: readonly Bracket[], creditPointAnnual: Agorot, creditPoints: number): { gross: Agorot; credits: Agorot; net: Agorot } {
  const gross = progressiveTax(taxable, brackets).tax;
  const credits = divRound(creditPointAnnual * BigInt(Math.round(creditPoints * 100)), 100n);
  return { gross, credits, net: gross > credits ? gross - credits : 0n };
}

/** Tax on an extra amount stacked on top of other income (credit points assumed used by the other income). */
export function marginalTaxOn(extra: Agorot, otherIncome: Agorot, brackets: readonly Bracket[]): Agorot {
  return progressiveTax(otherIncome + extra, brackets).tax - progressiveTax(otherIncome, brackets).tax;
}

/**
 * Surtax (מס יסף): rate on taxable income above the threshold, plus an additional rate on the
 * CAPITAL part of the income that lies above the threshold.
 */
export function surtax(totalIncome: Agorot, capitalIncome: Agorot, p: { thresholdAnnual: number; ratePpm: number; capitalAdditionalPpm: number }): { base: Agorot; capitalAbove: Agorot; tax: Agorot } {
  const above = totalIncome - BigInt(p.thresholdAnnual);
  if (above <= 0n) return { base: 0n, capitalAbove: 0n, tax: 0n };
  const capitalAbove = capitalIncome < above ? capitalIncome : above;
  return { base: above, capitalAbove, tax: divRound(above * BigInt(p.ratePpm) + capitalAbove * BigInt(p.capitalAdditionalPpm), 1_000_000n) };
}

import { divRound, type Agorot } from "@/lib/money";
import type { RuleUsed } from "./rules";

/** One line of the step-by-step breakdown shown on every calculation screen. */
export type Step = { key: string; values?: Record<string, string | number>; amount?: Agorot };

export type CalcResult<R> = {
  calculator: string;
  version: string;
  rulesUsed: RuleUsed[];
  steps: Step[];
  result: R;
  warnings: string[];
};

export type Bracket = { upTo: number | null; ratePpm: number };

/**
 * Progressive tax over brackets (upper bounds in agorot). Exact: Σ portion × rate is
 * accumulated in agorot·ppm and divided once, rounded HALF_UP to the agora.
 */
export function progressiveTax(amount: Agorot, brackets: readonly Bracket[]): { tax: Agorot; parts: { from: Agorot; to: Agorot; ratePpm: number; tax: Agorot }[] } {
  let lower = 0n;
  let acc = 0n;
  const parts: { from: Agorot; to: Agorot; ratePpm: number; tax: Agorot }[] = [];
  for (const b of brackets) {
    if (amount <= lower) break;
    const upper = b.upTo === null ? amount : BigInt(b.upTo) < amount ? BigInt(b.upTo) : amount;
    const portion = upper - lower;
    if (portion > 0n) {
      acc += portion * BigInt(b.ratePpm);
      parts.push({ from: lower, to: upper, ratePpm: b.ratePpm, tax: divRound(portion * BigInt(b.ratePpm), 1_000_000n) });
    }
    if (b.upTo === null) break;
    lower = BigInt(b.upTo);
  }
  return { tax: divRound(acc, 1_000_000n), parts };
}

/** Whole days between two YYYY-MM-DD dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);

/** Adds whole years to a YYYY-MM-DD date (Feb 29 → Feb 28 when needed). */
export function addYears(d: string, years: number): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y + years, m - 1, day));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

/** Adds whole months to a YYYY-MM-DD date (end-of-month clamped). */
export function addMonthsToDate(d: string, months: number): string {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, day));
  if (target.getUTCDate() !== day) target.setUTCDate(0);
  return target.toISOString().slice(0, 10);
}

export const toJsonSafe = <T>(v: T): unknown => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

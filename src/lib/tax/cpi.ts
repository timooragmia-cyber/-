import { divRound, type Agorot } from "@/lib/money";

/**
 * CPI index values are stored ×1000 (e.g. 104.3 → 104300) with an explicit base label.
 * Ratios are only computed between values of the SAME base.
 */
export type CpiPoint = { period: string; valueMilli: number; base: string };

export class CpiUnavailableError extends Error {
  constructor(public readonly period: string, public readonly reason: "MISSING" | "BASE_MISMATCH") {
    super(`CPI ${period}: ${reason}`);
    this.name = "CpiUnavailableError";
  }
}

/**
 * "Known index" convention: the CPI for month M is published around the 15th of M+1.
 * On a date from the 15th onward the known index is last month's; before the 15th it is
 * the month before that. The advisor can always override the index values on screen.
 */
export function knownIndexPeriod(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const idx = y * 12 + (m - 1) - (d >= 15 ? 1 : 2);
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function cpiFor(series: readonly CpiPoint[], period: string): CpiPoint {
  const p = series.find((x) => x.period === period);
  if (!p) throw new CpiUnavailableError(period, "MISSING");
  return p;
}

/** Inflationary amount = cost × (CPI_end / CPI_start − 1), exact, HALF_UP. Negative inflation → 0. */
export function inflationaryAmount(cost: Agorot, start: CpiPoint, end: CpiPoint): Agorot {
  if (start.base !== end.base) throw new CpiUnavailableError(end.period, "BASE_MISMATCH");
  if (end.valueMilli <= start.valueMilli) return 0n;
  return divRound(cost * BigInt(end.valueMilli - start.valueMilli), BigInt(start.valueMilli));
}

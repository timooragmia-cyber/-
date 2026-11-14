/**
 * Picks the configuration row valid on a given date (tax rules, fee benchmarks, params).
 * Calculations ALWAYS call this with the transaction/event date, never "today" implicitly.
 * Dates are compared as YYYY-MM-DD strings (calendar dates, no time zone drift).
 */
export type Effective = { effectiveFrom: Date; effectiveTo: Date | null };

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export class OverlappingConfigError extends Error {}

export function selectEffective<T extends Effective>(rows: readonly T[], on: Date): T | null {
  const day = ymd(on);
  const matches = rows.filter((r) => ymd(r.effectiveFrom) <= day && (r.effectiveTo === null || ymd(r.effectiveTo) >= day));
  if (matches.length > 1) {
    throw new OverlappingConfigError(`Overlapping configuration rows for ${day}; fix the effective dates`);
  }
  return matches[0] ?? null;
}

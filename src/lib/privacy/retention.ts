/**
 * Restrict-then-purge: a deletion request restricts the household immediately; the data is
 * purged once the advisor's retention period (years) has passed since the restriction.
 * No retention configured → never eligible (the purge refuses rather than guess a period).
 */
export type PurgeEligibility =
  | { state: "NOT_RESTRICTED" }
  | { state: "NO_RETENTION_SET" }
  | { state: "WAITING"; eligibleAt: Date }
  | { state: "ELIGIBLE"; eligibleAt: Date };

/** Same calendar day N years later (UTC); 29 Feb rolls to 28 Feb in non-leap years. */
export function addYearsUtc(d: Date, years: number): Date {
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

export function purgeEligibility(restrictedAt: Date | null, retentionYears: number | null, now: Date): PurgeEligibility {
  if (!restrictedAt) return { state: "NOT_RESTRICTED" };
  if (retentionYears === null) return { state: "NO_RETENTION_SET" };
  const eligibleAt = addYearsUtc(restrictedAt, retentionYears);
  return eligibleAt.getTime() <= now.getTime() ? { state: "ELIGIBLE", eligibleAt } : { state: "WAITING", eligibleAt };
}

/** Response deadline for a data-subject request. */
export function requestDueAt(receivedAt: Date, days: number): Date {
  return new Date(receivedAt.getTime() + days * 86_400_000);
}

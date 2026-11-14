import { addMonths, dayOfMonth, periodOf, type Period } from "./period";

export type MonthStatus = "SURPLUS" | "DEFICIT" | "NO_DATA";
export type Trend = "UP" | "DOWN" | "FLAT" | null;

export type SnapshotSummary = {
  period: Period;
  surplus: bigint; // agorot
  savingsRatePpm: number;
};

export type HouseholdStatusResult = {
  status: MonthStatus;
  lastClosedPeriod: Period | null;
  /** The month the advisor is expected to have closed by today. */
  expectedPeriod: Period;
  missingUpdate: boolean;
  trend: Trend;
};

/**
 * Traffic-light status for the advisor dashboard.
 *
 * - expectedPeriod: the previous calendar month, once `graceDays` of the current month
 *   have passed; before that, the month before it. (graceDays comes from
 *   AdvisoryParameter "monthly_close.grace_days" — not hardcoded.)
 * - NO_DATA when nothing was ever closed.
 * - missingUpdate when the latest closed period is older than expectedPeriod.
 * - trend compares savings rate of the two most recent closed months; a change smaller
 *   than `flatThresholdPpm` is FLAT.
 *
 * `snapshots` must contain the latest version per period (any order).
 */
export function computeHouseholdStatus(
  snapshots: readonly SnapshotSummary[],
  now: Date,
  graceDays: number,
  flatThresholdPpm: number,
): HouseholdStatusResult {
  const current = periodOf(now);
  const expectedPeriod = dayOfMonth(now) > graceDays ? addMonths(current, -1) : addMonths(current, -2);
  const sorted = [...snapshots].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
  const latest = sorted[0];
  if (!latest) {
    return { status: "NO_DATA", lastClosedPeriod: null, expectedPeriod, missingUpdate: true, trend: null };
  }
  const prev = sorted[1];
  let trend: Trend = null;
  if (prev) {
    const delta = latest.savingsRatePpm - prev.savingsRatePpm;
    trend = Math.abs(delta) < flatThresholdPpm ? "FLAT" : delta > 0 ? "UP" : "DOWN";
  }
  return {
    status: latest.surplus >= 0n ? "SURPLUS" : "DEFICIT",
    lastClosedPeriod: latest.period,
    expectedPeriod,
    missingUpdate: latest.period < expectedPeriod,
    trend,
  };
}

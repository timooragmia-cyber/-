import { ratioPpm, type Agorot } from "@/lib/money";
import type { MonthCloseResult } from "./month-close";

export type Highlight = {
  categoryKey: string;
  direction: "UP" | "DOWN";
  changePpm: number; // relative change vs previous month (absolute value)
  delta: Agorot; // current - previous (signed)
  /** Good for the household: spending down, or income up. */
  favorable: boolean;
  kind: "EXPENSE" | "INCOME" | "TOTAL";
};

/**
 * Month-over-month plain-language highlights ("groceries down 12%").
 * A category is mentioned only if it moved at least `minChangePpm` AND `minChangeAgorot`
 * (both from AdvisoryParameter "highlights.thresholds"). Sorted by absolute shekel impact.
 */
export function monthOverMonthHighlights(
  current: MonthCloseResult,
  previous: MonthCloseResult,
  t: { minChangePpm: number; minChangeAgorot: number; max: number },
): Highlight[] {
  const out: Highlight[] = [];
  const consider = (key: string, cur: Agorot, prev: Agorot, kind: Highlight["kind"]) => {
    const delta = cur - prev;
    const abs = delta < 0n ? -delta : delta;
    if (abs < BigInt(t.minChangeAgorot) || prev === 0n) return;
    const change = ratioPpm(abs, prev < 0n ? -prev : prev) ?? 0;
    if (change < t.minChangePpm) return;
    const up = delta > 0n;
    out.push({ categoryKey: key, direction: up ? "UP" : "DOWN", changePpm: change, delta, favorable: kind === "INCOME" ? up : !up, kind });
  };
  const prevExp = new Map(previous.expenses.map((l) => [l.key, l.amount]));
  const curExp = new Map(current.expenses.map((l) => [l.key, l.amount]));
  for (const key of new Set([...prevExp.keys(), ...curExp.keys()])) consider(key, curExp.get(key) ?? 0n, prevExp.get(key) ?? 0n, "EXPENSE");
  consider("__total_income", current.totalIncome, previous.totalIncome, "INCOME");
  const abs = (h: Highlight) => (h.delta < 0n ? -h.delta : h.delta);
  return out.sort((a, b) => (abs(a) > abs(b) ? -1 : abs(a) < abs(b) ? 1 : 0)).slice(0, t.max);
}

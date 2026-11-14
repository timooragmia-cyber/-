import { addMonths } from "@/lib/domain/period";
import type { Agorot } from "@/lib/money";

export type BalancePoint = { key: string; kind: "BANK" | "CARD" | "PRODUCT"; asOf: string; balance: Agorot };

/**
 * Month-end net worth series (pure). For each month, every asset/liability contributes its
 * latest known balance on or before month end (carried forward). Phase 2 covers bank,
 * card and long-term savings balances; loans and mortgages join in Phase 4.
 */
export function netWorthSeries(points: readonly BalancePoint[], fromPeriod: string, toPeriod: string): { period: string; assets: Agorot; liabilities: Agorot; netWorth: Agorot; savings: Agorot }[] {
  const byKey = new Map<string, BalancePoint[]>();
  for (const p of points) byKey.set(p.key, [...(byKey.get(p.key) ?? []), p].sort((a, b) => a.asOf.localeCompare(b.asOf)));
  const out = [];
  for (let p = fromPeriod; p <= toPeriod; p = addMonths(p, 1)) {
    const monthEnd = `${p}-31`;
    let assets = 0n, liabilities = 0n, savings = 0n;
    for (const list of byKey.values()) {
      const last = [...list].reverse().find((x) => x.asOf <= monthEnd);
      if (!last) continue;
      if (last.balance >= 0n) assets += last.balance;
      else liabilities += -last.balance;
      if (last.kind === "PRODUCT") savings += last.balance;
    }
    out.push({ period: p, assets, liabilities, netWorth: assets - liabilities, savings });
  }
  return out;
}

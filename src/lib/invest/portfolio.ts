import { divRound, type Agorot } from "@/lib/money";
import type { MonthPoint } from "./returns";

export const PORTFOLIO_VERSION = "portfolio@1";

export type AssetClass = "EQUITY_IL" | "EQUITY_FOREIGN" | "BONDS_GOV" | "BONDS_CORP" | "MONEY_MARKET" | "CASH" | "OTHER";
export type TxnType = "DEPOSIT" | "WITHDRAWAL" | "BUY" | "SELL" | "DIVIDEND" | "INTEREST" | "FEE" | "TAX";
export type FeeKind = "MANAGEMENT" | "TRADING" | "CUSTODY" | "OTHER";

/** Units are micro-units (×1,000,000) to avoid floats for fractional fund units. */
export type PTxn = { date: string; type: TxnType; holdingId: string | null; units: bigint; amount: Agorot; feeKind: FeeKind | null };
export type PHolding = { id: string; name: string; assetClass: AssetClass };
export type PValuation = { holdingId: string; asOf: string; value: Agorot };

export type HoldingState = {
  holding: PHolding;
  units: bigint;
  costBasis: Agorot; // remaining cost (average-cost method)
  realizedGain: Agorot;
  value: Agorot | null; // latest valuation (null = never valued)
  valueAsOf: string | null;
  unrealizedGain: Agorot | null;
};

/**
 * Replays transactions in date order. BUY adds units and cost (amount = cash paid incl.
 * commission); SELL removes units at average cost, realized = proceeds − cost removed.
 * Cash balance = deposits − withdrawals − buys + sells + dividends + interest − fees − taxes.
 */
export function replay(holdings: readonly PHolding[], txns: readonly PTxn[], valuations: readonly PValuation[]) {
  const state = new Map<string, { units: bigint; cost: bigint; realized: bigint }>(holdings.map((h) => [h.id, { units: 0n, cost: 0n, realized: 0n }]));
  let cash = 0n;
  const fees: Record<FeeKind, bigint> = { MANAGEMENT: 0n, TRADING: 0n, CUSTODY: 0n, OTHER: 0n };
  let dividends = 0n, interest = 0n, taxesPaid = 0n, netDeposits = 0n;
  const errors: string[] = [];
  for (const t of [...txns].sort((a, b) => a.date.localeCompare(b.date))) {
    const s = t.holdingId ? state.get(t.holdingId) : undefined;
    switch (t.type) {
      case "DEPOSIT": cash += t.amount; netDeposits += t.amount; break;
      case "WITHDRAWAL": cash -= t.amount; netDeposits -= t.amount; break;
      case "BUY":
        if (!s) { errors.push(`buy-without-holding:${t.date}`); break; }
        s.units += t.units; s.cost += t.amount; cash -= t.amount; break;
      case "SELL": {
        if (!s || s.units <= 0n || t.units > s.units) { errors.push(`oversell:${t.date}`); break; }
        const removed = divRound(s.cost * t.units, s.units);
        s.realized += t.amount - removed; s.cost -= removed; s.units -= t.units; cash += t.amount; break;
      }
      case "DIVIDEND": dividends += t.amount; cash += t.amount; break;
      case "INTEREST": interest += t.amount; cash += t.amount; break;
      case "FEE": fees[t.feeKind ?? "OTHER"] += t.amount; cash -= t.amount; break;
      case "TAX": taxesPaid += t.amount; cash -= t.amount; break;
    }
  }
  const latest = new Map<string, PValuation>();
  for (const v of valuations) {
    const cur = latest.get(v.holdingId);
    if (!cur || v.asOf > cur.asOf) latest.set(v.holdingId, v);
  }
  const rows: HoldingState[] = holdings.map((h) => {
    const s = state.get(h.id)!;
    const v = latest.get(h.id);
    return { holding: h, units: s.units, costBasis: s.cost, realizedGain: s.realized, value: v?.value ?? null, valueAsOf: v?.asOf ?? null, unrealizedGain: v ? v.value - s.cost : null };
  });
  const invested = rows.reduce((sum, r) => sum + (r.value ?? r.costBasis), 0n);
  return {
    holdings: rows,
    cash,
    totalValue: invested + cash,
    fees,
    totalFees: fees.MANAGEMENT + fees.TRADING + fees.CUSTODY + fees.OTHER,
    dividends,
    interest,
    taxesPaid,
    netDeposits,
    realizedGain: rows.reduce((s, r) => s + r.realizedGain, 0n),
    unrealizedGain: rows.reduce((s, r) => s + (r.unrealizedGain ?? 0n), 0n),
    unvalued: rows.filter((r) => r.value === null && r.units > 0n).map((r) => r.holding.name),
    errors,
  };
}

/** Allocation by asset class vs target (ppm). Cash counts as CASH. */
export function allocation(rows: readonly HoldingState[], cash: Agorot, target: Partial<Record<AssetClass, number>>) {
  const by = new Map<AssetClass, bigint>();
  for (const r of rows) by.set(r.holding.assetClass, (by.get(r.holding.assetClass) ?? 0n) + (r.value ?? r.costBasis));
  if (cash !== 0n) by.set("CASH", (by.get("CASH") ?? 0n) + cash);
  const total = [...by.values()].reduce((s, v) => s + v, 0n);
  const classes = new Set<AssetClass>([...by.keys(), ...(Object.keys(target) as AssetClass[])]);
  return [...classes].map((c) => {
    const value = by.get(c) ?? 0n;
    const actualPpm = total > 0n ? Number(divRound(value * 1_000_000n, total)) : 0;
    const targetPpm = target[c] ?? null;
    return { assetClass: c, value, actualPpm, targetPpm, driftPpm: targetPpm === null ? null : actualPpm - targetPpm };
  }).sort((a, b) => (a.value > b.value ? -1 : 1));
}

/**
 * Unrealized tax liability estimate: rate × positive unrealized gain, per holding (losses of one
 * holding offset gains of another). NOMINAL gains — the real gain (and so the tax) is usually
 * lower; shown as an upper-bound estimate.
 */
export function unrealizedTax(rows: readonly HoldingState[], ratePpm: number): Agorot {
  const net = rows.reduce((s, r) => s + (r.unrealizedGain ?? 0n), 0n);
  return net > 0n ? divRound(net * BigInt(ratePpm), 1_000_000n) : 0n;
}

/**
 * Month-end series for return computations: value = Σ latest valuation ≤ month end
 * (holdings not yet valued count at cost) + cash; flows = deposits − withdrawals in the month.
 */
export function monthlySeries(holdings: readonly PHolding[], txns: readonly PTxn[], valuations: readonly PValuation[], periods: readonly string[]): MonthPoint[] {
  return periods.map((p) => {
    const end = `${p}-31`;
    const r = replay(holdings, txns.filter((t) => t.date <= end), valuations.filter((v) => v.asOf <= end));
    const flow = txns.filter((t) => t.date.startsWith(p)).reduce((s, t) => s + (t.type === "DEPOSIT" ? t.amount : t.type === "WITHDRAWAL" ? -t.amount : 0n), 0n);
    return { period: p, value: r.totalValue, netFlow: flow };
  });
}

/** Investor cash flows per month for IRR: −deposits, +withdrawals, + final value in the last month. */
export function irrFlows(points: readonly MonthPoint[]): Agorot[] {
  const flows = points.map((p) => -p.netFlow);
  if (flows.length) flows[flows.length - 1] = flows[flows.length - 1]! + points[points.length - 1]!.value;
  // the first month's opening value counts as an initial deposit
  if (points.length && points[0]!.value > 0n && points[0]!.netFlow === 0n) flows[0] = flows[0]! - points[0]!.value;
  return flows;
}

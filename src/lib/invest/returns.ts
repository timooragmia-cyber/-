import { divRound, type Agorot } from "@/lib/money";

/** Fixed-point scale for rates in return computations (1.0 = 10^12). */
const S = 10n ** 12n;

export type MonthPoint = {
  period: string; // "YYYY-MM" month end
  value: Agorot; // portfolio value at month end
  netFlow: Agorot; // external flows during the month (deposits +, withdrawals −)
};

/**
 * Time-weighted return (chained Modified Dietz, flows assumed mid-month):
 *   r_m = (V_end − V_start − F) / (V_start + F/2),  TWR = Π(1 + r_m) − 1.
 * Exact rational arithmetic in fixed point; returns ppm (cumulative) and annualized ppm.
 * Monthly valuations only → this approximates true TWR (documented on screen).
 */
export function timeWeightedReturn(points: readonly MonthPoint[]): { cumulativePpm: number; annualizedPpm: number | null; months: number } | null {
  if (points.length < 2) return null;
  let growth = S;
  for (let i = 1; i < points.length; i++) {
    const v0 = points[i - 1]!.value;
    const { value: v1, netFlow: f } = points[i]!;
    const denom = v0 * 2n + f; // ×2 to keep F/2 exact
    if (denom <= 0n) continue; // empty period (nothing invested) — skip
    const r = ((v1 - v0 - f) * 2n * S) / denom;
    growth = (growth * (S + r)) / S;
  }
  const months = points.length - 1;
  const cumulativePpm = Number(((growth - S) * 1_000_000n) / S);
  return { cumulativePpm, annualizedPpm: months >= 12 ? annualizeFromGrowth(growth, months) : null, months };
}

function rootFixed(x: bigint, k: number): bigint {
  // k-th root of x (scaled by S) via bisection on the scaled value
  let lo = 0n;
  let hi = x > S ? x : S;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2n;
    let p = S;
    for (let j = 0; j < k; j++) p = (p * mid) / S;
    if (p > x) hi = mid;
    else lo = mid;
    if (hi - lo <= 1n) break;
  }
  return lo;
}

function annualizeFromGrowth(growth: bigint, months: number): number {
  // (growth)^(12/months) − 1 → via k-th root then power 12
  const monthly = rootFixed(growth, months);
  let annual = S;
  for (let j = 0; j < 12; j++) annual = (annual * monthly) / S;
  return Number(((annual - S) * 1_000_000n) / S);
}

/**
 * Money-weighted return (IRR) on monthly cash flows from the investor's view:
 * deposits are negative, withdrawals positive, final value positive (last month).
 * Bisection on the monthly rate in fixed point; returns annualized ppm.
 */
export function moneyWeightedReturn(flows: readonly Agorot[]): number | null {
  if (flows.length < 2 || !flows.some((f) => f < 0n) || !flows.some((f) => f > 0n)) return null;
  const npv = (m: bigint): bigint | null => {
    // Σ CF_k / (1+m)^k, accumulated in fixed point
    let disc = S;
    let total = 0n;
    const step = S + m;
    for (let k = 0; k < flows.length; k++) {
      total += (flows[k]! * S * S) / disc / S;
      disc = (disc * step) / S;
      if (disc <= 0n) return null;
    }
    return total;
  };
  // −50%/month lower bound: deep enough for any real portfolio while keeping the discount
  // factor (0.5^k at S = 10^12) from underflowing to zero over long horizons.
  let lo = -S / 2n;
  let hi = S; // +100% / month
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (fLo === null || fHi === null || (fLo > 0n) === (fHi > 0n)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2n;
    const fMid = npv(mid);
    if (fMid === null) return null;
    if (fMid === 0n || hi - lo <= 1n) {
      lo = mid;
      break;
    }
    if ((fMid > 0n) === (fLo > 0n)) {
      lo = mid;
      fLo = fMid;
    } else hi = mid;
  }
  let annual = S;
  for (let j = 0; j < 12; j++) annual = (annual * (S + lo)) / S;
  return Number(((annual - S) * 1_000_000n) / S);
}

export const pctOf = (part: Agorot, whole: Agorot) => (whole === 0n ? 0 : Number(divRound(part * 1_000_000n, whole)));

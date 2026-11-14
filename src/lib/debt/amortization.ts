import { divRound, type Agorot } from "@/lib/money";
import { FACTOR_SCALE, monthlyFactorFromAnnualPpm } from "@/lib/math/fixed";

export const AMORTIZATION_VERSION = "amortization@1";

/**
 * Israeli mortgage track types:
 *  PRIME               variable every month: rate = prime + margin (unlinked)
 *  FIXED_UNLINKED      קל"צ
 *  FIXED_LINKED        ק"צ — principal linked to CPI
 *  VARIABLE_5_UNLINKED משתנה כל 5 שנים, לא צמוד
 *  VARIABLE_5_LINKED   משתנה כל 5 שנים, צמוד
 */
export type TrackType = "PRIME" | "FIXED_UNLINKED" | "FIXED_LINKED" | "VARIABLE_5_UNLINKED" | "VARIABLE_5_LINKED";
export type Method = "SPITZER" | "EQUAL_PRINCIPAL";

export type Track = {
  type: TrackType;
  balance: Agorot;
  remainingMonths: number;
  /** Current annual rate (ppm). For PRIME this is prime + margin today. */
  annualRatePpm: number;
  method: Method;
  /** For variable-every-5: months until the next reset. */
  monthsToReset?: number;
};

/** Rate path assumptions (scenario). All ppm. */
export type RateScenario = {
  /** Change in prime from month `primeChangeAfter` onward (e.g. −10,000 = −1%). */
  primeDeltaPpm: number;
  primeChangeAfter: number;
  /** Change applied to variable-5 tracks at each reset. */
  resetDeltaPpm: number;
  /** Expected annual CPI for linked tracks. */
  inflationPpm: number;
};

export const BASE_SCENARIO: RateScenario = { primeDeltaPpm: 0, primeChangeAfter: 0, resetDeltaPpm: 0, inflationPpm: 0 };

export type ScheduleRow = { month: number; ratePpm: number; payment: Agorot; interest: Agorot; principal: Agorot; indexation: Agorot; balance: Agorot };
export type Schedule = { rows: ScheduleRow[]; totalPaid: Agorot; totalInterest: Agorot; totalIndexation: Agorot; firstPayment: Agorot; maxPayment: Agorot };

/**
 * Spitzer payment for balance B, monthly rate r = annual/12, n months: B·r / (1 − (1+r)^−n).
 * Computed in fixed point (10^15) with exact integer powers; rounded HALF_UP to the agora.
 * Israeli banks quote annual rates and charge annual/12 monthly (not compounded).
 */
export function spitzerPayment(balance: Agorot, annualRatePpm: number, months: number): Agorot {
  if (months <= 0) return balance;
  if (annualRatePpm === 0) return divRound(balance, BigInt(months));
  const S = FACTOR_SCALE;
  const r = (BigInt(annualRatePpm) * S) / 12_000_000n; // monthly rate × S
  let pow = S; // (1+r)^n × S
  for (let i = 0; i < months; i++) pow = (pow * (S + r)) / S;
  // payment = B·r·(1+r)^n / ((1+r)^n − 1)
  return divRound(balance * r * pow, (pow - S) * S);
}

/** Full monthly schedule for one track under a rate scenario. */
export function schedule(track: Track, sc: RateScenario = BASE_SCENARIO): Schedule {
  const linked = track.type === "FIXED_LINKED" || track.type === "VARIABLE_5_LINKED";
  const variable5 = track.type === "VARIABLE_5_UNLINKED" || track.type === "VARIABLE_5_LINKED";
  const inflM = linked ? monthlyFactorFromAnnualPpm(sc.inflationPpm) : FACTOR_SCALE;
  let balance = track.balance;
  let rate = track.annualRatePpm;
  let resetIn = track.monthsToReset ?? 60;
  const rows: ScheduleRow[] = [];
  let totalPaid = 0n, totalInterest = 0n, totalIdx = 0n, maxPayment = 0n;
  const n = track.remainingMonths;
  const principalPart = track.method === "EQUAL_PRINCIPAL" ? divRound(balance, BigInt(Math.max(1, n))) : 0n;
  for (let m = 1; m <= n && balance > 0n; m++) {
    if (track.type === "PRIME" && m === sc.primeChangeAfter + 1 && sc.primeDeltaPpm !== 0) rate = Math.max(0, rate + sc.primeDeltaPpm);
    if (variable5 && m > 1 && --resetIn <= 0) {
      rate = Math.max(0, rate + sc.resetDeltaPpm);
      resetIn = 60;
    }
    const indexation = linked ? divRound(balance * (inflM - FACTOR_SCALE), FACTOR_SCALE) : 0n;
    balance += indexation;
    const interest = divRound(balance * BigInt(rate), 12_000_000n);
    const remaining = n - m + 1;
    let principal: Agorot;
    if (track.method === "SPITZER") principal = spitzerPayment(balance, rate, remaining) - interest;
    else principal = linked ? divRound(balance, BigInt(remaining)) : principalPart;
    if (m === n || principal > balance) principal = balance;
    const payment = principal + interest;
    balance -= principal;
    rows.push({ month: m, ratePpm: rate, payment, interest, principal, indexation, balance });
    totalPaid += payment;
    totalInterest += interest;
    totalIdx += indexation;
    if (payment > maxPayment) maxPayment = payment;
  }
  return { rows, totalPaid, totalInterest, totalIndexation: totalIdx, firstPayment: rows[0]?.payment ?? 0n, maxPayment };
}

/** Whole mortgage (sum of tracks) under a scenario. */
export function mortgageSchedule(tracks: readonly Track[], sc: RateScenario = BASE_SCENARIO) {
  const each = tracks.map((t) => schedule(t, sc));
  const months = Math.max(0, ...tracks.map((t) => t.remainingMonths));
  const monthly: Agorot[] = Array.from({ length: months }, (_, i) => each.reduce((s, e) => s + (e.rows[i]?.payment ?? 0n), 0n));
  return {
    tracks: each,
    firstPayment: monthly[0] ?? 0n,
    maxPayment: monthly.reduce((m, p) => (p > m ? p : m), 0n),
    totalPaid: each.reduce((s, e) => s + e.totalPaid, 0n),
    totalInterest: each.reduce((s, e) => s + e.totalInterest, 0n),
    totalIndexation: each.reduce((s, e) => s + e.totalIndexation, 0n),
    balance: tracks.reduce((s, t) => s + t.balance, 0n),
    monthly,
  };
}

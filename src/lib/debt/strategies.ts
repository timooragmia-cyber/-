import { divRound, type Agorot } from "@/lib/money";
import { mortgageSchedule, schedule, spitzerPayment, type RateScenario, type Track, type TrackType } from "./amortization";

/**
 * Refinancing / early repayment: current tracks vs a new set of tracks for the same balance.
 * Costs: early-repayment fee (advisor's estimate from the bank's quote) + new-loan opening costs.
 * Break-even = months until cumulative monthly savings exceed the costs.
 */
export function refinance(current: readonly Track[], proposed: readonly Track[], costs: { earlyRepaymentFee: Agorot; openingCosts: Agorot }, sc: RateScenario) {
  const a = mortgageSchedule(current, sc);
  const b = mortgageSchedule(proposed, sc);
  const oneOff = costs.earlyRepaymentFee + costs.openingCosts;
  let cum = -oneOff;
  let breakEven: number | null = null;
  const n = Math.max(a.monthly.length, b.monthly.length);
  for (let i = 0; i < n; i++) {
    cum += (a.monthly[i] ?? 0n) - (b.monthly[i] ?? 0n);
    if (breakEven === null && cum >= 0n) breakEven = i + 1;
  }
  return {
    current: { firstPayment: a.firstPayment, totalPaid: a.totalPaid, maxPayment: a.maxPayment },
    proposed: { firstPayment: b.firstPayment, totalPaid: b.totalPaid + oneOff, maxPayment: b.maxPayment },
    monthlyChange: b.firstPayment - a.firstPayment,
    totalSaving: a.totalPaid - (b.totalPaid + oneOff),
    breakEvenMonths: breakEven,
  };
}

export type MixConstraints = { minFixedPpm: number; maxVariablePpm: number };
export type MixRates = Record<TrackType, number>; // annual ppm offered today per track type

/**
 * Track-mix optimizer: enumerates mixes of PRIME / FIXED_UNLINKED / FIXED_LINKED /
 * VARIABLE_5_UNLINKED in 10% steps, keeps those meeting the regulatory constraints (configured
 * parameters), evaluates each under several scenarios, and returns the best mix per objective:
 *  - cheapest expected total (base scenario),
 *  - lowest worst-case monthly payment (stress scenario),
 *  - balanced (best average rank of the two).
 * "Fixed" = FIXED_UNLINKED + FIXED_LINKED; "variable" (rate can change within 5 years) = PRIME.
 */
export function optimizeMix(amount: Agorot, months: number, rates: MixRates, cons: MixConstraints, scenarios: { base: RateScenario; stress: RateScenario; falling: RateScenario }) {
  const types: TrackType[] = ["PRIME", "FIXED_UNLINKED", "FIXED_LINKED", "VARIABLE_5_UNLINKED"];
  const out: { mix: Record<string, number>; baseTotal: Agorot; stressMax: Agorot; fallingTotal: Agorot; firstPayment: Agorot }[] = [];
  // A track's schedule depends only on (type, share, scenario): compute each once and sum per
  // mix. Identical to mortgageSchedule() on the mix (same balances, same rounding), ~30x faster.
  const memo = new Map<string, ReturnType<typeof schedule>>();
  const trackSchedule = (typeIdx: number, share: number, name: "base" | "stress" | "falling") => {
    const key = `${typeIdx}:${share}:${name}`;
    let s = memo.get(key);
    if (!s) {
      s = schedule({ type: types[typeIdx]!, balance: divRound(amount * BigInt(share), 10n), remainingMonths: months, annualRatePpm: rates[types[typeIdx]!], method: "SPITZER" }, scenarios[name]);
      memo.set(key, s);
    }
    return s;
  };
  const combine = (parts: number[], name: "base" | "stress" | "falling") => {
    const each = parts.flatMap((share, i) => (divRound(amount * BigInt(share), 10n) > 0n ? [trackSchedule(i, share, name)] : []));
    let total = 0n;
    let max = 0n;
    let first = 0n;
    for (const e of each) total += e.totalPaid;
    for (let m = 0; m < months; m++) {
      let pay = 0n;
      for (const e of each) pay += e.rows[m]?.payment ?? 0n;
      if (m === 0) first = pay;
      if (pay > max) max = pay;
    }
    return { total, max, first };
  };
  for (let p = 0; p <= 10; p++)
    for (let fu = 0; fu <= 10 - p; fu++)
      for (let fl = 0; fl <= 10 - p - fu; fl++) {
        const v5 = 10 - p - fu - fl;
        const fixedPpm = (fu + fl) * 100_000;
        const variablePpm = p * 100_000;
        if (fixedPpm < cons.minFixedPpm || variablePpm > cons.maxVariablePpm) continue;
        const parts = [p, fu, fl, v5];
        const base = combine(parts, "base");
        const stress = combine(parts, "stress");
        const falling = combine(parts, "falling");
        out.push({ mix: Object.fromEntries(types.map((t, i) => [t, parts[i]! * 100_000])), baseTotal: base.total, stressMax: stress.max, fallingTotal: falling.total, firstPayment: base.first });
      }
  if (out.length === 0) return null;
  const by = <K extends "baseTotal" | "stressMax">(k: K) => [...out].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0));
  const cheapest = by("baseTotal")[0]!;
  const safest = by("stressMax")[0]!;
  const rankA = new Map(by("baseTotal").map((x, i) => [x, i]));
  const rankB = new Map(by("stressMax").map((x, i) => [x, i]));
  const balanced = [...out].sort((a, b) => rankA.get(a)! + rankB.get(a)! - (rankA.get(b)! + rankB.get(b)!))[0]!;
  return { cheapest, safest, balanced, evaluated: out.length };
}

export type Debt = { id: string; label: string; kind: "OVERDRAFT" | "CARD_CREDIT" | "CONSUMER_LOAN" | "CAR_LOAN" | "OTHER"; balance: Agorot; annualRatePpm: number; monthlyPayment: Agorot; remainingMonths: number | null };

/** Debts ranked by effective annual interest (highest first) with yearly interest cost. */
export function rankDebts(debts: readonly Debt[], expensiveThresholdPpm: number | null) {
  return [...debts]
    .sort((a, b) => b.annualRatePpm - a.annualRatePpm)
    .map((d) => ({ ...d, annualInterest: divRound(d.balance * BigInt(d.annualRatePpm), 1_000_000n), expensive: expensiveThresholdPpm === null ? null : d.annualRatePpm > expensiveThresholdPpm }));
}

/** Remaining cost of a loan (payments left) — Spitzer, or overdraft modeled as interest-only. */
export function remainingCost(d: Debt): Agorot {
  if (d.remainingMonths === null) return divRound(d.balance * BigInt(d.annualRatePpm), 1_000_000n); // one year of interest
  return spitzerPayment(d.balance, d.annualRatePpm, d.remainingMonths) * BigInt(d.remainingMonths);
}

/** Consolidate selected debts into one new loan. Before = sum of current payments / remaining cost. */
export function consolidate(debts: readonly Debt[], loan: { annualRatePpm: number; months: number; fee: Agorot }) {
  const balance = debts.reduce((s, d) => s + d.balance, 0n) + loan.fee;
  const newPayment = spitzerPayment(balance, loan.annualRatePpm, loan.months);
  const beforeMonthly = debts.reduce((s, d) => s + d.monthlyPayment, 0n);
  const beforeTotal = debts.reduce((s, d) => s + remainingCost(d), 0n);
  const afterTotal = newPayment * BigInt(loan.months);
  return { balance, beforeMonthly, afterMonthly: newPayment, monthlyChange: newPayment - beforeMonthly, beforeTotal, afterTotal, totalChange: afterTotal - beforeTotal };
}

import { merchantKey } from "@/lib/import/text";
import { divRound, type Agorot } from "@/lib/money";

export type CashTxn = { date: string; amount: Agorot; description: string };

export type CalendarItem = { label: string; day: number; amount: Agorot; monthsSeen: number };
export type CashflowCalendar = {
  months: string[];
  /** Items that recur on (about) the same day each month. */
  items: CalendarItem[];
  /** Average monthly outflow NOT explained by recurring items (spread evenly). */
  variableMonthlyOut: Agorot;
  variableMonthlyIn: Agorot;
};

const median = <T extends bigint | number>(xs: T[]): T => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[Math.floor((xs.length - 1) / 2)]!;

/**
 * Cash-flow calendar from BANK-account lines of the last N complete months (card payments
 * are included — that is when card spending hits the account). A merchant is placed on
 * the calendar when it appears in at least `minMonths` of the months; its day and amount
 * are the medians. Everything else is "variable" and spread evenly over the month.
 */
export function buildCashflowCalendar(txns: readonly CashTxn[], months: readonly string[], minMonths: number): CashflowCalendar {
  const inRange = txns.filter((t) => months.includes(t.date.slice(0, 7)));
  const groups = new Map<string, { label: string; byMonth: Map<string, { amount: bigint; day: number }> }>();
  for (const t of inRange) {
    const key = `${merchantKey(t.description)}|${t.amount < 0n ? "out" : "in"}`;
    const g = groups.get(key) ?? { label: t.description, byMonth: new Map() };
    const m = t.date.slice(0, 7);
    const prev = g.byMonth.get(m);
    g.byMonth.set(m, { amount: (prev?.amount ?? 0n) + t.amount, day: prev?.day ?? Number(t.date.slice(8, 10)) });
    groups.set(key, g);
  }
  const items: CalendarItem[] = [];
  const explained = new Set<string>();
  for (const [key, g] of groups) {
    if (g.byMonth.size < minMonths) continue;
    const vals = [...g.byMonth.values()];
    items.push({ label: g.label, day: median(vals.map((v) => v.day)), amount: median(vals.map((v) => v.amount)), monthsSeen: g.byMonth.size });
    explained.add(key);
  }
  let varOut = 0n, varIn = 0n;
  for (const t of inRange) {
    const key = `${merchantKey(t.description)}|${t.amount < 0n ? "out" : "in"}`;
    if (explained.has(key)) continue;
    if (t.amount < 0n) varOut += -t.amount;
    else varIn += t.amount;
  }
  const n = BigInt(Math.max(1, months.length));
  items.sort((a, b) => a.day - b.day || (a.amount < b.amount ? -1 : 1));
  return { months: [...months], items, variableMonthlyOut: divRound(varOut, n), variableMonthlyIn: divRound(varIn, n) };
}

export type ProjectionDay = { day: number; date: string; inflow: Agorot; outflow: Agorot; balance: Agorot; belowZero: boolean; beyondOverdraft: boolean };

/**
 * Day-by-day projected bank balance for the next `days` days, starting from a known
 * balance on `fromDate`. Variable spending is spread evenly (monthly ÷ days in month).
 */
export function projectBalance(cal: CashflowCalendar, start: { date: string; balance: Agorot }, days: number, overdraftLimit: Agorot | null): ProjectionDay[] {
  const out: ProjectionDay[] = [];
  let bal = start.balance;
  const d = new Date(`${start.date}T00:00:00Z`);
  for (let i = 1; i <= days; i++) {
    const cur = new Date(d.getTime() + i * 86_400_000);
    const dom = cur.getUTCDate();
    const dim = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0)).getUTCDate();
    // items scheduled on days beyond this month's length fall on the last day
    const todays = cal.items.filter((it) => Math.min(it.day, dim) === dom);
    let inflow = todays.filter((x) => x.amount > 0n).reduce((s, x) => s + x.amount, 0n);
    let outflow = todays.filter((x) => x.amount < 0n).reduce((s, x) => s - x.amount, 0n);
    outflow += divRound(cal.variableMonthlyOut, BigInt(dim));
    inflow += divRound(cal.variableMonthlyIn, BigInt(dim));
    bal += inflow - outflow;
    out.push({
      day: dom,
      date: cur.toISOString().slice(0, 10),
      inflow,
      outflow,
      balance: bal,
      belowZero: bal < 0n,
      beyondOverdraft: overdraftLimit !== null && bal < -overdraftLimit,
    });
  }
  return out;
}

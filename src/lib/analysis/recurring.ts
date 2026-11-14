import { merchantKey } from "@/lib/import/text";
import { type Agorot } from "@/lib/money";

export type RecurringInput = {
  date: string; // YYYY-MM-DD (period attribution date)
  amount: Agorot;
  description: string;
  categoryKey: string | null;
  installmentTotal: number | null;
};

export type RecurringCharge = {
  merchantKey: string;
  sampleDescription: string;
  categoryKey: string | null;
  typicalAmount: Agorot; // median monthly outflow, positive
  monthsSeen: string[];
  lastDate: string;
  annualCost: Agorot;
  isSubscriptionLike: boolean;
};

const median = (vals: bigint[]): bigint => {
  const s = [...vals].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return s[Math.floor((s.length - 1) / 2)]!;
};

const SUBSCRIPTION_KEYS = new Set(["subscriptions", "communication", "leisure", "uncategorized"]);

/**
 * Recurring charge detection (pure). A merchant is recurring when it charged in at least
 * `minMonths` distinct months, about once a month (≤ 1.5 charges/month on average), and every
 * monthly total is within `tolerancePpm` of the median.
 * Installment lines are excluded (they are a separate commitment view).
 * Thresholds come from AdvisoryParameter "recurring.detection".
 */
export function detectRecurring(txns: readonly RecurringInput[], params: { minMonths: number; tolerancePpm: number }): RecurringCharge[] {
  const groups = new Map<string, { months: Map<string, bigint>; count: number; sample: string; cat: string | null; last: string }>();
  for (const t of txns) {
    if (t.amount >= 0n || t.installmentTotal) continue;
    const key = merchantKey(t.description);
    if (key.length < 2) continue;
    const g = groups.get(key) ?? { months: new Map(), count: 0, sample: t.description, cat: t.categoryKey, last: t.date };
    g.count++;
    const month = t.date.slice(0, 7);
    g.months.set(month, (g.months.get(month) ?? 0n) + -t.amount);
    if (t.date > g.last) {
      g.last = t.date;
      g.sample = t.description;
      g.cat = t.categoryKey;
    }
    groups.set(key, g);
  }
  const out: RecurringCharge[] = [];
  for (const [key, g] of groups) {
    if (g.months.size < params.minMonths) continue;
    // A recurring charge is ~one charge a month (rent, subscription, loan). Weekly shopping or
    // fuel can have stable monthly totals but is spending, not a commitment.
    if (g.count > g.months.size * 1.5) continue;
    const vals = [...g.months.values()];
    const med = median(vals);
    if (med <= 0n) continue;
    const tol = (med * BigInt(params.tolerancePpm)) / 1_000_000n;
    if (!vals.every((v) => (v > med ? v - med : med - v) <= tol)) continue;
    out.push({
      merchantKey: key,
      sampleDescription: g.sample,
      categoryKey: g.cat,
      typicalAmount: med,
      monthsSeen: [...g.months.keys()].sort(),
      lastDate: g.last,
      annualCost: med * 12n,
      isSubscriptionLike: g.cat === null || SUBSCRIPTION_KEYS.has(g.cat),
    });
  }
  return out.sort((a, b) => (a.annualCost > b.annualCost ? -1 : a.annualCost < b.annualCost ? 1 : 0));
}

export type InstallmentInput = RecurringInput & { installmentNumber: number | null };

export type InstallmentPlan = {
  merchantKey: string;
  sampleDescription: string;
  paymentAmount: Agorot;
  paid: number;
  total: number;
  remainingPayments: number;
  remainingAmount: Agorot;
  lastDate: string;
};

/**
 * Installment (tashlumim) commitments: for each plan keep the latest payment seen and
 * compute what is still to be paid. Total future burden = Σ remainingAmount.
 */
export function installmentBurden(txns: readonly InstallmentInput[]): { plans: InstallmentPlan[]; totalRemaining: Agorot } {
  const plans = new Map<string, InstallmentPlan>();
  for (const t of txns) {
    if (!t.installmentNumber || !t.installmentTotal || t.amount >= 0n) continue;
    const pay = -t.amount;
    const key = `${merchantKey(t.description)}|${t.installmentTotal}|${pay}`;
    const prev = plans.get(key);
    if (prev && prev.paid >= t.installmentNumber) continue;
    const remaining = t.installmentTotal - t.installmentNumber;
    plans.set(key, {
      merchantKey: merchantKey(t.description),
      sampleDescription: t.description,
      paymentAmount: pay,
      paid: t.installmentNumber,
      total: t.installmentTotal,
      remainingPayments: remaining,
      remainingAmount: pay * BigInt(remaining),
      lastDate: t.date,
    });
  }
  const list = [...plans.values()].filter((p) => p.remainingPayments > 0).sort((a, b) => (a.remainingAmount > b.remainingAmount ? -1 : 1));
  return { plans: list, totalRemaining: list.reduce((s, p) => s + p.remainingAmount, 0n) };
}

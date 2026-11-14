import { merchantKey } from "@/lib/import/text";
import type { Agorot } from "@/lib/money";

export type CardTxn = { date: string; chargeDate: string | null; amount: Agorot; description: string; categoryKey: string | null; installmentNumber: number | null; installmentTotal: number | null };

const FEE_WORDS = ["עמלה", "עמלת", "דמי כרטיס", "דמי חבר", "ריבית", "קרדיט", "عمولة", "فائدة", "رسوم"];
const CREDIT_PLAN_WORDS = ["קרדיט", "פריסה", "הלוואה", "תשלומים נוחים", "ائتمان"];

export type CardCycle = {
  chargeDate: string;
  total: Agorot; // positive = charged
  purchases: number;
  byCategory: { key: string; amount: Agorot }[];
  topMerchants: { label: string; amount: Agorot; count: number }[];
  installments: Agorot; // charged this cycle as installment payments
  creditPlan: Agorot; // credit plan / "קרדיט" charges
  feesAndInterest: Agorot;
};

/** "What comes out of each card and on what" — per billing cycle (pure). */
export function cardCycles(txns: readonly CardTxn[]): CardCycle[] {
  const cycles = new Map<string, CardTxn[]>();
  for (const t of txns) {
    const k = t.chargeDate ?? t.date;
    cycles.set(k, [...(cycles.get(k) ?? []), t]);
  }
  return [...cycles.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([chargeDate, list]) => {
      const cats = new Map<string, bigint>();
      const merchants = new Map<string, { label: string; amount: bigint; count: number }>();
      let total = 0n, installments = 0n, creditPlan = 0n, fees = 0n;
      for (const t of list) {
        const out = -t.amount;
        total += out;
        cats.set(t.categoryKey ?? "uncategorized", (cats.get(t.categoryKey ?? "uncategorized") ?? 0n) + out);
        const mk = merchantKey(t.description);
        const m = merchants.get(mk) ?? { label: t.description, amount: 0n, count: 0 };
        m.amount += out;
        m.count++;
        merchants.set(mk, m);
        if (t.installmentTotal) installments += out;
        if (CREDIT_PLAN_WORDS.some((w) => t.description.includes(w))) creditPlan += out;
        if (FEE_WORDS.some((w) => t.description.includes(w))) fees += out;
      }
      const desc = <T extends { amount: bigint }>(a: T, b: T) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0);
      return {
        chargeDate,
        total,
        purchases: list.length,
        byCategory: [...cats.entries()].map(([key, amount]) => ({ key, amount })).sort(desc),
        topMerchants: [...merchants.values()].sort(desc).slice(0, 8),
        installments,
        creditPlan,
        feesAndInterest: fees,
      };
    });
}

export type BankCostTxn = { date: string; amount: Agorot; description: string; categoryKey: string | null };

/** Interest vs fees paid on a bank account per month, from bank_fees lines (pure). */
export function bankCosts(txns: readonly BankCostTxn[]): { month: string; interest: Agorot; fees: Agorot }[] {
  const m = new Map<string, { interest: bigint; fees: bigint }>();
  for (const t of txns) {
    if (t.categoryKey !== "bank_fees" || t.amount >= 0n) continue;
    const k = t.date.slice(0, 7);
    const row = m.get(k) ?? { interest: 0n, fees: 0n };
    if (/ריבית|فائدة/.test(t.description)) row.interest += -t.amount;
    else row.fees += -t.amount;
    m.set(k, row);
  }
  return [...m.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, v]) => ({ month, ...v }));
}

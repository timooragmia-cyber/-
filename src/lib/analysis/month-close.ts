import { createHash } from "node:crypto";
import { ratioPpm, type Agorot } from "@/lib/money";

export const MONTH_CLOSE_CALC_VERSION = "month-close@1";

export type CloseCategory = { id: string; key: string; kind: "INCOME" | "EXPENSE" | "TRANSFER"; nature: "FIXED" | "VARIABLE" | "DISCRETIONARY" | null };

export type CloseTxn = {
  id: string;
  accountKind: "BANK_ACCOUNT" | "CREDIT_CARD" | "CASH";
  amount: Agorot;
  categoryId: string | null;
  isTransfer: boolean;
};

export type Nature = "FIXED" | "VARIABLE" | "DISCRETIONARY";

export type CategoryLine = { categoryId: string | null; key: string; amount: Agorot; budget: Agorot | null; count: number };

export type MonthCloseResult = {
  period: string;
  calcVersion: string;
  totalIncome: Agorot;
  totalExpenses: Agorot;
  surplus: Agorot;
  /** null when there is no income in the month. */
  savingsRatePpm: number | null;
  byNature: Record<Nature, Agorot>;
  fixedCostRatioPpm: number | null;
  discretionaryRatioPpm: number | null;
  income: CategoryLine[];
  expenses: CategoryLine[]; // sorted by amount desc ("where did the money go")
  excludedTransfers: { count: number; amount: Agorot };
  warnings: ("UNCATEGORIZED" | "NO_INCOME" | "CARD_PAYMENT_WITHOUT_CARD_DATA" | "NO_TRANSACTIONS")[];
  uncategorizedCount: number;
  transactionCount: number;
  transactionsSha256: string;
};

/**
 * Monthly close (pure). Rules, documented for the advisor:
 *  - Transfers (isTransfer, or a TRANSFER-kind category: card payment, savings transfer,
 *    own-account transfer) are excluded so nothing is counted twice. Card spending is
 *    counted from the card statement lines, not from the bank's card-payment line.
 *  - Positive lines in an EXPENSE category are refunds and reduce that category.
 *  - Uncategorized outflows go to "uncategorized"; uncategorized inflows count as income
 *    under "uncategorized" and raise an UNCATEGORIZED warning.
 *  - Savings rate = surplus / income. Fixed / discretionary ratios = nature total / income.
 */
export function computeMonthClose(
  period: string,
  txns: readonly CloseTxn[],
  categories: ReadonlyMap<string, CloseCategory>,
  budgets: ReadonlyMap<string, Agorot>,
): MonthCloseResult {
  const income = new Map<string, CategoryLine>();
  const expense = new Map<string, CategoryLine>();
  const byNature: Record<Nature, Agorot> = { FIXED: 0n, VARIABLE: 0n, DISCRETIONARY: 0n };
  let transfers = 0n;
  let transferCount = 0;
  let uncategorized = 0;
  let cardPaymentSeen = false;
  let cardLinesSeen = false;

  const line = (map: Map<string, CategoryLine>, cat: CloseCategory | null): CategoryLine => {
    const k = cat?.id ?? "__none__";
    let l = map.get(k);
    if (!l) {
      l = { categoryId: cat?.id ?? null, key: cat?.key ?? "uncategorized", amount: 0n, budget: cat ? (budgets.get(cat.id) ?? null) : null, count: 0 };
      map.set(k, l);
    }
    return l;
  };

  for (const t of txns) {
    const cat = t.categoryId ? (categories.get(t.categoryId) ?? null) : null;
    if (t.accountKind === "CREDIT_CARD") cardLinesSeen = true;
    if (cat?.key === "card_payment") cardPaymentSeen = true;
    if (t.isTransfer || cat?.kind === "TRANSFER") {
      transfers += t.amount;
      transferCount++;
      continue;
    }
    if (!cat || cat.key === "uncategorized") uncategorized++;
    if (cat?.kind === "INCOME" || (!cat && t.amount > 0n)) {
      const l = line(income, cat);
      l.amount += t.amount;
      l.count++;
    } else {
      const l = line(expense, cat);
      l.amount += -t.amount; // outflow becomes positive expense; refunds reduce it
      l.count++;
      byNature[cat?.nature ?? "VARIABLE"] += -t.amount;
    }
  }

  // Budget lines with no spending still appear (budget vs actual).
  for (const [catId, amount] of budgets) {
    const cat = categories.get(catId);
    if (cat?.kind === "EXPENSE" && !expense.has(catId)) expense.set(catId, { categoryId: catId, key: cat.key, amount: 0n, budget: amount, count: 0 });
  }

  const sortDesc = (a: CategoryLine, b: CategoryLine) => (a.amount === b.amount ? a.key.localeCompare(b.key) : a.amount > b.amount ? -1 : 1);
  const incomeLines = [...income.values()].sort(sortDesc);
  const expenseLines = [...expense.values()].sort(sortDesc);
  const totalIncome = incomeLines.reduce((s, l) => s + l.amount, 0n);
  const totalExpenses = expenseLines.reduce((s, l) => s + l.amount, 0n);
  const surplus = totalIncome - totalExpenses;

  const warnings: MonthCloseResult["warnings"] = [];
  if (txns.length === 0) warnings.push("NO_TRANSACTIONS");
  if (uncategorized > 0) warnings.push("UNCATEGORIZED");
  if (totalIncome <= 0n && txns.length > 0) warnings.push("NO_INCOME");
  if (cardPaymentSeen && !cardLinesSeen) warnings.push("CARD_PAYMENT_WITHOUT_CARD_DATA");

  const hashInput = [...txns]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((t) => `${t.id}:${t.amount}:${t.categoryId ?? "-"}:${t.isTransfer ? 1 : 0}`)
    .join("\n");

  const positiveIncome = totalIncome > 0n ? totalIncome : 0n;
  return {
    period,
    calcVersion: MONTH_CLOSE_CALC_VERSION,
    totalIncome,
    totalExpenses,
    surplus,
    savingsRatePpm: positiveIncome > 0n ? ratioPpm(surplus, positiveIncome) : null,
    byNature,
    fixedCostRatioPpm: positiveIncome > 0n ? ratioPpm(byNature.FIXED, positiveIncome) : null,
    discretionaryRatioPpm: positiveIncome > 0n ? ratioPpm(byNature.DISCRETIONARY, positiveIncome) : null,
    income: incomeLines,
    expenses: expenseLines,
    excludedTransfers: { count: transferCount, amount: transfers },
    warnings,
    uncategorizedCount: uncategorized,
    transactionCount: txns.length,
    transactionsSha256: createHash("sha256").update(hashInput).digest("hex"),
  };
}

/** JSON-safe form for the immutable snapshot payload (bigint → string). */
export function serializeClose(r: MonthCloseResult): Record<string, unknown> {
  return JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

type Ser = ReturnType<typeof serializeClose>;
const big = (v: unknown) => BigInt(String(v ?? "0"));

/** Inverse of serializeClose for reading snapshots. Missing fields (older/seed payloads) are tolerated. */
export function deserializeClose(payload: Ser): MonthCloseResult | null {
  if (payload.calcVersion !== MONTH_CLOSE_CALC_VERSION) return null;
  const lines = (arr: unknown): CategoryLine[] =>
    (Array.isArray(arr) ? arr : []).map((l: Record<string, unknown>) => ({
      categoryId: (l.categoryId as string | null) ?? null,
      key: String(l.key),
      amount: big(l.amount),
      budget: l.budget === null || l.budget === undefined ? null : big(l.budget),
      count: Number(l.count ?? 0),
    }));
  const n = (payload.byNature ?? {}) as Record<string, unknown>;
  const et = (payload.excludedTransfers ?? {}) as Record<string, unknown>;
  return {
    period: String(payload.period),
    calcVersion: String(payload.calcVersion),
    totalIncome: big(payload.totalIncome),
    totalExpenses: big(payload.totalExpenses),
    surplus: big(payload.surplus),
    savingsRatePpm: (payload.savingsRatePpm as number | null) ?? null,
    byNature: { FIXED: big(n.FIXED), VARIABLE: big(n.VARIABLE), DISCRETIONARY: big(n.DISCRETIONARY) },
    fixedCostRatioPpm: (payload.fixedCostRatioPpm as number | null) ?? null,
    discretionaryRatioPpm: (payload.discretionaryRatioPpm as number | null) ?? null,
    income: lines(payload.income),
    expenses: lines(payload.expenses),
    excludedTransfers: { count: Number(et.count ?? 0), amount: big(et.amount) },
    warnings: (payload.warnings as MonthCloseResult["warnings"]) ?? [],
    uncategorizedCount: Number(payload.uncategorizedCount ?? 0),
    transactionCount: Number(payload.transactionCount ?? 0),
    transactionsSha256: String(payload.transactionsSha256 ?? ""),
  };
}

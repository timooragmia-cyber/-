import { guessDateFormat } from "./parse-date";
import { normalizeText } from "./text";
import type { MappingConfig, RawTable } from "./types";

/**
 * Header keywords seen on Israeli bank / card exports (Hebrew, Arabic, English).
 * Order matters: more specific keys are matched first.
 */
const KEYWORDS = {
  chargeDate: ["תאריך חיוב", "מועד חיוב", "תאריך ערך", "تاريخ الخصم", "billing date", "value date"],
  date: ["תאריך עסקה", "תאריך רכישה", "תאריך", "تاريخ", "date"],
  amountCharged: ["סכום חיוב", "סכום החיוב", "סכום לחיוב", "المبلغ المخصوم", "charged amount"],
  originalAmount: ["סכום עסקה", "סכום העסקה", "סכום מקורי", "المبلغ الأصلي", "original amount"],
  originalCurrency: ["מטבע עסקה מקורי", "מטבע העסקה המקורי", "מטבע עסקה", "מטבע מקור", "عملة الصفقة", "original currency"],
  currency: ["מטבע", "العملة", "currency"],
  debit: ["בחובה", "חובה", "מדין", "مدين", "debit"],
  credit: ["בזכות", "זכות", "دائن", "credit"],
  amount: ["סכום", "המבלغ", "المبلغ", "amount", "סכום בש\"ח"],
  installment: ["מספר תשלום", "תשלומים", "פירוט נוסף", "دفعات", "installment"],
  description: ["שם בית העסק", "שם בית עסק", "בית עסק", "תיאור", "פרטים", "תאור", "اسم المحل", "الوصف", "التفاصيل", "description", "merchant"],
} as const;

type Key = keyof typeof KEYWORDS;

function classify(header: string): Key | null {
  const h = normalizeText(header);
  if (!h) return null;
  for (const key of Object.keys(KEYWORDS) as Key[]) {
    if (KEYWORDS[key].some((k) => h === normalizeText(k))) return key;
  }
  for (const key of Object.keys(KEYWORDS) as Key[]) {
    if (KEYWORDS[key].some((k) => h.includes(normalizeText(k)))) return key;
  }
  return null;
}

export type DetectionResult = { mapping: MappingConfig; confidence: "high" | "low"; headers: string[] };

/** Find the header row and propose a mapping. The advisor always reviews it in the wizard. */
export function detectMapping(table: RawTable, opts: { isCreditCard: boolean }): DetectionResult | null {
  let best: { idx: number; found: Map<Key, number> } | null = null;
  const scan = Math.min(table.rows.length, 40);
  for (let i = 0; i < scan; i++) {
    const found = new Map<Key, number>();
    (table.rows[i] ?? []).forEach((c, col) => {
      const k = classify(c);
      if (k && !found.has(k)) found.set(k, col);
    });
    if (found.has("date") || found.has("chargeDate")) {
      if (!best || found.size > best.found.size) best = { idx: i, found };
    }
  }
  if (!best) return null;
  const f = best.found;
  const dateColumn = f.get("date") ?? f.get("chargeDate");
  const descriptionColumn = f.get("description");
  if (dateColumn === undefined || descriptionColumn === undefined) return null;

  let amount: MappingConfig["amount"] | null = null;
  if (f.has("debit") && f.has("credit")) amount = { mode: "debitCredit", debitColumn: f.get("debit")!, creditColumn: f.get("credit")! };
  else {
    const col = f.get("amountCharged") ?? f.get("amount") ?? f.get("originalAmount");
    if (col !== undefined) amount = { mode: "single", column: col, negate: opts.isCreditCard };
  }
  if (!amount) return null;

  const samples = table.rows.slice(best.idx + 1, best.idx + 30).map((r) => r[dateColumn] ?? "");
  const amountCol = amount.mode === "single" ? amount.column : -1;
  const mapping: MappingConfig = {
    headerRowIndex: best.idx,
    dateColumn,
    dateFormat: guessDateFormat(samples),
    descriptionColumn,
    amount,
    ...(f.has("chargeDate") && f.get("chargeDate") !== dateColumn ? { chargeDateColumn: f.get("chargeDate") } : {}),
    ...(f.has("installment") ? { installmentColumn: f.get("installment") } : {}),
    ...(f.has("originalAmount") && f.get("originalAmount") !== amountCol ? { originalAmountColumn: f.get("originalAmount") } : {}),
    ...(f.has("originalCurrency") || f.has("currency") ? { originalCurrencyColumn: f.get("originalCurrency") ?? f.get("currency") } : {}),
  };
  const confidence = f.size >= 3 ? "high" : "low";
  return { mapping, confidence, headers: table.rows[best.idx] ?? [] };
}

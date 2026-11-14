import { MoneyError, parseAmount } from "@/lib/money";
import { parseInstallment } from "./installments";
import { parseStatementDate } from "./parse-date";
import type { MappingConfig, NormalizeResult, NormalizedRow, RawTable } from "./types";

const SYMBOLS: Record<string, string> = { "$": "USD", "€": "EUR", "£": "GBP" };

/** ISO code for foreign currency; null for shekels (₪ / ש"ח / ILS / NIS) or unknown text. */
export function normalizeCurrency(raw: string): string | null {
  const s = raw.trim().replace(/[״"']/g, "").toUpperCase();
  if (!s || s === "₪" || s === "שח" || s === "ILS" || s === "NIS" || s.includes("שקל")) return null;
  if (SYMBOLS[s]) return SYMBOLS[s]!;
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

const cell = (row: string[], idx: number | undefined) => (idx === undefined ? "" : (row[idx] ?? "").trim());

function tryAmount(raw: string): bigint | null | "invalid" {
  if (!raw.trim()) return null;
  try {
    return parseAmount(raw);
  } catch (e) {
    if (e instanceof MoneyError) return "invalid";
    throw e;
  }
}

/** Apply a column mapping to a raw table. Never throws on bad rows: they become errors for the preview. */
export function normalizeTable(table: RawTable, m: MappingConfig): NormalizeResult {
  const rows: NormalizedRow[] = [];
  const errors: NormalizeResult["errors"] = [];
  let skipped = 0;
  const skipWords = m.skipDescriptionsContaining ?? [];

  for (let i = m.headerRowIndex + 1; i < table.rows.length; i++) {
    const row = table.rows[i] ?? [];
    if (row.every((c) => !c || !c.trim())) {
      skipped++;
      continue;
    }
    const description = [cell(row, m.descriptionColumn), ...(m.extraDescriptionColumns ?? []).map((c) => cell(row, c))]
      .filter(Boolean)
      .join(" | ");
    const rawDate = cell(row, m.dateColumn);

    if (skipWords.some((w) => description.includes(w)) || (!rawDate && /סה"?כ|סה״כ|المجموع|total/i.test(row.join(" ")))) {
      skipped++;
      continue;
    }

    const date = parseStatementDate(rawDate, m.dateFormat);
    if (!date) {
      errors.push({ rowIndex: i, code: "INVALID_DATE", raw: rawDate });
      continue;
    }
    if (!description) {
      errors.push({ rowIndex: i, code: "MISSING_DESCRIPTION", raw: row.join(" ; ") });
      continue;
    }

    let amount: bigint;
    if (m.amount.mode === "single") {
      const a = tryAmount(cell(row, m.amount.column));
      if (a === null || a === "invalid") {
        errors.push({ rowIndex: i, code: "INVALID_AMOUNT", raw: cell(row, m.amount.column) });
        continue;
      }
      amount = m.amount.negate ? -a : a;
    } else {
      const d = tryAmount(cell(row, m.amount.debitColumn));
      const c = tryAmount(cell(row, m.amount.creditColumn));
      if (d === "invalid" || c === "invalid" || (d === null && c === null)) {
        errors.push({ rowIndex: i, code: "INVALID_AMOUNT", raw: `${cell(row, m.amount.debitColumn)} / ${cell(row, m.amount.creditColumn)}` });
        continue;
      }
      const debit = d ?? 0n;
      const credit = c ?? 0n;
      if (debit !== 0n && credit !== 0n) {
        errors.push({ rowIndex: i, code: "AMBIGUOUS_AMOUNT", raw: `${debit} / ${credit}` });
        continue;
      }
      // credit = money in (as given); debit = money out (some banks print it negative already)
      amount = credit !== 0n ? credit : -(debit < 0n ? -debit : debit);
    }

    const chargeRaw = cell(row, m.chargeDateColumn);
    const inst = parseInstallment(cell(row, m.installmentColumn), { allowBareSlash: true }) ?? parseInstallment(description);
    const orig = tryAmount(cell(row, m.originalAmountColumn));
    rows.push({
      rowIndex: i,
      date,
      chargeDate: chargeRaw ? parseStatementDate(chargeRaw, m.dateFormat) : null,
      description,
      amount,
      installmentNumber: inst?.number ?? null,
      installmentTotal: inst?.total ?? null,
      originalAmount: typeof orig === "bigint" ? orig : null,
      originalCurrency: normalizeCurrency(cell(row, m.originalCurrencyColumn)),
    });
  }
  return { rows, errors, skipped };
}

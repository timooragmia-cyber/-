/** A parsed sheet: cells as trimmed strings (adapters convert dates/numbers to strings). */
export type RawTable = { sheetName?: string; rows: string[][] };

export type DateFormat = "DD/MM/YYYY" | "DD/MM/YY" | "YYYY-MM-DD" | "MM/DD/YYYY";

export type AmountMapping =
  /** One signed amount column. `negate` flips the sign (card statements list charges as positive). */
  | { mode: "single"; column: number; negate: boolean }
  /** Separate debit (money out) and credit (money in) columns, both shown as positive numbers. */
  | { mode: "debitCredit"; debitColumn: number; creditColumn: number };

export type MappingConfig = {
  headerRowIndex: number;
  dateColumn: number;
  dateFormat: DateFormat;
  chargeDateColumn?: number;
  descriptionColumn: number;
  extraDescriptionColumns?: number[];
  amount: AmountMapping;
  installmentColumn?: number;
  originalAmountColumn?: number;
  originalCurrencyColumn?: number;
  /** Rows whose description contains any of these are skipped (totals, carried balances). */
  skipDescriptionsContaining?: string[];
};

export type NormalizedRow = {
  rowIndex: number;
  date: string; // YYYY-MM-DD
  chargeDate: string | null;
  description: string;
  amount: bigint; // signed agorot, negative = money out
  installmentNumber: number | null;
  installmentTotal: number | null;
  originalAmount: bigint | null;
  originalCurrency: string | null;
};

export type RowErrorCode = "INVALID_DATE" | "INVALID_AMOUNT" | "MISSING_DESCRIPTION" | "AMBIGUOUS_AMOUNT";

export type RowError = { rowIndex: number; code: RowErrorCode; raw: string };

export type NormalizeResult = { rows: NormalizedRow[]; errors: RowError[]; skipped: number };

/**
 * Adapter contract. File adapters exist today; an open-banking adapter later implements the
 * same interface and returns already-structured tables (or rows) without touching
 * mapping, dedup or categorization.
 */
export interface ImportAdapter {
  readonly id: string; // "file:csv" | "file:xlsx" | "file:html-xls" | "openbanking:<provider>"
  canHandle(input: { fileName: string; bytes: Uint8Array }): boolean;
  read(input: { fileName: string; bytes: Uint8Array }): Promise<RawTable[]>;
}

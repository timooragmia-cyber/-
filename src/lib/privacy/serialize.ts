/** Serialization for data exports: exact money (agorot as strings), ISO dates, safe CSV. */

export function exportReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function toExportJson(data: unknown): string {
  return JSON.stringify(data, exportReplacer, 2);
}

/** Agorot → "-1234.56" without floats. */
export function agorotToDecimal(a: bigint): string {
  const neg = a < 0n;
  const abs = neg ? -a : a;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * One CSV cell. Quotes when needed, and neutralizes spreadsheet formulas (CSV injection):
 * a cell starting with = + - @ tab or CR is prefixed with an apostrophe — except plain numbers,
 * so negative amounts stay numeric.
 */
export function csvCell(v: string | number | bigint | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 BOM so Excel opens Hebrew/Arabic correctly. */
export function toCsv(header: string[], rows: (string | number | bigint | null | undefined)[][]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function ymd(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

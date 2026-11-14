import ExcelJS from "exceljs";
import { parse as parseHtml } from "node-html-parser";
import Papa from "papaparse";
import type { ImportAdapter, RawTable } from "@/lib/import/types";

/**
 * File adapters → RawTable[]. Every cell becomes a trimmed string; spreadsheet dates become
 * ISO "YYYY-MM-DD" and numbers keep their exact decimal text (never float-rounded money).
 * Open-banking adapters will implement the same ImportAdapter interface.
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 20_000;

export class UnsupportedFileError extends Error {
  constructor(public readonly code: "BINARY_XLS" | "UNSUPPORTED" | "TOO_LARGE" | "EMPTY" | "TOO_MANY_ROWS") {
    super(code);
  }
}

/** Israeli bank CSVs are often Windows-1255. Try strict UTF-8 first, then fall back. */
export function decodeText(bytes: Uint8Array): string {
  const b = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("windows-1255").decode(b);
  }
}

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);
const looksHtml = (b: Uint8Array) => /<(html|table|!doctype)/i.test(decodeText(b.subarray(0, 2048)));

function guard(rows: string[][]): string[][] {
  if (rows.length > MAX_ROWS) throw new UnsupportedFileError("TOO_MANY_ROWS");
  return rows;
}

export const csvAdapter: ImportAdapter = {
  id: "file:csv",
  canHandle: ({ fileName, bytes }) => ["csv", "txt"].includes(ext(fileName)) && !looksHtml(bytes),
  async read({ bytes }) {
    const text = decodeText(bytes);
    const res = Papa.parse<string[]>(text, { skipEmptyLines: false, delimitersToGuess: [",", ";", "\t", "|"] });
    return [{ rows: guard(res.data.map((r) => r.map((c) => String(c ?? "").trim()))) }];
  },
};

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? v.toString() : v.toFixed(2);
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "1" : "0";
  if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
  if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
  if ("text" in v) return String(v.text).trim();
  return "";
}

export const xlsxAdapter: ImportAdapter = {
  id: "file:xlsx",
  canHandle: ({ bytes }) => startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]), // ZIP container
  async read({ bytes }) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const tables: RawTable[] = [];
    wb.eachSheet((ws) => {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: true }, (row, n) => {
        const cells: string[] = [];
        for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
        rows[n - 1] = cells;
      });
      tables.push({ sheetName: ws.name, rows: guard(Array.from(rows, (r) => r ?? [])) });
    });
    return tables;
  },
};

/** Many Israeli bank "Excel" downloads are HTML tables saved with an .xls extension. */
export const htmlTableAdapter: ImportAdapter = {
  id: "file:html-xls",
  canHandle: ({ bytes }) => looksHtml(bytes),
  async read({ bytes }) {
    const root = parseHtml(decodeText(bytes));
    return root.querySelectorAll("table").map((t, i) => ({
      sheetName: `table-${i + 1}`,
      rows: guard(t.querySelectorAll("tr").map((tr) => tr.querySelectorAll("th,td").map((c) => c.textContent.replace(/\s+/g, " ").trim()))),
    }));
  },
};

const ADAPTERS = [xlsxAdapter, htmlTableAdapter, csvAdapter];

export async function readFileTables(fileName: string, bytes: Uint8Array): Promise<{ adapter: string; tables: RawTable[] }> {
  if (bytes.length === 0) throw new UnsupportedFileError("EMPTY");
  if (bytes.length > MAX_FILE_BYTES) throw new UnsupportedFileError("TOO_LARGE");
  // Legacy binary .xls (OLE2) is not parsed: ask for XLSX/CSV instead of using a vulnerable parser.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) throw new UnsupportedFileError("BINARY_XLS");
  const adapter = ADAPTERS.find((a) => a.canHandle({ fileName, bytes }));
  if (!adapter) throw new UnsupportedFileError("UNSUPPORTED");
  const tables = (await adapter.read({ fileName, bytes })).filter((t) => t.rows.some((r) => r.some(Boolean)));
  if (tables.length === 0) throw new UnsupportedFileError("EMPTY");
  return { adapter: adapter.id, tables };
}

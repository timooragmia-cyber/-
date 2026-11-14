import type { DateFormat } from "./types";

const pad = (n: number) => n.toString().padStart(2, "0");

function valid(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parse a statement date to "YYYY-MM-DD" using an explicit format. Returns null if invalid. */
export function parseStatementDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  // Adapters already convert real spreadsheet dates to ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const parts = s.split(/[/.\-]/).map((p) => p.trim());
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const [a, b, c] = parts.map(Number) as [number, number, number];
  switch (format) {
    case "DD/MM/YYYY":
      return c >= 1000 ? valid(c, b, a) : null;
    case "DD/MM/YY":
      return c < 100 ? valid(2000 + c, b, a) : c >= 1000 ? valid(c, b, a) : null;
    case "MM/DD/YYYY":
      return valid(c < 100 ? 2000 + c : c, a, b);
    case "YYYY-MM-DD":
      return valid(a, b, c);
  }
}

/** Guess the format from sample values. Israeli statements default to day-first. */
export function guessDateFormat(samples: readonly string[]): DateFormat {
  const vals = samples.map((s) => s.trim()).filter(Boolean);
  if (vals.length === 0) return "DD/MM/YYYY";
  if (vals.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) return "YYYY-MM-DD";
  const split = vals.map((v) => v.split(/[/.\-]/));
  const twoDigitYear = split.every((p) => p.length === 3 && (p[2] ?? "").length <= 2);
  const secondOver12 = split.some((p) => Number(p[1]) > 12);
  const firstOver12 = split.some((p) => Number(p[0]) > 12);
  if (secondOver12 && !firstOver12) return "MM/DD/YYYY";
  return twoDigitYear ? "DD/MM/YY" : "DD/MM/YYYY";
}

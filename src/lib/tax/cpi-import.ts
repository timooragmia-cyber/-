import type { RawTable } from "@/lib/import/types";

/**
 * Parses a CPI table (e.g. downloaded from the CBS site) into { period, valueMilli } rows.
 * Accepts a period column in "YYYY-MM", "MM/YYYY", "MM-YYYY", "YYYY/MM", a spreadsheet
 * date (ISO), or Hebrew month names ("ינואר 2025"), and a numeric index column.
 * The first column whose cells look like periods is the period column; the first numeric
 * column after it is the value. Header and note rows are skipped.
 */
const HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function parsePeriod(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  let m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!);
  m = /^(\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return valid(+m[2]!, +m[1]!);
  m = /^(\d{4})[/.](\d{1,2})$/.exec(s);
  if (m) return valid(+m[1]!, +m[2]!);
  for (let i = 0; i < 12; i++) {
    const he = new RegExp(`^${HE_MONTHS[i]}\\s*(\\d{4})$`).exec(s) ?? new RegExp(`^(\\d{4})\\s*${HE_MONTHS[i]}$`).exec(s);
    if (he) return valid(+he[1]!, i + 1);
  }
  return null;
}

function valid(y: number, m: number): string | null {
  if (y < 1950 || y > 2100 || m < 1 || m > 12) return null;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Index value with up to 3 decimals → ×1000 integer (no floats). */
export function parseIndexValue(raw: string): number | null {
  const m = /^(\d{1,4})(?:\.(\d{1,3}))?$/.exec(raw.trim().replace(/,/g, ""));
  if (!m) return null;
  const v = Number(m[1]) * 1000 + Number(((m[2] ?? "") + "000").slice(0, 3));
  return v > 0 ? v : null;
}

export function parseCpiTable(table: RawTable): { rows: { period: string; valueMilli: number }[]; skipped: number } {
  let periodCol = -1;
  for (const r of table.rows) {
    const idx = r.findIndex((c) => parsePeriod(c ?? "") !== null);
    if (idx >= 0) {
      periodCol = idx;
      break;
    }
  }
  if (periodCol < 0) return { rows: [], skipped: table.rows.length };
  const out = new Map<string, number>();
  let skipped = 0;
  for (const r of table.rows) {
    const period = parsePeriod(r[periodCol] ?? "");
    const valueCell = r.slice(periodCol + 1).find((c) => parseIndexValue(c ?? "") !== null);
    const value = valueCell === undefined ? null : parseIndexValue(valueCell);
    if (!period || value === null) {
      skipped++;
      continue;
    }
    out.set(period, value);
  }
  return { rows: [...out.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, valueMilli]) => ({ period, valueMilli })), skipped };
}

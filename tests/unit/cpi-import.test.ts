import { describe, expect, it } from "vitest";
import { parseCpiTable, parseIndexValue, parsePeriod } from "@/lib/tax/cpi-import";

describe("CPI import", () => {
  it.each([["2025-01", "2025-01"], ["2025-01-01", "2025-01"], ["01/2025", "2025-01"], ["1-2025", "2025-01"], ["2025/12", "2025-12"], ["ינואר 2025", "2025-01"], ["דצמבר 2024", "2024-12"], ["2025 מרץ", "2025-03"], ["13/2025", null], ["מדד כללי", null]])("period %s → %s", (raw, exp) => {
    expect(parsePeriod(raw)).toBe(exp);
  });
  it("index values ×1000 without floats", () => {
    expect(parseIndexValue("104.3")).toBe(104_300);
    expect(parseIndexValue("99.875")).toBe(99_875);
    expect(parseIndexValue("1,004.1")).toBe(1_004_100);
    expect(parseIndexValue("abc")).toBeNull();
  });
  it("finds the period column, skips headers/notes, de-duplicates", () => {
    const r = parseCpiTable({
      rows: [["מדד המחירים לצרכן — בסיס ממוצע 2024=100"], ["חודש", "מדד", "שינוי %"], ["ינואר 2025", "100.4", "0.4"], ["פברואר 2025", "100.9", "0.5"], ["פברואר 2025", "101.0", ""], ["הערה: נתונים זמניים"]],
    });
    expect(r.rows).toEqual([{ period: "2025-01", valueMilli: 100_400 }, { period: "2025-02", valueMilli: 101_000 }]);
    expect(r.skipped).toBe(3);
  });
});

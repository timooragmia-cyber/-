import { describe, expect, it } from "vitest";
import { assignDedupKeys } from "@/lib/import/dedup";
import { detectMapping } from "@/lib/import/detect";
import { parseInstallment } from "@/lib/import/installments";
import { normalizeCurrency, normalizeTable } from "@/lib/import/normalize";
import { guessDateFormat, parseStatementDate } from "@/lib/import/parse-date";
import { merchantKey, normalizeText } from "@/lib/import/text";
import type { RawTable } from "@/lib/import/types";

describe("dates", () => {
  it.each([
    ["05/10/2026", "DD/MM/YYYY", "2026-10-05"],
    ["5.10.26", "DD/MM/YY", "2026-10-05"],
    ["2026-10-05", "DD/MM/YYYY", "2026-10-05"],
    ["10/05/2026", "MM/DD/YYYY", "2026-10-05"],
    ["31/02/2026", "DD/MM/YYYY", null],
    ["", "DD/MM/YYYY", null],
    ["יתרה", "DD/MM/YYYY", null],
  ] as const)("%s (%s) → %s", (raw, fmt, expected) => {
    expect(parseStatementDate(raw, fmt)).toBe(expected);
  });
  it("guesses day-first for Israeli files", () => {
    expect(guessDateFormat(["01/10/2026", "15/10/2026"])).toBe("DD/MM/YYYY");
    expect(guessDateFormat(["01/10/26"])).toBe("DD/MM/YY");
    expect(guessDateFormat(["10/15/2026"])).toBe("MM/DD/YYYY");
    expect(guessDateFormat(["2026-10-01"])).toBe("YYYY-MM-DD");
  });
});

describe("installments", () => {
  it.each([
    ["תשלום 3 מתוך 12", { number: 3, total: 12 }],
    ["3 מתוך 12", { number: 3, total: 12 }],
    ["ACE מקס תשלום 2 מ-6", { number: 2, total: 6 }],
    ["قسط 4 من 10", { number: 4, total: 10 }],
    ["רגיל", null],
  ] as const)("%s", (text, expected) => {
    expect(parseInstallment(text)).toEqual(expected);
  });
  it("bare 3/12 only inside an installment column, never in free text (dates)", () => {
    expect(parseInstallment("3/12", { allowBareSlash: true })).toEqual({ number: 3, total: 12 });
    expect(parseInstallment("שופרסל 05/10")).toBeNull();
    expect(parseInstallment("05/10")).toBeNull();
  });
  it("rejects impossible values", () => {
    expect(parseInstallment("תשלום 13 מתוך 12")).toBeNull();
  });
});

describe("text normalization", () => {
  it("strips niqqud, tashkeel, bidi marks, digits for merchant key", () => {
    expect(normalizeText("‏שׁוּפֶרְסַל  דיל")).toBe("שופרסל דיל");
    expect(normalizeText("مَخْبَز")).toBe("مخبز");
    expect(merchantKey("שופרסל דיל 123 כרמיאל 05/10")).toBe("שופרסל דיל כרמיאל");
    expect(merchantKey("NETFLIX.COM 866-579")).toBe("netflix com");
  });
});

// Bank statement with debit/credit columns, title rows before the header and a totals row.
const bank: RawTable = {
  rows: [
    ["בנק הפועלים — תנועות בחשבון"],
    ["חשבון: ****1234"],
    [],
    ["תאריך", "תיאור הפעולה", "אסמכתא", "בחובה", "בזכות", "יתרה"],
    ["01/10/2026", "משכורת", "1", "", "9,800.00", "10,500.00"],
    ["02/10/2026", "ישראכרט", "2", "4,210.55", "", "6,289.45"],
    ["03/10/2026", "עמלת פעולה", "3", "7.90", "", "6,281.55"],
    ["03/10/2026", "עמלת פעולה", "4", "7.90", "", "6,273.65"],
    ["xx/10/2026", "שורה פגומה", "5", "1", "", ""],
    ["", "סה\"כ", "", "4,226.35", "9,800.00", ""],
  ],
};

// Credit card statement: purchase date, billing amount positive = charge, installments column.
const card: RawTable = {
  rows: [
    ["תאריך עסקה", "שם בית העסק", "סכום עסקה", "סכום חיוב", "מטבע", "פירוט נוסף", "תאריך חיוב"],
    ["28/09/2026", "שופרסל דיל כרמיאל", "512.30", "512.30", "₪", "", "10/10/2026"],
    ["15/09/2026", "ACE", "3,600.00", "300.00", "₪", "תשלום 3 מתוך 12", "10/10/2026"],
    ["20/09/2026", "NETFLIX.COM", "54.90", "54.90", "₪", "", "10/10/2026"],
    ["22/09/2026", "זיכוי — החזר", "", "-100.00", "₪", "", "10/10/2026"],
  ],
};

describe("detectMapping + normalizeTable", () => {
  it("bank: finds header below title rows, debit/credit, skips totals, reports bad rows", () => {
    const d = detectMapping(bank, { isCreditCard: false })!;
    expect(d.mapping.headerRowIndex).toBe(3);
    expect(d.mapping.amount).toEqual({ mode: "debitCredit", debitColumn: 3, creditColumn: 4 });
    const r = normalizeTable(bank, d.mapping);
    expect(r.rows.map((x) => x.amount)).toEqual([980000n, -421055n, -790n, -790n]);
    expect(r.errors).toEqual([{ rowIndex: 8, code: "INVALID_DATE", raw: "xx/10/2026" }]);
    expect(r.skipped).toBe(1);
  });

  it("card: charged amount (not original) negated, charge date, installments, refund stays positive", () => {
    const d = detectMapping(card, { isCreditCard: true })!;
    expect(d.mapping.amount).toEqual({ mode: "single", column: 3, negate: true });
    expect(d.mapping.chargeDateColumn).toBe(6);
    expect(d.mapping.originalAmountColumn).toBe(2);
    expect(d.mapping.installmentColumn).toBe(5);
    const r = normalizeTable(card, d.mapping);
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.amount)).toEqual([-51230n, -30000n, -5490n, 10000n]);
    expect(r.rows[1]).toMatchObject({ installmentNumber: 3, installmentTotal: 12, originalAmount: 360000n, chargeDate: "2026-10-10", date: "2026-09-15" });
  });

  it("returns null when no usable header exists", () => {
    expect(detectMapping({ rows: [["a", "b"], ["1", "2"]] }, { isCreditCard: false })).toBeNull();
  });
});

describe("dedup keys", () => {
  const rows = [
    { date: "2026-10-03", amount: -790n, description: "עמלת פעולה" },
    { date: "2026-10-03", amount: -790n, description: "עמלת פעולה" },
    { date: "2026-10-04", amount: -790n, description: "עמלת פעולה" },
  ];
  it("keeps identical same-day rows distinct inside a file", () => {
    const k = assignDedupKeys(rows).map((r) => r.dedupKey);
    expect(new Set(k).size).toBe(3);
  });
  it("re-import of the same file produces identical keys (→ duplicates)", () => {
    expect(assignDedupKeys(rows).map((r) => r.dedupKey)).toEqual(assignDedupKeys(rows).map((r) => r.dedupKey));
  });
  it("overlapping file (subset) maps to the same keys", () => {
    const full = assignDedupKeys(rows).map((r) => r.dedupKey);
    const partial = assignDedupKeys(rows.slice(0, 1)).map((r) => r.dedupKey);
    expect(full).toContain(partial[0]);
  });
});

describe("currency normalization", () => {
  it.each([["₪", null], ['ש"ח', null], ["ILS", null], ["$", "USD"], ["usd", "USD"], ["€", "EUR"], ["", null], ["דולר", null]] as const)("%s → %s", (raw, expected) => {
    expect(normalizeCurrency(raw)).toBe(expected);
  });
});

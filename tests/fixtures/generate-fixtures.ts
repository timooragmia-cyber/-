/**
 * Generates FICTIONAL statement files that mimic common Israeli export layouts
 * (title rows, header row, totals row, debit/credit columns; card file with charge date,
 * installments and a foreign-currency purchase). Run: npx tsx tests/fixtures/generate-fixtures.ts
 */
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

const months = ["08", "09", "10"];
const d = (m: string, day: number) => `${String(day).padStart(2, "0")}/${m}/2026`;

// Bank CSV (UTF-8 with BOM), debit/credit columns.
const bank: string[][] = [
  ["בנק לדוגמה בע\"מ - פירוט תנועות בחשבון"],
  ["מספר חשבון: ****9921"],
  [],
  ["תאריך", "תיאור הפעולה", "אסמכתא", "בחובה", "בזכות", "יתרה בש\"ח"],
];
let ref = 1000;
for (const m of months) {
  bank.push([d(m, 1), "שכר דירה - הוראת קבע", String(ref++), "3,800.00", "", ""]);
  bank.push([d(m, 2), "ביטוח לאומי קצבת ילדים", String(ref++), "", "173.00", ""]);
  bank.push([d(m, 9), "משכורת - חברת גליל טכנולוגיות", String(ref++), "", "17,450.00", ""]);
  bank.push([d(m, 10), "מקס איט פיננסים", String(ref++), m === "08" ? "3,912.40" : m === "09" ? "4,105.80" : "3,566.10", "", ""]);
  bank.push([d(m, 12), "ארנונה עיריית כרמיאל", String(ref++), "480.00", "", ""]);
  bank.push([d(m, 15), "החזר הלוואה 7781", String(ref++), "1,100.00", "", ""]);
  bank.push([d(m, 18), "חברת החשמל לישראל", String(ref++), m === "09" ? "612.30" : "438.90", "", ""]);
  bank.push([d(m, 21), "משיכת מזומן כספומט", String(ref++), "1,000.00", "", ""]);
  bank.push([d(m, 28), "דמי ניהול חשבון", String(ref++), "24.90", "", ""]);
  bank.push([d(m, 28), "העברה למשה - שיפוצים", String(ref++), m === "10" ? "2,000.00" : "", "", ""]);
}
// Drop the empty "שיפוצים" rows for months without the transfer, then add a totals row.
const bankRows = bank.filter((r) => !(r[1] === "העברה למשה - שיפוצים" && !r[3]));
bankRows.push(["", "סה\"כ", "", "", "", ""]);
const csv = "﻿" + bankRows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";
writeFileSync("tests/fixtures/demo-bank-aug-oct-2026.csv", csv);

// Credit card XLSX (Max-like layout), purchases in Jul–Sep billed on the 10th of Aug–Oct.
async function card() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("עסקאות במועד החיוב");
  ws.addRow(["כרטיס מקס לדוגמה ****4410"]);
  ws.addRow([]);
  ws.addRow(["תאריך עסקה", "שם בית העסק", "קטגוריה", "4 ספרות אחרונות", "סוג עסקה", "סכום חיוב", "מטבע חיוב", "תאריך חיוב", "סכום עסקה מקורי", "מטבע עסקה מקורי", "פירוט נוסף"]);
  const purchase = (pm: string, cm: string, day: number, name: string, amount: number, extra: Partial<{ original: number; cur: string; note: string; type: string }> = {}) =>
    ws.addRow([new Date(Date.UTC(2026, Number(pm) - 1, day)), name, "", "4410", extra.type ?? "רגילה", amount, "₪", new Date(Date.UTC(2026, Number(cm) - 1, 10)), extra.original ?? amount, extra.cur ?? "₪", extra.note ?? ""]);
  const plan: [string, string][] = [["07", "08"], ["08", "09"], ["09", "10"]];
  plan.forEach(([pm, cm], i) => {
    purchase(pm, cm, 3, "שופרסל דיל כרמיאל", 742.3 + i * 10);
    purchase(pm, cm, 10, "רמי לוי כרמיאל", 655.9 - i * 20);
    purchase(pm, cm, 17, "שופרסל דיל כרמיאל", 701.15);
    purchase(pm, cm, 24, "ויקטורי כרמיאל", 588.4);
    purchase(pm, cm, 5, "פז כרמיאל", 352.0);
    purchase(pm, cm, 19, "סונול כרמיאל", 341.7);
    purchase(pm, cm, 2, "NETFLIX.COM", 54.9);
    purchase(pm, cm, 2, "SPOTIFY", 19.9);
    purchase(pm, cm, 12, "קפה ג'ו", 64.0 + i * 5);
    purchase(pm, cm, 14, "איקאה קריות", 250.0, { type: "תשלומים", note: `תשלום ${i + 1} מתוך 6` });
    if (i === 1) purchase(pm, cm, 20, "AMAZON MKTPLACE", 312.6, { original: 84.5, cur: "USD" });
    if (i === 2) purchase(pm, cm, 26, "זיכוי - החזרת מוצר שופרסל", -120.0);
  });
  ws.addRow([]);
  ws.addRow(["", "סה\"כ לחיוב", "", "", "", 0]);
  await wb.xlsx.writeFile("tests/fixtures/demo-card-max-aug-oct-2026.xlsx");
}

card().then(() => console.log("fixtures written"));

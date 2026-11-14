import "server-only";
import ExcelJS from "exceljs";
import { parseAmount, parsePercentToPpm } from "@/lib/money";

/**
 * Pluggable parsers for long-term-savings reports. Today: our own XLSX template.
 * The pension clearinghouse ("מסלקה פנסיונית", unified-interface XML) parser plugs in here
 * once a real anonymized sample file is available (docs/UNVERIFIED.md).
 */
export type ParsedProduct = {
  productType: "PENSION_COMPREHENSIVE" | "PENSION_GENERAL" | "MANAGERS_INSURANCE" | "PROVIDENT_FUND" | "INVESTMENT_PROVIDENT_FUND" | "STUDY_FUND";
  provider: string;
  track: string | null;
  policyLast4: string | null;
  balance: bigint;
  balanceAsOf: string;
  employeeDeposit: bigint;
  employerDeposit: bigint;
  severanceDeposit: bigint;
  feeDepositsPpm: number;
  feeAccumulationPpm: number;
  startDate: string | null;
  isActive: boolean;
  personFirstName: string | null;
};
export type ParseIssue = { row: number; field: string; raw: string };

export interface ProductReportParser {
  readonly id: string;
  canHandle(fileName: string, bytes: Uint8Array): boolean;
  parse(bytes: Uint8Array): Promise<{ products: ParsedProduct[]; issues: ParseIssue[] }>;
}

export const TEMPLATE_COLUMNS = [
  ["personFirstName", "שם פרטי של העמית / الاسم الشخصي"],
  ["productType", "סוג מוצר / نوع المنتج"],
  ["provider", "גוף מנהל / الجهة المديرة"],
  ["track", "מסלול השקעה / مسار الاستثمار"],
  ["policyLast4", "4 ספרות אחרונות של הפוליסה / آخر 4 أرقام"],
  ["balance", "יתרה (₪) / الرصيد"],
  ["balanceAsOf", "נכון לתאריך (YYYY-MM-DD) / بتاريخ"],
  ["employeeDeposit", "הפקדת עובד חודשית (₪) / إيداع العامل"],
  ["employerDeposit", "הפקדת מעסיק לתגמולים (₪) / إيداع المشغّل"],
  ["severanceDeposit", "הפקדה לפיצויים (₪) / تعويضات"],
  ["feeDeposits", "דמי ניהול מהפקדה (%) / رسوم من الإيداع"],
  ["feeAccumulation", "דמי ניהול מצבירה (%) / رسوم من التراكم"],
  ["startDate", "תאריך הצטרפות (YYYY-MM-DD) / تاريخ الانضمام"],
  ["isActive", "פעיל? (כן/לא) / فعّال؟"],
] as const;

export const PRODUCT_TYPES = ["PENSION_COMPREHENSIVE", "PENSION_GENERAL", "MANAGERS_INSURANCE", "PROVIDENT_FUND", "INVESTMENT_PROVIDENT_FUND", "STUDY_FUND"] as const;

export async function buildTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("products", { views: [{ rightToLeft: true }] });
  ws.addRow(TEMPLATE_COLUMNS.map(([, label]) => label));
  ws.addRow(["דוגמה", "PENSION_COMPREHENSIVE", "מגדל מקפת", "מסלול לבני 50 ומטה", "1234", 185000, "2026-10-31", 1100, 1200, 1400, 1.49, 0.22, "2012-03-01", "כן"]);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c) => (c.width = 22));
  const help = wb.addWorksheet("product types");
  help.addRow(["code", "עברית", "العربية"]);
  [["PENSION_COMPREHENSIVE", "קרן פנסיה מקיפה", "صندوق تقاعد شامل"], ["PENSION_GENERAL", "קרן פנסיה כללית", "صندوق تقاعد عام"], ["MANAGERS_INSURANCE", "ביטוח מנהלים", "تأمين مديرين"], ["PROVIDENT_FUND", "קופת גמל", "صندوق ادخار"], ["INVESTMENT_PROVIDENT_FUND", "קופת גמל להשקעה", "صندوق ادخار للاستثمار"], ["STUDY_FUND", "קרן השתלמות", "صندوق استكمال"]].forEach((r) => help.addRow(r));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

function text(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (typeof v === "object" && "result" in v) return text(v.result as ExcelJS.CellValue);
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  return String(v).trim();
}

export const templateXlsxParser: ProductReportParser = {
  id: "template-xlsx",
  canHandle: (name, bytes) => /\.xlsx$/i.test(name) && bytes[0] === 0x50 && bytes[1] === 0x4b,
  async parse(bytes) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    const products: ParsedProduct[] = [];
    const issues: ParseIssue[] = [];
    if (!ws) return { products, issues: [{ row: 0, field: "sheet", raw: "" }] };
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const cells = TEMPLATE_COLUMNS.map((_, i) => text(row.getCell(i + 1).value));
      if (cells.every((c) => !c) || cells[0] === "דוגמה") return;
      const get = (k: (typeof TEMPLATE_COLUMNS)[number][0]) => cells[TEMPLATE_COLUMNS.findIndex(([key]) => key === k)] ?? "";
      const bad = (field: string) => issues.push({ row: n, field, raw: get(field as never) });
      const amount = (k: (typeof TEMPLATE_COLUMNS)[number][0], required = false) => {
        const raw = get(k);
        if (!raw) return required ? (bad(k), null) : 0n;
        try {
          const v = parseAmount(raw);
          return v < 0n ? (bad(k), null) : v;
        } catch {
          return bad(k), null;
        }
      };
      const pct = (k: (typeof TEMPLATE_COLUMNS)[number][0]) => {
        const raw = get(k).replace("%", "");
        if (!raw) return 0;
        try {
          const v = parsePercentToPpm(raw);
          return v < 0 || v > 1_000_000 ? (bad(k), null) : v;
        } catch {
          return bad(k), null;
        }
      };
      const type = get("productType") as ParsedProduct["productType"];
      if (!(PRODUCT_TYPES as readonly string[]).includes(type)) bad("productType");
      const asOf = get("balanceAsOf");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) bad("balanceAsOf");
      const start = get("startDate");
      if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) bad("startDate");
      const last4 = get("policyLast4");
      if (last4 && !/^\d{4}$/.test(last4)) bad("policyLast4");
      if (!get("provider")) bad("provider");
      const values = { balance: amount("balance", true), emp: amount("employeeDeposit"), er: amount("employerDeposit"), sev: amount("severanceDeposit"), fd: pct("feeDeposits"), fa: pct("feeAccumulation") };
      if (issues.some((i) => i.row === n)) return;
      products.push({
        productType: type,
        provider: get("provider").slice(0, 120),
        track: get("track").slice(0, 120) || null,
        policyLast4: last4 || null,
        balance: values.balance!,
        balanceAsOf: asOf,
        employeeDeposit: values.emp!,
        employerDeposit: values.er!,
        severanceDeposit: values.sev!,
        feeDepositsPpm: values.fd!,
        feeAccumulationPpm: values.fa!,
        startDate: start || null,
        isActive: !/^(לא|no|لا|0|false)$/i.test(get("isActive")),
        personFirstName: get("personFirstName") || null,
      });
    });
    return { products, issues };
  },
};

/** Registry: clearinghouse XML parser will be added here (needs a real sample file). */
export const PRODUCT_PARSERS: ProductReportParser[] = [templateXlsxParser];

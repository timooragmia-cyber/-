import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildTemplate, templateXlsxParser } from "@/server/savings/report-parsers";

async function filled(rows: unknown[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await buildTemplate()) as unknown as ArrayBuffer);
  const ws = wb.worksheets[0]!;
  rows.forEach((r) => ws.addRow(r));
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("savings template parser", () => {
  it("builds a template that the parser accepts (example row ignored)", async () => {
    const r = await templateXlsxParser.parse(await buildTemplate());
    expect(r).toEqual({ products: [], issues: [] });
  });
  it("parses a filled row exactly (amounts → agorot, % → ppm)", async () => {
    const bytes = await filled([["נועה", "STUDY_FUND", "מיטב", "כללי", "4321", 85432.1, "2026-10-31", 250, 750, 0, 0, 0.62, "2015-01-01", "כן"]]);
    expect(templateXlsxParser.canHandle("x.xlsx", bytes)).toBe(true);
    const { products, issues } = await templateXlsxParser.parse(bytes);
    expect(issues).toEqual([]);
    expect(products[0]).toMatchObject({ productType: "STUDY_FUND", balance: 8_543_210n, employeeDeposit: 25_000n, employerDeposit: 75_000n, feeAccumulationPpm: 6_200, policyLast4: "4321", isActive: true, personFirstName: "נועה" });
  });
  it("reports every invalid field and imports nothing from that row", async () => {
    const bytes = await filled([["", "PENSION?", "", "", "12", "abc", "31/10/2026", "", "", "", "120", "0.5", "", "לא"]]);
    const { products, issues } = await templateXlsxParser.parse(bytes);
    expect(products).toEqual([]);
    expect(issues.map((i) => i.field).sort()).toEqual(["balance", "balanceAsOf", "feeDeposits", "policyLast4", "productType", "provider"].sort());
  });
});

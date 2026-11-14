import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assignDedupKeys } from "@/lib/import/dedup";
import { detectMapping } from "@/lib/import/detect";
import { normalizeTable } from "@/lib/import/normalize";
import { readFileTables } from "@/server/import/adapters";

const load = (f: string) => new Uint8Array(readFileSync(`tests/fixtures/${f}`));

describe("fixture files through the full pipeline", () => {
  it("bank CSV: 3 months, debit/credit, totals row skipped, no errors", async () => {
    const { adapter, tables } = await readFileTables("demo-bank-aug-oct-2026.csv", load("demo-bank-aug-oct-2026.csv"));
    expect(adapter).toBe("file:csv");
    const d = detectMapping(tables[0]!, { isCreditCard: false })!;
    expect(d.confidence).toBe("high");
    const r = normalizeTable(tables[0]!, d.mapping);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(28); // 9 lines × 3 months + 1 one-off transfer
    const salary = r.rows.filter((x) => x.description.startsWith("משכורת"));
    expect(salary.map((x) => x.amount)).toEqual([1_745_000n, 1_745_000n, 1_745_000n]);
    expect(r.rows.find((x) => x.description.startsWith("שכר דירה"))!.amount).toBe(-380_000n);
  });

  it("card XLSX: charged amount, charge date, installments, USD original, refund", async () => {
    const { adapter, tables } = await readFileTables("demo-card-max-aug-oct-2026.xlsx", load("demo-card-max-aug-oct-2026.xlsx"));
    expect(adapter).toBe("file:xlsx");
    const d = detectMapping(tables[0]!, { isCreditCard: true })!;
    expect(d.mapping.amount).toMatchObject({ mode: "single", negate: true });
    const r = normalizeTable(tables[0]!, d.mapping);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(32);
    const ikea = r.rows.filter((x) => x.description.includes("איקאה"));
    expect(ikea.map((x) => [x.installmentNumber, x.installmentTotal, x.amount])).toEqual([[1, 6, -25_000n], [2, 6, -25_000n], [3, 6, -25_000n]]);
    const amazon = r.rows.find((x) => x.description.includes("AMAZON"))!;
    expect(amazon).toMatchObject({ amount: -31_260n, originalAmount: 8_450n, originalCurrency: "USD", date: "2026-08-20", chargeDate: "2026-09-10" });
    expect(r.rows.find((x) => x.description.startsWith("זיכוי"))!.amount).toBe(12_000n);
    // Re-importing the same file yields identical dedup keys
    expect(assignDedupKeys(r.rows).map((x) => x.dedupKey)).toEqual(assignDedupKeys(normalizeTable(tables[0]!, d.mapping).rows).map((x) => x.dedupKey));
  });
});

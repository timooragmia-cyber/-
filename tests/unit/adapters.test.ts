import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { decodeText, readFileTables, UnsupportedFileError } from "@/server/import/adapters";

/** Minimal Windows-1255 encoder for Hebrew letters (test helper). */
function win1255(s: string): Uint8Array {
  return Uint8Array.from([...s].map((ch) => {
    const c = ch.codePointAt(0)!;
    if (c >= 0x05d0 && c <= 0x05ea) return 0xe0 + (c - 0x05d0);
    if (c < 0x80) return c;
    throw new Error("unsupported char in test");
  }));
}

describe("file adapters", () => {
  it("decodes UTF-8 (with BOM) and falls back to Windows-1255", () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("שלום")]))).toBe("שלום");
    expect(decodeText(win1255("תאריך,סכום"))).toBe("תאריך,סכום");
  });

  it("reads a Windows-1255 CSV", async () => {
    const { adapter, tables } = await readFileTables("tnuot.csv", win1255("תאריך,תיאור,סכום\n01/10/2026,משכורת,9800.00\n"));
    expect(adapter).toBe("file:csv");
    expect(tables[0]!.rows[1]).toEqual(["01/10/2026", "משכורת", "9800.00"]);
  });

  it("reads XLSX: real dates → ISO, numbers keep 2 decimals", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["תאריך עסקה", "שם בית העסק", "סכום חיוב"]);
    ws.addRow([new Date(Date.UTC(2026, 9, 5)), "שופרסל", 512.3]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());
    const { adapter, tables } = await readFileTables("max.xlsx", buf);
    expect(adapter).toBe("file:xlsx");
    expect(tables[0]!.rows[1]).toEqual(["2026-10-05", "שופרסל", "512.30"]);
  });

  it("reads HTML disguised as .xls", async () => {
    const html = "<html><body><table><tr><th>תאריך</th><th>סכום</th></tr><tr><td>01/10/2026</td><td> 1,200.00 </td></tr></table></body></html>";
    const { adapter, tables } = await readFileTables("export.xls", new TextEncoder().encode(html));
    expect(adapter).toBe("file:html-xls");
    expect(tables[0]!.rows).toEqual([["תאריך", "סכום"], ["01/10/2026", "1,200.00"]]);
  });

  it("refuses legacy binary XLS, empty and unknown files with explicit codes", async () => {
    await expect(readFileTables("old.xls", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2]))).rejects.toMatchObject({ code: "BINARY_XLS" });
    await expect(readFileTables("a.csv", new Uint8Array())).rejects.toBeInstanceOf(UnsupportedFileError);
    await expect(readFileTables("a.pdf", new Uint8Array([0x25, 0x50]))).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });
});

import { describe, expect, it } from "vitest";
import { addYearsUtc, purgeEligibility, requestDueAt } from "@/lib/privacy/retention";
import { agorotToDecimal, csvCell, toCsv, toExportJson } from "@/lib/privacy/serialize";

describe("retention", () => {
  const r = new Date("2026-03-15T10:00:00Z");
  it("not restricted / no retention configured → never eligible", () => {
    expect(purgeEligibility(null, 7, new Date("2040-01-01")).state).toBe("NOT_RESTRICTED");
    expect(purgeEligibility(r, null, new Date("2099-01-01")).state).toBe("NO_RETENTION_SET");
  });
  it("eligible exactly at restriction + N years", () => {
    expect(purgeEligibility(r, 7, new Date("2033-03-15T09:59:59Z"))).toEqual({ state: "WAITING", eligibleAt: new Date("2033-03-15T10:00:00Z") });
    expect(purgeEligibility(r, 7, new Date("2033-03-15T10:00:00Z")).state).toBe("ELIGIBLE");
  });
  it("29 Feb → 28 Feb in a non-leap year", () => {
    expect(addYearsUtc(new Date("2028-02-29T00:00:00Z"), 1).toISOString()).toBe("2029-02-28T00:00:00.000Z");
  });
  it("request due date", () => {
    expect(requestDueAt(new Date("2026-11-01T00:00:00Z"), 30).toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("export serialization", () => {
  it("money stays exact", () => {
    expect(agorotToDecimal(-123456n)).toBe("-1234.56");
    expect(agorotToDecimal(5n)).toBe("0.05");
    expect(toExportJson({ a: 12345678901234567890n })).toContain('"12345678901234567890"');
  });
  it("neutralizes spreadsheet formulas but keeps negative numbers numeric", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+972")).toBe("'+972");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("שופרסל, חיפה")).toBe('"שופרסל, חיפה"');
  });
  it("CSV has a BOM and CRLF rows", () => {
    expect(toCsv(["a"], [["1"]])).toBe("﻿a\r\n1\r\n");
  });
});

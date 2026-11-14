import { describe, expect, it } from "vitest";
import { applyRate, divRound, formatMoney, formatPpmPercent, fromJson, parseAmount, parsePercentToPpm, ratioPpm, shekels, sum, toJson } from "@/lib/money";

describe("divRound", () => {
  it.each([
    [5n, 2n, "HALF_UP", 3n],
    [-5n, 2n, "HALF_UP", -3n],
    [5n, 2n, "HALF_EVEN", 2n],
    [7n, 2n, "HALF_EVEN", 4n],
    [-7n, 2n, "HALF_EVEN", -4n],
    [7n, 3n, "FLOOR", 2n],
    [-7n, 3n, "FLOOR", -3n],
    [7n, 3n, "CEIL", 3n],
    [-7n, 3n, "CEIL", -2n],
    [-7n, 3n, "TRUNC", -2n],
    [4n, 3n, "HALF_UP", 1n],
  ] as const)("%s / %s %s = %s", (n, d, mode, expected) => {
    expect(divRound(n, d, mode)).toBe(expected);
  });
  it("rejects non-positive divisor", () => expect(() => divRound(1n, 0n)).toThrow());
});

describe("parseAmount (no floats)", () => {
  it.each([
    ["1,234.56", 123456n],
    ["-1234.5", -123450n],
    ["1234", 123400n],
    ["(1,234.56)", -123456n],
    ["1234.56-", -123456n],
    ["₪ 1,234.56", 123456n],
    ['1,000 ש"ח', 100000n],
    ["0.005", 1n],
    ["0.004", 0n],
    ["-0.005", -1n],
    ["‏1,500.00", 150000n],
    ["99999999999.99", 9999999999999n],
  ])("%s → %s agorot", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
  it.each(["", "abc", "1.2.3", "1,23a"])("rejects %j", (bad) => {
    expect(() => parseAmount(bad)).toThrow();
  });
  it("0.1 + 0.2 is exactly 0.30 (the float trap)", () => {
    expect(parseAmount("0.1") + parseAmount("0.2")).toBe(parseAmount("0.3"));
  });
});

describe("rates in ppm", () => {
  it("applies 0.22% to ₪1,000,000 exactly", () => {
    expect(applyRate(shekels(1_000_000), 2_200)).toBe(shekels(2_200));
  });
  it("rounds half up on agorot", () => {
    // 1.5% of 0.33 ₪ = 0.495 agorot → 0
    expect(applyRate(33n, 15_000)).toBe(0n);
    // 50% of 1 agora = 0.5 → 1 (HALF_UP)
    expect(applyRate(1n, 500_000)).toBe(1n);
    expect(applyRate(1n, 500_000, "HALF_EVEN")).toBe(0n);
  });
  it("rejects fractional ppm", () => expect(() => applyRate(100n, 1.5)).toThrow());
  it("ratioPpm", () => {
    expect(ratioPpm(shekels(1_800), shekels(26_600))).toBe(67_669);
    expect(ratioPpm(shekels(-500), shekels(10_000))).toBe(-50_000);
    expect(ratioPpm(1n, 0n)).toBeNull();
  });
  it("parsePercentToPpm", () => {
    expect(parsePercentToPpm("0.22%")).toBe(2_200);
    expect(parsePercentToPpm("6")).toBe(60_000);
    expect(parsePercentToPpm("1.4925")).toBe(14_925);
    expect(() => parsePercentToPpm("1.23456")).toThrow();
  });
});

describe("formatting", () => {
  it("formats Hebrew and Arabic with Western digits", () => {
    const he = formatMoney(123456n, "he");
    const ar = formatMoney(123456n, "ar");
    expect(he).toContain("1,234.56");
    expect(ar).toContain("1,234.56");
    expect(he).toContain("₪");
  });
  it("keeps precision for very large values", () => {
    expect(formatMoney(9007199254740993n, "he")).toContain("90,071,992,547,409.93");
  });
  it("rounds to whole shekels when asked", () => {
    expect(formatMoney(123450n, "he", { decimals: 0 })).toContain("1,235");
    expect(formatMoney(-123449n, "he", { decimals: 0 })).toContain("1,234");
  });
  it("formats ppm as percent", () => {
    expect(formatPpmPercent(2_200, "he")).toContain("0.22");
    expect(formatPpmPercent(67_669, "he", 1)).toContain("6.8");
  });
});

describe("helpers", () => {
  it("sum / json roundtrip", () => {
    expect(sum([1n, 2n, -3n])).toBe(0n);
    expect(fromJson(toJson(-123n))).toBe(-123n);
    expect(() => fromJson("1.5")).toThrow();
    expect(() => shekels(1.5)).toThrow();
  });
});

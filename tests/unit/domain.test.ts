import { describe, expect, it } from "vitest";
import { selectEffective, OverlappingConfigError } from "@/lib/config/effective";
import { computeHouseholdStatus } from "@/lib/domain/household-status";
import { addMonths, isPeriod, periodOf } from "@/lib/domain/period";
import { canAccessHousehold } from "@/server/auth/dal-guards";

describe("period", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-03", -15)).toBe("2024-12");
  });
  it("uses Asia/Jerusalem for month boundaries", () => {
    // 2026-10-31 22:30 UTC is already 2026-11-01 in Israel (UTC+2 in winter)
    expect(periodOf(new Date("2026-10-31T22:30:00Z"))).toBe("2026-11");
  });
  it("validates", () => {
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod("2026-09")).toBe(true);
  });
});

describe("computeHouseholdStatus", () => {
  const now = new Date("2026-11-14T10:00:00Z");
  const snap = (period: string, surplus: bigint, savingsRatePpm: number) => ({ period, surplus, savingsRatePpm });

  it("NO_DATA when nothing closed", () => {
    expect(computeHouseholdStatus([], now, 10, 10_000)).toMatchObject({ status: "NO_DATA", missingUpdate: true, trend: null });
  });
  it("SURPLUS with improving trend, up to date", () => {
    const r = computeHouseholdStatus([snap("2026-09", 50_000n, 19_000), snap("2026-10", 180_000n, 67_000)], now, 10, 10_000);
    expect(r).toMatchObject({ status: "SURPLUS", trend: "UP", lastClosedPeriod: "2026-10", expectedPeriod: "2026-10", missingUpdate: false });
  });
  it("DEFICIT and missing update when latest is stale", () => {
    const r = computeHouseholdStatus([snap("2026-08", -290_000n, -153_000), snap("2026-07", -170_000n, -92_000)], now, 10, 10_000);
    expect(r).toMatchObject({ status: "DEFICIT", trend: "DOWN", missingUpdate: true });
  });
  it("within grace days the expected month is two months back", () => {
    const early = new Date("2026-11-05T10:00:00Z");
    expect(computeHouseholdStatus([snap("2026-09", 1n, 1)], early, 10, 10_000)).toMatchObject({ expectedPeriod: "2026-09", missingUpdate: false });
  });
  it("small change is FLAT; zero surplus counts as balanced", () => {
    const r = computeHouseholdStatus([snap("2026-10", 0n, 0), snap("2026-09", 0n, 5_000)], now, 10, 10_000);
    expect(r).toMatchObject({ status: "SURPLUS", trend: "FLAT" });
  });
});

describe("selectEffective", () => {
  const row = (from: string, to: string | null, v: number) => ({ effectiveFrom: new Date(from), effectiveTo: to ? new Date(to) : null, v });
  const rows = [row("2025-01-01", "2025-12-31", 1), row("2026-01-01", null, 2)];
  it("picks the rule valid on the transaction date, not today", () => {
    expect(selectEffective(rows, new Date("2025-06-15"))?.v).toBe(1);
    expect(selectEffective(rows, new Date("2025-12-31"))?.v).toBe(1);
    expect(selectEffective(rows, new Date("2026-01-01"))?.v).toBe(2);
    expect(selectEffective(rows, new Date("2024-12-31"))).toBeNull();
  });
  it("refuses overlapping rows instead of guessing", () => {
    expect(() => selectEffective([...rows, row("2026-06-01", null, 3)], new Date("2026-07-01"))).toThrow(OverlappingConfigError);
  });
});

describe("tenant guard", () => {
  it("advisor sees all, client only own household", () => {
    expect(canAccessHousehold({ role: "ADVISOR", householdId: null }, "h1")).toBe(true);
    expect(canAccessHousehold({ role: "CLIENT", householdId: "h1" }, "h1")).toBe(true);
    expect(canAccessHousehold({ role: "CLIENT", householdId: "h1" }, "h2")).toBe(false);
    expect(canAccessHousehold({ role: "CLIENT", householdId: null }, "h1")).toBe(false);
  });
});

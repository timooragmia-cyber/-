import { describe, expect, it } from "vitest";
import { rateLimit, resetRateLimit } from "@/server/rate-limit";

describe("rateLimit", () => {
  it("blocks after the limit within the window and recovers after it", () => {
    const k = "t:window";
    for (let i = 0; i < 3; i++) expect(rateLimit(k, 3, 1000, 0).ok).toBe(true);
    expect(rateLimit(k, 3, 1000, 10).ok).toBe(false);
    expect(rateLimit(k, 3, 1000, 1000).ok).toBe(true);
  });
  it("a success clears the counter, so only consecutive failures are throttled", () => {
    const k = "t:reset";
    for (let i = 0; i < 3; i++) rateLimit(k, 3, 1000, 0);
    resetRateLimit(k);
    expect(rateLimit(k, 3, 1000, 1).ok).toBe(true);
  });
});

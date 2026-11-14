import "server-only";

/**
 * Fixed-window in-memory limiter. Adequate for the single-instance Docker deployment
 * chosen for v1; swap for Redis/Postgres-backed limiter if the app is ever scaled out.
 * Account-level lockout (persisted in DB) is the primary brute-force control.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return { ok: true, retryAfterMs: 0 };
  }
  b.count += 1;
  return b.count <= limit ? { ok: true, retryAfterMs: 0 } : { ok: false, retryAfterMs: b.resetAt - now };
}

/** Clears a key after a successful attempt, so only consecutive failures are throttled. */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

/** Exact integer helpers for compounding without floating point. */

/** floor(n^(1/k)) for n ≥ 0 via integer Newton iteration. */
export function integerRoot(n: bigint, k: number): bigint {
  if (n < 0n) throw new Error("negative radicand");
  if (n < 2n) return n;
  const K = BigInt(k);
  // initial guess from bit length (always ≥ true root)
  let x = 1n << (BigInt(n.toString(2).length) / K + 1n);
  for (;;) {
    const y = ((K - 1n) * x + n / x ** (K - 1n)) / K;
    if (y >= x) break;
    x = y;
  }
  while (x ** K > n) x -= 1n;
  while ((x + 1n) ** K <= n) x += 1n;
  return x;
}

export const FACTOR_SCALE = 10n ** 15n;

/**
 * Monthly growth factor for an annual rate in ppm, scaled by FACTOR_SCALE:
 * (1 + r)^(1/12) × 10^15, exact to the last digit (floor).
 * Negative annual rates down to −100% are supported.
 */
export function monthlyFactorFromAnnualPpm(annualPpm: number): bigint {
  if (!Number.isSafeInteger(annualPpm) || annualPpm <= -1_000_000) throw new Error("invalid annual rate");
  const base = FACTOR_SCALE + (BigInt(annualPpm) * FACTOR_SCALE) / 1_000_000n; // (1+r) scaled
  return integerRoot(base * FACTOR_SCALE ** 11n, 12);
}

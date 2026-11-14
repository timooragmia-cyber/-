/**
 * Money primitives. All money is integer agorot held in `bigint`.
 * There is intentionally no function that accepts or returns a JS `number` amount
 * except `toDisplayNumber` for chart axes (display only, never fed back into math).
 *
 * Rates are integer parts-per-million (ppm): 1% = 10_000 ppm, 100% = 1_000_000 ppm.
 */

export type Agorot = bigint;
export type Ppm = number; // integer, validated at runtime

export const AGOROT_PER_SHEKEL = 100n;
export const PPM_SCALE = 1_000_000n;

export type RoundingMode =
  /** Round half away from zero (common commercial/tax rounding). */
  | "HALF_UP"
  /** Banker's rounding (half to even). */
  | "HALF_EVEN"
  /** Toward −∞. */
  | "FLOOR"
  /** Toward +∞. */
  | "CEIL"
  /** Toward zero. */
  | "TRUNC";

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

function assertPpm(rate: Ppm): bigint {
  if (!Number.isSafeInteger(rate)) {
    throw new MoneyError(`Rate must be an integer ppm value, got ${rate}`);
  }
  return BigInt(rate);
}

const abs = (v: bigint) => (v < 0n ? -v : v);

/** Integer division of n/d with explicit rounding. d must be > 0. */
export function divRound(n: bigint, d: bigint, mode: RoundingMode = "HALF_UP"): bigint {
  if (d <= 0n) throw new MoneyError("Divisor must be positive");
  const q = n / d; // truncates toward zero
  const r = n % d;
  if (r === 0n) return q;
  const negative = n < 0n;
  switch (mode) {
    case "TRUNC":
      return q;
    case "FLOOR":
      return negative ? q - 1n : q;
    case "CEIL":
      return negative ? q : q + 1n;
    case "HALF_UP": {
      const twice = abs(r) * 2n;
      if (twice >= d) return negative ? q - 1n : q + 1n;
      return q;
    }
    case "HALF_EVEN": {
      const twice = abs(r) * 2n;
      if (twice > d) return negative ? q - 1n : q + 1n;
      if (twice < d) return q;
      // exactly half: round to even
      const isOdd = q % 2n !== 0n;
      if (!isOdd) return q;
      return negative ? q - 1n : q + 1n;
    }
  }
}

/** amount × rate, result in agorot, explicitly rounded. */
export function applyRate(amount: Agorot, rate: Ppm, mode: RoundingMode = "HALF_UP"): Agorot {
  return divRound(amount * assertPpm(rate), PPM_SCALE, mode);
}

/** Ratio part/whole as ppm (e.g. savings rate). Returns null when whole is 0. */
export function ratioPpm(part: Agorot, whole: Agorot, mode: RoundingMode = "HALF_UP"): Ppm | null {
  if (whole === 0n) return null;
  const sign = whole < 0n ? -1n : 1n;
  return Number(divRound(part * PPM_SCALE * sign, abs(whole), mode));
}

export function sum(values: readonly Agorot[]): Agorot {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

export function shekels(whole: number | bigint): Agorot {
  if (typeof whole === "number" && !Number.isSafeInteger(whole)) {
    throw new MoneyError("shekels() accepts whole shekels only; use parseAmount for decimals");
  }
  return BigInt(whole) * AGOROT_PER_SHEKEL;
}

/**
 * Parse a human/statement amount string into agorot without ever using floats.
 * Accepts: "1,234.56", "-1234.5", "1234", "(1,234.56)" (accounting negative),
 * "1234.56-" (trailing minus used by some Israeli statements), "₪ 1,234.56".
 * Thousand separator: ",". Decimal separator: ".". (Locale variants are normalized
 * by the import mapping layer before calling this.)
 */
export function parseAmount(input: string): Agorot {
  let s = input.trim().replace(/[₪\s‎‏‪-‮]/g, "").replace(/ILS|NIS|ש"ח|ש״ח/gi, "");
  if (s === "") throw new MoneyError(`Empty amount`);
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  s = s.replace(/,/g, "");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new MoneyError(`Invalid amount: "${input}"`);
  const whole = BigInt(m[1]!);
  const fracRaw = m[2] ?? "";
  // Keep 2 decimals; round the rest HALF_UP deterministically.
  const frac = BigInt((fracRaw + "00").slice(0, 2));
  const rest = fracRaw.slice(2);
  let value = whole * AGOROT_PER_SHEKEL + frac;
  if (rest.length > 0 && Number(rest[0]) >= 5) value += 1n; // half away from zero on magnitude
  return negative ? -value : value;
}

/** Display-only conversion (charts). Never use the result for further money math. */
export function toDisplayNumber(amount: Agorot): number {
  return Number(amount) / 100;
}

export type MoneyLocale = "he" | "ar";

const intlLocale: Record<MoneyLocale, string> = {
  he: "he-IL",
  // Western digits are standard for Arabic speakers in Israel; keep numbers consistent across languages.
  ar: "ar-IL-u-nu-latn",
};

/**
 * Format agorot as ILS. Uses string math for the fractional part so precision is
 * never lost for large values.
 */
export function formatMoney(
  amount: Agorot,
  locale: MoneyLocale,
  opts: { decimals?: 0 | 2; signDisplay?: "auto" | "always" | "exceptZero" } = {},
): string {
  const decimals = opts.decimals ?? 2;
  const rounded = decimals === 0 ? divRound(amount, 100n, "HALF_UP") * 100n : amount;
  const negative = rounded < 0n;
  const absVal = abs(rounded);
  const whole = absVal / 100n;
  const frac = absVal % 100n;
  const nf = new Intl.NumberFormat(intlLocale[locale], {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: opts.signDisplay ?? "auto",
  });
  // Format using a string decimal to avoid float conversion for huge values.
  const decimalString = `${negative ? "-" : ""}${whole.toString()}${decimals === 2 ? "." + frac.toString().padStart(2, "0") : ""}`;
  // Intl.NumberFormat.format accepts numeric strings (ES2023) and keeps exact precision.
  return nf.format(decimalString as unknown as number);
}

/** Format a ppm rate as percent, e.g. 2_200 → "0.22%". */
export function formatPpmPercent(rate: Ppm, locale: MoneyLocale, fractionDigits = 2): string {
  const nf = new Intl.NumberFormat(intlLocale[locale], {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  });
  // ppm → fraction as an exact decimal string
  const negative = rate < 0;
  const a = Math.abs(rate);
  const s = `${negative ? "-" : ""}0.${a.toString().padStart(6, "0")}`;
  const normalized = a >= 1_000_000 ? `${negative ? "-" : ""}${Math.floor(a / 1_000_000)}.${(a % 1_000_000).toString().padStart(6, "0")}` : s;
  return nf.format(normalized as unknown as number);
}

/** Parse a percent string like "0.22" or "0.22%" into ppm without floats. */
export function parsePercentToPpm(input: string): Ppm {
  const s = input.trim().replace("%", "");
  const m = /^(-)?(\d+)(?:\.(\d{1,4}))?$/.exec(s);
  if (!m) throw new MoneyError(`Invalid percent: "${input}"`);
  const whole = Number(m[2]);
  const frac = Number(((m[3] ?? "") + "0000").slice(0, 4));
  const ppm = whole * 10_000 + frac;
  return m[1] ? -ppm : ppm;
}

/** Serialize for JSON payloads (snapshots, API responses): agorot as decimal string. */
export function toJson(amount: Agorot): string {
  return amount.toString();
}

export function fromJson(value: string): Agorot {
  if (!/^-?\d+$/.test(value)) throw new MoneyError(`Invalid agorot JSON value: ${value}`);
  return BigInt(value);
}

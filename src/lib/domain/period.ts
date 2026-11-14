/** Month periods are "YYYY-MM" strings, compared lexicographically. Timezone: Asia/Jerusalem. */

export type Period = string;

const RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriod(v: string): v is Period {
  return RE.test(v);
}

export function periodOf(date: Date, timeZone = "Asia/Jerusalem"): Period {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

export function addMonths(period: Period, delta: number): Period {
  const m = RE.exec(period);
  if (!m) throw new Error(`Invalid period ${period}`);
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) + delta;
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  return `${y.toString().padStart(4, "0")}-${mo.toString().padStart(2, "0")}`;
}

export function dayOfMonth(date: Date, timeZone = "Asia/Jerusalem"): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone, day: "numeric" }).format(date));
}

import "server-only";
import { toDisplayNumber } from "@/lib/money";
import type { TrendPoint } from "@/components/charts/trend-charts";

export type Loc = "he" | "ar";

export const catName = (c: { nameHe: string; nameAr: string } | null | undefined, locale: Loc, fallback = "—") =>
  c ? (locale === "ar" ? c.nameAr : c.nameHe) : fallback;

export function toTrendPoints(trend: { period: string; income: bigint; expenses: bigint; surplus: bigint; savingsRatePpm: number }[]): TrendPoint[] {
  return trend.map((t) => ({
    period: t.period,
    income: toDisplayNumber(t.income),
    expenses: toDisplayNumber(t.expenses),
    surplus: toDisplayNumber(t.surplus),
    savingsRate: t.income > 0n ? t.savingsRatePpm / 1_000_000 : null,
  }));
}

import { getLocale, getTranslations } from "next-intl/server";
import { TrendCharts } from "@/components/charts/trend-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPpmPercent } from "@/lib/money";
import type { householdInsights } from "@/server/months";
import { toTrendPoints, type Loc } from "@/server/view";

type Insights = Awaited<ReturnType<typeof householdInsights>>;

/** Shared by the advisor overview and (in a reduced form) the client portal. */
export async function TrendCard({ insights, defaultRange = 6 }: { insights: Insights; defaultRange?: 3 | 6 | 12 }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  if (insights.trend.length === 0) return null;
  return (
    <Card>
      <CardTitle>{t("insights.trend")}</CardTitle>
      <p className="mb-3 text-sm text-muted">
        {t("insights.deficitMonths")}: {t("insights.range3")} <span className="num">{insights.deficitMonths.m3}</span> · {t("insights.range6")}{" "}
        <span className="num">{insights.deficitMonths.m6}</span> · {t("insights.range12")} <span className="num">{insights.deficitMonths.m12}</span>
      </p>
      <TrendCharts
        data={toTrendPoints(insights.trend)}
        locale={locale}
        defaultRange={defaultRange}
        labels={{
          income: t("insights.chartIncome"),
          expenses: t("insights.chartExpenses"),
          surplus: t("month.surplus"),
          deficit: t("month.deficit"),
          savingsRate: t("insights.chartSavingsRate"),
          ranges: { 3: t("insights.range3"), 6: t("insights.range6"), 12: t("insights.range12") },
          period: t("household.period"),
          table: t("insights.tableView"),
        }}
      />
    </Card>
  );
}

export async function HighlightsCard({ insights, categoryNames }: { insights: Insights; categoryNames: Map<string, string> }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  return (
    <Card>
      <CardTitle>{t("insights.highlights")}</CardTitle>
      {insights.highlights.length === 0 ? (
        <p className="text-sm text-muted">{t("insights.noHighlights")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {insights.highlights.map((h) => (
            <li key={h.categoryKey} className="flex items-center gap-2">
              <span aria-hidden className={h.favorable ? "text-ok" : "text-bad"}>{h.direction === "UP" ? "▲" : "▼"}</span>
              <span>
                {h.categoryKey === "__total_income" ? t("insights.totalIncome") : (categoryNames.get(h.categoryKey) ?? h.categoryKey)}{" "}
                {t(h.direction === "UP" ? "insights.up" : "insights.down")}{" "}
                <span className="num font-medium">{formatPpmPercent(h.changePpm, locale, 0)}</span>{" "}
                (<span className="num">{formatMoney(h.delta, locale, { decimals: 0, signDisplay: "always" })}</span>)
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function HealthCard({ insights }: { insights: Insights }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  const { score, components } = insights.health;
  const available = components.filter((c) => c.score !== null).length;
  const tone = score === null ? "neutral" : score >= 70 ? "ok" : score >= 40 ? "warn" : "bad";
  return (
    <Card>
      <CardTitle>{t("insights.health")}</CardTitle>
      <p className="num text-4xl font-bold">{score ?? "—"}<span className="text-base text-muted">/100</span></p>
      <Badge tone={tone} className="mt-1">{score === null ? t("insights.pending") : score >= 70 ? "●" : score >= 40 ? "◐" : "○"}</Badge>
      {score !== null && available < components.length && (
        <p className="mt-2 text-xs text-warn">{t("insights.partial", { n: available, total: components.length })}</p>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">{t("insights.healthHow")}</summary>
        <ul className="mt-2 space-y-1">
          {components.map((c) => (
            <li key={c.key} className="flex justify-between gap-2">
              <span>{t(`insights.components.${c.key}`)}</span>
              <span className="num text-muted">
                {c.score === null ? t("insights.pending") : `${c.score}/100`}
                {c.input !== null && c.key !== "emergencyFund" && ` · ${formatPpmPercent(c.input, locale, 1)}`} · {t("insights.weight")} {c.weight}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

export async function RecurringCard({ insights }: { insights: Insights }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  return (
    <Card>
      <CardTitle>{t("insights.recurring")}</CardTitle>
      {insights.recurring.length === 0 ? (
        <p className="text-sm text-muted">{t("insights.noRecurring")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {insights.recurring.slice(0, 30).map((r) => (
            <li key={r.merchantKey} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {r.sampleDescription}{" "}
                {r.isSubscriptionLike && <Badge tone="warn">{t("insights.subscriptionLike")}</Badge>}
              </span>
              <span className="num text-muted">
                {formatMoney(r.typicalAmount, locale)} · {formatMoney(r.annualCost, locale, { decimals: 0 })} {t("insights.perYear")} · {t("insights.monthsSeen", { count: r.monthsSeen.length })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export async function InstallmentsCard({ insights }: { insights: Insights }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  const { plans, totalRemaining } = insights.installments;
  return (
    <Card>
      <CardTitle>{t("insights.installments")}</CardTitle>
      {plans.length === 0 ? (
        <p className="text-sm text-muted">{t("insights.noInstallments")}</p>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {plans.map((p) => (
              <li key={`${p.merchantKey}-${p.total}-${p.paymentAmount}`} className="flex justify-between gap-2">
                <span>{p.sampleDescription}</span>
                <span className="num text-muted">
                  {formatMoney(p.paymentAmount, locale)} × {p.remainingPayments} = {formatMoney(p.remainingAmount, locale, { decimals: 0 })}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-semibold">
            {t("insights.totalFuture")}: <span className="num">{formatMoney(totalRemaining, locale, { decimals: 0 })}</span>
          </p>
        </>
      )}
    </Card>
  );
}

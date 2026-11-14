import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { StatusBadge } from "@/components/app/status-badge";
import { HighlightsCard, TrendCard } from "@/components/app/insights";
import { SpendBars } from "@/components/charts/trend-charts";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPpmPercent, toDisplayNumber } from "@/lib/money";
import { audit } from "@/server/audit";
import { requireClient } from "@/server/auth/dal";
import { getHouseholdProfile } from "@/server/households";
import { householdInsights, loadCategories } from "@/server/months";
import { catName, type Loc } from "@/server/view";
import { clientTaskStatusAction } from "./actions";
import { db } from "@/server/db";

/**
 * Client home. Goal: understand the month in 10 seconds — one headline number, one status,
 * one savings rate above the fold. The portal shows CLOSED months only (advisor-reviewed),
 * never live, unreviewed numbers.
 */
export default async function PortalPage() {
  const user = await requireClient();
  const [h, insights, cats] = await Promise.all([getHouseholdProfile(user, user.householdId), householdInsights(user.householdId), loadCategories()]);
  await audit({ action: "VIEW", actorUserId: user.id, actorRole: user.role, entityType: "Portal", householdId: user.householdId });
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  const latest = insights.closed[0];
  // Balances only — fee analysis and projections stay advisor-side until approved (Phase 4 plan).
  const products = await db.longTermProduct.findMany({ where: { householdId: user.householdId }, include: { person: { select: { firstName: true } } }, orderBy: { balance: "desc" } });
  const names = new Map([...cats.values()].map((c) => [c.key, catName(c, locale)]));
  const byKey = new Map([...cats.values()].map((c) => [c.key, c]));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t("portal.hello", { name: user.displayName })}</h1>
        <Link href="/portal/upload" className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium">{t("portalMore.uploadCta")}</Link>
      </div>

      <Card>
        <CardTitle>{t("portal.statusHeadline")}</CardTitle>
        {latest ? (
          <div className="space-y-2 text-center">
            <p className="num text-sm text-muted">{latest.period}</p>
            <p className={`num text-4xl font-bold ${latest.totals.surplus < 0n ? "text-bad" : "text-ok"}`}>
              {formatMoney(latest.totals.surplus, locale, { decimals: 0, signDisplay: "exceptZero" })}
            </p>
            <StatusBadge status={latest.totals.surplus < 0n ? "DEFICIT" : "SURPLUS"} />
            <p className="text-sm">
              {t("portal.savingsRate")}: <span className="num">{latest.totals.income > 0n ? formatPpmPercent(latest.totals.savingsRatePpm, locale, 1) : "—"}</span>
            </p>
          </div>
        ) : (
          <p className="text-muted">{t("portal.noDataYet")}</p>
        )}
      </Card>

      {h && h.actionItems.length > 0 && (
        <Card>
          <CardTitle>{t("portal.yourTasks")}</CardTitle>
          <ul className="space-y-3">
            {h.actionItems.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{a.title}{a.status === "IN_PROGRESS" && <span className="text-muted"> · {t("tasks.status.IN_PROGRESS")}</span>}</span>
                <span className="flex gap-2">
                  {a.status === "OPEN" && (
                    <ActionForm action={clientTaskStatusAction} submitLabel={t("portalMore.taskStart")} variant="outline">
                      <input type="hidden" name="taskId" value={a.id} /><input type="hidden" name="status" value="IN_PROGRESS" />
                    </ActionForm>
                  )}
                  <ActionForm action={clientTaskStatusAction} submitLabel={t("portalMore.taskDone")}>
                    <input type="hidden" name="taskId" value={a.id} /><input type="hidden" name="status" value="DONE" />
                  </ActionForm>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {latest?.result && latest.result.expenses.length > 0 && (
        <Card>
          <CardTitle>{t("portalMore.whereMoneyWent")}</CardTitle>
          <SpendBars
            locale={locale}
            budgetLabel={t("month.budget")}
            overLabel={t("month.overBudget")}
            items={latest.result.expenses.slice(0, 8).map((l) => ({ label: catName(byKey.get(l.key), locale, l.key), amount: toDisplayNumber(l.amount), budget: l.budget === null ? null : toDisplayNumber(l.budget) }))}
          />
        </Card>
      )}

      {products.length > 0 && (
        <Card>
          <CardTitle>{t("portalSavings.title")}</CardTitle>
          <p className="num text-2xl font-bold">{formatMoney(products.reduce((s, p) => s + p.balance, 0n), locale, { decimals: 0 })}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {products.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{t(`productType.${p.productType}`)} — {p.provider}{p.person ? ` (${p.person.firstName})` : ""}</span>
                <span className="num">{formatMoney(p.balance, locale, { decimals: 0 })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {insights.highlights.length > 0 && <HighlightsCard insights={insights} categoryNames={names} />}
      {insights.trend.length > 1 && <TrendCard insights={insights} defaultRange={3} />}
    </div>
  );
}

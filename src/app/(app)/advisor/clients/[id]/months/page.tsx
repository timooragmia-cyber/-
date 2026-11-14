import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { PeriodPicker } from "@/components/app/period-picker";
import { SpendBars } from "@/components/charts/trend-charts";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isPeriod } from "@/lib/domain/period";
import { formatMoney, formatPpmPercent, toDisplayNumber } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { computeLiveClose, getClosedMonths, loadCategories, periodsWithData } from "@/server/months";
import { catName, type Loc } from "@/server/view";
import { closeMonthAction, setBudgetAction } from "../actions";

export default async function MonthsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string }> }) {
  await requireAdvisor();
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  const [periods, closedAll, cats] = await Promise.all([periodsWithData(id), getClosedMonths(id, 36), loadCategories()]);
  const allPeriods = [...new Set([...periods, ...closedAll.map((c) => c.period)])].sort().reverse();
  if (allPeriods.length === 0) return <Card><p className="text-muted">{t("month.warnings.NO_TRANSACTIONS")}</p></Card>;
  const period = sp.period && isPeriod(sp.period) ? sp.period : allPeriods[0]!;
  const live = await computeLiveClose(id, period);
  const closed = closedAll.find((c) => c.period === period);
  const changed = closed?.result ? closed.result.transactionsSha256 !== live.transactionsSha256 : false;
  const byKey = new Map([...cats.values()].map((c) => [c.key, c]));
  const money = (v: bigint) => formatMoney(v, locale, { decimals: 0 });
  const pct = (v: number | null) => (v === null ? "—" : formatPpmPercent(v, locale, 1));
  const expenseCats = [...cats.values()].filter((c) => c.kind === "EXPENSE");

  return (
    <div className="space-y-4">
      <PeriodPicker periods={allPeriods} current={period} label={t("month.pick")} submitLabel={t("batches.continue")} />

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="mb-1">{t("month.title", { period })}</CardTitle>
            <p className="text-sm text-muted">
              {closed ? t("month.closedVersion", { version: closed.version, date: closed.closedAt.toISOString().slice(0, 10) }) : t("month.live")} · {t("month.calcVersion")} <span className="num">{live.calcVersion}</span>
            </p>
          </div>
          {live.transactionCount > 0 && (
            <ActionForm action={closeMonthAction} submitLabel={closed ? t("month.reclose") : t("month.close")} variant={closed && !changed ? "outline" : "default"}>
              <input type="hidden" name="householdId" value={id} />
              <input type="hidden" name="period" value={period} />
            </ActionForm>
          )}
        </div>
        {changed && <p role="alert" className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{t("month.changedSinceClose")}</p>}
        {live.warnings.length > 0 && (
          <ul className="mt-3 space-y-1">
            {live.warnings.map((w) => <li key={w} className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">⚠ {t(`month.warnings.${w}`)}</li>)}
          </ul>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [t("month.income"), money(live.totalIncome), ""],
            [t("month.expenses"), money(live.totalExpenses), ""],
            [live.surplus < 0n ? t("month.deficit") : t("month.surplus"), formatMoney(live.surplus, locale, { decimals: 0, signDisplay: "exceptZero" }), live.surplus < 0n ? "text-bad" : "text-ok"],
            [t("month.savingsRate"), pct(live.savingsRatePpm), ""],
            [t("month.fixedRatio"), pct(live.fixedCostRatioPpm), ""],
            [t("month.discretionaryRatio"), pct(live.discretionaryRatioPpm), ""],
          ].map(([label, value, cls]) => (
            <div key={label} className="rounded-md bg-background p-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className={`num text-start text-xl font-bold ${cls}`}>{value}</dd>
            </div>
          ))}
        </dl>
        {live.excludedTransfers.count > 0 && (
          <p className="mt-3 text-xs text-muted">{t("month.transfersExcluded", { count: live.excludedTransfers.count, amount: money(live.excludedTransfers.amount < 0n ? -live.excludedTransfers.amount : live.excludedTransfers.amount) })}</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>{t("month.whereMoneyWent")}</CardTitle>
          <SpendBars
            locale={locale}
            budgetLabel={t("month.budget")}
            overLabel={t("month.overBudget")}
            items={live.expenses.map((l) => ({ label: catName(byKey.get(l.key), locale, l.key), amount: toDisplayNumber(l.amount), budget: l.budget === null ? null : toDisplayNumber(l.budget) }))}
          />
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-brand">{t("month.setBudget")}</summary>
            <ActionForm action={setBudgetAction} submitLabel={t("form.save")} className="mt-3 flex flex-wrap items-end gap-2 space-y-0">
              <input type="hidden" name="householdId" value={id} />
              <input type="hidden" name="effectiveFrom" value={period} />
              <Select name="categoryId" aria-label={t("txn.category")} className="w-auto">{expenseCats.map((c) => <option key={c.id} value={c.id}>{catName(c, locale)}</option>)}</Select>
              <Input name="monthlyAmount" inputMode="decimal" dir="ltr" className="w-32" aria-label={t("month.budget")} required />
            </ActionForm>
          </details>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardTitle>{t("month.byNature")}</CardTitle>
            <ul className="space-y-1 text-sm">
              {(["FIXED", "VARIABLE", "DISCRETIONARY"] as const).map((n) => (
                <li key={n} className="flex justify-between"><span>{t(`month.nature.${n}`)}</span><span className="num">{money(live.byNature[n])}</span></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>{t("month.income")}</CardTitle>
            <ul className="space-y-1 text-sm">
              {live.income.map((l) => (
                <li key={l.key} className="flex justify-between"><span>{catName(byKey.get(l.key), locale, l.key)}</span><span className="num">{money(l.amount)}</span></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardTitle>{t("advisor.lastClosed")}</CardTitle>
            <ul className="space-y-1 text-sm">
              {closedAll.slice(0, 12).map((c) => (
                <li key={c.period} className="flex justify-between gap-2">
                  <a className="num text-brand underline" href={`?period=${c.period}`}>{c.period}</a>
                  <span className="flex items-center gap-2">
                    <span className={`num ${c.totals.surplus < 0n ? "text-bad" : "text-ok"}`}>{formatMoney(c.totals.surplus, locale, { decimals: 0, signDisplay: "exceptZero" })}</span>
                    <Badge>v{c.version}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

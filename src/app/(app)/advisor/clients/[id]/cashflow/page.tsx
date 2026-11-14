import { getLocale, getTranslations } from "next-intl/server";
import { BalanceProjectionChart } from "@/components/charts/balance-projection";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, toDisplayNumber, type MoneyLocale } from "@/lib/money";
import { cashflow } from "@/server/accounts";
import { requireAdvisor, requireOpenHousehold } from "@/server/auth/dal";

export default async function CashflowPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  await requireOpenHousehold(id);
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const cf = await cashflow(user, id);
  const money = (a: bigint) => formatMoney(a, locale, { decimals: 0, signDisplay: "exceptZero" });
  const { calendar } = cf;
  if (calendar.items.length === 0 && calendar.variableMonthlyOut === 0n) return <Card><p className="text-muted">{t("cashflow.noData")}</p></Card>;

  const firstRisk = cf.projection.find((d) => d.beyondOverdraft) ?? cf.projection.find((d) => d.belowZero);
  const lowest = cf.projection.reduce<(typeof cf.projection)[number] | null>((m, d) => (!m || d.balance < m.balance ? d : m), null);
  const byDay = new Map<number, typeof calendar.items>();
  for (const it of calendar.items) byDay.set(it.day, [...(byDay.get(it.day) ?? []), it]);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{t("cashflow.projection", { days: cf.params.projectionDays })}</CardTitle>
        {!cf.start ? (
          <p className="text-sm text-warn">{t("cashflow.noBalance")}</p>
        ) : (
          <>
            <p className="text-sm text-muted">{t("cashflow.start", { balance: money(cf.start.balance), date: cf.start.date })}</p>
            <p role="status" className={`my-3 rounded-md px-3 py-2 text-sm ${firstRisk ? "bg-bad-bg text-bad" : "bg-ok-bg text-ok"}`}>
              {firstRisk
                ? t(firstRisk.beyondOverdraft ? "cashflow.riskOverdraft" : "cashflow.riskNegative", { date: firstRisk.date, balance: money(firstRisk.balance) })
                : t("cashflow.noRisk")}
              {lowest && <> · {t("cashflow.lowest", { balance: money(lowest.balance), date: lowest.date })}</>}
            </p>
            <BalanceProjectionChart
              locale={locale}
              overdraft={cf.overdraft === null ? null : toDisplayNumber(cf.overdraft)}
              data={cf.projection.map((d) => ({ date: d.date, balance: toDisplayNumber(d.balance) }))}
              labels={{ balance: t("cashflow.chartBalance"), zero: t("cashflow.chartZero"), overdraft: t("acct.overdraftLimit") }}
            />
          </>
        )}
      </Card>

      <Card>
        <CardTitle>{t("cashflow.title")}</CardTitle>
        <p className="mb-3 text-xs text-muted">{t("cashflow.help", { months: cf.params.lookbackMonths, min: cf.params.minMonths })}</p>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[...byDay.entries()].map(([day, items]) => {
            const net = items.reduce((s, i) => s + i.amount, 0n);
            return (
              <li key={day} className="rounded-md border border-border p-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{t("cashflow.day")} <span className="num">{day}</span></span>
                  <span className={`num text-sm font-semibold ${net < 0n ? "text-bad" : "text-ok"}`}>{money(net)}</span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {items.map((i) => (
                    <li key={i.label} className="flex justify-between gap-2"><span className="truncate">{i.label}</span><span className="num">{money(i.amount)}</span></li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm">{t("cashflow.variable")}: <span className="num font-medium">{money(-calendar.variableMonthlyOut)}</span></p>
        {calendar.variableMonthlyIn > 0n && <p className="text-sm">{t("cashflow.variableIn")}: <span className="num font-medium">{money(calendar.variableMonthlyIn)}</span></p>}
      </Card>
    </div>
  );
}

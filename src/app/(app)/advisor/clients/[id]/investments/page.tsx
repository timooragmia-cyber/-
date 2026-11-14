import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatMoney, formatPpmPercent, type MoneyLocale } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { investmentsOverview } from "@/server/invest/service";
import { AccountForm, DeleteButton, DepositForm, HoldingForm, PropertyForm, TxnForm, ValuationForm } from "./forms";

export default async function InvestmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const o = await investmentsOverview(user, id);
  const m = (a: bigint | null | undefined, d: 0 | 2 = 0) => (a === null || a === undefined ? "—" : formatMoney(a, locale, { decimals: d }));
  const pc = (p: number | null | undefined, digits = 2) => (p === null || p === undefined ? "—" : formatPpmPercent(p, locale, digits));
  const a = o.assumptions;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">{t("invest.assumptionsNote", { inflation: pc(a.expectedInflationPpm), selling: pc(a.sellingCostsPpm), years: a.exitHorizonYears })}</p>

      {/* ── Real estate ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("invest.realEstate")}</h2>
        {o.properties.length === 0 && <p className="text-sm text-muted">{t("invest.noProperties")}</p>}
        {o.properties.map(({ property: p, yields: y, scenarios, horizon, exitNow, exitHorizon, exitError }) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{p.label}{p.city ? ` · ${p.city}` : ""}</h3>
                <p className="text-xs text-muted">{t(`invest.p.${p.usage}`)}{p.isOnlyApartment ? ` · ${t("invest.p.isOnlyApartment")}` : ""}</p>
              </div>
              <p className="num text-xl font-bold">{m(p.currentValue)}</p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                [t("invest.p.grossYield"), pc(y.grossYieldPpm)],
                [t("invest.p.netYield"), pc(y.netYieldPpm)],
                [t("invest.p.cashOnEquity"), pc(y.cashOnEquityPpm)],
                [t("invest.p.annualCashflow"), m(y.annualNetCashflow)],
                [t("invest.p.equity"), m(y.equity)],
                [t("invest.p.invested"), m(y.totalInvested)],
                [t("invest.p.unrealizedGain"), m(y.unrealizedGain)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md bg-background p-2"><dt className="text-xs text-muted">{k}</dt><dd className="num font-semibold">{v}</dd></div>
              ))}
            </dl>
            <h4 className="mt-3 text-sm font-medium">{t("invest.p.appreciation", { years: horizon })}</h4>
            <ul className="flex flex-wrap gap-3 text-sm">
              {scenarios.map((s) => <li key={s.ratePpm} className="rounded-md border border-border px-2 py-1">{t("invest.p.perYear", { rate: pc(s.ratePpm, 1) })}: <span className="num font-medium">{m(s.value)}</span></li>)}
            </ul>
            {exitError && <p className="mt-3 text-sm text-bad">{t("invest.p.exitError", { error: exitError })}</p>}
            {(exitNow || exitHorizon) && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[[t("invest.p.exitNow"), exitNow], [t("invest.p.exitHorizon", { years: horizon }), exitHorizon]].filter(([, e]) => e).map(([title, e]) => {
                  const x = e as NonNullable<typeof exitNow>;
                  return (
                    <div key={title as string} className="rounded-md border border-border p-3 text-sm">
                      <h4 className="font-medium">{title as string}</h4>
                      <ul className="mt-1 space-y-0.5">
                        <li className="flex justify-between"><span>{t("invest.p.salePrice")}</span><span className="num">{m(x.salePrice)}</span></li>
                        <li className="flex justify-between"><span>{t("invest.p.sellingCosts")}</span><span className="num">−{m(x.sellingCosts)}</span></li>
                        <li className="flex justify-between"><span>{t("invest.p.bettermentTax")} ({t(`tax.options.${x.route}`)})</span><span className="num">−{m(x.bettermentTax)}</span></li>
                        <li className="flex justify-between"><span>{t("invest.p.mortgagePayoff")}</span><span className="num">−{m(x.mortgagePayoff)}</span></li>
                        <li className="flex justify-between border-t border-border pt-1 font-semibold"><span>{t("invest.p.netProceeds")}</span><span className="num">{m(x.netProceeds)}</span></li>
                        <li className="flex justify-between text-xs text-muted"><span>{t("invest.p.profit")}</span><span className="num">{m(x.profitAfterAll)}</span></li>
                      </ul>
                      {x.warnings.length > 0 && <ul className="mt-1 text-xs text-warn">{x.warnings.map((w) => <li key={w}>⚠ {t.has(`tax.warnings.${w}`) ? t(`tax.warnings.${w}`) : w === "realEstate.cpiProjected" ? t("invest.p.cpiProjected") : w === "realEstate.rulesAssumedUnchanged" ? t("invest.p.rulesAssumed") : w}</li>)}</ul>}
                    </div>
                  );
                })}
              </div>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-brand">{t("invest.edit")}</summary>
              <div className="mt-2"><PropertyForm householdId={id} p={p} prefix={`pr-${p.id}`} /></div>
              <DeleteButton householdId={id} kind="property" id={p.id} label={t("invest.delete")} confirm={t("invest.deleteConfirm")} />
            </details>
          </Card>
        ))}
        <details><summary className="cursor-pointer text-sm font-medium text-brand">{t("invest.addProperty")}</summary><Card className="mt-2"><PropertyForm householdId={id} prefix="new-prop" /></Card></details>
      </section>

      {/* ── Portfolio ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("invest.portfolio")}</h2>
        {o.portfolios.length === 0 && <p className="text-sm text-muted">{t("invest.noPortfolios")}</p>}
        {o.portfolios.map(({ account, state: s, allocation: alloc, unrealizedTax, twr, mwrPpm }) => (
          <Card key={account.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold">{account.name} · {account.institution}</h3>
              <p className="num text-xl font-bold">{m(s.totalValue)}</p>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                [t("invest.a.twr"), twr ? `${pc(twr.cumulativePpm)} ${t("invest.a.cumulative")}${twr.annualizedPpm !== null ? ` · ${pc(twr.annualizedPpm)} ${t("invest.a.annualized")}` : ""}` : "—"],
                [t("invest.a.mwr"), pc(mwrPpm)],
                [t("invest.a.realized"), m(s.realizedGain)],
                [t("invest.a.unrealized"), m(s.unrealizedGain)],
                [t("invest.a.unrealizedTax"), m(unrealizedTax)],
                [t("invest.a.fees"), m(s.totalFees, 2)],
                [t("invest.a.cash"), m(s.cash)],
              ].map(([k, v]) => <div key={k} className="rounded-md bg-background p-2"><dt className="text-xs text-muted">{k}</dt><dd className="num font-semibold">{v}</dd></div>)}
            </dl>
            <p className="mt-1 text-xs text-muted">{t("invest.a.returnsNote")} {t("invest.a.unrealizedTaxNote")}</p>
            {s.unvalued.length > 0 && <p className="text-xs text-warn">{t("invest.a.unvalued", { names: s.unvalued.join(", ") })}</p>}
            {s.errors.length > 0 && <p className="text-xs text-bad">{t("invest.a.errors", { list: s.errors.join(", ") })}</p>}
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium">{t("invest.a.allocation")}</h4>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-muted"><th className="text-start font-medium" /><th className="text-start font-medium">{t("invest.a.actual")}</th><th className="text-start font-medium">{t("invest.a.target")}</th><th className="text-start font-medium">{t("invest.a.drift")}</th></tr></thead>
                  <tbody>
                    {alloc.map((x) => (
                      <tr key={x.assetClass} className="border-t border-border">
                        <td className="py-1">{t(`invest.asset.${x.assetClass}`)}</td>
                        <td className="num py-1">{pc(x.actualPpm, 1)}</td>
                        <td className="num py-1">{pc(x.targetPpm, 1)}</td>
                        <td className={`num py-1 ${x.driftPpm !== null && Math.abs(x.driftPpm) >= 50_000 ? "font-semibold text-warn" : ""}`}>{x.driftPpm === null ? "—" : pc(x.driftPpm, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h4 className="text-sm font-medium">{t("invest.a.holdings")}</h4>
                <ul className="text-sm">
                  {s.holdings.map((h) => (
                    <li key={h.holding.id} className="flex justify-between gap-2 border-t border-border py-1">
                      <span>{h.holding.name} <Badge>{t(`invest.asset.${h.holding.assetClass}`)}</Badge></span>
                      <span className="num">{m(h.value ?? h.costBasis)} <span className="text-xs text-muted">({t("invest.a.costBasis")} {m(h.costBasis)})</span></span>
                    </li>
                  ))}
                </ul>
                <h4 className="mt-2 text-xs font-medium text-muted">{t("invest.a.fees")}</h4>
                <p className="num text-xs">{(["MANAGEMENT", "TRADING", "CUSTODY", "OTHER"] as const).map((k) => `${t(`invest.t.${k}`)} ${m(s.fees[k], 2)}`).join(" · ")}</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <details><summary className="cursor-pointer text-sm text-brand">{t("invest.addTxn")}</summary><div className="mt-2"><TxnForm householdId={id} accountId={account.id} holdings={account.holdings} /></div></details>
              <details><summary className="cursor-pointer text-sm text-brand">{t("invest.addValuations")}</summary><div className="mt-2"><ValuationForm householdId={id} accountId={account.id} holdings={account.holdings} /></div></details>
              <details><summary className="cursor-pointer text-sm text-brand">{t("invest.addHolding")}</summary><div className="mt-2"><HoldingForm householdId={id} accountId={account.id} /></div></details>
              <details><summary className="cursor-pointer text-sm text-brand">{t("invest.edit")}</summary><div className="mt-2"><AccountForm householdId={id} a={account} prefix={`ac-${account.id}`} /></div>
                <DeleteButton householdId={id} kind="account" id={account.id} label={t("invest.delete")} confirm={t("invest.deleteConfirm")} /></details>
            </div>
          </Card>
        ))}
        <details><summary className="cursor-pointer text-sm font-medium text-brand">{t("invest.addAccount")}</summary><Card className="mt-2"><AccountForm householdId={id} prefix="new-acc" /></Card></details>
      </section>

      {/* ── Deposits & money-market ── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("invest.deposits")}</h2>
        {o.deposits.length === 0 ? <p className="text-sm text-muted">{t("invest.noDeposits")}</p> : (
          <Card className="p-0 sm:p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted">{["label", "balance", "annualRate", "fee", "net", "real", "liquidity"].map((k) => <th key={k} className="px-3 py-2 text-start font-medium">{t(`invest.d.${k}`)}</th>)}<th /></tr></thead>
                <tbody>
                  {o.deposits.map(({ deposit: d, net }) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-2">{d.label} <span className="text-xs text-muted">· {t(`invest.d.${d.kind}`)} · {d.institution}</span></td>
                      <td className="num px-3 py-2">{m(d.balance)}</td>
                      <td className="num px-3 py-2">{pc(d.annualRatePpm)}</td>
                      <td className="num px-3 py-2">{pc(d.feePpm)}</td>
                      <td className="num px-3 py-2 font-semibold">{pc(net?.netPpm)}</td>
                      <td className="num px-3 py-2">{pc(net?.realNetPpm)}</td>
                      <td className="px-3 py-2">{d.kind === "MONEY_MARKET_FUND" ? t("invest.d.daily") : `${t("invest.d.atMaturity")}${d.maturityDate ? ` ${d.maturityDate.toISOString().slice(0, 10)}` : ""}`}</td>
                      <td className="px-3 py-2"><DeleteButton householdId={id} kind="deposit" id={d.id} label={t("invest.delete")} confirm={t("invest.deleteConfirm")} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        <details><summary className="cursor-pointer text-sm font-medium text-brand">{t("invest.addDeposit")}</summary><Card className="mt-2"><DepositForm householdId={id} /></Card></details>
      </section>
    </div>
  );
}

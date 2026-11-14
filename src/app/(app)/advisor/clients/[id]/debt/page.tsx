import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatMoney, formatPpmPercent, MoneyError, parseAmount, parsePercentToPpm, type MoneyLocale } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { consolidateSim, debtOverview, optimizeSim, refinanceSim } from "@/server/debt/service";
import * as A from "../actions";

const TRACKS = ["PRIME", "FIXED_UNLINKED", "FIXED_LINKED", "VARIABLE_5_UNLINKED", "VARIABLE_5_LINKED"] as const;
const safe = <T,>(fn: () => T): T | null => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof MoneyError) return null;
    throw e;
  }
};

export default async function DebtPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? (sp[k] as string[])[0] : (sp[k] as string | undefined));
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const m = (a: bigint | null | undefined) => (a === null || a === undefined ? "—" : formatMoney(a, locale, { decimals: 0 }));
  const pc = (p: number | null | undefined, d = 2) => (p === null || p === undefined ? "—" : formatPpmPercent(p, locale, d));
  const o = await debtOverview(user, id);
  const sc = o.scenarios;

  // Refinance simulation (per mortgage, rates from the query string)
  const refiFor = one("refi");
  const refi = refiFor
    ? await (async () => {
        const mort = o.mortgages.find((x) => x.mortgage.id === refiFor);
        if (!mort) return null;
        const rates: Record<string, number> = {};
        for (const tr of mort.mortgage.tracks) {
          const v = one(`rate_${tr.id}`);
          if (v) { const p = safe(() => parsePercentToPpm(v)); if (p !== null) rates[tr.id] = p; }
        }
        const fee = safe(() => parseAmount(one("earlyFee") || "0")) ?? 0n;
        const open = safe(() => parseAmount(one("openingCosts") || "0")) ?? 0n;
        const months = one("newMonths") ? Number(one("newMonths")) : null;
        return refinanceSim(user, id, refiFor, rates, months && months > 0 && months <= 480 ? months : null, { earlyRepaymentFee: fee, openingCosts: open });
      })()
    : null;

  // Mix optimizer
  const optAmount = one("optAmount") ? safe(() => parseAmount(one("optAmount")!)) : null;
  const optMonths = Number(one("optMonths") ?? 0);
  const optRates = Object.fromEntries(TRACKS.map((k) => [k, one(`opt_${k}`) ? safe(() => parsePercentToPpm(one(`opt_${k}`)!)) : null]));
  const opt = optAmount && optMonths > 0 && optMonths <= 480 && TRACKS.every((k) => optRates[k] !== null) ? await optimizeSim(optAmount, optMonths, optRates as Record<(typeof TRACKS)[number], number>) : null;

  // Consolidation
  const consIds = ([] as string[]).concat(sp.cons ?? []);
  const consRate = one("consRate") ? safe(() => parsePercentToPpm(one("consRate")!)) : null;
  const cons = consIds.length && consRate !== null ? await consolidateSim(user, id, consIds, { annualRatePpm: consRate, months: Math.min(480, Math.max(1, Number(one("consMonths") ?? 36))), fee: safe(() => parseAmount(one("consFee") || "0")) ?? 0n }) : null;

  const summaryRow = (label: string, s: (typeof o.mortgages)[number]["base"]) => (
    <tr key={label} className="border-t border-border">
      <td className="py-1 font-medium">{label}</td>
      <td className="num py-1">{m(s.firstPayment)}</td>
      <td className="num py-1">{m(s.maxPayment)}</td>
      <td className="num py-1">{m(s.totalPaid)}</td>
      <td className="num py-1">{m(s.totalInterest)}</td>
      <td className="num py-1">{m(s.totalIndexation)}</td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        {t("debt.boi", { rate: pc(o.boi.ratePpm), prime: pc(o.primeToday), date: o.boi.effectiveFrom })} · <a className="text-brand underline" href={o.boi.sourceUrl} target="_blank" rel="noopener noreferrer">{t("debt.source")}</a>
      </p>

      {/* Mortgages */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("debt.mortgages")}</h2>
        {o.mortgages.length === 0 && <p className="text-sm text-muted">{t("debt.noMortgages")}</p>}
        {o.mortgages.map(({ mortgage: mo, base, stress, falling }) => (
          <Card key={mo.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">{mo.lender}</h3>
              <span className="num text-xl font-bold">{m(base.balance)}</span>
            </div>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-xs text-muted"><th className="text-start font-medium">{t("debt.track.type")}</th><th className="text-start font-medium">{t("debt.track.balance")}</th><th className="text-start font-medium">{t("debt.track.annualRate")}</th><th className="text-start font-medium">{t("debt.track.remainingMonths")}</th><th className="text-start font-medium">{t("debt.track.method")}</th><th /></tr></thead>
              <tbody>
                {mo.tracks.map((tr, i) => (
                  <tr key={tr.id} className="border-t border-border">
                    <td className="py-1">{t(`debt.trackType.${tr.type}`)}</td>
                    <td className="num py-1">{m(tr.balance)}</td>
                    <td className="num py-1">{pc(tr.annualRatePpm)}</td>
                    <td className="num py-1">{tr.remainingMonths}</td>
                    <td className="py-1">{t(`debt.methodName.${tr.method}`)}</td>
                    <td className="py-1">
                      <details>
                        <summary className="cursor-pointer text-xs text-brand">{t("debt.summary.totalPaid")}</summary>
                        <table className="mt-1 text-xs">
                          <tbody>
                            {base.tracks[i]!.rows.filter((r) => r.month % 12 === 0 || r.month === base.tracks[i]!.rows.length).map((r) => (
                              <tr key={r.month}><td className="num pe-2">{Math.ceil(r.month / 12)}</td><td className="num pe-2">{m(r.payment)}</td><td className="num pe-2">{pc(r.ratePpm)}</td><td className="num">{m(r.balance)}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-xs text-muted"><th /><th className="text-start font-medium">{t("debt.summary.firstPayment")}</th><th className="text-start font-medium">{t("debt.summary.maxPayment")}</th><th className="text-start font-medium">{t("debt.summary.totalPaid")}</th><th className="text-start font-medium">{t("debt.summary.totalInterest")}</th><th className="text-start font-medium">{t("debt.summary.totalIndexation")}</th></tr></thead>
              <tbody>{[summaryRow(t("debt.scenario.base"), base), summaryRow(t("debt.scenario.stress"), stress), summaryRow(t("debt.scenario.falling"), falling)]}</tbody>
            </table>
            <p className="mt-1 text-xs text-muted">{t("debt.scenarioNote", { infl: pc(sc.baseInflationPpm), stressPrime: pc(sc.stress.primeDeltaPpm), after: sc.stress.primeChangeAfter, stressInfl: pc(sc.stress.inflationPpm), fallPrime: pc(sc.falling.primeDeltaPpm) })}</p>

            <details className="mt-3" open={refiFor === mo.id}>
              <summary className="cursor-pointer text-sm font-medium text-brand">{t("debt.refinance")}</summary>
              <form method="get" className="mt-2 space-y-2">
                <input type="hidden" name="refi" value={mo.id} />
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {mo.tracks.map((tr) => <label key={tr.id} className="text-xs">{t(`debt.trackType.${tr.type}`)} — {t("debt.newRate")}<Input name={`rate_${tr.id}`} dir="ltr" inputMode="decimal" defaultValue={one(`rate_${tr.id}`) ?? String(tr.annualRatePpm / 10_000)} /></label>)}
                  <label className="text-xs">{t("debt.newMonths")}<Input name="newMonths" dir="ltr" inputMode="numeric" defaultValue={one("newMonths") ?? ""} /></label>
                  <label className="text-xs">{t("debt.earlyFee")}<Input name="earlyFee" dir="ltr" inputMode="decimal" defaultValue={one("earlyFee") ?? "0"} /></label>
                  <label className="text-xs">{t("debt.openingCosts")}<Input name="openingCosts" dir="ltr" inputMode="decimal" defaultValue={one("openingCosts") ?? "0"} /></label>
                </div>
                <Button type="submit" variant="outline">{t("debt.simulate")}</Button>
              </form>
              {refi && refiFor === mo.id && (
                <dl className="mt-3 grid gap-2 sm:grid-cols-3 text-sm">
                  <div className="rounded-md bg-background p-2"><dt className="text-xs text-muted">{t("debt.refi.monthlyChange")}</dt><dd className={`num font-bold ${refi.monthlyChange < 0n ? "text-ok" : "text-bad"}`}>{formatMoney(refi.monthlyChange, locale, { decimals: 0, signDisplay: "exceptZero" })}</dd></div>
                  <div className="rounded-md bg-background p-2"><dt className="text-xs text-muted">{t("debt.refi.totalSaving")}</dt><dd className={`num font-bold ${refi.totalSaving > 0n ? "text-ok" : "text-bad"}`}>{m(refi.totalSaving)}</dd></div>
                  <div className="rounded-md bg-background p-2"><dt className="text-xs text-muted">{t("debt.refi.breakEven")}</dt><dd className="num font-bold">{refi.breakEvenMonths === null ? t("debt.refi.never") : t("debt.refi.months", { n: refi.breakEvenMonths })}</dd></div>
                </dl>
              )}
            </details>
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-brand">{t("debt.addTrack")}</summary>
              <ActionForm action={A.addTrackAction} submitLabel={t("form.add")} className="mt-2">
                <HouseholdField id={id} />
                <input type="hidden" name="mortgageId" value={mo.id} />
                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <label className="text-xs">{t("debt.track.type")}<Select name="type">{TRACKS.map((k) => <option key={k} value={k}>{t(`debt.trackType.${k}`)}</option>)}</Select></label>
                  <label className="text-xs">{t("debt.track.method")}<Select name="method"><option value="SPITZER">{t("debt.methodName.SPITZER")}</option><option value="EQUAL_PRINCIPAL">{t("debt.methodName.EQUAL_PRINCIPAL")}</option></Select></label>
                  <label className="text-xs">{t("debt.track.balance")}<Input name="balance" dir="ltr" inputMode="decimal" required /></label>
                  <label className="text-xs">{t("debt.track.remainingMonths")}<Input name="remainingMonths" dir="ltr" inputMode="numeric" required /></label>
                  <label className="text-xs">{t("debt.track.annualRate")}<Input name="annualRate" dir="ltr" inputMode="decimal" required /></label>
                  <label className="text-xs">{t("debt.track.monthsToReset")}<Input name="monthsToReset" dir="ltr" inputMode="numeric" /></label>
                </div>
              </ActionForm>
            </details>
          </Card>
        ))}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("debt.addMortgage")}</summary>
          <Card className="mt-2">
            <ActionForm action={A.saveMortgageAction} submitLabel={t("form.add")} className="flex flex-wrap items-end gap-2 space-y-0">
              <HouseholdField id={id} />
              <label className="text-xs">{t("debt.lender")}<Input name="lender" required /></label>
              <label className="text-xs">{t("debt.asOf")}<Input name="asOf" type="date" dir="ltr" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
            </ActionForm>
          </Card>
        </details>
      </section>

      {/* Optimizer */}
      <Card>
        <CardTitle>{t("debt.optimizer")}</CardTitle>
        <form method="get" className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            <label className="text-xs">{t("debt.amount")}<Input name="optAmount" dir="ltr" inputMode="decimal" defaultValue={one("optAmount") ?? ""} /></label>
            <label className="text-xs">{t("debt.months")}<Input name="optMonths" dir="ltr" inputMode="numeric" defaultValue={one("optMonths") ?? "300"} /></label>
            {TRACKS.map((k) => <label key={k} className="text-xs">{t(`debt.trackType.${k}`)} (%)<Input name={`opt_${k}`} dir="ltr" inputMode="decimal" defaultValue={one(`opt_${k}`) ?? (k === "PRIME" ? String((o.primeToday - 5_000) / 10_000) : "")} /></label>)}
          </div>
          <p className="text-xs text-muted">{t("debt.ratesToday")}</p>
          <Button type="submit" variant="outline">{t("debt.simulate")}</Button>
        </form>
        {opt && (
          <div className="mt-3">
            <p className="text-xs text-muted">{t("debt.constraints", { fixed: pc(opt.constraints.minFixedPpm, 0), variable: pc(opt.constraints.maxVariablePpm, 0) })}</p>
            {!opt.result ? <p className="text-sm text-bad">{t("debt.opt.none")}</p> : (
              <>
                <table className="mt-2 w-full text-sm">
                  <thead><tr className="text-xs text-muted"><th /><th className="text-start font-medium">{TRACKS.slice(0, 4).map((k) => t(`debt.trackType.${k}`)).join(" / ")}</th><th className="text-start font-medium">{t("debt.opt.firstPayment")}</th><th className="text-start font-medium">{t("debt.opt.baseTotal")}</th><th className="text-start font-medium">{t("debt.opt.stressMax")}</th><th className="text-start font-medium">{t("debt.opt.fallingTotal")}</th></tr></thead>
                  <tbody>
                    {(["cheapest", "safest", "balanced"] as const).map((k) => {
                      const r = opt.result![k];
                      return (
                        <tr key={k} className="border-t border-border">
                          <td className="py-1 font-medium">{t(`debt.opt.${k}`)}</td>
                          <td className="num py-1">{TRACKS.slice(0, 4).map((tt) => pc(r.mix[tt] ?? 0, 0)).join(" / ")}</td>
                          <td className="num py-1">{m(r.firstPayment)}</td>
                          <td className="num py-1">{m(r.baseTotal)}</td>
                          <td className="num py-1">{m(r.stressMax)}</td>
                          <td className="num py-1">{m(r.fallingTotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="text-xs text-muted">{t("debt.opt.evaluated", { n: opt.result.evaluated })}</p>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Debts */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("debt.ranking")}</h2>
        {o.threshold === null && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{t("debt.thresholdMissing")}</p>}
        {o.ranked.length === 0 ? <p className="text-sm text-muted">{t("debt.noDebts")}</p> : (
          <Card className="p-0 sm:p-0">
            <form method="get">
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted"><th className="px-3 py-2" /><th className="px-3 py-2 text-start font-medium">{t("debt.loan.label")}</th><th className="px-3 py-2 text-start font-medium">{t("debt.loan.balance")}</th><th className="px-3 py-2 text-start font-medium">{t("debt.loan.annualRate")}</th><th className="px-3 py-2 text-start font-medium">{t("debt.annualInterest")}</th><th className="px-3 py-2 text-start font-medium">{t("debt.loan.monthlyPayment")}</th></tr></thead>
                <tbody>
                  {o.ranked.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-3 py-2"><input type="checkbox" name="cons" value={d.id} defaultChecked={consIds.includes(d.id)} aria-label={t("debt.pick")} /></td>
                      <td className="px-3 py-2">{d.label} <span className="text-xs text-muted">· {t(`debt.loanKind.${d.kind}`)}</span> {d.expensive && <Badge tone="bad">{t("debt.expensive")}</Badge>}</td>
                      <td className="num px-3 py-2">{m(d.balance)}</td>
                      <td className="num px-3 py-2 font-semibold">{pc(d.annualRatePpm)}</td>
                      <td className="num px-3 py-2">{m(d.annualInterest)}</td>
                      <td className="num px-3 py-2">{m(d.monthlyPayment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-end gap-2 border-t border-border p-3">
                <span className="text-sm font-medium">{t("debt.consolidation")}</span>
                <label className="text-xs">{t("debt.consRate")}<Input name="consRate" dir="ltr" inputMode="decimal" defaultValue={one("consRate") ?? ""} className="w-28" /></label>
                <label className="text-xs">{t("debt.consMonths")}<Input name="consMonths" dir="ltr" inputMode="numeric" defaultValue={one("consMonths") ?? "36"} className="w-24" /></label>
                <label className="text-xs">{t("debt.consFee")}<Input name="consFee" dir="ltr" inputMode="decimal" defaultValue={one("consFee") ?? "0"} className="w-24" /></label>
                <Button type="submit" variant="outline">{t("debt.simulate")}</Button>
              </div>
            </form>
            {cons && (
              <dl className="grid gap-2 border-t border-border p-3 text-sm sm:grid-cols-3">
                {(["balance", "beforeMonthly", "afterMonthly", "beforeTotal", "afterTotal", "totalChange"] as const).map((k) => (
                  <div key={k} className="rounded-md bg-background p-2"><dt className="text-xs text-muted">{t(`debt.cons.${k}`)}</dt><dd className={`num font-bold ${k === "totalChange" ? (cons.totalChange < 0n ? "text-ok" : "text-bad") : ""}`}>{k === "totalChange" ? formatMoney(cons[k], locale, { decimals: 0, signDisplay: "exceptZero" }) : m(cons[k])}</dd></div>
                ))}
              </dl>
            )}
          </Card>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("debt.addLoan")}</summary>
          <Card className="mt-2">
            <ActionForm action={A.saveLoanAction} submitLabel={t("form.add")}>
              <HouseholdField id={id} />
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
                <label className="text-xs">{t("debt.loan.kind")}<Select name="kind">{(["CONSUMER_LOAN", "CAR_LOAN", "CARD_CREDIT", "OTHER"] as const).map((k) => <option key={k} value={k}>{t(`debt.loanKind.${k}`)}</option>)}</Select></label>
                <label className="text-xs">{t("debt.lender")}<Input name="lender" required /></label>
                <label className="text-xs">{t("debt.loan.label")}<Input name="label" required /></label>
                <label className="text-xs">{t("debt.loan.balance")}<Input name="balance" dir="ltr" inputMode="decimal" required /></label>
                <label className="text-xs">{t("debt.loan.annualRate")}<Input name="annualRate" dir="ltr" inputMode="decimal" required /></label>
                <label className="text-xs">{t("debt.loan.monthlyPayment")}<Input name="monthlyPayment" dir="ltr" inputMode="decimal" /></label>
                <label className="text-xs">{t("debt.loan.remainingMonths")}<Input name="remainingMonths" dir="ltr" inputMode="numeric" /></label>
              </div>
            </ActionForm>
          </Card>
        </details>
      </section>
      <p className="text-xs text-muted">{t("debt.disclaimer")}</p>
    </div>
  );
}

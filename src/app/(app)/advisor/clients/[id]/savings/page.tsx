import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { FeeSimulator } from "@/components/savings/fee-simulator";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/select";
import { formatMoney, formatPpmPercent, type MoneyLocale } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { savingsOverview } from "@/server/savings/service";
import { deleteProductAction, importProductsAction, saveAssumptionsAction } from "../actions";
import { ProductForm } from "./product-form";

const tone = { ABOVE_CEILING: "bad", ABOVE_BENCHMARK: "warn", OK: "ok", NO_BENCHMARK: "neutral" } as const;

export default async function SavingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ product?: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const o = await savingsOverview(user, id);
  const money = (a: bigint) => formatMoney(a, locale, { decimals: 0 });
  const pct = (p: number | null) => (p === null ? "—" : formatPpmPercent(p, locale, 3));
  const a = o.assumptions;

  // Simulator: chosen product, else the first one with savings potential, else the first.
  const simProduct = o.products.find((p) => p.product.id === sp.product) ?? o.products.find((p) => p.comparison) ?? o.products[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [t("savings.totalBalance"), money(o.totals.balance), ""],
          [t("savings.monthlyDeposits"), money(o.totals.monthlyDeposits), ""],
          [t("savings.potential"), money(o.totals.savingsPotential), "text-ok"],
          [t("savings.flagged", { count: o.totals.flagged }), String(o.totals.flagged), o.totals.flagged ? "text-warn" : ""],
        ].map(([label, value, cls]) => (
          <Card key={label} className="p-4 sm:p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className={`num text-start text-2xl font-bold ${cls}`}>{value}</p>
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">{t("savings.potentialHelp")} {t("savings.verifyNote")}</p>

      {o.products.length === 0 && <Card><p className="text-muted">{t("savings.none")}</p></Card>}
      <div className="grid gap-4 lg:grid-cols-2">
        {o.products.map((v) => (
          <Card key={v.product.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{t(`productType.${v.product.productType}`)} — {v.product.provider}</h3>
                <p className="text-xs text-muted">
                  {v.product.person?.firstName ?? "—"}{v.product.track ? ` · ${v.product.track}` : ""} · {v.product.isActive ? t("savings.active") : t("savings.inactive")}
                </p>
              </div>
              <p className="num text-xl font-bold">{money(v.product.balance)}</p>
            </div>
            <p className="mt-1 text-xs text-muted">{t("acct.asOf")} <span className="num">{v.product.balanceAsOf.toISOString().slice(0, 10)}</span> · {t("savings.deposit")}: <span className="num">{money(v.deposit)}</span></p>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-xs text-muted"><th className="text-start font-medium">{t("savings.fees")}</th><th className="text-start font-medium">%</th><th className="text-start font-medium">{t("savings.benchmark")}</th><th className="text-start font-medium">{t("savings.ceiling")}</th><th /></tr></thead>
              <tbody>
                {v.flags.map((f) => (
                  <tr key={f.feeBase} className="border-t border-border">
                    <td className="py-1">{f.feeBase === "DEPOSITS" ? t("sim.fromDeposit") : t("sim.fromBalance")}</td>
                    <td className="num py-1 font-medium">{pct(f.actualPpm)}</td>
                    <td className="num py-1">{pct(f.benchmarkPpm)}</td>
                    <td className="num py-1">{pct(f.ceilingPpm)}</td>
                    <td className="py-1"><Badge tone={tone[f.level]}>{t(`feeLevel.${f.level}`)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {v.comparison && (
              <div className="mt-3 rounded-md bg-ok-bg p-3 text-sm text-ok">
                <p className="font-semibold">{t("savings.gain")}: <span className="num">{money(v.comparison.gainAtHorizon)}</span></p>
                <p>{t("savings.feesSaved")}: <span className="num">{money(v.comparison.feesSaved)}</span> · {t("savings.perYear")}: <span className="num">{money(v.comparison.gainPerYear)}</span></p>
                <p className="text-xs">{v.horizonFromBirthYear ? t("savings.horizon", { years: Math.round(v.months / 12) }) : t("savings.horizonFallback", { years: o.fallbackHorizonYears })} · {t("scenario.base")} {pct(a.returns.base)}</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a href={`?product=${v.product.id}#simulator`} className="text-sm font-medium text-brand underline">{t("savings.simulate")}</a>
              <details className="w-full">
                <summary className="cursor-pointer text-sm text-brand">{t("savings.edit")}</summary>
                <div className="mt-3"><ProductForm householdId={id} members={o.members} product={v.product} idPrefix={`p-${v.product.id}`} /></div>
                <ActionForm action={deleteProductAction} submitLabel={t("form.delete")} variant="ghost" confirm={t("savings.deleteConfirm")} className="mt-2">
                  <HouseholdField id={id} />
                  <input type="hidden" name="productId" value={v.product.id} />
                </ActionForm>
              </details>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("savings.add")}</CardTitle>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand">{t("savings.add")}</summary>
            <div className="mt-3"><ProductForm householdId={id} members={o.members} idPrefix="new" /></div>
          </details>
        </Card>
        <Card>
          <CardTitle>{t("savings.importTitle")}</CardTitle>
          <p className="mb-3 text-sm text-muted">{t("savings.importHelp")}</p>
          <a href="/api/savings-template" className="mb-3 inline-block text-sm font-medium text-brand underline">{t("savings.template")}</a>
          <ActionForm action={importProductsAction} submitLabel={t("upload.submit")}>
            <HouseholdField id={id} />
            <Input name="file" type="file" accept=".xlsx" aria-label={t("upload.file")} required />
          </ActionForm>
        </Card>
      </div>

      <Card>
        <CardTitle>{t("retirement.title")}</CardTitle>
        <p className="mb-3 text-xs text-muted">{t("retirement.note")}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {o.byPerson.map(({ person, months, scenarios }) => (
            <div key={person.id} className="rounded-md border border-border p-3">
              <h3 className="font-semibold">{person.firstName} {person.lastName}</h3>
              {!scenarios ? (
                <p className="text-sm text-warn">{t("retirement.missingBirthYear")}</p>
              ) : (
                <>
                  <p className="text-xs text-muted">{t("retirement.yearsLeft", { years: Math.round((months ?? 0) / 12) })}</p>
                  <table className="mt-2 w-full text-sm">
                    <thead><tr className="text-xs text-muted"><th className="text-start font-medium" /><th className="text-start font-medium">{t("retirement.capital")}</th><th className="text-start font-medium">{t("retirement.monthlyPension")}</th><th className="text-start font-medium">{t("retirement.lumpSum")}</th></tr></thead>
                    <tbody>
                      {scenarios.map((s) => (
                        <tr key={s.scenario} className={`border-t border-border ${s.scenario === "base" ? "font-semibold" : ""}`}>
                          <td className="py-1">{t(`scenario.${s.scenario}`)} <span className="num text-xs text-muted">({pct(a.returns[s.scenario])})</span></td>
                          <td className="num py-1">{money(s.annuityCapital)}</td>
                          <td className="num py-1">{money(s.monthlyPension)}</td>
                          <td className="num py-1">{money(s.lumpSum)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("retirement.assumptions")}{!o.assumptionsFromHousehold && ` — ${t("retirement.usingDefaults")}`}</summary>
          <ActionForm action={saveAssumptionsAction} submitLabel={t("retirement.save")} resetOnSuccess={false} className="mt-3">
            <HouseholdField id={id} />
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Field label={t("retirement.age")} htmlFor="ra-age"><Input id="ra-age" name="retirementAge" dir="ltr" inputMode="numeric" defaultValue={a.retirementAge} /></Field>
              {(["conservative", "base", "optimistic"] as const).map((s) => (
                <Field key={s} label={`${t(`scenario.${s}`)} (%)`} htmlFor={`ra-${s}`}><Input id={`ra-${s}`} name={s} dir="ltr" inputMode="decimal" defaultValue={a.returns[s] / 10_000} /></Field>
              ))}
              <Field label={t("retirement.depositGrowth")} htmlFor="ra-growth"><Input id="ra-growth" name="depositGrowth" dir="ltr" inputMode="decimal" defaultValue={a.depositGrowthPpm / 10_000} /></Field>
              <Field label={t("retirement.annuityFactor")} htmlFor="ra-factor"><Input id="ra-factor" name="annuityFactor" dir="ltr" inputMode="decimal" defaultValue={(a.annuityFactorMilli / 1000).toString()} /></Field>
            </div>
          </ActionForm>
        </details>
      </Card>

      {simProduct && (
        <Card id="simulator">
          <CardTitle>{t("sim.title")} — {t(`productType.${simProduct.product.productType}`)} {simProduct.product.provider}</CardTitle>
          <FeeSimulator
            key={simProduct.product.id}
            locale={locale}
            defaults={{
              balance: simProduct.product.balance.toString(),
              deposit: (simProduct.product.isActive ? simProduct.deposit : 0n).toString(),
              years: Math.max(1, Math.round(simProduct.months / 12)),
              feeDep: simProduct.product.feeDepositsPpm,
              feeAcc: simProduct.product.feeAccumulationPpm,
              targetDep: simProduct.target.dep,
              targetAcc: simProduct.target.acc,
              returns: a.returns,
              depositGrowthPpm: a.depositGrowthPpm,
            }}
          />
        </Card>
      )}
    </div>
  );
}

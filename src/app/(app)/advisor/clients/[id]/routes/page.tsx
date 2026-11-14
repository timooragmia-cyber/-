import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/select";
import { formatMoney, formatPpmPercent, MoneyError, parseAmount, type MoneyLocale } from "@/lib/money";
import { RuleUnavailableError } from "@/lib/tax/rules";
import { requireAdvisor } from "@/server/auth/dal";
import { routesComparison } from "@/server/invest/service";

export default async function RoutesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ amount?: string; years?: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const m = (a: bigint) => formatMoney(a, locale, { decimals: 0 });
  const pc = (p: number) => formatPpmPercent(p, locale, 2);

  let amount = 10_000_000n; // ₪100,000 default
  try {
    if (sp.amount) amount = parseAmount(sp.amount);
  } catch (e) {
    if (!(e instanceof MoneyError)) throw e;
  }
  const years = Math.min(40, Math.max(1, Number(sp.years ?? 5) || 5));

  let data: Awaited<ReturnType<typeof routesComparison>> | null = null;
  let ruleError: string | null = null;
  try {
    data = await routesComparison(user, id, amount, years * 12);
  } catch (e) {
    if (e instanceof RuleUnavailableError) ruleError = t("tax.errors.rule", { ruleKey: e.ruleKey, on: e.on, reason: t(`tax.errors.reasons.${e.reason}`) });
    else throw e;
  }
  const tone = { OK: "ok", MISSING: "bad", UNKNOWN: "warn" } as const;
  const riskTone = { VERY_LOW: "ok", LOW: "ok", MEDIUM: "warn", HIGH: "bad" } as const;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("routes.title")}</h2>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <Field label={t("routes.amount")} htmlFor="r-amount"><Input id="r-amount" name="amount" dir="ltr" inputMode="decimal" defaultValue={String(amount / 100n)} className="w-40" /></Field>
        <Field label={t("routes.years")} htmlFor="r-years"><Input id="r-years" name="years" dir="ltr" inputMode="numeric" defaultValue={years} className="w-24" /></Field>
        <Button type="submit">{t("routes.compare")}</Button>
      </form>

      {ruleError && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{ruleError}</p>}

      {data && (
        <>
          <Card>
            <CardTitle>{t("routes.prereqTitle")}</CardTitle>
            <p className="mb-2 text-sm text-muted">{t("routes.prereqHelp")}</p>
            <ol className="space-y-1 text-sm">
              {data.prerequisites.items.map((i) => (
                <li key={i.key} className="flex flex-wrap items-center gap-2">
                  <Badge tone={tone[i.status]}>{t(`routes.status.${i.status}`)}</Badge>
                  <span>{t(`routes.prereq.${i.key}`, { months: String(i.detail?.months ?? 0), target: String(i.detail?.target ?? 0), count: String(i.detail?.count ?? 0) })}</span>
                </li>
              ))}
            </ol>
            {data.prerequisites.emergencyGap > 0n && <p className="mt-2 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{t("routes.emergencyGap", { amount: m(data.prerequisites.emergencyGap) })}</p>}
          </Card>

          <Card className="p-0 sm:p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    {["route", "finalNet", "tax", "netAnnual", "realAnnual", "risk", "liquidity", "fit"].map((k) => <th key={k} className="px-3 py-2 text-start font-medium">{t(`routes.${k}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.key} className={`border-t border-border ${r.suitable ? "" : "text-muted"}`}>
                      <td className="px-3 py-2 font-medium">
                        {t.has(`routes.names.${r.key}`) ? t(`routes.names.${r.key}`) : r.key}
                        {r.note && <div className="text-xs text-warn">{t(`routes.notes.${r.note}`)}</div>}
                      </td>
                      <td className="num px-3 py-2 font-semibold">{m(r.finalNet)}</td>
                      <td className="num px-3 py-2">{m(r.tax)}</td>
                      <td className="num px-3 py-2">{pc(r.netAnnualPpm)}</td>
                      <td className="num px-3 py-2">{pc(r.realNetAnnualPpm)}</td>
                      <td className="px-3 py-2"><Badge tone={riskTone[r.risk]}>{t(`routes.riskLevels.${r.risk}`)}</Badge></td>
                      <td className="px-3 py-2">{t(`routes.liq.${r.liquidity}`)}</td>
                      <td className="px-3 py-2">{data!.household.riskTolerance === null ? t("routes.noTolerance") : r.suitable ? `✓ ${t("routes.suitable")}` : t("routes.notSuitable")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs text-muted">{t("routes.assumptions", { inflation: pc(data.assumptions.expectedInflationPpm) })}</p>
          <p className="rounded-md bg-warn-bg px-3 py-2 text-xs text-warn">{t("routes.notAdvice")} {t("tax.verifyNote")}</p>
          <ul className="flex flex-wrap gap-2 text-xs text-muted">
            {data.rulesUsed.map((r) => <li key={r.id} className="num" dir="ltr">{r.ruleKey} @ {r.effectiveFrom} ({r.status})</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

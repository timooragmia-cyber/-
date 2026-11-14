import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPpmPercent, type MoneyLocale } from "@/lib/money";
import type { CalcResult, Step } from "@/lib/tax/common";

const MONEY_KEYS = new Set(["from", "to", "ceiling", "sale", "cost", "saleCosts", "price", "threshold", "above", "capitalAbove", "expenses", "depreciation", "rent"]);

function fmtValues(values: Step["values"], locale: MoneyLocale, t: (k: string) => string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (MONEY_KEYS.has(k)) out[k] = formatMoney(BigInt(v), locale, { decimals: 0 });
    else if (/rate$|Rate$|Ppm$/.test(k) && typeof v === "number") out[k] = formatPpmPercent(v, locale, 3);
    else if (k === "cpiStart" || k === "cpiEnd") out[k] = (Number(v) / 1000).toFixed(3);
    else if (k === "fxBuy" || k === "fxSell") out[k] = (Number(v) / 10_000).toFixed(4);
    else if (k === "basis") out[k] = t(`tax.options.${v === "REAL" ? "CPI" : "NONE"}`);
    else out[k] = v;
  }
  return out;
}

function fmtResult(key: string, v: unknown, locale: MoneyLocale, t: (k: string, vals?: Record<string, string>) => string): string {
  if (typeof v === "bigint") return formatMoney(v, locale);
  if (typeof v === "number" && /Ppm$/.test(key)) return formatPpmPercent(v, locale, 3);
  if (typeof v === "boolean") return t(v ? "common.yes" : "common.no");
  if (v === null) return "—";
  if (key === "cheapest") return t(`tax.routes.${String(v)}`);
  return String(v);
}

/** Inputs → rules used (version, status, source) → steps → result → warnings. */
export async function ResultView({ result }: { result: CalcResult<Record<string, unknown>> }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const tone = (s: string) => (s === "VERIFIED" ? "ok" : s === "MISSING" ? "bad" : "warn") as "ok" | "bad" | "warn";
  const resultEntries = Object.entries(result.result).filter(([k]) => k !== "routes");
  const routes = (result.result as { routes?: { route: string; taxableAnnual: bigint; taxAnnual: bigint }[] }).routes;
  const cheapest = (result.result as { cheapest?: string }).cheapest;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{t("tax.result")}</CardTitle>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {resultEntries.map(([k, v]) => (
            <div key={k} className={`rounded-md p-3 ${/tax$|Tax$/.test(k) && k !== "fundTax" && k !== "depositTax" ? "bg-warn-bg" : "bg-background"}`}>
              <dt className="text-xs text-muted">{t.has(`tax.results.${k}`) ? t(`tax.results.${k}`) : k}</dt>
              <dd className="num text-start text-xl font-bold">{fmtResult(k, v, locale, t)}</dd>
            </div>
          ))}
        </dl>
        {routes && (
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-xs text-muted"><th className="text-start font-medium">{t("tax.results.routes")}</th><th className="text-start font-medium">{t("tax.results.taxableAnnual")}</th><th className="text-start font-medium">{t("tax.results.annualTax")}</th></tr></thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.route} className={`border-t border-border ${r.route === cheapest ? "font-semibold text-ok" : ""}`}>
                  <td className="py-1">{t(`tax.routes.${r.route}`)} {r.route === cheapest && "✓"}</td>
                  <td className="num py-1">{formatMoney(r.taxableAnnual, locale)}</td>
                  <td className="num py-1">{formatMoney(r.taxAnnual, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-xs text-warn">{t("tax.verifyNote")}</p>
      </Card>

      {result.warnings.length > 0 && (
        <Card>
          <CardTitle>{t("tax.warningsTitle")}</CardTitle>
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {result.warnings.map((w) => <li key={w}>{t.has(`tax.warnings.${w}`) ? t(`tax.warnings.${w}`) : w}</li>)}
          </ul>
        </Card>
      )}

      <Card>
        <CardTitle>{t("tax.stepsTitle")}</CardTitle>
        <ol className="space-y-1 text-sm">
          {result.steps.map((s, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-border py-1 last:border-0">
              <span>{t.has(`tax.steps.${s.key}`) ? t(`tax.steps.${s.key}`, fmtValues(s.values, locale, t)) : s.key}</span>
              {s.amount !== undefined && <span className="num font-medium">{formatMoney(s.amount, locale)}</span>}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted num" dir="ltr">{result.calculator} · {result.version}</p>
      </Card>

      <Card>
        <CardTitle>{t("tax.rulesUsed")}</CardTitle>
        <ul className="space-y-1 text-sm">
          {result.rulesUsed.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              <span className="num font-mono text-xs" dir="ltr">{r.ruleKey}</span>
              <span className="text-xs text-muted">{t("tax.ruleFrom", { date: r.effectiveFrom })}</span>
              <Badge tone={tone(r.status)}>{t(`enums.VerificationStatus.${r.status}`)}</Badge>
              {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand underline">{t("tax.source")}</a>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

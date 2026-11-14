"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { compareFees, FEE_SIM_VERSION } from "@/lib/savings/fee-simulator";
import { formatMoney, MoneyError, parseAmount, parsePercentToPpm, toDisplayNumber, type MoneyLocale } from "@/lib/money";

export type SimDefaults = {
  balance: string; // agorot as decimal string
  deposit: string;
  years: number;
  feeDep: number; // ppm
  feeAcc: number;
  targetDep: number;
  targetAcc: number;
  returns: { conservative: number; base: number; optimistic: number };
  depositGrowthPpm: number;
};

const shekelsText = (agorot: string) => {
  const a = BigInt(agorot);
  return `${a / 100n}${a % 100n ? "." + (a % 100n).toString().padStart(2, "0") : ""}`;
};
const pctText = (ppm: number) => (ppm / 10_000).toString();

/**
 * Fee-savings simulator. Runs the same pure, integer-only engine as the server
 * (src/lib/savings/fee-simulator.ts), so the screen and any report agree to the agora.
 */
export function FeeSimulator({ defaults, locale }: { defaults: SimDefaults; locale: MoneyLocale }) {
  const t = useTranslations();
  const [v, setV] = useState({
    balance: shekelsText(defaults.balance),
    deposit: shekelsText(defaults.deposit),
    years: String(defaults.years),
    scenario: "base" as "conservative" | "base" | "optimistic",
    feeDep: pctText(defaults.feeDep),
    feeAcc: pctText(defaults.feeAcc),
    targetDep: pctText(defaults.targetDep),
    targetAcc: pctText(defaults.targetAcc),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });

  const result = useMemo(() => {
    try {
      const years = Number(v.years);
      if (!Number.isInteger(years) || years < 1 || years > 60) return null;
      return compareFees(
        { startBalance: parseAmount(v.balance || "0"), monthlyDeposit: parseAmount(v.deposit || "0"), months: years * 12, annualReturnPpm: defaults.returns[v.scenario], depositGrowthPpm: defaults.depositGrowthPpm },
        { dep: parsePercentToPpm(v.feeDep || "0"), acc: parsePercentToPpm(v.feeAcc || "0") },
        { dep: parsePercentToPpm(v.targetDep || "0"), acc: parsePercentToPpm(v.targetAcc || "0") },
      );
    } catch (e) {
      if (e instanceof MoneyError || e instanceof Error) return null;
      throw e;
    }
  }, [v, defaults]);

  const money = (a: bigint) => formatMoney(a, locale, { decimals: 0 });
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-IL-u-nu-latn" : "he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0, notation: "compact" });
  const chart = result ? result.current.years.map((y, i) => ({ year: y.year, current: toDisplayNumber(y.endBalance), target: toDisplayNumber(result.target.years[i]!.endBalance) })) : [];
  const input = "min-h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-base num";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm"><span className="font-medium">{t("sim.balance")}</span><input className={input} dir="ltr" inputMode="decimal" value={v.balance} onChange={set("balance")} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">{t("sim.deposit")}</span><input className={input} dir="ltr" inputMode="decimal" value={v.deposit} onChange={set("deposit")} /></label>
        <label className="space-y-1 text-sm"><span className="font-medium">{t("sim.years")}</span><input className={input} dir="ltr" inputMode="numeric" value={v.years} onChange={set("years")} /></label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">{t("sim.scenario")}</span>
          <select className={input} value={v.scenario} onChange={set("scenario")}>
            {(["conservative", "base", "optimistic"] as const).map((s) => <option key={s} value={s}>{t(`scenario.${s}`)} ({(defaults.returns[s] / 10_000).toString()}%)</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t("sim.current")}</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">{t("sim.fromDeposit")}<input className={input} dir="ltr" inputMode="decimal" value={v.feeDep} onChange={set("feeDep")} /></label>
            <label className="text-xs">{t("sim.fromBalance")}<input className={input} dir="ltr" inputMode="decimal" value={v.feeAcc} onChange={set("feeAcc")} /></label>
          </div>
        </fieldset>
        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t("sim.target")}</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">{t("sim.fromDeposit")}<input className={input} dir="ltr" inputMode="decimal" value={v.targetDep} onChange={set("targetDep")} /></label>
            <label className="text-xs">{t("sim.fromBalance")}<input className={input} dir="ltr" inputMode="decimal" value={v.targetAcc} onChange={set("targetAcc")} /></label>
          </div>
        </fieldset>
      </div>

      {!result ? (
        <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{t("sim.invalid")}</p>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-3" aria-live="polite">
            {[
              [t("sim.resultGain"), result.gainAtHorizon],
              [t("sim.resultFees"), result.feesSaved],
              [t("sim.resultPerYear"), result.gainPerYear],
            ].map(([label, val]) => (
              <div key={label as string} className="rounded-md bg-ok-bg p-3">
                <dt className="text-xs text-ok">{label as string}</dt>
                <dd className="num text-start text-2xl font-bold text-ok">{money(val as bigint)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted">
            {t("sim.finalCurrent")}: <span className="num">{money(result.current.finalBalance)}</span> · {t("sim.finalTarget")}: <span className="num">{money(result.target.finalBalance)}</span>
          </p>
          <figure>
            <figcaption className="mb-1 flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-5 bg-viz-2" />{t("sim.chartCurrent")}</span>
              <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-5 bg-viz-1" />{t("sim.chartTarget")}</span>
            </figcaption>
            <div dir="ltr" className="h-56 w-full">
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: "var(--viz-axis)", fontSize: 12 }} tickLine={false} />
                  <YAxis tickFormatter={(x: number) => nf.format(x)} tick={{ fill: "var(--viz-axis)", fontSize: 12 }} width={72} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(x, name) => [nf.format(Number(x)), name === "current" ? t("sim.chartCurrent") : t("sim.chartTarget")]} labelFormatter={(l) => `${t("sim.year")} ${l}`} />
                  <Line isAnimationActive={false} dataKey="current" stroke="var(--viz-series-2)" strokeWidth={2} dot={false} />
                  <Line isAnimationActive={false} dataKey="target" stroke="var(--viz-series-1)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </figure>
          <p className="text-xs text-muted">{t("sim.method", { version: FEE_SIM_VERSION })}</p>
        </>
      )}
    </div>
  );
}

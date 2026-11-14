"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Display-only numbers (shekels) — money math happens on the server in bigint agorot. */
export type TrendPoint = { period: string; income: number; expenses: number; surplus: number; savingsRate: number | null };

type Labels = {
  income: string;
  expenses: string;
  surplus: string;
  deficit: string;
  savingsRate: string;
  ranges: { 3: string; 6: string; 12: string };
  period: string;
  table: string;
};

const fmt = (locale: string) => new Intl.NumberFormat(locale === "ar" ? "ar-IL-u-nu-latn" : "he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);

/**
 * Two charts, one y-axis each (no dual axes):
 *  1. Income vs expenses — 2 lines (blue / orange), legend + direct end labels.
 *  2. Monthly surplus — diverging bars around zero (blue = surplus, red = deficit),
 *     sign also shown in the tooltip and table, never color alone.
 * Time runs left→right in both languages (axes are LTR inside the RTL page).
 */
export function TrendCharts({ data, locale, labels, defaultRange = 6 }: { data: TrendPoint[]; locale: string; labels: Labels; defaultRange?: 3 | 6 | 12 }) {
  const [range, setRange] = useState<3 | 6 | 12>(defaultRange);
  const rows = data.slice(-range);
  const money = fmt(locale);
  if (rows.length === 0) return null;

  const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, direction: locale === "ar" || locale === "he" ? ("rtl" as const) : ("ltr" as const) };

  return (
    <div className="space-y-4">
      <div role="group" aria-label={labels.period} className="flex gap-1">
        {([3, 6, 12] as const).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className={`rounded-md border px-3 py-1 text-sm ${range === r ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface"}`}
          >
            {labels.ranges[r]}
          </button>
        ))}
      </div>

      <figure>
        <figcaption className="mb-1 flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-5 bg-viz-1" />{labels.income}</span>
          <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-5 bg-viz-2" />{labels.expenses}</span>
        </figcaption>
        <div dir="ltr" className="h-56 w-full">
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: "var(--viz-axis)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--viz-grid)" }} />
              <YAxis tickFormatter={(v: number) => money.format(v)} tick={{ fill: "var(--viz-axis)", fontSize: 12 }} width={84} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [money.format(Number(v)), name === "income" ? labels.income : labels.expenses]} />
              <Line isAnimationActive={false} type="monotone" dataKey="income" stroke="var(--viz-series-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--viz-surface)" }} activeDot={{ r: 6 }} />
              <Line isAnimationActive={false} type="monotone" dataKey="expenses" stroke="var(--viz-series-2)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--viz-surface)" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure>
        <figcaption className="mb-1 flex flex-wrap items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-viz-1" />{labels.surplus}</span>
          <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-viz-neg" />{labels.deficit}</span>
        </figcaption>
        <div dir="ltr" className="h-44 w-full">
          <ResponsiveContainer>
            <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="period" tick={{ fill: "var(--viz-axis)", fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v: number) => money.format(v)} tick={{ fill: "var(--viz-axis)", fontSize: 12 }} width={84} tickLine={false} axisLine={false} />
              <ReferenceLine y={0} stroke="var(--viz-axis)" />
              <Tooltip
                cursor={{ fill: "var(--viz-grid)", opacity: 0.4 }}
                contentStyle={tooltipStyle}
                formatter={(v) => [money.format(Number(v)), Number(v) < 0 ? labels.deficit : labels.surplus]}
              />
              <Bar isAnimationActive={false} dataKey="surplus" radius={[4, 4, 4, 4]} maxBarSize={36}>
                {rows.map((r) => (
                  <Cell key={r.period} fill={r.surplus < 0 ? "var(--viz-negative)" : "var(--viz-series-1)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted">{labels.table}</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-muted">
              <th className="py-1 text-start font-medium">{labels.period}</th>
              <th className="py-1 text-start font-medium">{labels.income}</th>
              <th className="py-1 text-start font-medium">{labels.expenses}</th>
              <th className="py-1 text-start font-medium">{labels.surplus}</th>
              <th className="py-1 text-start font-medium">{labels.savingsRate}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} className="num border-t border-border">
                <td className="py-1">{r.period}</td>
                <td className="py-1">{money.format(r.income)}</td>
                <td className="py-1">{money.format(r.expenses)}</td>
                <td className="py-1">{money.format(r.surplus)}</td>
                <td className="py-1">{pct(r.savingsRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** Ranked horizontal bars (one hue = magnitude) with an optional budget tick. Plain HTML, accessible as a list. */
export function SpendBars({ items, locale, budgetLabel, overLabel }: { items: { label: string; amount: number; budget: number | null }[]; locale: string; budgetLabel: string; overLabel: string }) {
  const money = fmt(locale);
  const max = Math.max(1, ...items.map((i) => Math.max(i.amount, i.budget ?? 0)));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => {
        const over = i.budget !== null && i.amount > i.budget;
        return (
          <li key={i.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span>{i.label}</span>
              <span className="num font-medium">
                {money.format(i.amount)}
                {i.budget !== null && (
                  <span className={`ms-2 text-xs ${over ? "text-bad" : "text-muted"}`}>
                    {over ? `▲ ${overLabel} · ` : ""}
                    {budgetLabel} {money.format(i.budget)}
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-2.5 rounded-full bg-background" aria-hidden>
              <div className="h-2.5 rounded-full bg-viz-1" style={{ width: `${Math.max(0, (i.amount / max) * 100)}%` }} />
              {i.budget !== null && <div className="absolute top-[-3px] h-4 w-0.5 bg-foreground" style={{ insetInlineStart: `${(i.budget / max) * 100}%` }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

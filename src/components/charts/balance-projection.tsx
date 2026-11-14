"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Single-series projected balance with zero and overdraft reference lines (display numbers only). */
export function BalanceProjectionChart({ data, overdraft, locale, labels }: { data: { date: string; balance: number }[]; overdraft: number | null; locale: string; labels: { balance: string; zero: string; overdraft: string } }) {
  const nf = new Intl.NumberFormat(locale === "ar" ? "ar-IL-u-nu-latn" : "he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
  return (
    <figure>
      <figcaption className="mb-1 flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-5 bg-viz-1" />{labels.balance}</span>
        {overdraft !== null && <span className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-0.5 w-5 border-t-2 border-dashed border-viz-neg" />{labels.overdraft}</span>}
      </figcaption>
      <div dir="ltr" className="h-56 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8, 10) + "/" + d.slice(5, 7)} tick={{ fill: "var(--viz-axis)", fontSize: 12 }} tickLine={false} minTickGap={16} />
            <YAxis domain={overdraft !== null ? [(min: number) => Math.min(min, -overdraft * 1.05), "auto"] : ["auto", "auto"]} tickFormatter={(v: number) => nf.format(v)} tick={{ fill: "var(--viz-axis)", fontSize: 12 }} width={84} tickLine={false} axisLine={false} />
            <ReferenceLine y={0} stroke="var(--viz-axis)" label={{ value: labels.zero, fill: "var(--viz-axis)", fontSize: 11, position: "insideTopLeft" }} />
            {overdraft !== null && <ReferenceLine y={-overdraft} stroke="var(--viz-negative)" strokeDasharray="4 4" />}
            <Tooltip formatter={(v) => [nf.format(Number(v)), labels.balance]} />
            <Line isAnimationActive={false} type="stepAfter" dataKey="balance" stroke="var(--viz-series-1)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

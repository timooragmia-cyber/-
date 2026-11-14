import "server-only";
import { getTranslations } from "next-intl/server";
import { formatMoney, formatPpmPercent, toDisplayNumber, type MoneyLocale } from "@/lib/money";
import type { CurrentUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { debtOverview } from "@/server/debt/service";
import { netWorth } from "@/server/accounts";
import { householdInsights, loadCategories } from "@/server/months";
import { listPlan } from "@/server/plan/service";
import { recommendationText } from "@/server/plan/text";
import { savingsOverview } from "@/server/savings/service";
import { fontCss } from "./fonts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Surplus bars (blue = surplus, red = deficit) as inline SVG; LTR time axis. */
function surplusSvg(points: { period: string; surplus: bigint }[], locale: MoneyLocale): string {
  if (points.length === 0) return "";
  const w = 520, h = 140, pad = 24;
  const vals = points.map((p) => toDisplayNumber(p.surplus));
  const max = Math.max(1, ...vals.map(Math.abs));
  const zero = h / 2;
  const bw = (w - pad * 2) / vals.length;
  const bars = vals
    .map((v, i) => {
      const bh = (Math.abs(v) / max) * (h / 2 - 16);
      const x = pad + i * bw + bw * 0.2;
      const y = v >= 0 ? zero - bh : zero;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${v >= 0 ? "#2a78d6" : "#e34948"}"/>
<text x="${(x + bw * 0.3).toFixed(1)}" y="${h - 2}" font-size="9" text-anchor="middle" fill="#52514e">${esc(points[i]!.period)}</text>
<text x="${(x + bw * 0.3).toFixed(1)}" y="${(v >= 0 ? y - 3 : y + bh + 10).toFixed(1)}" font-size="9" text-anchor="middle" fill="#0b0b0b">${esc(formatMoney(points[i]!.surplus, locale, { decimals: 0, signDisplay: "exceptZero" }))}</text>`;
    })
    .join("");
  return `<svg dir="ltr" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img"><line x1="${pad}" x2="${w - pad}" y1="${zero}" y2="${zero}" stroke="#52514e" stroke-width="1"/>${bars}</svg>`;
}

export type ReportKind = "MONTHLY" | "FULL_REVIEW";

export async function buildReportHtml(user: CurrentUser, householdId: string, kind: ReportKind, locale: MoneyLocale, period: string | null): Promise<{ html: string; period: string | null }> {
  const t = await getTranslations({ locale });
  const m = (a: bigint | null | undefined) => (a === null || a === undefined ? "—" : formatMoney(a, locale, { decimals: 0 }));
  const pc = (p: number | null | undefined) => (p === null || p === undefined ? "—" : formatPpmPercent(p, locale, 1));
  const [household, insights, cats, savings, plan] = await Promise.all([
    db.household.findUniqueOrThrow({ where: { id: householdId }, select: { displayName: true } }),
    householdInsights(householdId),
    loadCategories(),
    savingsOverview(user, householdId),
    listPlan(user, householdId),
  ]);
  const approved = plan.filter((r) => ["APPROVED", "IN_PROGRESS", "DONE"].includes(r.status)); // client-facing: approved only
  const month = (period ? insights.closed.find((c) => c.period === period) : insights.closed[0]) ?? null;
  const usedPeriod = month?.period ?? period;
  const catName = (key: string) => {
    const c = [...cats.values()].find((x) => x.key === key);
    return c ? (locale === "ar" ? c.nameAr : c.nameHe) : key;
  };

  const sections: string[] = [];
  // Monthly summary
  if (month) {
    sections.push(`<section><h2>${esc(t("reports.pdf.summary"))}</h2><div class="kpis">
      <div><span>${esc(t("reports.pdf.income"))}</span><b>${esc(m(month.totals.income))}</b></div>
      <div><span>${esc(t("reports.pdf.expenses"))}</span><b>${esc(m(month.totals.expenses))}</b></div>
      <div class="${month.totals.surplus < 0n ? "bad" : "ok"}"><span>${esc(t("reports.pdf.surplus"))}</span><b>${esc(formatMoney(month.totals.surplus, locale, { decimals: 0, signDisplay: "exceptZero" }))}</b></div>
      <div><span>${esc(t("reports.pdf.savingsRate"))}</span><b>${esc(month.totals.income > 0n ? pc(month.totals.savingsRatePpm) : "—")}</b></div></div></section>`);
    const hl = insights.highlights;
    sections.push(`<section><h2>${esc(t("reports.pdf.vsLast"))}</h2>${hl.length === 0 ? `<p class="muted">${esc(t("reports.pdf.noComparison"))}</p>` : `<ul>${hl
      .map((h) => `<li>${h.favorable ? "▼" : "▲"} ${esc(h.categoryKey === "__total_income" ? t("insights.totalIncome") : catName(h.categoryKey))} ${esc(t(h.direction === "UP" ? "insights.up" : "insights.down"))} ${esc(formatPpmPercent(h.changePpm, locale, 0))} (${esc(formatMoney(h.delta, locale, { decimals: 0, signDisplay: "always" }))})</li>`)
      .join("")}</ul>`}</section>`);
    if (month.result) {
      sections.push(`<section><h2>${esc(t("reports.pdf.whereMoney"))}</h2><table>${month.result.expenses
        .slice(0, 8)
        .map((l) => `<tr><td>${esc(catName(l.key))}</td><td class="num">${esc(m(l.amount))}</td></tr>`)
        .join("")}</table></section>`);
    }
  } else {
    sections.push(`<section><p class="muted">${esc(t("reports.pdf.noData"))}</p></section>`);
  }

  // Top actions (approved only)
  const actions = (kind === "MONTHLY" ? approved.slice(0, 3) : approved).map((r) => {
    const { title, reason } = recommendationText(t as never, locale, r);
    return `<li><b>${esc(title)}</b><br/><span class="muted">${esc(reason)}</span>${r.impactLifetime ? ` <span class="tag">${esc(m(r.impactLifetime))}</span>` : ""}</li>`;
  });
  sections.push(`<section><h2>${esc(kind === "MONTHLY" ? t("reports.pdf.topActions") : t("reports.pdf.plan"))}</h2>${actions.length ? `<ol>${actions.join("")}</ol>` : `<p class="muted">${esc(t("reports.pdf.noActions"))}</p>`}</section>`);

  // Fee savings potential
  sections.push(`<section><h2>${esc(t("reports.pdf.feePotential"))}</h2><p class="big ok">${esc(m(savings.totals.savingsPotential))}</p></section>`);

  // Trend
  const trend = insights.trend.slice(-6).map((p) => ({ period: p.period, surplus: p.surplus }));
  if (trend.length > 1) sections.push(`<section><h2>${esc(t("reports.pdf.trend"))}</h2>${surplusSvg(trend, locale)}</section>`);

  if (kind === "FULL_REVIEW") {
    const [nw, debt] = await Promise.all([netWorth(householdId, 6), debtOverview(user, householdId)]);
    const last = nw.at(-1);
    sections.push(`<section><h2>${esc(t("reports.pdf.netWorth"))}</h2><p class="big">${esc(m(last?.netWorth))}</p></section>`);
    sections.push(`<section><h2>${esc(t("reports.pdf.longTerm"))}</h2><table>${savings.products
      .map((p) => `<tr><td>${esc(t(`productType.${p.product.productType}`))} — ${esc(p.product.provider)}</td><td class="num">${esc(m(p.product.balance))}</td><td class="num">${esc(pc(p.product.feeDepositsPpm))} / ${esc(formatPpmPercent(p.product.feeAccumulationPpm, locale, 2))}</td></tr>`)
      .join("") || `<tr><td>${esc(t("reports.pdf.noData"))}</td></tr>`}</table>
      <h3>${esc(t("reports.pdf.retirement"))}</h3><table>${savings.byPerson
      .map((b) => { const base = b.scenarios?.find((s) => s.scenario === "base"); return `<tr><td>${esc(b.person.firstName)}</td><td class="num">${esc(base ? m(base.monthlyPension) : "—")}</td></tr>`; })
      .join("")}</table></section>`);
    sections.push(`<section><h2>${esc(t("reports.pdf.debts"))}</h2><table>${debt.ranked
      .map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${esc(m(d.balance))}</td><td class="num">${esc(formatPpmPercent(d.annualRatePpm, locale, 2))}</td></tr>`)
      .join("") || `<tr><td>${esc(t("reports.pdf.noData"))}</td></tr>`}</table></section>`);
  }

  const title = kind === "MONTHLY" ? t("reports.pdf.monthlyTitle", { period: usedPeriod ?? "—" }) : t("reports.pdf.fullTitle");
  const fonts = await fontCss();
  const fontFamily = locale === "ar" ? `"Noto Sans Arabic","Noto Sans Hebrew"` : `"Noto Sans Hebrew","Noto Sans Arabic"`;
  const html = `<!doctype html><html lang="${locale}" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
${fonts}
body{font-family:${fontFamily},sans-serif;color:#14202e;font-size:11.5px;line-height:1.55;margin:0}
header{border-bottom:3px solid #0f3a5f;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end}
.brand{font-family:sans-serif;font-weight:700;color:#0f3a5f;font-size:18px;direction:ltr}
h1{font-size:20px;margin:0;color:#0f3a5f}h2{font-size:14px;color:#0f3a5f;margin:14px 0 6px;border-bottom:1px solid #dde2e8;padding-bottom:3px}h3{font-size:12px;margin:8px 0 4px}
.muted{color:#5b6878}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.kpis div{background:#f4f6f9;border-radius:6px;padding:8px}.kpis span{display:block;color:#5b6878;font-size:10px}.kpis b{font-size:15px;direction:ltr;unicode-bidi:isolate}
.ok{color:#17703a}.bad{color:#b42318}.big{font-size:20px;font-weight:700;direction:ltr;unicode-bidi:isolate;text-align:start}
table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #eef0f3;padding:4px 2px}.num{direction:ltr;unicode-bidi:isolate;text-align:end;white-space:nowrap}
ol,ul{padding-inline-start:18px;margin:4px 0}li{margin-bottom:6px}.tag{background:#e5f4ea;color:#17703a;border-radius:10px;padding:0 6px;font-size:10px}
section{break-inside:avoid}.disclaimer{margin-top:18px;border-top:1px solid #dde2e8;padding-top:6px;font-size:9.5px;color:#5b6878}
</style></head><body>
<header><div><h1>${esc(title)}</h1><div class="muted">${esc(t("reports.pdf.preparedFor", { name: household.displayName }))} · ${esc(t("reports.pdf.date", { date: new Date().toISOString().slice(0, 10) }))}</div></div><div class="brand">T.A Mortgages</div></header>
${sections.join("\n")}
<p class="disclaimer">${esc(t("reports.pdf.disclaimer"))}</p>
</body></html>`;
  return { html, period: usedPeriod ?? null };
}

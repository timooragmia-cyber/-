import "server-only";
import { formatMoney, formatPpmPercent, type MoneyLocale } from "@/lib/money";

const MONEY = new Set(["gap", "monthly", "balance", "yearly", "gain", "annual", "amount", "surplus"]);

type T = { (key: string, values?: Record<string, string | number>): string; has(key: string): boolean };

/** Renders a recommendation's title and reason from its rule key + parameters (or the advisor's own wording). */
export function recommendationText(t: T, locale: MoneyLocale, rec: { ruleKey: string; reason: unknown; customTitle: string | null }) {
  const raw = (rec.reason ?? {}) as Record<string, string | number>;
  const v: Record<string, string | number> = {};
  for (const [k, val] of Object.entries(raw)) {
    if (MONEY.has(k)) v[k] = formatMoney(BigInt(val), locale, { decimals: 0 });
    else if (k === "rate") v[k] = formatPpmPercent(Number(val), locale, 2);
    else if (k === "route") v[k] = t.has(`routes.names.${val}`) ? t(`routes.names.${val}`) : String(val);
    else v[k] = val;
  }
  const title = rec.customTitle || (t.has(`plan.rules.${rec.ruleKey}.title`) ? t(`plan.rules.${rec.ruleKey}.title`, v) : rec.ruleKey);
  const reason = t.has(`plan.rules.${rec.ruleKey}.reason`) ? t(`plan.rules.${rec.ruleKey}.reason`, v) : "";
  return { title, reason };
}

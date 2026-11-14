import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { formatMoney, type MoneyLocale } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";

const HEADLINE = ["totalTax", "tax", "annualTax", "difference"];

export default async function CalculationsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdvisor();
  const { id } = await params;
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const runs = await db.calculationRun.findMany({ where: { householdId: id }, orderBy: { createdAt: "desc" }, take: 50 });
  if (runs.length === 0) return <Card><p className="text-muted">{t("tax.noRuns")}</p></Card>;
  return (
    <ul className="space-y-2">
      {runs.map((r) => {
        const result = r.result as Record<string, unknown>;
        const key = HEADLINE.find((k) => typeof result[k] === "string");
        const raw = ((r.inputs as { raw?: Record<string, string> }).raw ?? {}) as Record<string, string>;
        const href = `/advisor/tax/${r.calculator}?${new URLSearchParams({ ...raw, run: "1" }).toString()}`;
        return (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
            <div>
              <p className="font-medium">{t.has(`tax.calculators.${r.calculator}`) ? t(`tax.calculators.${r.calculator}`) : r.calculator}{r.title ? ` — ${r.title}` : ""}</p>
              <p className="num text-xs text-muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {r.version}</p>
            </div>
            <div className="flex items-center gap-3">
              {key && <span className="font-semibold">{t(`tax.results.${key}`)}: <span className="num">{formatMoney(BigInt(result[key] as string), locale)}</span></span>}
              <Link href={href} className="text-sm text-brand underline">{t("tax.open")}</Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

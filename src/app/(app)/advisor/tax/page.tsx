import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";
import { CALCULATOR_NAMES } from "@/server/tax/calculators";

export default async function TaxIndex() {
  await requireAdvisor();
  const t = await getTranslations("tax");
  const [count, first, last] = await Promise.all([
    db.cpiValue.count(),
    db.cpiValue.findFirst({ orderBy: { period: "asc" } }),
    db.cpiValue.findFirst({ orderBy: { period: "desc" } }),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-sm text-muted">{t("intro")}</p>
      <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{t("verifyNote")}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>{count > 0 ? t("cpiStatus", { count, from: first!.period, to: last!.period, base: last!.base }) : t("cpiEmpty")}</span>
        <Link href="/advisor/tax/cpi" className="font-medium text-brand underline">{t("cpiManage")}</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CALCULATOR_NAMES.map((c) => (
          <Link key={c} href={`/advisor/tax/${c}`} className="block">
            <Card className="h-full transition-colors hover:border-brand">
              <h2 className="font-semibold text-brand">{t(`calculators.${c}`)}</h2>
              <p className="mt-1 text-sm text-muted">{t(`descriptions.${c}`)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

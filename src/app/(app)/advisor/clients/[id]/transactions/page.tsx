import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { PeriodPicker } from "@/components/app/period-picker";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { isPeriod } from "@/lib/domain/period";
import { formatMoney } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";
import { attributionDate, loadCategories, periodsWithData, periodWhere } from "@/server/months";
import { catName, type Loc } from "@/server/view";
import { recategorizeAction } from "../actions";

export default async function TransactionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string; uncat?: string }> }) {
  await requireAdvisor();
  const { id } = await params;
  const sp = await searchParams;
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  const periods = await periodsWithData(id);
  if (periods.length === 0) return <Card><p className="text-muted">{t("txn.noTxns")}</p></Card>;
  const period = sp.period && isPeriod(sp.period) ? sp.period : periods[0]!;
  const uncatOnly = sp.uncat === "1";
  const cats = await loadCategories();
  const uncategorizedId = [...cats.values()].find((c) => c.key === "uncategorized")?.id;
  const txns = await db.transaction.findMany({
    where: { AND: [periodWhere(id, period, period), ...(uncatOnly ? [{ OR: [{ categoryId: null }, { categoryId: uncategorizedId }] }] : [])] },
    include: { account: { select: { nickname: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "asc" }],
    take: 400,
  });
  const catOptions = [...cats.values()];

  return (
    <div className="space-y-4">
      <PeriodPicker
        periods={periods}
        current={period}
        label={t("month.pick")}
        submitLabel={t("txn.filter")}
        extra={
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="uncat" value="1" defaultChecked={uncatOnly} /> {t("txn.uncategorizedOnly")}
          </label>
        }
      />
      {txns.length === 0 ? (
        <Card><p className="text-muted">{t("txn.noTxns")}</p></Card>
      ) : (
        <ul className="space-y-2">
          {txns.map((x) => {
            const cat = x.categoryId ? cats.get(x.categoryId) : null;
            return (
              <li key={x.id} className="rounded-lg border border-border bg-surface p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{x.description}</p>
                    <p className="text-xs text-muted">
                      <span className="num">{attributionDate(x)}</span> · {x.account.nickname}
                      {x.installmentNumber && <> · {t("txn.installment", { n: x.installmentNumber, t: x.installmentTotal ?? 0 })}</>}
                    </p>
                  </div>
                  <p className={`num font-semibold ${x.amount < 0n ? "" : "text-ok"}`}>{formatMoney(x.amount, locale)}</p>
                </div>
                <ActionForm action={recategorizeAction} submitLabel={t("form.save")} variant="outline" resetOnSuccess={false} className="mt-2 flex flex-wrap items-center gap-2 space-y-0">
                  <input type="hidden" name="householdId" value={id} />
                  <input type="hidden" name="transactionId" value={x.id} />
                  <Select name="categoryId" defaultValue={x.categoryId ?? ""} aria-label={t("txn.category")} className="w-auto min-w-48">
                    {!cat && <option value="">—</option>}
                    {catOptions.map((c) => <option key={c.id} value={c.id}>{catName(c, locale)}</option>)}
                  </Select>
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="applySimilar" defaultChecked /> {t("txn.applySimilar")}</label>
                  <Badge tone={x.categorySource === "NONE" ? "warn" : "neutral"}>{t(`txn.sources.${x.categorySource}`)}</Badge>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

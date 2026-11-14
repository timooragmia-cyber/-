import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPpmPercent, ratioPpm, type MoneyLocale } from "@/lib/money";
import { accountsAnalysis } from "@/server/accounts";
import { requireAdvisor, requireOpenHousehold } from "@/server/auth/dal";
import { loadCategories } from "@/server/months";
import { catName } from "@/server/view";

export default async function CardsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  await requireOpenHousehold(id);
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const [accounts, cats] = await Promise.all([accountsAnalysis(user, id), loadCategories()]);
  const byKey = new Map([...cats.values()].map((c) => [c.key, c]));
  const cards = accounts.filter((a) => a.account.kind === "CREDIT_CARD");
  const money = (a: bigint) => formatMoney(a, locale, { decimals: 0 });
  if (cards.length === 0) return <Card><p className="text-muted">{t("cards.noCards")}</p></Card>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("cards.title")}</h2>
      {cards.map(({ account, cycles }) => (
        <Card key={account.id}>
          <CardTitle>{account.nickname} <span className="num text-sm font-normal text-muted">{account.last4 ? `••${account.last4}` : ""}</span></CardTitle>
          {cycles.length === 0 ? <p className="text-sm text-muted">{t("cards.noCycles")}</p> : (
            <div className="grid gap-4 lg:grid-cols-3">
              {cycles.map((c) => (
                <section key={c.chargeDate} className="rounded-md border border-border p-3">
                  <h3 className="font-medium">{t("cards.cycle", { date: c.chargeDate })}</h3>
                  <p className="num text-2xl font-bold">{money(c.total)}</p>
                  <p className="text-xs text-muted">
                    {t("cards.purchases", { count: c.purchases })}
                    {account.creditLimit ? <> · {t("cards.limitUse")} <span className="num">{formatPpmPercent(ratioPpm(c.total, account.creditLimit) ?? 0, locale, 0)}</span></> : null}
                  </p>
                  <dl className="mt-2 space-y-0.5 text-xs">
                    <div className="flex justify-between"><dt>{t("cards.installments")}</dt><dd className="num">{money(c.installments)}</dd></div>
                    <div className="flex justify-between"><dt>{t("cards.creditPlan")}</dt><dd className={`num ${c.creditPlan > 0n ? "text-bad" : ""}`}>{money(c.creditPlan)}</dd></div>
                    <div className="flex justify-between"><dt>{t("cards.feesInterest")}</dt><dd className={`num ${c.feesAndInterest > 0n ? "text-bad" : ""}`}>{money(c.feesAndInterest)}</dd></div>
                  </dl>
                  <h4 className="mt-3 text-xs font-semibold text-muted">{t("cards.byCategory")}</h4>
                  <ul className="text-sm">
                    {c.byCategory.slice(0, 6).map((x) => (
                      <li key={x.key} className="flex justify-between gap-2"><span>{catName(byKey.get(x.key), locale as "he" | "ar", x.key)}</span><span className="num">{money(x.amount)}</span></li>
                    ))}
                  </ul>
                  <h4 className="mt-3 text-xs font-semibold text-muted">{t("cards.topMerchants")}</h4>
                  <ul className="text-sm">
                    {c.topMerchants.slice(0, 5).map((m) => (
                      <li key={m.label} className="flex justify-between gap-2"><span className="truncate">{m.label}{m.count > 1 ? ` ×${m.count}` : ""}</span><span className="num">{money(m.amount)}</span></li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

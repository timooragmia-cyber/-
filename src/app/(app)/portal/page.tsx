import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardTitle } from "@/components/ui/card";
import { formatMoney, formatPpmPercent, type MoneyLocale } from "@/lib/money";
import { requireClient } from "@/server/auth/dal";
import { getHouseholdProfile } from "@/server/households";

/**
 * Client home. Design goal: the client understands their monthly status in 10 seconds —
 * one headline number (surplus/deficit), one status word, one savings rate. Nothing else above the fold.
 */
export default async function PortalPage() {
  const user = await requireClient();
  const h = await getHouseholdProfile(user, user.householdId);
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const latest = h?.snapshots[0];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">{t("portal.hello", { name: user.displayName })}</h1>
      <Card>
        <CardTitle>{t("portal.statusHeadline")}</CardTitle>
        {latest ? (
          <div className="space-y-2 text-center">
            <p className="num text-sm text-muted">{latest.period}</p>
            <p className={`num text-4xl font-bold ${latest.surplus < 0n ? "text-bad" : "text-ok"}`}>
              {formatMoney(latest.surplus, locale, { decimals: 0, signDisplay: "exceptZero" })}
            </p>
            <StatusBadge status={latest.surplus < 0n ? "DEFICIT" : "SURPLUS"} />
            <p className="text-sm">
              {t("portal.savingsRate")}: <span className="num">{formatPpmPercent(latest.savingsRatePpm, locale, 1)}</span>
            </p>
          </div>
        ) : (
          <p className="text-muted">{t("portal.noDataYet")}</p>
        )}
      </Card>
      <Card>
        <CardTitle>{t("portal.yourTasks")}</CardTitle>
        {h && h.actionItems.length > 0 ? (
          <ul className="list-disc space-y-1 ps-5 text-sm">
            {h.actionItems.map((a) => (
              <li key={a.id}>{a.title}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("portal.noTasks")}</p>
        )}
      </Card>
      <p className="text-xs text-muted">{t("portal.uploadSoon")}</p>
    </div>
  );
}

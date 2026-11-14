import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney, formatPpmPercent, type MoneyLocale } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { getHouseholdProfile } from "@/server/households";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  const h = await getHouseholdProfile(user, id);
  if (!h) notFound();
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const hasConsent = h.consents.some((c) => c.type === "DATA_PROCESSING" && !c.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{h.displayName}</h1>
        <Badge tone={hasConsent ? "ok" : "bad"}>{t(hasConsent ? "household.consentGiven" : "household.consentMissing")}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>{t("household.profile")}</CardTitle>
          <p className="mb-3 text-sm">
            {t("household.riskTolerance")}:{" "}
            <strong>{h.riskTolerance ? t(`enums.RiskTolerance.${h.riskTolerance}`) : t("household.notAssessed")}</strong>
          </p>
          <ul className="space-y-1 text-sm">
            {h.members.map((m) => (
              <li key={m.id}>
                {m.firstName} {m.lastName} — {t(`enums.MemberRole.${m.memberRole}`)}
                {m.employmentType && <> · {t(`enums.EmploymentType.${m.employmentType}`)}</>}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>{t("household.incomeSources")}</CardTitle>
          <ul className="space-y-1 text-sm">
            {h.incomeSources.map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span>
                  {s.label} ({t(`enums.IncomeType.${s.type}`)})
                </span>
                <span className="num">{s.netMonthly !== null ? formatMoney(s.netMonthly, locale, { decimals: 0 }) : "—"}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>{t("household.goals")}</CardTitle>
          <ul className="space-y-1 text-sm">
            {h.goals.map((g) => (
              <li key={g.id} className="flex justify-between gap-2">
                <span>{g.title}</span>
                <span className="num">{formatMoney(g.targetAmount, locale, { decimals: 0 })}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>{t("advisor.lastClosed")}</CardTitle>
          {h.snapshots.length === 0 ? (
            <p className="text-sm text-muted">{t("status.NO_DATA")}</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>{t("household.period")}</Th>
                  <Th>{t("household.surplus")}</Th>
                  <Th>{t("household.savingsRate")}</Th>
                </tr>
              </thead>
              <tbody>
                {h.snapshots.slice(0, 6).map((s) => (
                  <tr key={s.id}>
                    <Td className="num">{s.period}</Td>
                    <Td className={`num ${s.surplus < 0n ? "text-bad" : "text-ok"}`}>{formatMoney(s.surplus, locale, { decimals: 0, signDisplay: "exceptZero" })}</Td>
                    <Td className="num">{formatPpmPercent(s.savingsRatePpm, locale, 1)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
      <p className="text-sm text-muted">{t("household.phaseNote")}</p>
    </div>
  );
}

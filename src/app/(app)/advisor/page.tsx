import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge, TrendArrow } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney, type MoneyLocale } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { listHouseholdsForAdvisor } from "@/server/households";

export default async function AdvisorDashboard() {
  const user = await requireAdvisor();
  const rows = await listHouseholdsForAdvisor(user);
  const t = await getTranslations("advisor");
  const locale = (await getLocale()) as MoneyLocale;

  const count = (s: string) => rows.filter((r) => r.status.status === s).length;
  const tiles = [
    { label: t("summaryTotal"), value: rows.length },
    { label: t("summaryClosed"), value: count("SURPLUS") },
    { label: t("summaryDeficit"), value: count("DEFICIT") },
    { label: t("summaryNoData"), value: count("NO_DATA") },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("dashboardTitle")}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-4 sm:p-4">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="num text-start text-3xl font-bold">{tile.value}</p>
          </Card>
        ))}
      </div>
      <Card className="p-0 sm:p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-muted">{t("noClients")}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("household")}</Th>
                <Th>{t("status")}</Th>
                <Th>{t("lastClosed")}</Th>
                <Th>{t("trend")}</Th>
                <Th className="sr-only">{t("openClient")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <div className="font-medium">{r.displayName}</div>
                    <div className="text-xs text-muted">
                      {r.city} · {t("members")}: <span className="num">{r.memberCount}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge status={r.status.status} />
                      {r.status.missingUpdate && r.status.status !== "NO_DATA" && <Badge tone="warn">{t("missingUpdate")}</Badge>}
                    </div>
                    {r.latestSurplus !== null && (
                      <div className={`num mt-1 text-start text-xs ${r.latestSurplus < 0n ? "text-bad" : "text-ok"}`}>
                        {formatMoney(r.latestSurplus, locale, { decimals: 0, signDisplay: "exceptZero" })}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <span className="num">{r.status.lastClosedPeriod ?? "—"}</span>
                  </Td>
                  <Td>
                    <TrendArrow trend={r.status.trend} />
                  </Td>
                  <Td>
                    <Link href={`/advisor/clients/${r.id}`} className="font-medium text-brand underline">
                      {t("openClient")}
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

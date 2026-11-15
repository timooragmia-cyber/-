import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { StatusBadge, TrendArrow } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { formatMoney, type MoneyLocale } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { listHouseholdsForAdvisor } from "@/server/households";
import { db } from "@/server/db";
import { openPrivacyRequests } from "@/server/privacy/service";
import { desktopBackupStatus } from "@/server/desktop";

export default async function AdvisorDashboard() {
  const user = await requireAdvisor();
  const [rows, pending, requests] = await Promise.all([
    listHouseholdsForAdvisor(user),
    db.uploadedFile.groupBy({ by: ["householdId"], where: { status: "PENDING_REVIEW" }, _count: true }),
    openPrivacyRequests(user),
  ]);
  const now = new Date();
  const pendingBy = new Map(pending.map((p) => [p.householdId, p._count]));
  const tAll = await getTranslations();
  const tNav = await getTranslations("nav");
  const tDash = await getTranslations("dash");
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("dashboardTitle")}</h1>
        <Link href="/advisor/clients/new" className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground">+ {tNav("newClient")}</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label} className="p-4 sm:p-4">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="num text-start text-3xl font-bold">{tile.value}</p>
          </Card>
        ))}
      </div>
      {(() => {
        // Desktop edition: the data lives on this computer only — a missing or stale backup is
        // the biggest risk, so it is the first thing on the dashboard.
        const b = desktopBackupStatus();
        if (!b) return null;
        const stale = !b.lastBackupAt || now.getTime() - new Date(b.lastBackupAt).getTime() > 3 * 86_400_000;
        if (b.configured && !stale && !b.lastBackupError) return null;
        return (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-bad bg-bad-bg p-3 text-sm text-bad">
            <span>{!b.configured ? tAll("backup.bannerNotSet") : b.lastBackupError ? tAll("backup.bannerError") : tAll("backup.bannerStale")}</span>
            <Link href="/advisor/backup" className="rounded-md bg-bad px-3 py-1.5 font-medium text-white">{tAll("backup.bannerCta")}</Link>
          </div>
        );
      })()}
      {requests.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">{tAll("privacy.openRequests")}</h2>
          <ul className="space-y-1 text-sm">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/advisor/privacy/${r.householdId}`} className="font-medium text-brand underline">{r.household.displayName}</Link>
                <span>{tAll(`privacy.type.${r.type}`)}</span>
                <Badge tone={r.dueAt && r.dueAt < now ? "bad" : "warn"}>{tAll("privacy.due")} <span className="num">{r.dueAt ? r.dueAt.toISOString().slice(0, 10) : "—"}</span></Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
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
                      {r.restrictedAt ? <Badge tone="bad">{tAll("privacy.restrictedBadge")}</Badge> : <StatusBadge status={r.status.status} />}
                      {r.status.missingUpdate && r.status.status !== "NO_DATA" && <Badge tone="warn">{t("missingUpdate")}</Badge>}
                      {pendingBy.get(r.id) ? <Badge tone="warn">{tDash("pendingUploads")}: {pendingBy.get(r.id)}</Badge> : null}
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
                    <Link href={r.restrictedAt ? `/advisor/privacy/${r.id}` : `/advisor/clients/${r.id}`} className="font-medium text-brand underline">
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

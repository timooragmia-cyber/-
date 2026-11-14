import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { requireAdvisor, requireOpenHousehold } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getClosedMonths } from "@/server/months";
import { generateReportAction, releaseReportAction } from "../actions";

export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdvisor();
  const { id } = await params;
  await requireOpenHousehold(id);
  const t = await getTranslations();
  const [reports, closed, household] = await Promise.all([
    db.report.findMany({ where: { householdId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    getClosedMonths(id, 12),
    db.household.findUniqueOrThrow({ where: { id }, select: { preferredLocale: true } }),
  ]);
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{t("reports.generate")}</CardTitle>
        <ActionForm action={generateReportAction} submitLabel={t("reports.generate")} className="flex flex-wrap items-end gap-3 space-y-0">
          <HouseholdField id={id} />
          <label className="text-xs">{t("reports.type")}<Select name="type"><option value="MONTHLY">{t("reports.MONTHLY")}</option><option value="FULL_REVIEW">{t("reports.FULL_REVIEW")}</option></Select></label>
          <label className="text-xs">{t("reports.period")}<Select name="period">{closed.map((c) => <option key={c.period} value={c.period}>{c.period}</option>)}</Select></label>
          <label className="text-xs">{t("reports.language")}<Select name="locale" defaultValue={household.preferredLocale}><option value="he">{t("lang.he")}</option><option value="ar">{t("lang.ar")}</option></Select></label>
        </ActionForm>
      </Card>
      {reports.length === 0 ? <Card><p className="text-muted">{t("reports.none")}</p></Card> : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
              <div>
                <p className="font-medium">{t(`reports.${r.type}`)}{r.period ? ` · ${r.period}` : ""} · {t(`lang.${r.locale}`)}</p>
                <p className="num text-xs text-muted">{r.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {Math.round(r.sizeBytes / 1024)} KB</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={r.releasedAt ? "ok" : "neutral"}>{r.releasedAt ? t("reports.released") : t("reports.notReleased")}</Badge>
                <a href={`/api/reports/${r.id}`} className="text-sm font-medium text-brand underline">{t("reports.download")}</a>
                {!r.releasedAt && (
                  <ActionForm action={releaseReportAction} submitLabel={t("reports.release")} variant="outline">
                    <HouseholdField id={id} />
                    <input type="hidden" name="reportId" value={r.id} />
                  </ActionForm>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

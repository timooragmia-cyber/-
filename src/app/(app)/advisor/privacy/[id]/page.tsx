import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, Textarea } from "@/components/ui/select";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";
import { listPrivacyRequests, privacyStatus } from "@/server/privacy/service";
import { liftAction, logRequestAction, purgeAction, resolveRequestAction, restrictAction } from "../actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

/**
 * Privacy for one household: data-subject requests, export, restriction and purge.
 * Reachable while the file is restricted (every other client page redirects here).
 */
export default async function PrivacyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  if (!(await db.household.findUnique({ where: { id }, select: { id: true } }))) notFound();
  const t = await getTranslations();
  const [status, requests] = await Promise.all([privacyStatus(user, id), listPrivacyRequests(user, id)]);
  const restricted = status.restrictedAt !== null;
  const now = new Date();
  const e = status.eligibility;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{status.displayName}</h1>
          <p className="text-sm text-muted">{t("privacy.title")}</p>
        </div>
        {!restricted && <Link href={`/advisor/clients/${id}`} className="text-sm font-medium text-brand underline">{t("privacy.backToFile")}</Link>}
      </div>

      {restricted && (
        <p role="status" className="rounded-md border border-bad bg-bad-bg px-3 py-2 text-sm text-bad">
          {t("privacy.restrictedBanner", { date: day(status.restrictedAt) })}
        </p>
      )}

      <Card>
        <CardTitle>{t("privacy.exportTitle")}</CardTitle>
        <p className="mb-3 text-sm text-muted">{t("privacy.exportHelp")}</p>
        <a href={`/api/privacy/export?household=${id}`} className="inline-block rounded-md border border-border px-3 py-2 text-sm font-medium" download>{t("privacy.exportButton")}</a>
      </Card>

      <Card>
        <CardTitle>{t("privacy.requestsTitle")}</CardTitle>
        {requests.length === 0 ? <p className="text-sm text-muted">{t("privacy.noRequests")}</p> : (
          <ul className="mb-4 space-y-2">
            {requests.map((r) => {
              const overdue = r.status === "OPEN" && r.dueAt !== null && r.dueAt < now;
              return (
                <li key={r.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`privacy.type.${r.type}`)}</span>
                    <Badge tone={r.status === "OPEN" ? (overdue ? "bad" : "warn") : r.status === "DONE" ? "ok" : "neutral"}>{t(`privacy.status.${r.status}`)}</Badge>
                    <span className="text-xs text-muted">{t("privacy.received")} <span className="num">{day(r.receivedAt)}</span> · {t("privacy.due")} <span className="num">{day(r.dueAt)}</span></span>
                  </div>
                  {r.details && <p className="mt-1 whitespace-pre-wrap text-sm">{r.details}</p>}
                  {r.resolution && <p className="mt-1 border-s-2 border-accent ps-2 text-sm">{r.resolution} <span className="num text-xs text-muted">({day(r.handledAt)})</span></p>}
                  {r.status === "OPEN" && (
                    <ActionForm action={resolveRequestAction} submitLabel={t("privacy.resolve")} variant="outline" className="mt-2 flex flex-wrap items-end gap-2 space-y-0">
                      <HouseholdField id={id} />
                      <input type="hidden" name="requestId" value={r.id} />
                      <label className="text-xs">{t("privacy.outcome")}<Select name="status"><option value="DONE">{t("privacy.status.DONE")}</option><option value="REJECTED">{t("privacy.status.REJECTED")}</option></Select></label>
                      <label className="min-w-64 flex-1 text-xs">{t("privacy.resolution")}<Input name="resolution" required /></label>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand">{t("privacy.logRequest")}</summary>
          <ActionForm action={logRequestAction} submitLabel={t("privacy.logRequest")} className="mt-2 space-y-2">
            <HouseholdField id={id} />
            <label className="block text-xs">{t("privacy.requestType")}<Select name="type">{(["ACCESS", "CORRECTION", "DELETION"] as const).map((k) => <option key={k} value={k}>{t(`privacy.type.${k}`)}</option>)}</Select></label>
            <label className="block text-xs">{t("privacy.details")}<Textarea name="details" rows={2} /></label>
          </ActionForm>
        </details>
      </Card>

      <Card>
        <CardTitle>{t("privacy.deletionTitle")}</CardTitle>
        <p className="mb-3 text-sm text-muted">{t("privacy.deletionHelp")}</p>
        {status.retentionYears === null
          ? <p className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{t("privacy.noRetention")}</p>
          : <p className="mb-3 text-sm">{t("privacy.retention", { years: status.retentionYears })}</p>}

        {!restricted ? (
          <ActionForm action={restrictAction} submitLabel={t("privacy.restrictButton")} variant="danger" confirm={t("privacy.restrictConfirm")} className="space-y-2">
            <HouseholdField id={id} />
            <label className="block text-xs">{t("privacy.reason")}<Input name="reason" required minLength={3} /></label>
            <label className="block text-xs">{t("privacy.typeName", { name: status.displayName })}<Input name="confirmName" required autoComplete="off" /></label>
          </ActionForm>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
              <dt className="text-muted">{t("privacy.restrictedAt")}</dt><dd className="num">{day(status.restrictedAt)}</dd>
              <dt className="text-muted">{t("privacy.reason")}</dt><dd>{status.restrictedReason}</dd>
              <dt className="text-muted">{t("privacy.purgeAt")}</dt>
              <dd>{e.state === "WAITING" || e.state === "ELIGIBLE" ? <span className="num">{day(e.eligibleAt)}</span> : t("privacy.purgeAtUnknown")}</dd>
            </dl>
            <ActionForm action={liftAction} submitLabel={t("privacy.liftButton")} variant="outline" confirm={t("privacy.liftConfirm")}>
              <HouseholdField id={id} />
            </ActionForm>
            {e.state === "ELIGIBLE" && (
              <ActionForm action={purgeAction} submitLabel={t("privacy.purgeButton")} variant="danger" confirm={t("privacy.purgeConfirmDialog")} className="space-y-2 rounded-md border border-bad p-3">
                <HouseholdField id={id} />
                <p className="text-sm text-bad">{t("privacy.purgeWarning")}</p>
                <label className="block text-xs">{t("privacy.typeName", { name: status.displayName })}<Input name="confirmName" required autoComplete="off" /></label>
              </ActionForm>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

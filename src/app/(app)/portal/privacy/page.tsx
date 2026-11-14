import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/select";
import { requireClient } from "@/server/auth/dal";
import { listPrivacyRequests } from "@/server/privacy/service";
import { clientPrivacyRequestAction } from "../actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

/** "My data": download everything we hold, and ask for correction or deletion. */
export default async function MyDataPage() {
  const user = await requireClient();
  const t = await getTranslations();
  const requests = await listPrivacyRequests(user, user.householdId);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t("portalPrivacy.title")}</h1>
      <Card>
        <CardTitle>{t("portalPrivacy.downloadTitle")}</CardTitle>
        <p className="mb-3 text-sm text-muted">{t("portalPrivacy.downloadHelp")}</p>
        <a href="/api/privacy/export" className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground" download>{t("portalPrivacy.downloadButton")}</a>
      </Card>
      <Card>
        <CardTitle>{t("portalPrivacy.requestTitle")}</CardTitle>
        <p className="mb-3 text-sm text-muted">{t("portalPrivacy.requestHelp")}</p>
        <ActionForm action={clientPrivacyRequestAction} submitLabel={t("portalPrivacy.send")} className="space-y-2">
          <label className="block text-sm">{t("privacy.requestType")}
            <Select name="type">{(["CORRECTION", "DELETION", "ACCESS"] as const).map((k) => <option key={k} value={k}>{t(`privacy.type.${k}`)}</option>)}</Select>
          </label>
          <label className="block text-sm">{t("privacy.details")}<Textarea name="details" rows={3} maxLength={2000} /></label>
        </ActionForm>
        <p className="mt-3 text-xs text-muted">{t("portalPrivacy.deletionNote")}</p>
      </Card>
      {requests.length > 0 && (
        <Card>
          <CardTitle>{t("portalPrivacy.myRequests")}</CardTitle>
          <ul className="space-y-2">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{t(`privacy.type.${r.type}`)}</span>
                <Badge tone={r.status === "OPEN" ? "warn" : r.status === "DONE" ? "ok" : "neutral"}>{t(`privacy.status.${r.status}`)}</Badge>
                <span className="text-xs text-muted">{t("privacy.received")} <span className="num">{day(r.receivedAt)}</span></span>
                {r.resolution && <p className="basis-full border-s-2 border-accent ps-2">{r.resolution}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

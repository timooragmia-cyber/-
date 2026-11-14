import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { RecAction } from "@/components/app/rec-action";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/select";
import { formatMoney, type MoneyLocale } from "@/lib/money";
import { requireAdvisor } from "@/server/auth/dal";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { listPlan } from "@/server/plan/service";
import { recommendationText } from "@/server/plan/text";
import { regeneratePlanAction, updateRecommendationAction } from "../actions";

const tone = { PROPOSED: "warn", APPROVED: "ok", IN_PROGRESS: "neutral", DONE: "ok", DISMISSED: "neutral" } as const;

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  const t = await getTranslations();
  const locale = (await getLocale()) as MoneyLocale;
  const [recs, threshold] = await Promise.all([listPlan(user, id), getAdvisoryParameter<number | null>("debt.expensive_threshold_ppm")]);
  const m = (a: bigint | null) => (a === null ? "—" : formatMoney(a, locale, { decimals: 0 }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{t("plan.title")}</h2>
        <ActionForm action={regeneratePlanAction} submitLabel={t("plan.regenerate")} resetOnSuccess={false}>
          <HouseholdField id={id} />
        </ActionForm>
      </div>
      <p className="text-sm text-muted">{t("plan.help")}</p>
      {threshold === null && <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{t("plan.thresholdMissing")}</p>}
      {recs.length === 0 ? <Card><p className="text-muted">{t("plan.empty")}</p></Card> : (
        <ol className="space-y-3">
          {recs.map((r, i) => {
            const { title, reason } = recommendationText(t, locale, r);
            return (
              <li key={r.id} className={`rounded-lg border border-border bg-surface p-4 ${r.status === "DISMISSED" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold"><span className="num text-muted">{i + 1}.</span> {title}</p>
                    <p className="text-sm text-muted">{reason}</p>
                    {r.advisorNote && <p className="mt-1 border-s-2 border-accent ps-2 text-sm">{r.advisorNote}</p>}
                  </div>
                  <div className="text-end text-sm">
                    <Badge tone={tone[r.status]}>{t(`plan.status.${r.status}`)}</Badge>
                    {r.impactMonthly !== null && <p>{t("plan.impactMonthly")}: <b className="num">{m(r.impactMonthly)}</b></p>}
                    {r.impactLifetime !== null && <p>{t("plan.impactLifetime")}: <b className="num">{m(r.impactLifetime)}</b></p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.status === "PROPOSED" && <RecAction action={updateRecommendationAction} householdId={id} recId={r.id} status="APPROVED" label={t("plan.approve")} variant="default" />}
                  {r.status === "APPROVED" && <RecAction action={updateRecommendationAction} householdId={id} recId={r.id} status="IN_PROGRESS" label={t("plan.status.IN_PROGRESS")} />}
                  {(r.status === "APPROVED" || r.status === "IN_PROGRESS") && <RecAction action={updateRecommendationAction} householdId={id} recId={r.id} status="DONE" label={t("plan.status.DONE")} />}
                  {r.status !== "DISMISSED" && r.status !== "DONE" && <RecAction action={updateRecommendationAction} householdId={id} recId={r.id} status="DISMISSED" label={t("plan.dismiss")} variant="ghost" />}
                  {(r.status === "DISMISSED" || r.status === "APPROVED") && <RecAction action={updateRecommendationAction} householdId={id} recId={r.id} status="PROPOSED" label={t("plan.reopen")} variant="ghost" />}
                  {i > 0 && <RecAction action={updateRecommendationAction} householdId={id} recId={r.id} move="up" label={`▲ ${t("plan.up")}`} variant="ghost" />}
                  {i < recs.length - 1 && <RecAction action={updateRecommendationAction} householdId={id} recId={r.id} move="down" label={`▼ ${t("plan.down")}`} variant="ghost" />}
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-brand">{t("plan.customTitle")} / {t("plan.note")}</summary>
                  <ActionForm action={updateRecommendationAction} submitLabel={t("plan.save")} resetOnSuccess={false} className="mt-2">
                    <HouseholdField id={id} />
                    <input type="hidden" name="recId" value={r.id} />
                    <Input name="customTitle" defaultValue={r.customTitle ?? ""} aria-label={t("plan.customTitle")} placeholder={t("plan.customTitle")} />
                    <Textarea name="advisorNote" rows={2} defaultValue={r.advisorNote ?? ""} aria-label={t("plan.note")} placeholder={t("plan.note")} />
                  </ActionForm>
                </details>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

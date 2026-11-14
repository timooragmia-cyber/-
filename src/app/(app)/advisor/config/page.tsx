import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ActionForm } from "@/components/app/action-form";
import { Textarea } from "@/components/ui/select";
import { confirmParamAction, updateFeeAction, updateParamAction, updateTaxRuleAction } from "./actions";
import { Input } from "@/components/ui/input";
import { formatPpmPercent } from "@/lib/money";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function ConfigPage() {
  await requireAdvisor();
  const t = await getTranslations();
  const [rules, fees, params] = await Promise.all([
    db.taxRule.findMany({ orderBy: [{ ruleKey: "asc" }, { effectiveFrom: "desc" }] }),
    db.feeBenchmark.findMany({ where: { effectiveTo: null }, orderBy: [{ productType: "asc" }, { feeBase: "asc" }] }),
    db.advisoryParameter.findMany({ where: { effectiveTo: null }, orderBy: { key: "asc" } }),
  ]);
  const unverified = rules.filter((r) => r.status !== "VERIFIED").length + fees.filter((f) => f.status !== "VERIFIED").length;
  const tone = (s: string) => (s === "VERIFIED" ? "ok" : s === "MISSING" ? "bad" : "warn") as "ok" | "bad" | "warn";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("config.title")}</h1>
      <p className="text-sm text-muted">{t("config.intro")}</p>
      {unverified > 0 && (
        <p role="status" className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
          {t("config.unverifiedWarning", { count: unverified })}
        </p>
      )}

      <Card>
        <CardTitle>{t("config.taxRules")}</CardTitle>
        <p className="mb-3 text-xs text-muted">{t("tax.ruleEdit.help")}</p>
        <ul className="space-y-3">
          {rules.map((r) => (
            <li key={r.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="num font-mono text-xs" dir="ltr">{r.ruleKey}</span>
                <span className="flex items-center gap-2">
                  <span className="num text-xs text-muted">{ymd(r.effectiveFrom)} → {ymd(r.effectiveTo)}</span>
                  <Badge tone={tone(r.status)}>{t(`enums.VerificationStatus.${r.status}`)}</Badge>
                </span>
              </div>
              {r.notes && <p className="mt-1 text-xs text-muted">{r.notes}</p>}
              {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand underline">{t("tax.source")}</a>}
              {r.lastVerifiedAt && <p className="text-xs text-ok">{t("feeEdit.verifiedBy", { date: ymd(r.lastVerifiedAt) })}</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-brand">{t("tax.ruleEdit.title")}</summary>
                <ActionForm action={updateTaxRuleAction} submitLabel={t("feeEdit.save")} resetOnSuccess={false} className="mt-2">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="block text-xs">{t("tax.ruleEdit.params")}<Textarea name="params" rows={4} dir="ltr" className="font-mono text-xs" defaultValue={r.parameters === null ? "" : JSON.stringify(r.parameters)} /></label>
                  <label className="block text-xs">{t("feeEdit.source")}<Input name="sourceUrl" dir="ltr" defaultValue={r.sourceUrl ?? ""} /></label>
                  <label className="block text-xs">{t("feeEdit.notes")}<Textarea name="notes" rows={2} defaultValue={r.notes ?? ""} /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verify" /> {t("feeEdit.verify")}</label>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>{t("config.feeBenchmarks")}</CardTitle>
        <ul className="space-y-3">
          {fees.map((f) => (
            <li key={f.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{t(`productType.${f.productType}`)} · {f.feeBase === "DEPOSITS" ? t("sim.fromDeposit") : t("sim.fromBalance")}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted">{t("savings.benchmark")} <span className="num">{f.benchmarkPpm !== null ? formatPpmPercent(f.benchmarkPpm, "he", 3) : "—"}</span> · {t("savings.ceiling")} <span className="num">{f.legalCeilingPpm !== null ? formatPpmPercent(f.legalCeilingPpm, "he", 3) : "—"}</span></span>
                  <Badge tone={tone(f.status)}>{t(`enums.VerificationStatus.${f.status}`)}</Badge>
                </span>
              </div>
              {f.notes && <p className="mt-1 text-xs text-muted">{f.notes}</p>}
              {f.lastVerifiedAt && <p className="text-xs text-ok">{t("feeEdit.verifiedBy", { date: ymd(f.lastVerifiedAt) })}</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-brand">{t("feeEdit.title")}</summary>
                <ActionForm action={updateFeeAction} submitLabel={t("feeEdit.save")} resetOnSuccess={false} className="mt-2">
                  <input type="hidden" name="id" value={f.id} />
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="text-xs">{t("feeEdit.benchmark")}<Input name="benchmark" dir="ltr" inputMode="decimal" defaultValue={f.benchmarkPpm !== null ? f.benchmarkPpm / 10_000 : ""} /></label>
                    <label className="text-xs">{t("feeEdit.ceiling")}<Input name="ceiling" dir="ltr" inputMode="decimal" defaultValue={f.legalCeilingPpm !== null ? f.legalCeilingPpm / 10_000 : ""} /></label>
                    <label className="text-xs">{t("feeEdit.source")}<Input name="sourceUrl" dir="ltr" defaultValue={f.sourceUrl ?? ""} /></label>
                  </div>
                  <label className="block text-xs">{t("feeEdit.notes")}<Textarea name="notes" rows={2} defaultValue={f.notes ?? ""} /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verify" /> {t("feeEdit.verify")}</label>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>{t("config.advisoryParameters")}</CardTitle>
        <p className="mb-4 text-sm text-muted">{t("configEdit.historyNote")}</p>
        <ul className="space-y-4">
          {params.map((p) => (
            <li key={p.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="num font-mono text-xs">{p.key}</span>
                <Badge tone={p.confirmedAt ? "ok" : "warn"}>{p.confirmedAt ? t("configEdit.confirmed") : t("configEdit.unconfirmed")}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{p.description}</p>
              <p className="mt-1 text-xs text-muted">{t("config.effectiveFrom")} <span className="num">{ymd(p.effectiveFrom)}</span></p>
              <div className="mt-2 flex flex-wrap items-start gap-3">
                <ActionForm action={updateParamAction} submitLabel={t("configEdit.edit")} variant="outline" resetOnSuccess={false} className="min-w-64 flex-1">
                  <input type="hidden" name="key" value={p.key} />
                  <Textarea name="value" rows={2} dir="ltr" className="font-mono text-xs" aria-label={t("configEdit.json")} defaultValue={JSON.stringify(p.value)} />
                </ActionForm>
                {!p.confirmedAt && (
                  <ActionForm action={confirmParamAction} submitLabel={t("configEdit.confirm")}>
                    <input type="hidden" name="id" value={p.id} />
                  </ActionForm>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

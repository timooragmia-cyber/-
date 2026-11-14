import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ActionForm } from "@/components/app/action-form";
import { Textarea } from "@/components/ui/select";
import { confirmParamAction, updateParamAction } from "./actions";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function ConfigPage() {
  await requireAdvisor();
  const t = await getTranslations();
  const [rules, fees, params] = await Promise.all([
    db.taxRule.findMany({ orderBy: [{ ruleKey: "asc" }, { effectiveFrom: "desc" }] }),
    db.feeBenchmark.findMany({ orderBy: [{ productType: "asc" }, { feeBase: "asc" }] }),
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

      <Card className="p-0 sm:p-0">
        <CardTitle className="px-4 pt-4">{t("config.taxRules")}</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>{t("config.ruleKey")}</Th>
              <Th>{t("config.effectiveFrom")}</Th>
              <Th>{t("config.source")}</Th>
              <Th>{t("config.verification")}</Th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <Td className="num font-mono text-xs">{r.ruleKey}</Td>
                <Td className="num">{ymd(r.effectiveFrom)}</Td>
                <Td className="text-xs">{r.sourceTitle ?? "—"}</Td>
                <Td>
                  <Badge tone={tone(r.status)}>{t(`enums.VerificationStatus.${r.status}`)}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="p-0 sm:p-0">
        <CardTitle className="px-4 pt-4">{t("config.feeBenchmarks")}</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>{t("config.ruleKey")}</Th>
              <Th>{t("config.effectiveFrom")}</Th>
              <Th>{t("config.source")}</Th>
              <Th>{t("config.verification")}</Th>
            </tr>
          </thead>
          <tbody>
            {fees.map((f) => (
              <tr key={f.id}>
                <Td className="num font-mono text-xs">
                  {f.productType} / {f.feeBase}
                </Td>
                <Td className="num">{ymd(f.effectiveFrom)}</Td>
                <Td className="text-xs">{f.sourceTitle ?? "—"}</Td>
                <Td>
                  <Badge tone={tone(f.status)}>{t(`enums.VerificationStatus.${f.status}`)}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
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
              <p className="num mt-1 text-xs text-muted">{t("config.effectiveFrom")} {ymd(p.effectiveFrom)}</p>
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

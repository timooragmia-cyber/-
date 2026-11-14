import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function ConfigPage() {
  await requireAdvisor();
  const t = await getTranslations();
  const [rules, fees, params] = await Promise.all([
    db.taxRule.findMany({ orderBy: [{ ruleKey: "asc" }, { effectiveFrom: "desc" }] }),
    db.feeBenchmark.findMany({ orderBy: [{ productType: "asc" }, { feeBase: "asc" }] }),
    db.advisoryParameter.findMany({ orderBy: { key: "asc" } }),
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

      <Card className="p-0 sm:p-0">
        <CardTitle className="px-4 pt-4">{t("config.advisoryParameters")}</CardTitle>
        <Table>
          <thead>
            <tr>
              <Th>{t("config.ruleKey")}</Th>
              <Th>{t("config.value")}</Th>
              <Th>{t("config.effectiveFrom")}</Th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.id}>
                <Td>
                  <div className="num font-mono text-xs">{p.key}</div>
                  <div className="text-xs text-muted">{p.description}</div>
                </Td>
                <Td className="num font-mono text-xs">{JSON.stringify(p.value)}</Td>
                <Td className="num">{ymd(p.effectiveFrom)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

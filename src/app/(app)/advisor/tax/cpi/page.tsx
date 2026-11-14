import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/select";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";
import { importCpiAction, upsertCpiAction } from "../actions";

export default async function CpiPage() {
  await requireAdvisor();
  const t = await getTranslations();
  const rows = await db.cpiValue.findMany({ orderBy: { period: "desc" }, take: 36 });
  const base = rows[0]?.base ?? "";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("tax.cpi.title")}</h1>
      <p className="text-sm text-muted">{t("tax.cpi.intro")}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("tax.cpi.import")}</CardTitle>
          <ActionForm action={importCpiAction} submitLabel={t("tax.cpi.import")}>
            <Field label={t("tax.cpi.base")} htmlFor="cpi-base"><Input id="cpi-base" name="base" defaultValue={base} required /></Field>
            <Input name="file" type="file" accept=".csv,.xlsx,.xls,.txt" aria-label={t("upload.file")} required />
          </ActionForm>
        </Card>
        <Card>
          <CardTitle>{t("tax.cpi.manual")}</CardTitle>
          <ActionForm action={upsertCpiAction} submitLabel={t("form.save")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("tax.cpi.period")} htmlFor="cpi-p"><Input id="cpi-p" name="period" dir="ltr" placeholder="2026-09" required /></Field>
              <Field label={t("tax.cpi.value")} htmlFor="cpi-v"><Input id="cpi-v" name="value" dir="ltr" inputMode="decimal" required /></Field>
              <Field label={t("tax.cpi.base")} htmlFor="cpi-b"><Input id="cpi-b" name="base" defaultValue={base} required /></Field>
            </div>
          </ActionForm>
        </Card>
      </div>
      <Card>
        <CardTitle>{t("tax.cpi.list")}</CardTitle>
        {rows.length === 0 ? <p className="text-sm text-muted">{t("tax.cpiEmpty")}</p> : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            {rows.map((r) => <li key={r.id} className="flex justify-between"><span className="num">{r.period}</span><span className="num">{(r.valueMilli / 1000).toFixed(3)}</span></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}

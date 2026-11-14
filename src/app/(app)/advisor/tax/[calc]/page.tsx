import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { fieldsFor, type FieldSpec } from "@/components/tax/fields";
import { ResultView } from "@/components/tax/result-view";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/select";
import type { CalcResult } from "@/lib/tax/common";
import { audit } from "@/server/audit";
import { requireAdvisor } from "@/server/auth/dal";
import { db } from "@/server/db";
import { isCalculator } from "@/server/tax/calculators";
import { runCalculator } from "@/server/tax/service";
import { saveRunAction } from "../actions";

function FieldInput({ f, value, label, options }: { f: FieldSpec; value: string | undefined; label: string; options?: { value: string; label: string }[] }) {
  if (f.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name={f.name} defaultChecked={value === "on"} /> {label}
      </label>
    );
  }
  return (
    <Field label={label} htmlFor={`f-${f.name}`}>
      {typeof f.type === "object" ? (
        <Select id={`f-${f.name}`} name={f.name} defaultValue={value ?? f.type.select[0]}>
          {options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : (
        <Input
          id={`f-${f.name}`}
          name={f.name}
          type={f.type === "date" ? "date" : "text"}
          inputMode={f.type === "date" ? undefined : "decimal"}
          dir="ltr"
          required={f.required}
          defaultValue={value ?? f.def ?? ""}
        />
      )}
    </Field>
  );
}

export default async function CalculatorPage({ params, searchParams }: { params: Promise<{ calc: string }>; searchParams: Promise<Record<string, string>> }) {
  const user = await requireAdvisor();
  const { calc } = await params;
  if (!isCalculator(calc)) notFound();
  const sp = await searchParams;
  const t = await getTranslations();
  const fields = fieldsFor(calc);
  const run = sp.run === "1";
  const raw = Object.fromEntries(fields.map((f) => [f.name, sp[f.name] ?? ""]));
  const outcome = run ? await runCalculator(calc, raw) : null;
  if (run) await audit({ action: "VIEW", actorUserId: user.id, actorRole: user.role, entityType: "TaxCalculation", entityId: calc, metadata: { ok: outcome?.ok ?? false } });
  const households = outcome?.ok ? await db.household.findMany({ where: { archivedAt: null }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }) : [];

  const errorText = (() => {
    if (!outcome || outcome.ok) return null;
    switch (outcome.error) {
      case "input":
        return t("tax.errors.input", { fields: outcome.fields.map((f) => (t.has(`tax.fields.${f}`) ? t(`tax.fields.${f}`) : f)).join(", ") });
      case "rule":
        return t("tax.errors.rule", { ruleKey: outcome.ruleKey, on: outcome.on, reason: t(`tax.errors.reasons.${outcome.reason}`) });
      case "cpi":
        return t("tax.errors.cpi", { period: outcome.period });
      case "calc":
        return t("tax.errors.calc", { code: t.has(`tax.errors.codes.${outcome.code}`) ? t(`tax.errors.codes.${outcome.code}`) : outcome.code });
    }
  })();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t(`tax.calculators.${calc}`)}</h1>
      <p className="text-sm text-muted">{t(`tax.descriptions.${calc}`)}</p>
      <Card>
        <CardTitle>{t("tax.inputs")}</CardTitle>
        <form method="get" className="space-y-3">
          <input type="hidden" name="run" value="1" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {fields.map((f) => (
              <FieldInput
                key={f.name}
                f={f}
                value={run ? raw[f.name] : undefined}
                label={t(`tax.fields.${f.name}`)}
                options={typeof f.type === "object" ? f.type.select.map((o) => ({ value: o, label: t(`tax.options.${o}`) })) : undefined}
              />
            ))}
          </div>
          <Button type="submit">{t("tax.calculate")}</Button>
        </form>
      </Card>

      {errorText && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{errorText}</p>}

      {outcome?.ok && (
        <>
          <ResultView result={outcome.result as CalcResult<Record<string, unknown>>} />
          <Card>
            <CardTitle>{t("tax.save")}</CardTitle>
            <ActionForm action={saveRunAction} submitLabel={t("tax.save")} className="flex flex-wrap items-end gap-3 space-y-0">
              <input type="hidden" name="$calc" value={calc} />
              {Object.entries(raw).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <Field label={t("tax.household")} htmlFor="save-h">
                <Select id="save-h" name="$household" required className="w-64">
                  {households.map((h) => <option key={h.id} value={h.id}>{h.displayName}</option>)}
                </Select>
              </Field>
              <Field label={t("tax.saveTitle")} htmlFor="save-title"><Input id="save-title" name="$title" className="w-64" /></Field>
            </ActionForm>
          </Card>
        </>
      )}
    </div>
  );
}

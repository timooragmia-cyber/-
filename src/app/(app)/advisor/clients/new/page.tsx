import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/select";
import { requireAdvisor } from "@/server/auth/dal";
import { createHouseholdAction } from "./actions";

export default async function NewClientPage() {
  await requireAdvisor();
  const t = await getTranslations();
  return (
    <Card className="mx-auto max-w-xl">
      <CardTitle>{t("newClient.title")}</CardTitle>
      <ActionForm action={createHouseholdAction} submitLabel={t("newClient.create")} resetOnSuccess={false}>
        <Field label={t("newClient.displayName")} htmlFor="displayName"><Input id="displayName" name="displayName" required minLength={2} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("newClient.primaryFirst")} htmlFor="firstName"><Input id="firstName" name="firstName" required /></Field>
          <Field label={t("newClient.primaryLast")} htmlFor="lastName"><Input id="lastName" name="lastName" required /></Field>
          <Field label={t("newClient.city")} htmlFor="city"><Input id="city" name="city" /></Field>
          <Field label={t("newClient.preferredLocale")} htmlFor="preferredLocale">
            <Select id="preferredLocale" name="preferredLocale"><option value="he">{t("lang.he")}</option><option value="ar">{t("lang.ar")}</option></Select>
          </Field>
          <Field label={t("newClient.employment")} htmlFor="employmentType">
            <Select id="employmentType" name="employmentType">
              {(["SALARIED", "SELF_EMPLOYED", "BOTH", "NOT_EMPLOYED", "RETIRED"] as const).map((e) => <option key={e} value={e}>{t(`enums.EmploymentType.${e}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("newClient.consent")} htmlFor="consent">
            <Select id="consent" name="consent">
              {(["SIGNED_FORM", "PORTAL_ACCEPTANCE", "RECORDED_VERBAL"] as const).map((m) => <option key={m} value={m}>{t(`consentMethod.${m}`)}</option>)}
              <option value="NONE">{t("newClient.consentNone")}</option>
            </Select>
          </Field>
        </div>
      </ActionForm>
    </Card>
  );
}

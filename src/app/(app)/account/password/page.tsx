import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/select";
import { requireUser } from "@/server/auth/dal";
import { changePasswordAction } from "./actions";

export default async function PasswordPage() {
  const user = await requireUser({ allowPasswordChangePending: true });
  const t = await getTranslations("pwd");
  return (
    <Card className="mx-auto max-w-md">
      <CardTitle>{t("title")}</CardTitle>
      {user.mustChangePassword && <p role="status" className="mb-3 rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">{t("mustChange")}</p>}
      <ActionForm action={changePasswordAction} submitLabel={t("submit")} resetOnSuccess={false}>
        <Field label={t("current")} htmlFor="current"><Input id="current" name="current" type="password" autoComplete="current-password" dir="ltr" required /></Field>
        <Field label={t("new")} htmlFor="new"><Input id="new" name="new" type="password" autoComplete="new-password" minLength={12} dir="ltr" required /></Field>
        <Field label={t("confirm")} htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={12} dir="ltr" required /></Field>
      </ActionForm>
    </Card>
  );
}

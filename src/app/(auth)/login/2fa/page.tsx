import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { getPartialUser } from "@/server/auth/dal";
import { verifySecondFactorAction } from "../actions";
import { CodeForm } from "../code-form";

export default async function TwoFactorPage() {
  const state = await getPartialUser();
  if (!state) redirect("/login");
  if (!state.user.totpEnabled) redirect(state.user.role === "ADVISOR" ? "/login/setup-2fa" : "/portal");
  if (state.secondFactorDone) redirect("/");
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardTitle>{t("twoFactorTitle")}</CardTitle>
      <p className="mb-4 text-sm text-muted">{t("twoFactorHelp")}</p>
      <CodeForm action={verifySecondFactorAction} allowRecovery />
    </Card>
  );
}

import { getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardTitle>
        <span>{t("loginTitle")}</span>
      </CardTitle>
      <LoginForm />
    </Card>
  );
}

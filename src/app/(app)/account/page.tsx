import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { locales } from "@/i18n/config";
import { requireUser } from "@/server/auth/dal";
import { setLocaleAction } from "./actions";

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">{t("account.title")}</h1>
      <Card>
        <CardTitle>{t("account.language")}</CardTitle>
        <form action={setLocaleAction} className="flex flex-wrap items-center gap-3">
          {locales.map((l) => (
            <label key={l} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <input type="radio" name="locale" value={l} defaultChecked={user.locale === l} />
              <span lang={l}>{t(`lang.${l}`)}</span>
            </label>
          ))}
          <Button type="submit">{t("account.save")}</Button>
        </form>
      </Card>
      <Card>
        <CardTitle>{t("account.twoFactor")}</CardTitle>
        <Badge tone={user.totpEnabled ? "ok" : "neutral"}>{t(user.totpEnabled ? "account.enabled" : "account.disabled")}</Badge>
      </Card>
    </div>
  );
}

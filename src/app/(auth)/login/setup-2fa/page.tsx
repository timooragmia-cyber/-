import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { Card, CardTitle } from "@/components/ui/card";
import { getPartialUser } from "@/server/auth/dal";
import { getOrCreatePendingTotpSecret } from "@/server/auth/enrollment";
import { otpauthUri } from "@/server/auth/totp";
import { env } from "@/server/env";
import { confirmTotpEnrollmentAction } from "../actions";
import { CodeForm } from "../code-form";

export default async function SetupTwoFactorPage() {
  const state = await getPartialUser();
  if (!state) redirect("/login");
  if (state.user.totpEnabled) redirect(state.secondFactorDone ? "/" : "/login/2fa");

  const secret = await getOrCreatePendingTotpSecret(state.user.id);
  const uri = otpauthUri(secret, state.user.email, env().TOTP_ISSUER);
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  const t = await getTranslations("auth");

  return (
    <Card>
      <CardTitle>{t("setupTitle")}</CardTitle>
      <ol className="mb-4 list-decimal space-y-3 ps-5 text-sm">
        <li>
          {t("setupStep1")}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR" width={220} height={220} className="mx-auto my-3 rounded border border-border" />
          <span className="text-muted">{t("setupManual")}</span>
          <code className="num mt-1 block break-all rounded bg-background p-2 text-xs">{secret}</code>
        </li>
        <li>{t("setupStep2")}</li>
      </ol>
      <CodeForm action={confirmTotpEnrollmentAction} />
    </Card>
  );
}

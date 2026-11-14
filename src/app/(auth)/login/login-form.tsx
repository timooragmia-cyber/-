"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { loginAction, type FormState } from "./actions";

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="username" dir="ltr" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" dir="ltr" required />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">
          {t(state.error === "invalidCode" ? "invalid" : state.error)}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}

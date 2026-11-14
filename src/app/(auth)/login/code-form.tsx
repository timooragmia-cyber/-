"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { FormState } from "./actions";

export function CodeForm({
  action: serverAction,
  allowRecovery = false,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  allowRecovery?: boolean;
}) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(serverAction, undefined);

  if (state?.recoveryCodes) {
    return (
      <div className="space-y-3">
        <h2 className="font-semibold">{t("recoveryTitle")}</h2>
        <p className="text-sm text-muted">{t("recoveryHelp")}</p>
        <ul className="num grid grid-cols-2 gap-2 rounded-md bg-background p-3 font-mono text-sm">
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Link href="/" className="block text-center font-medium text-brand underline">
          {t("continue")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="code">{t("code")}</Label>
        <Input
          id="code"
          name="code"
          dir="ltr"
          autoComplete="one-time-code"
          inputMode={allowRecovery ? "text" : "numeric"}
          maxLength={allowRecovery ? 16 : 6}
          required
          className="num text-center text-lg tracking-widest"
        />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">
          {t(state.error === "invalid" ? "invalidCode" : state.error)}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {t("verify")}
      </Button>
    </form>
  );
}

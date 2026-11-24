"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { loginAction, type FormState } from "./actions";

const HEBREW = /[֐-׿]/;

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, undefined);
  // Controlled fields: React 19 resets uncontrolled inputs after every submit, which emptied the
  // e-mail after a failed attempt (and the next try failed for lack of an e-mail).
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="username" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="password">{t("password")}</Label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input id="show-password" type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            {t("showPassword")}
          </label>
        </div>
        <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr" required
          value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={onKey} onKeyDown={onKey} />
        {HEBREW.test(password) && <p className="text-xs text-warn">{t("hebrewInPassword")}</p>}
        {caps && <p className="text-xs text-warn">{t("capsLock")}</p>}
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

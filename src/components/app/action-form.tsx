"use client";

import { startTransition, useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

/**
 * Form bound to a server action returning ActionState. Shows translated error / success.
 * Error strings that are not i18n keys (e.g. config validation details) are shown as-is.
 *
 * Submission is dispatched manually (not via <form action>) because React 19 resets a
 * form's fields after every action submit — including failed ones, which would wipe what
 * the user typed. Here fields are kept on error and reset only on success (if requested).
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  variant,
  confirm,
  resetOnSuccess = true,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "danger" | "ghost";
  confirm?: string;
  resetOnSuccess?: boolean;
}) {
  const t = useTranslations();
  // Wrap the server action so every result carries a fresh nonce: two identical successes in
  // a row still reset the form.
  const [state, formAction, pending] = useActionState<(ActionState & { nonce?: number }) | undefined, FormData>(async (prev, data) => {
    const r = await action(prev, data);
    return r ? { ...r, nonce: Date.now() + Math.random() } : r;
  }, undefined);
  const tr = (k: string) => (t.has(k) ? t(k, state?.values) : k);
  return (
    <form
      key={resetOnSuccess && state?.ok ? state.nonce : undefined}
      className={cn("space-y-3", className)}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {children}
      {state?.error && (
        <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">
          {tr(state.error)}
        </p>
      )}
      {state?.ok && state.message && (
        <p role="status" className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok">
          {tr(state.message)}
        </p>
      )}
      {state?.secret && <code className="num block break-all rounded bg-background p-2 font-mono text-sm">{state.secret}</code>}
      <Button type="submit" variant={variant} disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

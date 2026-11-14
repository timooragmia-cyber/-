"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

/**
 * Form bound to a server action returning ActionState. Shows translated error / success.
 * Error strings that are not i18n keys (e.g. config validation details) are shown as-is.
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
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  const tr = (k: string) => (t.has(k) ? t(k, state?.values) : k);
  return (
    <form
      action={formAction}
      key={resetOnSuccess && state?.ok ? JSON.stringify(state) : undefined}
      className={cn("space-y-3", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
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

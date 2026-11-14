/** Shared return shape for server actions used with useActionState. */
export type ActionState = {
  ok?: boolean;
  /** i18n key (e.g. "form.error", "upload.errors.TOO_LARGE") or a raw message from config validation. */
  error?: string;
  /** i18n key for success, with optional values. */
  message?: string;
  values?: Record<string, string | number>;
  /** One-time data to display (e.g. a temporary password). */
  secret?: string;
} | undefined;

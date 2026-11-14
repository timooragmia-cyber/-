export const locales = ["he", "ar"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "he";
export const LOCALE_COOKIE = "ta_locale";

export function isLocale(v: unknown): v is AppLocale {
  return typeof v === "string" && (locales as readonly string[]).includes(v);
}

/** Both supported languages are RTL. Kept as a function so adding English later is trivial. */
export function dirFor(locale: AppLocale): "rtl" | "ltr" {
  return locale === "he" || locale === "ar" ? "rtl" : "ltr";
}

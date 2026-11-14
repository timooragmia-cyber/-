import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// Locale is per user (stored on User.locale, mirrored into a cookie at login / on switch).
// No locale segment in URLs: the advisor and client share links regardless of language.
// An explicit locale (getTranslations({ locale }) — e.g. a PDF report in the client's language)
// wins over the viewer's cookie.
export default getRequestConfig(async ({ locale: explicit }) => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(explicit) ? explicit : isLocale(fromCookie) ? fromCookie : defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Jerusalem",
  };
});

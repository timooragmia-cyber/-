import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// Locale is per user (stored on User.locale, mirrored into a cookie at login / on switch).
// No locale segment in URLs: the advisor and client share links regardless of language.
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Jerusalem",
  };
});

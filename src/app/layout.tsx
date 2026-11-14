import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { dirFor, isLocale, defaultLocale } from "@/i18n/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "T.A Mortgages",
  description: "Financial management & investment platform",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : defaultLocale;
  return (
    <html lang={locale} dir={dirFor(locale)} className="h-full antialiased">
      <body className="min-h-full">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}

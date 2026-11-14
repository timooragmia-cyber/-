import { getTranslations } from "next-intl/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-2xl font-bold text-brand">{t("name")}</p>
        <p className="text-sm text-muted">{t("tagline")}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}

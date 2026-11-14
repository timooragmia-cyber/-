import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { logoutAction } from "@/app/(auth)/login/actions";
import type { CurrentUser } from "@/server/auth/dal";

export async function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const t = await getTranslations();
  const links =
    user.role === "ADVISOR"
      ? [
          { href: "/advisor", label: t("nav.dashboard") },
          { href: "/advisor/tax", label: t("nav.tax") },
          { href: "/advisor/config", label: t("nav.config") },
          { href: "/account", label: t("nav.account") },
        ]
      : [
          { href: "/portal", label: t("nav.portal") },
          { href: "/portal/upload", label: t("nav.upload") },
          { href: "/portal/privacy", label: t("nav.myData") },
          { href: "/account", label: t("nav.account") },
        ];
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
        {t("nav.skipToContent")}
      </a>
      <header className="border-b border-border bg-brand text-brand-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-lg font-bold">
            {t("app.name")}
          </Link>
          <nav aria-label="main" className="flex flex-1 flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="opacity-90">{user.displayName}</span>
            <form action={logoutAction}>
              <button type="submit" className="rounded border border-white/40 px-2 py-1 hover:bg-white/10">
                {t("nav.logout")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>
      <footer className="border-t border-border bg-surface">
        <p className="mx-auto max-w-6xl px-4 py-3 text-xs text-muted">{t("app.disclaimer")}</p>
      </footer>
    </div>
  );
}

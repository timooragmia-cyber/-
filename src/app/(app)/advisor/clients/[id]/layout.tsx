import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Tabs } from "@/components/app/tabs";
import { requireAdvisor, requireOpenHousehold } from "@/server/auth/dal";
import { db } from "@/server/db";

export default async function ClientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await requireAdvisor();
  const { id } = await params;
  await requireOpenHousehold(id);
  const h = await db.household.findUnique({ where: { id }, select: { displayName: true, city: true } });
  if (!h) notFound();
  const t = await getTranslations("tabs");
  const base = `/advisor/clients/${id}`;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{h.displayName}</h1>
        {h.city && <p className="text-sm text-muted">{h.city}</p>}
      </div>
      <Tabs
        items={[
          { href: base, label: t("overview"), exact: true },
          { href: `${base}/profile`, label: t("profile") },
          { href: `${base}/accounts`, label: t("accounts") },
          { href: `${base}/transactions`, label: t("transactions") },
          { href: `${base}/cards`, label: t("cards") },
          { href: `${base}/cashflow`, label: t("cashflow") },
          { href: `${base}/months`, label: t("months") },
          { href: `${base}/savings`, label: t("savings") },
          { href: `${base}/investments`, label: t("investments") },
          { href: `${base}/routes`, label: t("routes") },
          { href: `${base}/debt`, label: t("debt") },
          { href: `${base}/plan`, label: t("plan") },
          { href: `${base}/reports`, label: t("reports") },
          { href: `${base}/calculations`, label: t("calculations") },
          { href: `${base}/tasks`, label: t("tasks") },
          { href: `/advisor/privacy/${id}`, label: t("privacy") },
        ]}
      />
      {children}
    </div>
  );
}

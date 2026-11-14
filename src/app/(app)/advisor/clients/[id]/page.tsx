import { getLocale } from "next-intl/server";
import { HealthCard, HighlightsCard, InstallmentsCard, RecurringCard, TrendCard } from "@/components/app/insights";
import { audit } from "@/server/audit";
import { requireAdvisor, requireOpenHousehold } from "@/server/auth/dal";
import { householdInsights, loadCategories } from "@/server/months";
import { catName, type Loc } from "@/server/view";

export default async function ClientOverview({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdvisor();
  const { id } = await params;
  await requireOpenHousehold(id);
  const locale = (await getLocale()) as Loc;
  const [insights, cats] = await Promise.all([householdInsights(id), loadCategories()]);
  await audit({ action: "VIEW", actorUserId: user.id, actorRole: user.role, entityType: "HouseholdOverview", entityId: id, householdId: id });
  const names = new Map([...cats.values()].map((c) => [c.key, catName(c, locale)]));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <TrendCard insights={insights} />
        <RecurringCard insights={insights} />
      </div>
      <div className="space-y-4">
        <HealthCard insights={insights} />
        <HighlightsCard insights={insights} categoryNames={names} />
        <InstallmentsCard insights={insights} />
      </div>
    </div>
  );
}

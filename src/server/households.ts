import "server-only";
import { computeHouseholdStatus, type HouseholdStatusResult } from "@/lib/domain/household-status";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { audit } from "@/server/audit";
import { assertHouseholdAccess, type CurrentUser } from "@/server/auth/dal";
import { db } from "@/server/db";

/** Latest version per period, newest first (snapshots are immutable & versioned). */
function latestVersions<T extends { period: string; version: number }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const r of rows) {
    const cur = best.get(r.period);
    if (!cur || r.version > cur.version) best.set(r.period, r);
  }
  return [...best.values()].sort((a, b) => b.period.localeCompare(a.period));
}

export type DashboardRow = {
  id: string;
  displayName: string;
  city: string | null;
  memberCount: number;
  hasConsent: boolean;
  status: HouseholdStatusResult;
  latestSurplus: bigint | null;
  restrictedAt: Date | null;
};

export async function listHouseholdsForAdvisor(user: CurrentUser): Promise<DashboardRow[]> {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const [graceDays, flat] = await Promise.all([
    getAdvisoryParameter<number>("monthly_close.grace_days"),
    getAdvisoryParameter<number>("dashboard.trend_flat_threshold_ppm"),
  ]);
  const households = await db.household.findMany({
    where: { archivedAt: null },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      displayName: true,
      city: true,
      restrictedAt: true,
      _count: { select: { members: true } },
      consents: { where: { type: "DATA_PROCESSING", revokedAt: null }, select: { id: true }, take: 1 },
      snapshots: {
        orderBy: [{ period: "desc" }, { version: "desc" }],
        take: 6,
        select: { period: true, version: true, surplus: true, savingsRatePpm: true },
      },
    },
  });
  const now = new Date();
  await audit({ action: "VIEW", actorUserId: user.id, actorRole: user.role, entityType: "HouseholdList" });
  return households.map((h) => {
    const snaps = latestVersions(h.snapshots);
    return {
      id: h.id,
      displayName: h.displayName,
      city: h.city,
      memberCount: h._count.members,
      hasConsent: h.consents.length > 0,
      status: computeHouseholdStatus(snaps, now, graceDays, flat),
      latestSurplus: snaps[0]?.surplus ?? null,
      restrictedAt: h.restrictedAt,
    };
  });
}

export async function getHouseholdProfile(user: CurrentUser, householdId: string) {
  await assertHouseholdAccess(user, householdId);
  const household = await db.household.findUnique({
    where: { id: householdId },
    include: {
      members: { orderBy: { memberRole: "asc" }, select: { id: true, firstName: true, lastName: true, memberRole: true, birthYear: true, employmentType: true } },
      incomeSources: { orderBy: { createdAt: "asc" } },
      goals: { where: { status: "ACTIVE" }, orderBy: { priority: "asc" } },
      consents: { orderBy: { grantedAt: "desc" } },
      snapshots: { orderBy: [{ period: "desc" }, { version: "desc" }], take: 13 },
      actionItems: {
        where: user.role === "CLIENT" ? { visibleToClient: true, status: { in: ["OPEN", "IN_PROGRESS"] } } : {},
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  if (!household) return null;
  await audit({ action: "VIEW", actorUserId: user.id, actorRole: user.role, entityType: "Household", entityId: householdId, householdId });
  return { ...household, snapshots: latestVersions(household.snapshots) };
}

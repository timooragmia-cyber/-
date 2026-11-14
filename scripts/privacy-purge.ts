/**
 * Scheduled privacy purge (daily, see docs/DEPLOYMENT.md):
 *   npm run privacy:purge            → purge restricted households whose retention period ended
 *   npm run privacy:purge -- --dry-run
 * Refuses to purge anything while privacy.retention_years is not set.
 */
import "dotenv/config";
import { purgeEligibility } from "@/lib/privacy/retention";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { db } from "@/server/db";
import { purgeDueHouseholds } from "@/server/privacy/service";

async function main() {
  const dry = process.argv.includes("--dry-run");
  const now = new Date();
  const years = await getAdvisoryParameter<number | null>("privacy.retention_years", now);
  const restricted = await db.household.findMany({ where: { restrictedAt: { not: null } }, select: { id: true, restrictedAt: true } });
  const plan = restricted.map((h) => ({ id: h.id, ...purgeEligibility(h.restrictedAt, years, now) }));
  console.log(JSON.stringify({ at: now.toISOString(), retentionYears: years, restricted: restricted.length, eligible: plan.filter((p) => p.state === "ELIGIBLE").map((p) => p.id), dryRun: dry }));
  if (dry) return;
  const r = await purgeDueHouseholds(now);
  console.log(JSON.stringify({ purged: r.purged.map((p) => ({ id: p.id, files: "files" in p ? p.files : 0, fileErrors: "fileErrors" in p ? p.fileErrors : 0 })) }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

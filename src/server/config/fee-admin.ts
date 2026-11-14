import "server-only";
import { parsePercentToPpm } from "@/lib/money";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { db } from "@/server/db";

const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const pct = (v: string): number | null | "invalid" => {
  if (!v.trim()) return null;
  try {
    const p = parsePercentToPpm(v);
    return p < 0 || p > 1_000_000 ? "invalid" : p;
  } catch {
    return "invalid";
  }
};

/**
 * Advisor edits a fee benchmark / ceiling (no developer needed).
 * - A VERIFIED row is never edited in place: the change becomes a new row effective today and
 *   the old one is closed (history kept for traceability).
 * - "verify" marks the row VERIFIED by this advisor now, with the source URL required.
 */
export async function updateFeeBenchmark(user: CurrentUser, id: string, input: { benchmark: string; ceiling: string; sourceUrl: string; verify: boolean; notes: string }) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const b = pct(input.benchmark);
  const c = pct(input.ceiling);
  if (b === "invalid" || c === "invalid") return { ok: false as const, error: "invalid_percent" };
  if (input.sourceUrl && !/^https:\/\/[^\s]+$/.test(input.sourceUrl)) return { ok: false as const, error: "invalid_url" };
  if (input.verify && !input.sourceUrl) return { ok: false as const, error: "source_required" };
  const row = await db.feeBenchmark.findUniqueOrThrow({ where: { id } });
  const changed = row.benchmarkPpm !== b || row.legalCeilingPpm !== c || (row.sourceUrl ?? "") !== input.sourceUrl || (row.notes ?? "") !== input.notes;
  const status = input.verify ? ("VERIFIED" as const) : b === null && c === null ? ("MISSING" as const) : row.status === "VERIFIED" && !changed ? ("VERIFIED" as const) : ("UNVERIFIED" as const);
  const verifiedFields = input.verify ? { lastVerifiedByUserId: user.id, lastVerifiedAt: new Date() } : {};
  const data = { benchmarkPpm: b, legalCeilingPpm: c, sourceUrl: input.sourceUrl || null, notes: input.notes || null, status, ...verifiedFields };
  const start = today();
  if (row.status === "VERIFIED" && changed && row.effectiveFrom.getTime() !== start.getTime()) {
    await db.$transaction([
      db.feeBenchmark.update({ where: { id }, data: { effectiveTo: new Date(start.getTime() - 86_400_000) } }),
      db.feeBenchmark.create({ data: { productType: row.productType, feeBase: row.feeBase, effectiveFrom: start, sourceTitle: row.sourceTitle, ...data } }),
    ]);
  } else {
    await db.feeBenchmark.update({ where: { id }, data });
  }
  await audit({ action: "CONFIG_CHANGE", actorUserId: user.id, actorRole: user.role, entityType: "FeeBenchmark", entityId: `${row.productType}/${row.feeBase}`, metadata: { from: { b: row.benchmarkPpm, c: row.legalCeilingPpm, status: row.status }, to: { b, c, status } } });
  return { ok: true as const };
}

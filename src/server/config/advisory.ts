import "server-only";
import { db } from "@/server/db";

/**
 * Reads an advisory parameter valid on `on` (default today). Throws if missing so a
 * screen never silently falls back to a value hidden in code.
 */
export async function getAdvisoryParameter<T>(key: string, on: Date = new Date()): Promise<T> {
  const row = await db.advisoryParameter.findFirst({
    where: { key, effectiveFrom: { lte: on }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: on } }] },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!row) throw new Error(`Advisory parameter "${key}" is not configured for ${on.toISOString().slice(0, 10)}`);
  return row.value as T;
}

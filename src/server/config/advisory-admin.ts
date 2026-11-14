import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ADVISORY_SCHEMAS } from "./advisory-schemas";

const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

/**
 * Change an advisory parameter. History is preserved: the current row is closed
 * (effectiveTo = yesterday) and a new row starts today, already confirmed by the advisor.
 * A second change on the same day edits today's row.
 */
export async function updateAdvisoryParameter(user: CurrentUser, key: string, rawJson: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const schema = ADVISORY_SCHEMAS[key];
  if (!schema) return { ok: false, error: "unknown_key" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, error: "invalid_json" };
  }
  const v = schema.safeParse(parsed);
  if (!v.success) return { ok: false, error: v.error.issues[0]?.message ?? "invalid" };

  const start = today();
  const current = await db.advisoryParameter.findFirst({ where: { key, effectiveTo: null }, orderBy: { effectiveFrom: "desc" } });
  const value = v.data as Prisma.InputJsonValue;
  await db.$transaction(async (tx) => {
    if (current && current.effectiveFrom.getTime() === start.getTime()) {
      await tx.advisoryParameter.update({ where: { id: current.id }, data: { value, updatedByUserId: user.id, confirmedByUserId: user.id, confirmedAt: new Date() } });
      return;
    }
    if (current) await tx.advisoryParameter.update({ where: { id: current.id }, data: { effectiveTo: new Date(start.getTime() - 86_400_000) } });
    await tx.advisoryParameter.create({
      data: { key, value, effectiveFrom: start, description: current?.description, updatedByUserId: user.id, confirmedByUserId: user.id, confirmedAt: new Date() },
    });
  });
  await audit({ action: "CONFIG_CHANGE", actorUserId: user.id, actorRole: user.role, entityType: "AdvisoryParameter", entityId: key, metadata: { from: current?.value ?? null, to: value } });
  return { ok: true };
}

export async function confirmAdvisoryParameter(user: CurrentUser, id: string) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const row = await db.advisoryParameter.update({ where: { id }, data: { confirmedByUserId: user.id, confirmedAt: new Date() } });
  await audit({ action: "CONFIG_CHANGE", actorUserId: user.id, actorRole: user.role, entityType: "AdvisoryParameter", entityId: row.key, metadata: { confirmed: true } });
}

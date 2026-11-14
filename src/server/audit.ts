import "server-only";
import { headers } from "next/headers";
import type { AuditAction, Role } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";

export type AuditInput = {
  action: AuditAction;
  actorUserId?: string | null;
  actorRole?: Role | null;
  entityType?: string;
  entityId?: string;
  householdId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

/** Append-only audit trail (DB trigger forbids UPDATE/DELETE). Never put secrets in metadata. */
export async function audit(entry: AuditInput): Promise<void> {
  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
    userAgent = h.get("user-agent")?.slice(0, 300) ?? null;
  } catch {
    // outside a request (seed/scripts)
  }
  await db.auditLog.create({
    data: {
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      householdId: entry.householdId ?? null,
      ip,
      userAgent,
      metadata: entry.metadata,
    },
  });
}

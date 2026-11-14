"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth/dal";
import { hashPassword, passwordPolicyError, verifyPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";

export async function changePasswordAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireUser({ allowPasswordChangePending: true });
  if (!rateLimit(`pwd:${user.id}`, 5, 15 * 60_000).ok) return { error: "auth.rateLimited" };
  const current = String(f.get("current") ?? "");
  const next = String(f.get("new") ?? "");
  if (next !== String(f.get("confirm") ?? "")) return { error: "pwd.mismatch" };
  if (passwordPolicyError(next)) return { error: "pwd.tooShort" };
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(row.passwordHash, current))) return { error: "pwd.wrongCurrent" };
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date(), mustChangePassword: false } }),
    // Sign out every other session of this user.
    db.session.deleteMany({ where: { userId: user.id, id: { not: user.sessionId } } }),
  ]);
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "User.password", entityId: user.id });
  redirect(user.role === "ADVISOR" ? "/advisor" : "/portal");
}

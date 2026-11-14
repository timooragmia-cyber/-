import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/server/db";
import { env } from "@/server/env";

export const SESSION_COOKIE = "ta_session";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function createSession(userId: string, secondFactorDone: boolean): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const h = await headers();
  const expiresAt = new Date(Date.now() + env().SESSION_ABSOLUTE_HOURS * 3600_000);
  await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      secondFactorDone,
      expiresAt,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionWithUser = NonNullable<Awaited<ReturnType<typeof loadSession>>>;

async function loadSession(token: string) {
  return db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          displayName: true,
          locale: true,
          isActive: true,
          householdId: true,
          totpEnabledAt: true,
        },
      },
    },
  });
}

/**
 * Returns the current session if valid; enforces absolute expiry and idle timeout.
 * Sliding idle refresh is throttled to one write per minute.
 */
export async function getSession(): Promise<SessionWithUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await loadSession(token);
  if (!session) return null;
  const now = Date.now();
  const idleMs = env().SESSION_IDLE_MINUTES * 60_000;
  if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + idleMs <= now || !session.user.isActive) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  return session;
}

export async function markSecondFactorDone(sessionId: string): Promise<void> {
  // Rotate the token on privilege elevation to prevent session fixation.
  const token = randomBytes(32).toString("base64url");
  const s = await db.session.update({
    where: { id: sessionId },
    data: { secondFactorDone: true, tokenHash: sha256(token), lastSeenAt: new Date() },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: s.expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

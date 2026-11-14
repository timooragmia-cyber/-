"use server";

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/server/audit";
import { getPartialUser, requiresSecondFactor } from "@/server/auth/dal";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession, markSecondFactorDone } from "@/server/auth/session";
import { generateRecoveryCodes, verifyTotp } from "@/server/auth/totp";
import { decrypt } from "@/server/crypto";
import { db } from "@/server/db";
import { rateLimit, resetRateLimit } from "@/server/rate-limit";
import { LOCALE_COOKIE } from "@/i18n/config";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type FormState = { error?: "invalid" | "locked" | "rateLimited" | "invalidCode"; recoveryCodes?: string[] } | undefined;

// Precomputed hash so unknown e-mails take the same time as known ones (no user enumeration).
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword("timing-equalizer-not-a-real-password"));

const homeFor = (role: "ADVISOR" | "CLIENT") => (role === "ADVISOR" ? "/advisor" : "/portal");

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
}

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(256) });

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const { email, password } = parsed.data;

  const ip = await clientIp();
  if (!rateLimit(`login:ip:${ip}`, 30, 15 * 60_000).ok || !rateLimit(`login:email:${email}`, 10, 15 * 60_000).ok) {
    return { error: "rateLimited" };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    await verifyPassword(await getDummyHash(), password);
    await audit({ action: "LOGIN_FAILED", metadata: { reason: "unknown_or_inactive" } });
    return { error: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ action: "LOGIN_LOCKED", actorUserId: user.id, actorRole: user.role });
    return { error: "locked" };
  }
  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED;
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
    });
    await audit({ action: lock ? "LOGIN_LOCKED" : "LOGIN_FAILED", actorUserId: user.id, actorRole: user.role });
    return { error: lock ? "locked" : "invalid" };
  }

  await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  resetRateLimit(`login:email:${email}`);
  // Kill any previous session cookie (fixation) before issuing a new one.
  await destroySession();
  const needs2fa = requiresSecondFactor(user.role, user.totpEnabledAt !== null);
  await createSession(user.id, !needs2fa);
  (await cookies()).set(LOCALE_COOKIE, user.locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  await audit({ action: "LOGIN_SUCCESS", actorUserId: user.id, actorRole: user.role, metadata: { secondFactorPending: needs2fa } });

  if (user.role === "ADVISOR" && !user.totpEnabledAt) redirect("/login/setup-2fa");
  if (needs2fa) redirect("/login/2fa");
  redirect(homeFor(user.role));
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const normalizeRecovery = (v: string) => v.trim().toUpperCase().replace(/[^A-Z2-7]/g, "");

export async function verifySecondFactorAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await getPartialUser();
  if (!state) redirect("/login");
  const { user } = state;
  if (!rateLimit(`2fa:${user.id}`, 6, 5 * 60_000).ok) return { error: "rateLimited" };

  const code = String(form.get("code") ?? "").trim();
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!row.totpSecretEnc || !row.totpEnabledAt) redirect("/login/setup-2fa");

  let ok = false;
  if (/^\d{6}$/.test(code)) {
    const counter = verifyTotp(decrypt(row.totpSecretEnc, `totp:${user.id}`), code, Date.now());
    if (counter !== null && (row.totpLastCounter === null || counter > row.totpLastCounter)) {
      await db.user.update({ where: { id: user.id }, data: { totpLastCounter: counter } });
      ok = true;
    }
  } else if (code.length >= 10) {
    const hash = sha256(normalizeRecovery(code));
    const used = await db.recoveryCode.updateMany({ where: { userId: user.id, codeHash: hash, usedAt: null }, data: { usedAt: new Date() } });
    ok = used.count === 1;
  }

  if (!ok) {
    await audit({ action: "TWO_FACTOR_FAILED", actorUserId: user.id, actorRole: user.role });
    return { error: "invalidCode" };
  }
  await markSecondFactorDone(user.sessionId);
  resetRateLimit(`2fa:${user.id}`);
  redirect(homeFor(user.role));
}

export async function confirmTotpEnrollmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const state = await getPartialUser();
  if (!state) redirect("/login");
  const { user } = state;
  if (!rateLimit(`2fa-setup:${user.id}`, 6, 5 * 60_000).ok) return { error: "rateLimited" };
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (row.totpEnabledAt || !row.totpSecretEnc) redirect(homeFor(user.role));

  const counter = verifyTotp(decrypt(row.totpSecretEnc, `totp:${user.id}`), String(form.get("code") ?? "").trim(), Date.now());
  if (counter === null) return { error: "invalidCode" };

  const codes = generateRecoveryCodes();
  // The session token was freshly issued at password login, so no rotation is needed here.
  // We deliberately do NOT set a cookie in this action: a cookie write makes Next re-render
  // the page (which would redirect away before the one-time recovery codes are shown).
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), totpLastCounter: counter } }),
    db.recoveryCode.deleteMany({ where: { userId: user.id } }),
    db.recoveryCode.createMany({ data: codes.map((c) => ({ userId: user.id, codeHash: sha256(normalizeRecovery(c)) })) }),
    db.session.update({ where: { id: user.sessionId }, data: { secondFactorDone: true } }),
  ]);
  await audit({ action: "TWO_FACTOR_ENROLLED", actorUserId: user.id, actorRole: user.role });
  return { recoveryCodes: codes };
}

export async function logoutAction(): Promise<void> {
  const state = await getPartialUser();
  if (state) await audit({ action: "LOGOUT", actorUserId: state.user.id, actorRole: state.user.role });
  await destroySession();
  redirect("/login");
}

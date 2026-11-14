import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { requiresSecondFactor } from "./dal-guards";
import { getSession } from "./session";

/**
 * Data Access Layer: the ONLY place that decides who may see what.
 * Every page, server action and route handler calls one of these first.
 * The proxy's cookie check is an optimistic redirect only, never authorization.
 */

export type CurrentUser = {
  id: string;
  email: string;
  role: "ADVISOR" | "CLIENT";
  displayName: string;
  locale: "he" | "ar";
  householdId: string | null;
  sessionId: string;
  totpEnabled: boolean;
};

export { requiresSecondFactor } from "./dal-guards";

const getAuthState = cache(async (): Promise<{ user: CurrentUser; secondFactorDone: boolean } | null> => {
  const s = await getSession();
  if (!s) return null;
  return {
    secondFactorDone: s.secondFactorDone,
    user: {
      id: s.user.id,
      email: s.user.email,
      role: s.user.role,
      displayName: s.user.displayName,
      locale: s.user.locale,
      householdId: s.user.householdId,
      sessionId: s.id,
      totpEnabled: s.user.totpEnabledAt !== null,
    },
  };
});

/** Session user regardless of 2FA state (used only by the login/2FA flow itself). */
export async function getPartialUser(): Promise<{ user: CurrentUser; secondFactorDone: boolean } | null> {
  return getAuthState();
}

/** Fully authenticated user (password + second factor where required). */
export async function requireUser(): Promise<CurrentUser> {
  const state = await getAuthState();
  if (!state) redirect("/login");
  const { user } = state;
  if (user.role === "ADVISOR" && !user.totpEnabled) redirect("/login/setup-2fa");
  if (requiresSecondFactor(user.role, user.totpEnabled) && !state.secondFactorDone) redirect("/login/2fa");
  return user;
}

export async function requireAdvisor(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADVISOR") redirect("/portal");
  return user;
}

export async function requireClient(): Promise<CurrentUser & { householdId: string }> {
  const user = await requireUser();
  if (user.role !== "CLIENT" || !user.householdId) redirect("/advisor");
  return user as CurrentUser & { householdId: string };
}

export { assertHouseholdAccess, canAccessHousehold, ForbiddenError } from "./dal-guards";

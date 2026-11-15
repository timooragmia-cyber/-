/** Pure authorization rules (unit-tested). The DAL re-exports and enforces them. */
export type GuardUser = { role: "ADVISOR" | "CLIENT"; householdId: string | null };

export class ForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ForbiddenError";
  }
}

/** Tenant guard: an advisor sees every household; a client only their own. */
export function canAccessHousehold(user: GuardUser, householdId: string): boolean {
  if (user.role === "ADVISOR") return true;
  return user.householdId !== null && user.householdId === householdId;
}

export function assertHouseholdAccess(user: GuardUser, householdId: string): void {
  if (!canAccessHousehold(user, householdId)) throw new ForbiddenError();
}

/**
 * ADVISOR: 2FA mandatory on the server edition; on the desktop edition (one computer, no
 * network exposure) it is optional. CLIENT: 2FA when they enabled it. Enabled = always asked.
 */
export function requiresSecondFactor(role: GuardUser["role"], totpEnabled: boolean, advisorMandatory = true): boolean {
  return (role === "ADVISOR" && advisorMandatory) || totpEnabled;
}

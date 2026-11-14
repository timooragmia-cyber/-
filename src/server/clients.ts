import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal-guards";
import { hashPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { parseAmount } from "@/lib/money";
import { isPeriod } from "@/lib/domain/period";

/** All mutations here are advisor-only unless stated; every one is audited. */
function advisorOnly(user: CurrentUser) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
}

const money = z.string().trim().transform((v, ctx) => {
  try {
    const a = parseAmount(v);
    if (a < 0n) throw new Error();
    return a;
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid_amount" });
    return z.NEVER;
  }
});
const optMoney = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return null;
  try {
    return parseAmount(v);
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid_amount" });
    return z.NEVER;
  }
});
const optDate = z.string().trim().optional().transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

export const householdSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80).optional(),
  preferredLocale: z.enum(["he", "ar"]),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  employmentType: z.enum(["SALARIED", "SELF_EMPLOYED", "BOTH", "NOT_EMPLOYED", "RETIRED"]),
  consent: z.enum(["SIGNED_FORM", "PORTAL_ACCEPTANCE", "RECORDED_VERBAL", "NONE"]),
});

export async function createHousehold(user: CurrentUser, input: z.infer<typeof householdSchema>) {
  advisorOnly(user);
  const h = await db.household.create({
    data: {
      displayName: input.displayName,
      city: input.city || null,
      preferredLocale: input.preferredLocale,
      members: { create: { firstName: input.firstName, lastName: input.lastName, memberRole: "PRIMARY", employmentType: input.employmentType } },
      ...(input.consent !== "NONE"
        ? { consents: { create: { type: "DATA_PROCESSING", textVersion: "2026-01-draft", method: input.consent, grantedAt: new Date(), recordedByUserId: user.id } } }
        : {}),
    },
  });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "Household", entityId: h.id, householdId: h.id });
  return h;
}

export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80).optional(),
  preferredLocale: z.enum(["he", "ar"]),
  riskTolerance: z.enum(["", "VERY_LOW", "LOW", "MEDIUM", "HIGH"]),
});

export async function updateProfile(user: CurrentUser, householdId: string, input: z.infer<typeof profileSchema>) {
  advisorOnly(user);
  const before = await db.household.findUniqueOrThrow({ where: { id: householdId } });
  const risk = input.riskTolerance === "" ? null : input.riskTolerance;
  await db.household.update({
    where: { id: householdId },
    data: {
      displayName: input.displayName,
      city: input.city || null,
      preferredLocale: input.preferredLocale,
      riskTolerance: risk,
      riskAssessedAt: risk !== before.riskTolerance ? (risk ? new Date() : null) : before.riskAssessedAt,
    },
  });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "Household", entityId: householdId, householdId, metadata: { riskTolerance: risk } });
}

export const memberSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  memberRole: z.enum(["PRIMARY", "SPOUSE", "DEPENDENT", "OTHER"]),
  birthYear: z.string().trim().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1900).max(2100).nullable()),
  employmentType: z.enum(["", "SALARIED", "SELF_EMPLOYED", "BOTH", "NOT_EMPLOYED", "RETIRED"]).transform((v) => (v === "" ? null : v)),
});

export async function addMember(user: CurrentUser, householdId: string, input: z.infer<typeof memberSchema>) {
  advisorOnly(user);
  const m = await db.person.create({ data: { householdId, ...input } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "Person", entityId: m.id, householdId });
}

export const incomeSchema = z.object({
  label: z.string().trim().min(1).max(120),
  type: z.enum(["SALARY", "SELF_EMPLOYMENT", "BONUS", "RENTAL", "PENSION", "ALLOWANCE", "OTHER"]),
  personId: z.string().optional().transform((v) => v || null),
  netMonthly: money,
  grossMonthly: optMoney,
  regularity: z.enum(["FIXED", "IRREGULAR"]),
});

export async function addIncome(user: CurrentUser, householdId: string, input: z.infer<typeof incomeSchema>) {
  advisorOnly(user);
  if (input.personId) await db.person.findFirstOrThrow({ where: { id: input.personId, householdId } });
  const r = await db.incomeSource.create({ data: { householdId, ...input } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "IncomeSource", entityId: r.id, householdId });
}

export const goalSchema = z.object({ title: z.string().trim().min(1).max(120), targetAmount: money, targetDate: optDate });

export async function addGoal(user: CurrentUser, householdId: string, input: z.infer<typeof goalSchema>) {
  advisorOnly(user);
  const count = await db.goal.count({ where: { householdId } });
  const g = await db.goal.create({ data: { householdId, ...input, priority: count } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "Goal", entityId: g.id, householdId });
}

export async function deleteRow(user: CurrentUser, householdId: string, kind: "member" | "income" | "goal", id: string) {
  advisorOnly(user);
  if (kind === "member") await db.person.deleteMany({ where: { id, householdId } });
  if (kind === "income") await db.incomeSource.deleteMany({ where: { id, householdId } });
  if (kind === "goal") await db.goal.deleteMany({ where: { id, householdId } });
  await audit({ action: "DELETE", actorUserId: user.id, actorRole: user.role, entityType: kind, entityId: id, householdId });
}

export async function recordConsent(user: CurrentUser, householdId: string, method: "SIGNED_FORM" | "PORTAL_ACCEPTANCE" | "RECORDED_VERBAL") {
  advisorOnly(user);
  const c = await db.consent.create({ data: { householdId, type: "DATA_PROCESSING", textVersion: "2026-01-draft", method, grantedAt: new Date(), recordedByUserId: user.id } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "Consent", entityId: c.id, householdId });
}

export async function revokeConsent(user: CurrentUser, householdId: string, consentId: string) {
  advisorOnly(user);
  await db.consent.updateMany({ where: { id: consentId, householdId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "Consent", entityId: consentId, householdId, metadata: { revoked: true } });
}

export async function hasActiveConsent(householdId: string): Promise<boolean> {
  return (await db.consent.count({ where: { householdId, type: "DATA_PROCESSING", revokedAt: null } })) > 0;
}

export const accountSchema = z.object({
  kind: z.enum(["BANK_ACCOUNT", "CREDIT_CARD", "CASH"]),
  institution: z.enum(["LEUMI", "HAPOALIM", "DISCOUNT", "MIZRAHI_TEFAHOT", "ISRACARD", "CAL", "MAX", "OTHER"]),
  nickname: z.string().trim().min(1).max(80),
  last4: z.string().trim().optional().transform((v) => v || null).pipe(z.string().regex(/^\d{4}$/).nullable()),
  ownerPersonId: z.string().optional().transform((v) => v || null),
});

export async function addAccount(user: CurrentUser, householdId: string, input: z.infer<typeof accountSchema>) {
  advisorOnly(user);
  if (input.ownerPersonId) await db.person.findFirstOrThrow({ where: { id: input.ownerPersonId, householdId } });
  const a = await db.financialAccount.create({ data: { householdId, ...input } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "FinancialAccount", entityId: a.id, householdId });
  return a;
}

export const clientLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  personId: z.string().min(1),
  locale: z.enum(["he", "ar"]),
});

/** Creates a client login with a one-time temporary password the client must change at first login. */
export async function createClientLogin(user: CurrentUser, householdId: string, input: z.infer<typeof clientLoginSchema>) {
  advisorOnly(user);
  const person = await db.person.findFirstOrThrow({ where: { id: input.personId, householdId } });
  const temp = randomBytes(9).toString("base64url");
  const u = await db.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(temp),
      role: "CLIENT",
      displayName: person.firstName,
      locale: input.locale,
      householdId,
      personId: person.id,
      mustChangePassword: true,
    },
  });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "User", entityId: u.id, householdId });
  return { email: u.email, temporaryPassword: temp };
}

export const budgetSchema = z.object({ categoryId: z.string().min(1), monthlyAmount: money, effectiveFrom: z.string().refine(isPeriod) });

export async function setBudget(user: CurrentUser, householdId: string, input: z.infer<typeof budgetSchema>) {
  advisorOnly(user);
  await db.budget.upsert({
    where: { householdId_categoryId_effectiveFrom: { householdId, categoryId: input.categoryId, effectiveFrom: input.effectiveFrom } },
    update: { monthlyAmount: input.monthlyAmount },
    create: { householdId, ...input },
  });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "Budget", householdId, metadata: { categoryId: input.categoryId, period: input.effectiveFrom } });
}

export const noteSchema = z.object({ body: z.string().trim().min(1).max(4000), period: z.string().optional().transform((v) => (v && isPeriod(v) ? v : null)) });

export async function addNote(user: CurrentUser, householdId: string, input: z.infer<typeof noteSchema>) {
  advisorOnly(user);
  const n = await db.advisorNote.create({ data: { householdId, body: input.body, period: input.period, createdByUserId: user.id } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "AdvisorNote", entityId: n.id, householdId });
}

export const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  details: z.string().trim().max(2000).optional(),
  dueDate: optDate,
  visibleToClient: z.string().optional().transform((v) => v === "on"),
  period: z.string().optional().transform((v) => (v && isPeriod(v) ? v : null)),
});

export async function addTask(user: CurrentUser, householdId: string, input: z.infer<typeof taskSchema>) {
  advisorOnly(user);
  const t = await db.actionItem.create({ data: { householdId, ...input, details: input.details || null, createdByUserId: user.id } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "ActionItem", entityId: t.id, householdId });
}

/** Advisor can set any status; the client can only move their own visible tasks between OPEN/IN_PROGRESS/DONE. */
export async function setTaskStatus(user: CurrentUser, householdId: string, taskId: string, status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED") {
  assertHouseholdAccess(user, householdId);
  const task = await db.actionItem.findFirstOrThrow({ where: { id: taskId, householdId } });
  if (user.role === "CLIENT" && (!task.visibleToClient || status === "CANCELLED")) throw new Error("Forbidden");
  await db.actionItem.update({ where: { id: task.id }, data: { status, completedAt: status === "DONE" ? new Date() : null } });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "ActionItem", entityId: task.id, householdId, metadata: { status } });
}

import "server-only";
import { z } from "zod";
import { bankCosts, cardCycles } from "@/lib/accounts/cards";
import { buildCashflowCalendar, projectBalance } from "@/lib/accounts/cashflow";
import { netWorthSeries, type BalancePoint } from "@/lib/accounts/net-worth";
import { addMonths, periodOf } from "@/lib/domain/period";
import { parseAmount } from "@/lib/money";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal-guards";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { db } from "@/server/db";
import { attributionDate } from "@/server/months";

const optMoney = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return null;
  try {
    return parseAmount(v);
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid_amount" });
    return z.NEVER;
  }
});

export const accountDetailsSchema = z.object({
  overdraftLimit: optMoney,
  overdraftRate: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const m = /^(\d{1,2})(?:\.(\d{1,4}))?$/.exec(v.replace("%", ""));
    if (!m) {
      ctx.addIssue({ code: "custom", message: "invalid_percent" });
      return z.NEVER;
    }
    return Number(m[1]) * 10_000 + Number(((m[2] ?? "") + "0000").slice(0, 4));
  }),
  monthlyFee: optMoney,
  creditLimit: optMoney,
  billingDay: z.string().trim().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(1).max(31).nullable()),
  annualCardFee: optMoney,
});

export async function updateAccountDetails(user: CurrentUser, householdId: string, accountId: string, input: z.infer<typeof accountDetailsSchema>) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const acc = await db.financialAccount.findFirstOrThrow({ where: { id: accountId, householdId } });
  await db.financialAccount.update({
    where: { id: acc.id },
    data: { overdraftLimit: input.overdraftLimit, overdraftRatePpm: input.overdraftRate, monthlyFee: input.monthlyFee, creditLimit: input.creditLimit, billingDay: input.billingDay, annualCardFee: input.annualCardFee },
  });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "FinancialAccount", entityId: acc.id, householdId });
}

export const balanceSchema = z.object({
  balance: z.string().trim().transform((v, ctx) => {
    try {
      return parseAmount(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid_amount" });
      return z.NEVER;
    }
  }),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function recordBalance(user: CurrentUser, householdId: string, accountId: string, input: z.infer<typeof balanceSchema>) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const acc = await db.financialAccount.findFirstOrThrow({ where: { id: accountId, householdId } });
  const asOf = new Date(`${input.asOf}T00:00:00Z`);
  await db.balanceSnapshot.upsert({
    where: { accountId_asOf: { accountId: acc.id, asOf } },
    update: { balance: input.balance, createdByUserId: user.id },
    create: { accountId: acc.id, asOf, balance: input.balance, createdByUserId: user.id },
  });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "BalanceSnapshot", entityId: acc.id, householdId });
}

export async function latestBalances(householdId: string) {
  const accounts = await db.financialAccount.findMany({ where: { householdId }, include: { balances: { orderBy: { asOf: "desc" }, take: 1 } }, orderBy: { createdAt: "asc" } });
  return accounts.map((a) => ({ account: a, latest: a.balances[0] ?? null }));
}

/** Card cycles, bank costs, per account (last N months). */
export async function accountsAnalysis(user: CurrentUser, householdId: string, months = 3) {
  assertHouseholdAccess(user, householdId);
  const since = new Date(`${addMonths(periodOf(new Date()), -months)}-01T00:00:00Z`);
  const accounts = await latestBalances(householdId);
  const txns = await db.transaction.findMany({
    where: { householdId, OR: [{ chargeDate: { gte: since } }, { chargeDate: null, date: { gte: since } }] },
    include: { category: { select: { key: true } } },
  });
  return accounts.map(({ account, latest }) => {
    const mine = txns.filter((t) => t.accountId === account.id);
    const rows = mine.map((t) => ({
      date: t.date.toISOString().slice(0, 10),
      chargeDate: t.chargeDate?.toISOString().slice(0, 10) ?? null,
      amount: t.amount,
      description: t.description,
      categoryKey: t.category?.key ?? null,
      installmentNumber: t.installmentNumber,
      installmentTotal: t.installmentTotal,
    }));
    return {
      account,
      latest,
      cycles: account.kind === "CREDIT_CARD" ? cardCycles(rows).slice(0, months) : [],
      costs: account.kind === "BANK_ACCOUNT" ? bankCosts(rows.map((r) => ({ ...r, date: r.chargeDate ?? r.date }))) : [],
    };
  });
}

export async function cashflow(user: CurrentUser, householdId: string) {
  assertHouseholdAccess(user, householdId);
  const p = await getAdvisoryParameter<{ lookbackMonths: number; minMonths: number; projectionDays: number }>("cashflow.calendar");
  const current = periodOf(new Date());
  const months = Array.from({ length: p.lookbackMonths }, (_, i) => addMonths(current, -(i + 1))).reverse();
  const banks = await latestBalances(householdId);
  const bankIds = banks.filter((b) => b.account.kind === "BANK_ACCOUNT").map((b) => b.account.id);
  const txns = await db.transaction.findMany({
    where: { householdId, accountId: { in: bankIds }, date: { gte: new Date(`${months[0]}-01T00:00:00Z`) } },
    select: { date: true, chargeDate: true, amount: true, description: true },
  });
  const cal = buildCashflowCalendar(txns.map((t) => ({ date: attributionDate(t), amount: t.amount, description: t.description })), months, p.minMonths);
  const withBalance = banks.filter((b) => b.account.kind === "BANK_ACCOUNT" && b.latest);
  const start = withBalance.length
    ? {
        date: withBalance.map((b) => b.latest!.asOf.toISOString().slice(0, 10)).sort().at(-1)!,
        balance: withBalance.reduce((s, b) => s + b.latest!.balance, 0n),
      }
    : null;
  const overdraft = banks.filter((b) => b.account.kind === "BANK_ACCOUNT").reduce<bigint | null>((s, b) => (b.account.overdraftLimit ? (s ?? 0n) + b.account.overdraftLimit : s), null);
  return { calendar: cal, start, projection: start ? projectBalance(cal, start, p.projectionDays, overdraft) : [], overdraft, params: p };
}

export async function netWorth(householdId: string, months = 12) {
  const [accounts, products] = await Promise.all([
    db.financialAccount.findMany({ where: { householdId }, include: { balances: true } }),
    db.longTermProduct.findMany({ where: { householdId }, include: { history: true } }),
  ]);
  const points: BalancePoint[] = [
    ...accounts.flatMap((a) => a.balances.map((b) => ({ key: `a:${a.id}`, kind: a.kind === "CREDIT_CARD" ? ("CARD" as const) : ("BANK" as const), asOf: b.asOf.toISOString().slice(0, 10), balance: b.balance }))),
    ...products.flatMap((p) => p.history.map((h) => ({ key: `p:${p.id}`, kind: "PRODUCT" as const, asOf: h.asOf.toISOString().slice(0, 10), balance: h.balance }))),
  ];
  const to = periodOf(new Date());
  return netWorthSeries(points, addMonths(to, -(months - 1)), to);
}

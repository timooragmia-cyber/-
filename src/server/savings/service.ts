import "server-only";
import { z } from "zod";
import { feeFlags, targetFees, type FeeBenchmarkRow, type FeeFlag } from "@/lib/savings/fee-flags";
import { compareFees, type FeeComparison } from "@/lib/savings/fee-simulator";
import { monthsToRetirement, projectRetirement, type Assumptions, type ScenarioResult } from "@/lib/savings/retirement";
import { selectEffective } from "@/lib/config/effective";
import { parseAmount, parsePercentToPpm } from "@/lib/money";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal-guards";
import { getAdvisoryParameter } from "@/server/config/advisory";
import { db } from "@/server/db";
import { PRODUCT_PARSERS, PRODUCT_TYPES } from "./report-parsers";

type Defaults = { retirementAge: number; conservativeReturnPpm: number; baseReturnPpm: number; optimisticReturnPpm: number; depositGrowthPpm: number; annuityFactorMilli: number };

export async function currentFeeRows(on = new Date()): Promise<FeeBenchmarkRow[]> {
  const rows = await db.feeBenchmark.findMany();
  const out: FeeBenchmarkRow[] = [];
  for (const type of new Set(rows.map((r) => r.productType))) {
    for (const base of ["DEPOSITS", "ACCUMULATION"] as const) {
      const r = selectEffective(rows.filter((x) => x.productType === type && x.feeBase === base), on);
      if (r) out.push({ productType: r.productType, feeBase: r.feeBase, benchmarkPpm: r.benchmarkPpm, legalCeilingPpm: r.legalCeilingPpm, status: r.status });
    }
  }
  return out;
}

export async function getAssumptions(householdId: string): Promise<{ a: Assumptions; fromHousehold: boolean; defaults: Defaults }> {
  const defaults = await getAdvisoryParameter<Defaults>("retirement.defaults");
  const row = await db.retirementAssumptions.findUnique({ where: { householdId } });
  const src = row ?? defaults;
  return {
    fromHousehold: !!row,
    defaults,
    a: {
      retirementAge: src.retirementAge,
      returns: { conservative: src.conservativeReturnPpm, base: src.baseReturnPpm, optimistic: src.optimisticReturnPpm },
      depositGrowthPpm: src.depositGrowthPpm,
      annuityFactorMilli: src.annuityFactorMilli,
    },
  };
}

/** Default horizon when the member's birth year is unknown (years). Shown on screen. */
const FALLBACK_HORIZON_YEARS = 20;

export type ProductView = Awaited<ReturnType<typeof savingsOverview>>["products"][number];

export async function savingsOverview(user: CurrentUser, householdId: string) {
  assertHouseholdAccess(user, householdId);
  const [products, members, rows, { a, fromHousehold, defaults }] = await Promise.all([
    db.longTermProduct.findMany({ where: { householdId }, orderBy: [{ personId: "asc" }, { productType: "asc" }], include: { person: true } }),
    db.person.findMany({ where: { householdId }, orderBy: { memberRole: "asc" } }),
    currentFeeRows(),
    getAssumptions(householdId),
  ]);
  const now = new Date();
  const views = products.map((p) => {
    const deposit = p.employeeDeposit + p.employerDeposit + p.severanceDeposit;
    const flags: FeeFlag[] = feeFlags(p.productType, { dep: p.feeDepositsPpm, acc: p.feeAccumulationPpm }, rows);
    const target = targetFees({ dep: p.feeDepositsPpm, acc: p.feeAccumulationPpm }, flags);
    const months = p.person?.birthYear ? monthsToRetirement(p.person.birthYear, a.retirementAge, now) : FALLBACK_HORIZON_YEARS * 12;
    const improvable = target.dep < p.feeDepositsPpm || target.acc < p.feeAccumulationPpm;
    const comparison: FeeComparison | null = improvable
      ? compareFees({ startBalance: p.balance, monthlyDeposit: p.isActive ? deposit : 0n, months, annualReturnPpm: a.returns.base, depositGrowthPpm: a.depositGrowthPpm }, { dep: p.feeDepositsPpm, acc: p.feeAccumulationPpm }, target)
      : null;
    return { product: p, deposit, flags, target, months, horizonFromBirthYear: !!p.person?.birthYear, comparison };
  });

  const byPerson = members.map((m) => {
    const mine = views.filter((v) => v.product.personId === m.id);
    if (mine.length === 0) return null;
    const months = m.birthYear ? monthsToRetirement(m.birthYear, a.retirementAge, now) : null;
    const scenarios: ScenarioResult[] | null =
      months === null
        ? null
        : projectRetirement(
            mine.map((v) => ({ id: v.product.id, productType: v.product.productType, balance: v.product.balance, monthlyDeposit: v.deposit, isActive: v.product.isActive, feeDepositsPpm: v.product.feeDepositsPpm, feeAccumulationPpm: v.product.feeAccumulationPpm })),
            months,
            a,
          );
    return { person: m, months, scenarios };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const totals = {
    balance: views.reduce((s, v) => s + v.product.balance, 0n),
    monthlyDeposits: views.reduce((s, v) => s + (v.product.isActive ? v.deposit : 0n), 0n),
    savingsPotential: views.reduce((s, v) => s + (v.comparison?.gainAtHorizon ?? 0n), 0n),
    flagged: views.filter((v) => v.flags.some((f) => f.level === "ABOVE_BENCHMARK" || f.level === "ABOVE_CEILING")).length,
  };
  await audit({ action: "VIEW", actorUserId: user.id, actorRole: user.role, entityType: "Savings", householdId });
  return { products: views, byPerson, totals, assumptions: a, assumptionsFromHousehold: fromHousehold, defaults, members, fallbackHorizonYears: FALLBACK_HORIZON_YEARS };
}

const money = (required: boolean) =>
  z.string().trim().optional().transform((v, ctx) => {
    if (!v) {
      if (required) ctx.addIssue({ code: "custom", message: "required" });
      return 0n;
    }
    try {
      const a = parseAmount(v);
      if (a < 0n) throw new Error();
      return a;
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid_amount" });
      return z.NEVER;
    }
  });
const pct = z.string().trim().optional().transform((v, ctx) => {
  if (!v) return 0;
  try {
    const p = parsePercentToPpm(v);
    if (p < 0 || p > 1_000_000) throw new Error();
    return p;
  } catch {
    ctx.addIssue({ code: "custom", message: "invalid_percent" });
    return z.NEVER;
  }
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const productSchema = z.object({
  personId: z.string().optional().transform((v) => v || null),
  productType: z.enum(PRODUCT_TYPES),
  provider: z.string().trim().min(1).max(120),
  track: z.string().trim().max(120).optional().transform((v) => v || null),
  policyLast4: z.string().trim().optional().transform((v) => v || null).pipe(z.string().regex(/^\d{4}$/).nullable()),
  balance: money(true),
  balanceAsOf: date,
  employeeDeposit: money(false),
  employerDeposit: money(false),
  severanceDeposit: money(false),
  feeDeposits: pct,
  feeAccumulation: pct,
  startDate: z.string().optional().transform((v) => v || null).pipe(date.nullable()),
  isActive: z.string().optional().transform((v) => v === "on"),
});

const asDate = (v: string) => new Date(`${v}T00:00:00Z`);

export async function saveProduct(user: CurrentUser, householdId: string, input: z.infer<typeof productSchema>, productId?: string) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  if (input.personId) await db.person.findFirstOrThrow({ where: { id: input.personId, householdId } });
  const data = {
    personId: input.personId,
    productType: input.productType,
    provider: input.provider,
    track: input.track,
    policyLast4: input.policyLast4,
    balance: input.balance,
    balanceAsOf: asDate(input.balanceAsOf),
    employeeDeposit: input.employeeDeposit,
    employerDeposit: input.employerDeposit,
    severanceDeposit: input.severanceDeposit,
    feeDepositsPpm: input.feeDeposits,
    feeAccumulationPpm: input.feeAccumulation,
    startDate: input.startDate ? asDate(input.startDate) : null,
    isActive: input.isActive,
  };
  const p = productId
    ? await db.longTermProduct.update({ where: { id: (await db.longTermProduct.findFirstOrThrow({ where: { id: productId, householdId } })).id }, data })
    : await db.longTermProduct.create({ data: { householdId, ...data } });
  await db.productBalance.upsert({
    where: { productId_asOf: { productId: p.id, asOf: data.balanceAsOf } },
    update: { balance: data.balance },
    create: { productId: p.id, asOf: data.balanceAsOf, balance: data.balance },
  });
  await audit({ action: productId ? "UPDATE" : "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "LongTermProduct", entityId: p.id, householdId });
  return p;
}

export async function deleteProduct(user: CurrentUser, householdId: string, productId: string) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await db.longTermProduct.deleteMany({ where: { id: productId, householdId } });
  await audit({ action: "DELETE", actorUserId: user.id, actorRole: user.role, entityType: "LongTermProduct", entityId: productId, householdId });
}

export const assumptionsSchema = z.object({
  retirementAge: z.coerce.number().int().min(50).max(80),
  conservative: pct,
  base: pct,
  optimistic: pct,
  depositGrowth: pct,
  annuityFactor: z.string().trim().regex(/^\d{2,3}(\.\d{1,3})?$/),
}).refine((v) => v.conservative <= v.base && v.base <= v.optimistic, "order");

export async function saveAssumptions(user: CurrentUser, householdId: string, input: z.infer<typeof assumptionsSchema>) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const [whole, frac = ""] = input.annuityFactor.split(".");
  const data = {
    retirementAge: input.retirementAge,
    conservativeReturnPpm: input.conservative,
    baseReturnPpm: input.base,
    optimisticReturnPpm: input.optimistic,
    depositGrowthPpm: input.depositGrowth,
    annuityFactorMilli: Number(whole) * 1000 + Number((frac + "000").slice(0, 3)),
    updatedByUserId: user.id,
  };
  await db.retirementAssumptions.upsert({ where: { householdId }, update: data, create: { householdId, ...data } });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "RetirementAssumptions", householdId, metadata: { ...data } });
}

/** Import products from a report file through the pluggable parser registry. */
export async function importProductReport(user: CurrentUser, householdId: string, file: File) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  if (file.size > 5 * 1024 * 1024) return { created: 0, issues: [{ row: 0, field: "file", raw: "too_large" }] };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const parser = PRODUCT_PARSERS.find((p) => p.canHandle(file.name, bytes));
  if (!parser) return { created: 0, issues: [{ row: 0, field: "file", raw: "unsupported" }] };
  const { products, issues } = await parser.parse(bytes);
  if (issues.length > 0) return { created: 0, issues }; // all-or-nothing: fix the file and re-upload
  const members = await db.person.findMany({ where: { householdId } });
  let created = 0;
  for (const p of products) {
    const person = p.personFirstName ? members.find((m) => m.firstName.trim() === p.personFirstName!.trim()) : undefined;
    const row = await db.longTermProduct.create({
      data: {
        householdId,
        personId: person?.id ?? null,
        productType: p.productType,
        provider: p.provider,
        track: p.track,
        policyLast4: p.policyLast4,
        balance: p.balance,
        balanceAsOf: asDate(p.balanceAsOf),
        employeeDeposit: p.employeeDeposit,
        employerDeposit: p.employerDeposit,
        severanceDeposit: p.severanceDeposit,
        feeDepositsPpm: p.feeDepositsPpm,
        feeAccumulationPpm: p.feeAccumulationPpm,
        startDate: p.startDate ? asDate(p.startDate) : null,
        isActive: p.isActive,
        source: parser.id,
      },
    });
    await db.productBalance.create({ data: { productId: row.id, asOf: row.balanceAsOf, balance: row.balance } });
    created++;
  }
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "LongTermProduct.import", householdId, metadata: { parser: parser.id, created } });
  return { created, issues: [] };
}

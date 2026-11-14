import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../../src/generated/prisma/client";
import { categories, merchantRules } from "./categories";
import { advisoryParameters, CMA_SOURCE, feeBenchmarkKeys, taxRuleKeys } from "./config";
import { demoHouseholds } from "./demo";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
const SEED_DATE = new Date("2026-01-01");
const agorot = (shekels: number) => BigInt(shekels) * 100n;

function password(envName: string): { value: string; generated: boolean } {
  const v = process.env[envName];
  if (v && v.length >= 12) return { value: v, generated: false };
  return { value: randomBytes(12).toString("base64url"), generated: true };
}

async function seedReference() {
  for (const [i, c] of categories.entries()) {
    await db.category.upsert({
      where: { key: c.key },
      update: { nameHe: c.nameHe, nameAr: c.nameAr, kind: c.kind, nature: c.nature, sortOrder: i },
      create: { key: c.key, nameHe: c.nameHe, nameAr: c.nameAr, kind: c.kind, nature: c.nature, sortOrder: i },
    });
  }
  const byKey = new Map((await db.category.findMany()).map((c) => [c.key, c.id]));
  await db.categorizationRule.deleteMany({ where: { householdId: null, origin: "SYSTEM" } });
  await db.categorizationRule.createMany({
    data: merchantRules.map((r) => ({ match: "CONTAINS" as const, pattern: r.pattern, categoryId: byKey.get(r.category)!, origin: "SYSTEM" as const })),
  });

  for (const r of taxRuleKeys) {
    await db.taxRule.upsert({
      where: { ruleKey_jurisdiction_effectiveFrom: { ruleKey: r.ruleKey, jurisdiction: "IL", effectiveFrom: SEED_DATE } },
      update: {},
      create: { ruleKey: r.ruleKey, effectiveFrom: SEED_DATE, status: "MISSING", parameters: undefined, sourceTitle: r.sourceTitle, notes: r.notes },
    });
  }
  for (const f of feeBenchmarkKeys) {
    await db.feeBenchmark.upsert({
      where: { productType_feeBase_effectiveFrom: { productType: f.productType, feeBase: f.feeBase, effectiveFrom: SEED_DATE } },
      update: {},
      create: { ...f, effectiveFrom: SEED_DATE, status: "MISSING", sourceTitle: CMA_SOURCE },
    });
  }
  for (const p of advisoryParameters) {
    await db.advisoryParameter.upsert({
      where: { key_effectiveFrom: { key: p.key, effectiveFrom: SEED_DATE } },
      update: {},
      create: { key: p.key, value: p.value as object, description: p.description, effectiveFrom: SEED_DATE },
    });
  }
}

async function seedAdvisor() {
  const email = (process.env.SEED_ADVISOR_EMAIL ?? "advisor@example.test").toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { email, password: null as string | null, id: existing.id };
  const pw = password("SEED_ADVISOR_PASSWORD");
  const user = await db.user.create({
    data: { email, passwordHash: await hash(pw.value, ARGON), role: "ADVISOR", displayName: "T.A — יועץ", locale: "he" },
  });
  return { email, password: pw.generated ? pw.value : "(from SEED_ADVISOR_PASSWORD)", id: user.id };
}

async function seedDemo(advisorId: string) {
  if (process.env.SEED_DEMO_DATA === "false") return [];
  if ((await db.household.count()) > 0) return [];
  const created: { email: string; password: string }[] = [];
  const demoPw = password("SEED_DEMO_CLIENT_PASSWORD");

  for (const d of demoHouseholds) {
    const h = await db.household.create({
      data: {
        displayName: d.displayName,
        city: d.city,
        preferredLocale: d.preferredLocale,
        status: d.status,
        riskTolerance: d.riskTolerance,
        riskAssessedAt: d.riskTolerance ? new Date("2026-04-15") : null,
        members: { create: d.members.map((m) => ({ ...m })) },
        incomeSources: {
          create: d.income.map((i) => ({ label: i.label, type: i.type, netMonthly: agorot(i.net), grossMonthly: i.gross ? agorot(i.gross) : null, regularity: i.regularity ?? "FIXED" })),
        },
        goals: { create: d.goals.map((g, idx) => ({ title: g.title, targetAmount: agorot(g.target), targetDate: g.targetDate ? new Date(g.targetDate) : null, priority: idx })) },
      },
      include: { members: true },
    });
    if (d.consent) {
      await db.consent.create({
        data: { householdId: h.id, type: "DATA_PROCESSING", textVersion: "2026-01-draft", method: "SIGNED_FORM", grantedAt: new Date("2026-04-01"), recordedByUserId: advisorId },
      });
    }
    for (const s of d.snapshots) {
      const income = agorot(s.income);
      const expenses = agorot(s.expenses);
      const surplus = income - expenses;
      const payload = { source: "seed-demo", note: "Totals only — produced by seed, not by a real month close", income: income.toString(), expenses: expenses.toString() };
      await db.monthlySnapshot.create({
        data: {
          householdId: h.id,
          period: s.period,
          totalIncome: income,
          totalExpenses: expenses,
          surplus,
          savingsRatePpm: Number((surplus * 1_000_000n) / income),
          payload,
          calcVersion: "seed-demo",
          contentSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
          closedByUserId: advisorId,
          closedAt: new Date(`${s.period}-28T12:00:00Z`),
        },
      });
    }
    for (const title of d.tasks) {
      await db.actionItem.create({ data: { householdId: h.id, title, createdByUserId: advisorId, period: "2026-10" } });
    }
    if (d.clientLogin) {
      const primary = h.members.find((m) => m.memberRole === "PRIMARY");
      await db.user.create({
        data: {
          email: d.clientLogin.email,
          passwordHash: await hash(demoPw.value, ARGON),
          role: "CLIENT",
          displayName: d.clientLogin.displayName,
          locale: d.clientLogin.locale,
          householdId: h.id,
          personId: primary?.id,
        },
      });
      created.push({ email: d.clientLogin.email, password: demoPw.generated ? demoPw.value : "(from SEED_DEMO_CLIENT_PASSWORD)" });
    }
  }
  return created;
}

async function main() {
  await seedReference();
  const advisor = await seedAdvisor();
  const clients = await seedDemo(advisor.id);
  console.log("\nSeed complete.");
  if (advisor.password) console.log(`  Advisor: ${advisor.email} / ${advisor.password}  (2FA enrollment required on first login)`);
  for (const c of clients) console.log(`  Demo client: ${c.email} / ${c.password}`);
  console.log("  Passwords above are shown once. Change them before any non-demo use.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

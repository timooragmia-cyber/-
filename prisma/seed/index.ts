import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../../src/generated/prisma/client";
import { categories, merchantRules } from "./categories";
import { advisoryParameters, CMA_SOURCE, feeBenchmarks } from "./config";
import { taxRules } from "./tax-rules";
import { demoHouseholds } from "./demo";
import { categorize, compileRules, learnedRuleFor } from "../../src/lib/categorize/engine";
import { assignDedupKeys } from "../../src/lib/import/dedup";
import { computeMonthClose, serializeClose } from "../../src/lib/analysis/month-close";
import { addMonths } from "../../src/lib/domain/period";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
const SEED_DATE = new Date("2026-01-01");
const APPROVED_DEFAULTS = new Set(["emergency_fund.months", "monthly_close.grace_days", "dashboard.trend_flat_threshold_ppm"]);
// retirement.defaults: return scenarios approved 2026-11-14, but age / annuity factor still need confirmation → left unconfirmed.
const agorot = (shekels: number) => BigInt(shekels) * 100n;

/**
 * A password given explicitly is used as is — or the seed FAILS. It never silently replaces a
 * given password with a random one (that locked desktop users out when they chose 10–11
 * characters). Only when none is given is a random one generated and printed.
 */
const MIN_PASSWORD = 10;
function password(envName: string): { value: string; generated: boolean } {
  const v = process.env[envName];
  if (v !== undefined && v !== "") {
    if (v.length < MIN_PASSWORD) throw new Error(`${envName} must be at least ${MIN_PASSWORD} characters`);
    return { value: v, generated: false };
  }
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

  // Tax rules: researched values replace untouched placeholders; advisor-edited rows are kept.
  for (const r of taxRules) {
    const existing = await db.taxRule.findMany({ where: { ruleKey: r.ruleKey, jurisdiction: "IL" } });
    const untouched = existing.every((e) => e.status === "MISSING" && e.lastVerifiedAt === null);
    if (existing.length > 0 && !untouched) continue;
    await db.taxRule.deleteMany({ where: { ruleKey: r.ruleKey, jurisdiction: "IL" } });
    await db.taxRule.create({
      data: {
        ruleKey: r.ruleKey,
        effectiveFrom: new Date(`${r.effectiveFrom}T00:00:00Z`),
        effectiveTo: r.effectiveTo ? new Date(`${r.effectiveTo}T00:00:00Z`) : null,
        parameters: (r.params ?? undefined) as object | undefined,
        status: r.params === null ? "MISSING" : "UNVERIFIED",
        sourceUrl: r.sourceUrl,
        sourceTitle: r.sourceTitle,
        notes: r.notes,
      },
    });
  }
  // Superseded placeholder: CPI lives in its own table (cpi_values), not in tax_rules.
  await db.taxRule.deleteMany({ where: { ruleKey: { notIn: taxRules.map((r) => r.ruleKey) }, status: "MISSING", lastVerifiedAt: null } });
  for (const f of feeBenchmarks) {
    const where = { productType_feeBase_effectiveFrom: { productType: f.productType, feeBase: f.feeBase, effectiveFrom: SEED_DATE } };
    const data = { benchmarkPpm: f.benchmarkPpm, legalCeilingPpm: f.legalCeilingPpm, sourceUrl: f.sourceUrl, sourceTitle: CMA_SOURCE, notes: f.notes, status: f.status };
    const existing = await db.feeBenchmark.findUnique({ where });
    if (!existing) await db.feeBenchmark.create({ data: { productType: f.productType, feeBase: f.feeBase, effectiveFrom: SEED_DATE, ...data } });
    // Fill placeholders only — never overwrite a row the advisor has edited or verified.
    else if (existing.status === "MISSING" && existing.lastVerifiedAt === null) await db.feeBenchmark.update({ where, data });
  }
  for (const p of advisoryParameters) {
    await db.advisoryParameter.upsert({
      where: { key_effectiveFrom: { key: p.key, effectiveFrom: SEED_DATE } },
      update: {},
      create: {
        key: p.key,
        value: p.value as object,
        description: p.description,
        effectiveFrom: SEED_DATE,
        // Approved by the advisor on 2026-11-14 (Phase 1 kickoff): recorded as confirmed.
        ...(APPROVED_DEFAULTS.has(p.key) ? { confirmedAt: new Date("2026-11-14T12:00:00Z") } : {}),
      },
    });
  }
}

async function seedAdvisor() {
  const email = (process.env.SEED_ADVISOR_EMAIL ?? "advisor@example.test").toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // Desktop first-run setup: the password the user just chose always wins (an earlier,
    // interrupted setup may have created this login already).
    if (process.env.SEED_ADVISOR_SET_PASSWORD === "true") {
      const pw = password("SEED_ADVISOR_PASSWORD");
      if (pw.generated) throw new Error("SEED_ADVISOR_SET_PASSWORD needs SEED_ADVISOR_PASSWORD");
      await db.user.update({ where: { id: existing.id }, data: { passwordHash: await hash(pw.value, ARGON), failedLoginCount: 0, lockedUntil: null, isActive: true } });
    }
    return { email, password: null as string | null, id: existing.id };
  }
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
  const cats = await db.category.findMany();
  const catByKey = new Map(cats.map((c) => [c.key, c]));
  const closeCats = new Map(cats.map((c) => [c.id, { id: c.id, key: c.key, kind: c.kind, nature: c.nature }]));

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

    // Accounts + transactions through the real pipeline: dedup keys → rules → learned rules.
    for (const l of d.learned) {
      const rule = learnedRuleFor(l.description, catByKey.get(l.category)!.id, h.id);
      if (rule) await db.categorizationRule.create({ data: rule });
    }
    const compiled = compileRules(await db.categorizationRule.findMany({ where: { OR: [{ householdId: null }, { householdId: h.id }] } }));
    const accountIds = new Map<string, { id: string; kind: "BANK_ACCOUNT" | "CREDIT_CARD" }>();
    for (const a of d.accounts) {
      const acc = await db.financialAccount.create({ data: { householdId: h.id, kind: a.kind, institution: a.institution, nickname: a.nickname, last4: a.last4 } });
      accountIds.set(a.key, { id: acc.id, kind: a.kind });
    }
    const lines = d.lines();
    for (const [key, acc] of accountIds) {
      const mine = assignDedupKeys(lines.filter((l) => l.account === key));
      const batch = await db.importBatch.create({
        data: { householdId: h.id, accountId: acc.id, adapter: "seed:demo", fileName: "demo-generated", status: "COMMITTED", rowsTotal: mine.length, rowsImported: mine.length, createdByUserId: advisorId, committedAt: new Date("2026-10-15") },
      });
      await db.transaction.createMany({
        data: mine.map((l) => {
          const manual = d.manual.find((m) => l.description.includes(m.descriptionContains));
          const cat = manual ? { categoryId: catByKey.get(manual.category)!.id, source: "MANUAL" as const } : (() => {
            const r = categorize(l.description, compiled);
            return r ? { categoryId: r.categoryId, source: r.source } : null;
          })();
          return {
            householdId: h.id,
            accountId: acc.id,
            importBatchId: batch.id,
            date: new Date(`${l.date}T00:00:00Z`),
            chargeDate: l.chargeDate ? new Date(`${l.chargeDate}T00:00:00Z`) : null,
            amount: l.amount,
            description: l.description,
            categoryId: cat?.categoryId ?? null,
            categorySource: cat?.source ?? "NONE",
            isTransfer: cat ? closeCats.get(cat.categoryId)!.kind === "TRANSFER" : false,
            installmentNumber: l.installmentNumber ?? null,
            installmentTotal: l.installmentTotal ?? null,
            dedupKey: l.dedupKey,
          };
        }),
      });
    }
    // Phase 2: account details, balances, long-term products
    for (const [key, det] of Object.entries(d.accountDetails ?? {})) {
      const acc = accountIds.get(key);
      if (!acc) continue;
      await db.financialAccount.update({
        where: { id: acc.id },
        data: {
          overdraftLimit: det.overdraftLimit !== undefined ? agorot(det.overdraftLimit) : null,
          overdraftRatePpm: det.overdraftRatePct !== undefined ? Math.round(det.overdraftRatePct * 10_000) : null,
          monthlyFee: det.monthlyFee !== undefined ? BigInt(Math.round(det.monthlyFee * 100)) : null,
          creditLimit: det.creditLimit !== undefined ? agorot(det.creditLimit) : null,
          billingDay: det.billingDay ?? null,
          annualCardFee: det.annualCardFee !== undefined ? agorot(det.annualCardFee) : null,
        },
      });
    }
    for (const b of d.balances ?? []) {
      await db.balanceSnapshot.create({ data: { accountId: accountIds.get(b.account)!.id, asOf: new Date(`${b.asOf}T00:00:00Z`), balance: agorot(b.balance), createdByUserId: advisorId } });
    }
    for (const p of d.products ?? []) {
      const person = h.members.find((m) => m.firstName === p.person);
      const prod = await db.longTermProduct.create({
        data: {
          householdId: h.id,
          personId: person?.id ?? null,
          productType: p.type,
          provider: p.provider,
          track: p.track,
          balance: agorot(p.balance),
          balanceAsOf: new Date("2026-10-31T00:00:00Z"),
          employeeDeposit: agorot(p.employee),
          employerDeposit: agorot(p.employer),
          severanceDeposit: agorot(p.severance),
          feeDepositsPpm: Math.round(p.feeDepPct * 10_000),
          feeAccumulationPpm: Math.round(p.feeAccPct * 10_000),
          startDate: new Date(`${p.start}T00:00:00Z`),
          isActive: p.active,
        },
      });
      for (const [asOf, bal] of [...p.history, ["2026-10-31", p.balance] as [string, number]]) {
        await db.productBalance.create({ data: { productId: prod.id, asOf: new Date(`${asOf}T00:00:00Z`), balance: agorot(bal) } });
      }
    }

    // Phase 3b: investments
    for (const pr of d.invest?.properties ?? []) {
      await db.property.create({
        data: {
          householdId: h.id, label: pr.label, city: pr.city, usage: pr.usage, isOnlyApartment: pr.only, purchaseDate: new Date(`${pr.purchaseDate}T00:00:00Z`),
          purchasePrice: agorot(pr.price), purchaseCosts: agorot(pr.costs), improvementCosts: agorot(pr.improvements), currentValue: agorot(pr.value), valueAsOf: new Date("2026-10-31T00:00:00Z"),
          monthlyRent: agorot(pr.rent), monthlyExpenses: agorot(pr.expenses), mortgageBalance: agorot(pr.mortgage), monthlyMortgagePayment: agorot(pr.payment),
        },
      });
    }
    if (d.invest?.portfolio) {
      const pf = d.invest.portfolio;
      const acc = await db.portfolioAccount.create({ data: { householdId: h.id, name: pf.name, institution: pf.institution, targetAllocation: pf.target } });
      const ids = new Map<string, string>();
      for (const hd of pf.holdings) ids.set(hd.key, (await db.portfolioHolding.create({ data: { accountId: acc.id, name: hd.name, assetClass: hd.assetClass } })).id);
      for (const tx of pf.txns) {
        await db.portfolioTxn.create({
          data: { accountId: acc.id, holdingId: tx.holding ? ids.get(tx.holding)! : null, date: new Date(`${tx.date}T00:00:00Z`), type: tx.type, units: BigInt(tx.units ?? 0) * 1_000_000n, amount: agorot(tx.amount), feeKind: tx.feeKind ?? null, createdByUserId: advisorId },
        });
      }
      for (const v of pf.valuations) {
        for (const [k, val] of Object.entries(v.values)) await db.holdingValuation.create({ data: { holdingId: ids.get(k)!, asOf: new Date(`${v.asOf}T00:00:00Z`), value: agorot(val) } });
      }
    }
    for (const dp of d.invest?.deposits ?? []) {
      await db.savingsDeposit.create({
        data: { householdId: h.id, kind: dp.kind, institution: dp.institution, label: dp.label, balance: agorot(dp.balance), balanceAsOf: new Date("2026-10-31T00:00:00Z"), annualRatePpm: Math.round(dp.ratePct * 10_000), feePpm: Math.round(dp.feePct * 10_000), maturityDate: dp.maturity ? new Date(`${dp.maturity}T00:00:00Z`) : null },
      });
    }

    // Phase 4: mortgage & loans
    if (d.debt?.mortgage) {
      const mg = await db.mortgage.create({ data: { householdId: h.id, lender: d.debt.mortgage.lender, asOf: new Date("2026-10-31T00:00:00Z") } });
      for (const tr of d.debt.mortgage.tracks) {
        await db.mortgageTrack.create({ data: { mortgageId: mg.id, type: tr.type, balance: agorot(tr.balance), remainingMonths: tr.months, annualRatePpm: Math.round(tr.ratePct * 10_000), monthsToReset: tr.type.startsWith("VARIABLE_5") ? (tr.reset ?? 60) : null } });
      }
    }
    for (const l of d.debt?.loans ?? []) {
      await db.loan.create({ data: { householdId: h.id, kind: l.kind, lender: l.lender, label: l.label, balance: agorot(l.balance), annualRatePpm: Math.round(l.ratePct * 10_000), monthlyPayment: agorot(l.payment), remainingMonths: l.months } });
    }

    for (const b of d.budgets) {
      await db.budget.create({ data: { householdId: h.id, categoryId: catByKey.get(b.category)!.id, monthlyAmount: agorot(b.amount), effectiveFrom: "2026-05" } });
    }

    // Close months with the same code the advisor uses (immutable snapshots).
    for (const period of d.closePeriods) {
      const start = new Date(`${period}-01T00:00:00Z`);
      const end = new Date(`${addMonths(period, 1)}-01T00:00:00Z`);
      const txns = await db.transaction.findMany({
        where: { householdId: h.id, OR: [{ chargeDate: { gte: start, lt: end } }, { chargeDate: null, date: { gte: start, lt: end } }] },
        include: { account: { select: { kind: true } } },
      });
      const budgets = new Map((await db.budget.findMany({ where: { householdId: h.id, effectiveFrom: { lte: period } } })).map((b) => [b.categoryId, b.monthlyAmount]));
      const r = computeMonthClose(period, txns.map((t) => ({ id: t.id, amount: t.amount, categoryId: t.categoryId, isTransfer: t.isTransfer, accountKind: t.account.kind })), closeCats, budgets);
      const payload = serializeClose(r);
      await db.monthlySnapshot.create({
        data: {
          householdId: h.id,
          period,
          totalIncome: r.totalIncome,
          totalExpenses: r.totalExpenses,
          surplus: r.surplus,
          savingsRatePpm: r.savingsRatePpm ?? 0,
          payload: payload as object,
          calcVersion: r.calcVersion,
          contentSha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
          closedByUserId: advisorId,
          closedAt: new Date(`${addMonths(period, 1)}-08T12:00:00Z`),
        },
      });
    }

    for (const body of d.notes) await db.advisorNote.create({ data: { householdId: h.id, body, createdByUserId: advisorId, period: "2026-10" } });
    for (const title of d.tasks) await db.actionItem.create({ data: { householdId: h.id, title, createdByUserId: advisorId, period: "2026-10" } });
    // Desktop edition has no client portal: SEED_CLIENT_LOGINS=false skips demo client logins.
    if (d.clientLogin && process.env.SEED_CLIENT_LOGINS !== "false") {
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

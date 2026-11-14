import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { toJsonSafe } from "@/lib/tax/common";
import { CpiUnavailableError, type CpiPoint } from "@/lib/tax/cpi";
import { parseCpiTable } from "@/lib/tax/cpi-import";
import { RULE_SCHEMAS, RuleUnavailableError, type TaxRuleRow } from "@/lib/tax/rules";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal";
import { db } from "@/server/db";
import { readFileTables, UnsupportedFileError } from "@/server/import/adapters";
import { CALCULATORS, type CalculatorName } from "./calculators";

export async function loadTaxRows(): Promise<TaxRuleRow[]> {
  return (await db.taxRule.findMany()).map((r) => ({ id: r.id, ruleKey: r.ruleKey, parameters: r.parameters, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, status: r.status, sourceUrl: r.sourceUrl }));
}

export async function loadCpi(): Promise<CpiPoint[]> {
  return (await db.cpiValue.findMany({ orderBy: { period: "asc" } })).map((c) => ({ period: c.period, valueMilli: c.valueMilli, base: c.base }));
}

export type RunOutcome =
  | { ok: true; result: ReturnType<(typeof CALCULATORS)[CalculatorName]["run"]>; input: unknown }
  | { ok: false; error: "input"; fields: string[] }
  | { ok: false; error: "rule"; ruleKey: string; reason: string; on: string }
  | { ok: false; error: "cpi"; period: string; reason: string }
  | { ok: false; error: "calc"; code: string };

/** Validates raw string inputs, resolves rules on the transaction date and runs the calculator. */
export async function runCalculator(name: CalculatorName, raw: Record<string, string>): Promise<RunOutcome> {
  const calc = CALCULATORS[name];
  const parsed = calc.schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "input", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))] };
  const [rows, cpi] = await Promise.all([loadTaxRows(), loadCpi()]);
  try {
    return { ok: true, result: calc.run(rows, cpi, parsed.data as never), input: parsed.data };
  } catch (e) {
    if (e instanceof RuleUnavailableError) return { ok: false, error: "rule", ruleKey: e.ruleKey, reason: e.reason, on: e.on };
    if (e instanceof CpiUnavailableError) return { ok: false, error: "cpi", period: e.period, reason: e.reason };
    if (e instanceof Error) return { ok: false, error: "calc", code: e.message };
    throw e;
  }
}

export async function saveRun(user: CurrentUser, householdId: string, name: CalculatorName, raw: Record<string, string>, title: string | null) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await assertHouseholdAccess(user, householdId);
  const out = await runCalculator(name, raw);
  if (!out.ok) return out;
  const r = out.result;
  const run = await db.calculationRun.create({
    data: {
      householdId,
      calculator: name,
      version: r.version,
      title,
      inputs: toJsonSafe({ raw, parsed: out.input }) as Prisma.InputJsonValue,
      rulesUsed: toJsonSafe(r.rulesUsed) as Prisma.InputJsonValue,
      steps: toJsonSafe(r.steps) as Prisma.InputJsonValue,
      result: toJsonSafe(r.result) as Prisma.InputJsonValue,
      warnings: r.warnings as Prisma.InputJsonValue,
      createdByUserId: user.id,
    },
  });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "CalculationRun", entityId: run.id, householdId, metadata: { calculator: name } });
  return { ok: true as const, id: run.id };
}

const today = () => new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");

/**
 * Advisor edits a tax rule's parameters (JSON, validated against the rule's schema).
 * VERIFIED rows are never edited in place: a change becomes a new row effective today.
 * Marking VERIFIED requires a source URL.
 */
export async function updateTaxRule(user: CurrentUser, id: string, input: { paramsJson: string; sourceUrl: string; notes: string; verify: boolean }) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const row = await db.taxRule.findUniqueOrThrow({ where: { id } });
  const schema = RULE_SCHEMAS[row.ruleKey as keyof typeof RULE_SCHEMAS];
  if (!schema) return { ok: false as const, error: "unknown_rule" };
  let params: unknown = null;
  if (input.paramsJson.trim()) {
    try {
      params = JSON.parse(input.paramsJson);
    } catch {
      return { ok: false as const, error: "invalid_json" };
    }
    const v = schema.safeParse(params);
    if (!v.success) return { ok: false as const, error: `schema: ${v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  }
  if (input.sourceUrl && !/^https:\/\/\S+$/.test(input.sourceUrl)) return { ok: false as const, error: "invalid_url" };
  if (input.verify && (!input.sourceUrl || params === null)) return { ok: false as const, error: "source_required" };
  const changed = JSON.stringify(row.parameters) !== JSON.stringify(params) || (row.sourceUrl ?? "") !== input.sourceUrl;
  const status = input.verify ? ("VERIFIED" as const) : params === null ? ("MISSING" as const) : row.status === "VERIFIED" && !changed ? ("VERIFIED" as const) : ("UNVERIFIED" as const);
  const data = {
    parameters: (params ?? undefined) as Prisma.InputJsonValue | undefined,
    sourceUrl: input.sourceUrl || null,
    notes: input.notes || null,
    status,
    ...(input.verify ? { lastVerifiedByUserId: user.id, lastVerifiedAt: new Date() } : {}),
  };
  const start = today();
  if (row.status === "VERIFIED" && changed && row.effectiveFrom.getTime() !== start.getTime()) {
    await db.$transaction([
      db.taxRule.update({ where: { id }, data: { effectiveTo: new Date(start.getTime() - 86_400_000) } }),
      db.taxRule.create({ data: { ruleKey: row.ruleKey, jurisdiction: row.jurisdiction, effectiveFrom: start, effectiveTo: row.effectiveTo, sourceTitle: row.sourceTitle, ...data } }),
    ]);
  } else {
    await db.taxRule.update({ where: { id }, data });
  }
  await audit({ action: "CONFIG_CHANGE", actorUserId: user.id, actorRole: user.role, entityType: "TaxRule", entityId: row.ruleKey, metadata: { from: { params: row.parameters, status: row.status }, to: { params: params as Prisma.InputJsonValue, status } } as Prisma.InputJsonValue });
  return { ok: true as const };
}

export async function importCpiFile(user: CurrentUser, file: File, base: string) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  if (!/^[\p{L}\p{N} =._-]{1,60}$/u.test(base)) return { ok: false as const, error: "invalid_base" };
  try {
    const { tables } = await readFileTables(file.name, new Uint8Array(await file.arrayBuffer()));
    const parsed = parseCpiTable(tables[0]!);
    if (parsed.rows.length === 0) return { ok: false as const, error: "no_rows" };
    const existingBases = await db.cpiValue.findMany({ where: { base: { not: base } }, select: { base: true }, distinct: ["base"] });
    if (existingBases.length > 0) return { ok: false as const, error: "base_mismatch", values: { existing: existingBases.map((b) => b.base).join(", ") } };
    for (const r of parsed.rows) {
      await db.cpiValue.upsert({ where: { period: r.period }, update: { valueMilli: r.valueMilli, base, source: "cbs-import", updatedByUserId: user.id }, create: { ...r, base, source: "cbs-import", updatedByUserId: user.id } });
    }
    await audit({ action: "CONFIG_CHANGE", actorUserId: user.id, actorRole: user.role, entityType: "CpiValue.import", metadata: { rows: parsed.rows.length, base, from: parsed.rows[0]!.period, to: parsed.rows.at(-1)!.period } });
    return { ok: true as const, count: parsed.rows.length };
  } catch (e) {
    if (e instanceof UnsupportedFileError) return { ok: false as const, error: `upload:${e.code}` };
    throw e;
  }
}

export async function upsertCpi(user: CurrentUser, period: string, valueMilli: number, base: string) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const other = await db.cpiValue.findFirst({ where: { base: { not: base } } });
  if (other) return { ok: false as const, error: "base_mismatch", values: { existing: other.base } };
  await db.cpiValue.upsert({ where: { period }, update: { valueMilli, base, source: "manual", updatedByUserId: user.id }, create: { period, valueMilli, base, source: "manual", updatedByUserId: user.id } });
  await audit({ action: "CONFIG_CHANGE", actorUserId: user.id, actorRole: user.role, entityType: "CpiValue", entityId: period, metadata: { valueMilli, base } });
  return { ok: true as const };
}

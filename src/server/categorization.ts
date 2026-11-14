import "server-only";
import { categorize, compileRules, learnedRuleFor, type CompiledRules } from "@/lib/categorize/engine";
import { db } from "@/server/db";

/** Global dictionary + this household's rules, compiled once per operation. */
export async function loadRules(householdId: string): Promise<CompiledRules> {
  const rules = await db.categorizationRule.findMany({ where: { OR: [{ householdId: null }, { householdId }] } });
  return compileRules(rules);
}

export function categorizeWith(compiled: CompiledRules, description: string) {
  return categorize(description, compiled);
}

/**
 * Advisor correction. Always marks this transaction MANUAL. With `applyToSimilar`, it also
 * learns a household rule and re-categorizes this household's non-manual transactions that
 * the new rule matches. Returns how many other transactions changed.
 */
export async function recategorizeTransaction(params: {
  householdId: string;
  transactionId: string;
  categoryId: string;
  applyToSimilar: boolean;
}): Promise<{ updatedOthers: number }> {
  const txn = await db.transaction.findFirstOrThrow({ where: { id: params.transactionId, householdId: params.householdId } });
  const category = await db.category.findUniqueOrThrow({ where: { id: params.categoryId } });
  await db.transaction.update({
    where: { id: txn.id },
    data: { categoryId: category.id, categorySource: "MANUAL", isTransfer: category.kind === "TRANSFER" },
  });
  if (!params.applyToSimilar) return { updatedOthers: 0 };

  const learned = learnedRuleFor(txn.description, category.id, params.householdId);
  if (!learned) return { updatedOthers: 0 };
  // One learned rule per merchant per household: replace the previous decision.
  await db.categorizationRule.deleteMany({ where: { householdId: params.householdId, origin: "LEARNED", match: "EQUALS", pattern: learned.pattern } });
  await db.categorizationRule.create({ data: learned });

  const compiled = await loadRules(params.householdId);
  const candidates = await db.transaction.findMany({
    where: { householdId: params.householdId, categorySource: { not: "MANUAL" }, id: { not: txn.id } },
    select: { id: true, description: true, categoryId: true },
  });
  let updated = 0;
  for (const c of candidates) {
    const r = categorize(c.description, compiled);
    if (r && r.categoryId === category.id && c.categoryId !== category.id) {
      await db.transaction.update({ where: { id: c.id }, data: { categoryId: r.categoryId, categorySource: r.source, isTransfer: category.kind === "TRANSFER" } });
      updated++;
    }
  }
  return { updatedOthers: updated };
}

import { merchantKey, normalizeText } from "@/lib/import/text";

export type RuleMatch = "CONTAINS" | "STARTS_WITH" | "EQUALS" | "REGEX";
export type RuleOrigin = "SYSTEM" | "ADVISOR" | "LEARNED";

export type CategorizationRule = {
  id: string;
  householdId: string | null;
  match: RuleMatch;
  pattern: string;
  categoryId: string;
  priority: number;
  origin: RuleOrigin;
};

export type CategorizationResult = { categoryId: string; ruleId: string; source: "RULE" | "LEARNED" };

/**
 * Precedence (first match wins):
 *   1. household LEARNED (from the advisor's corrections for this family)
 *   2. household ADVISOR rules
 *   3. global ADVISOR rules
 *   4. global SYSTEM merchant dictionary
 * Inside a tier: lower `priority` first, then the longer (more specific) pattern.
 */
function tier(r: CategorizationRule): number {
  if (r.householdId) return r.origin === "LEARNED" ? 0 : 1;
  return r.origin === "SYSTEM" ? 3 : 2;
}

export type CompiledRules = { rules: (CategorizationRule & { norm: string; re?: RegExp })[] };

export function compileRules(rules: readonly CategorizationRule[]): CompiledRules {
  const compiled = rules
    .map((r) => {
      let re: RegExp | undefined;
      if (r.match === "REGEX") {
        if (r.pattern.length > 200) return null;
        try {
          re = new RegExp(r.pattern, "iu");
        } catch {
          return null; // invalid regex never breaks categorization
        }
      }
      return { ...r, norm: r.match === "EQUALS" ? merchantKey(r.pattern) : normalizeText(r.pattern), re };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null && (r.re !== undefined || r.norm.length > 0));
  compiled.sort((a, b) => tier(a) - tier(b) || a.priority - b.priority || b.norm.length - a.norm.length);
  return { rules: compiled };
}

export function categorize(description: string, compiled: CompiledRules): CategorizationResult | null {
  const text = normalizeText(description);
  const key = merchantKey(description);
  for (const r of compiled.rules) {
    const hit =
      r.match === "CONTAINS" ? text.includes(r.norm) :
      r.match === "STARTS_WITH" ? text.startsWith(r.norm) :
      r.match === "EQUALS" ? key === r.norm :
      r.re!.test(description);
    if (hit) return { categoryId: r.categoryId, ruleId: r.id, source: r.origin === "LEARNED" ? "LEARNED" : "RULE" };
  }
  return null;
}

/** The rule created when the advisor corrects a transaction and chooses "apply to similar". */
export function learnedRuleFor(description: string, categoryId: string, householdId: string): Omit<CategorizationRule, "id"> | null {
  const key = merchantKey(description);
  if (key.length < 2) return null;
  return { householdId, match: "EQUALS", pattern: key, categoryId, priority: 10, origin: "LEARNED" };
}

import { describe, expect, it } from "vitest";
import { categorize, compileRules, learnedRuleFor, type CategorizationRule } from "@/lib/categorize/engine";

const rule = (id: string, p: Partial<CategorizationRule>): CategorizationRule => ({
  id, householdId: null, match: "CONTAINS", pattern: "", categoryId: "x", priority: 100, origin: "SYSTEM", ...p,
});

describe("categorization engine", () => {
  const rules = compileRules([
    rule("sys-shufersal", { pattern: "שופרסל", categoryId: "groceries" }),
    rule("sys-super", { pattern: "סופר", categoryId: "groceries" }),
    rule("sys-superpharm", { pattern: "סופר-פארם", categoryId: "health" }),
    rule("sys-bakery", { pattern: "مخبز", categoryId: "groceries" }),
    rule("adv-global", { pattern: "חשמל", categoryId: "utilities", origin: "ADVISOR" }),
    rule("hh-learned", { householdId: "h1", match: "EQUALS", pattern: "שופרסל דיל כרמיאל", categoryId: "leisure", origin: "LEARNED" }),
    rule("bad-regex", { match: "REGEX", pattern: "([", categoryId: "x", origin: "ADVISOR" }),
    rule("regex", { match: "REGEX", pattern: "^netflix", categoryId: "subscriptions", origin: "ADVISOR" }),
  ]);

  it("matches Hebrew and Arabic dictionary entries", () => {
    expect(categorize("שופרסל אקספרס 22", rules)?.categoryId).toBe("groceries");
    expect(categorize("مخبز الأمل", rules)?.categoryId).toBe("groceries");
  });
  it("more specific pattern wins inside a tier (סופר-פארם before סופר)", () => {
    expect(categorize("סופר-פארם עכו", rules)?.categoryId).toBe("health");
  });
  it("household learned rule beats the global dictionary", () => {
    expect(categorize("שופרסל דיל 104 כרמיאל", rules)).toEqual({ categoryId: "leisure", ruleId: "hh-learned", source: "LEARNED" });
  });
  it("advisor regex works, invalid regex is ignored", () => {
    expect(categorize("NETFLIX.COM", rules)?.categoryId).toBe("subscriptions");
  });
  it("returns null when nothing matches", () => {
    expect(categorize("חנות שאינה מוכרת", rules)).toBeNull();
  });
  it("learnedRuleFor builds an EQUALS rule on the merchant key", () => {
    expect(learnedRuleFor("שופרסל דיל 104 כרמיאל", "c1", "h1")).toEqual({ householdId: "h1", match: "EQUALS", pattern: "שופרסל דיל כרמיאל", categoryId: "c1", priority: 10, origin: "LEARNED" });
    expect(learnedRuleFor("1234", "c1", "h1")).toBeNull();
  });
});

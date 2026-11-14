import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/security/csp";

/**
 * Static guardrails: the build fails if a new page, route or server action forgets
 * authorization, or if a household guard is called without await (a forgotten await makes
 * the check a no-op).
 */
const root = path.resolve(__dirname, "../../src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(root).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes(`${path.sep}generated${path.sep}`));
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");
const AUTH = /\b(requireAdvisor|requireClient|requireUser|requireOpenHousehold|getCurrentUserOrNull|getPartialUser)\(/;
const PUBLIC = new Set(["app/api/health/route.ts", "app/(auth)/login/page.tsx"]);

describe("authorization coverage", () => {
  it("every page and route handler outside /login authenticates", () => {
    const entry = files.filter((f) => /\/(page\.tsx|route\.ts)$/.test(rel(f)) && rel(f).startsWith("app/"));
    expect(entry.length).toBeGreaterThan(30);
    const missing = entry.filter((f) => !PUBLIC.has(rel(f)) && !AUTH.test(readFileSync(f, "utf8")));
    expect(missing.map(rel)).toEqual([]);
  });

  it("every client-file page checks the privacy restriction itself (layouts render in parallel)", () => {
    const pages = files.filter((f) => rel(f).startsWith("app/(app)/advisor/clients/[id]/") && /(page|layout)\.tsx$/.test(f));
    expect(pages.length).toBeGreaterThan(15);
    expect(pages.filter((f) => !readFileSync(f, "utf8").includes("requireOpenHousehold(")).map(rel)).toEqual([]);
  });

  it("every exported server action authenticates (or is an explicit public auth step)", () => {
    const publicActions = new Set(["loginAction", "verifySecondFactorAction", "confirmTotpEnrollmentAction", "logoutAction"]);
    const offenders: string[] = [];
    for (const f of files.filter((x) => readFileSync(x, "utf8").startsWith('"use server"'))) {
      const src = readFileSync(f, "utf8");
      const parts = src.split(/(?=^export async function )/m).slice(1);
      for (const part of parts) {
        const name = /^export async function (\w+)/.exec(part)![1]!;
        if (publicActions.has(name)) continue;
        if (!AUTH.test(part) && !/\breturn run\(|= await run\(|await run\(/.test(part)) offenders.push(`${rel(f)}#${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("household guards are always awaited", () => {
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (/(?<!await |function |const )\bassertHouseholdAccess\(/.test(line) && !line.includes("export")) bad.push(`${rel(f)}:${i + 1}`);
        if (/^\s+guard\(/.test(line)) bad.push(`${rel(f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("no service imports the synchronous tenant guard directly (it skips the restriction check)", () => {
    const direct = files.filter((f) => !rel(f).startsWith("server/auth/") && readFileSync(f, "utf8").includes('from "@/server/auth/dal-guards"') && /assertHouseholdAccess/.test(readFileSync(f, "utf8")));
    expect(direct.map(rel)).toEqual([]);
  });
});

describe("content security policy", () => {
  const csp = buildCsp("abc", { dev: false });
  it("scripts only with the nonce; no eval in production; no framing; no plugins", () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/https?:\/\//); // no third-party origins
  });
});

import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import he from "../../messages/he.json";

const keys = (o: object, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const get = (o: object, path: string) => path.split(".").reduce<unknown>((a, k) => (a as Record<string, unknown>)[k], o) as string;

describe("i18n catalogs", () => {
  it("Hebrew and Arabic have exactly the same keys", () => {
    expect(keys(ar).sort()).toEqual(keys(he).sort());
  });
  it("placeholders match in both languages", () => {
    for (const k of keys(he)) expect(placeholders(get(ar, k)), k).toEqual(placeholders(get(he, k)));
  });
  it("no empty strings", () => {
    for (const k of keys(he)) {
      expect(get(he, k).trim(), k).not.toBe("");
      expect(get(ar, k).trim(), k).not.toBe("");
    }
  });

  it("every t(\"…\") literal used in the source resolves to a string (no group/leaf mix-ups)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : /\.tsx?$/.test(f) ? [`${d}/${f}`] : []));
    const bad: string[] = [];
    const resolve = (key: string) => { try { return get(he, key); } catch { return undefined; } };
    for (const file of [...walk("src/app"), ...walk("src/components")]) {
      const src = readFileSync(file, "utf8");
      if (!/getTranslations|useTranslations/.test(src)) continue;
      const namespaces = [...src.matchAll(/(?:getTranslations|useTranslations)\("([\w.]+)"\)/g)].map((m) => m[1]!);
      for (const m of src.matchAll(/\bt\("([a-zA-Z0-9_.]+)"/g)) {
        const candidates = [m[1]!, ...namespaces.map((n) => `${n}.${m[1]}`)];
        if (!candidates.some((k) => typeof resolve(k) === "string")) bad.push(`${file}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("every message/error key returned by server actions and services resolves (ActionForm shows it)", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(`${d}/${f}`).isDirectory() ? walk(`${d}/${f}`) : /\.tsx?$/.test(f) ? [`${d}/${f}`] : []));
    const resolve = (key: string) => { try { return get(he, key); } catch { return undefined; } };
    const bad: string[] = [];
    for (const file of [...walk("src/app"), ...walk("src/server")]) {
      for (const m of readFileSync(file, "utf8").matchAll(/(?:message|error): ["`]([a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+)["`]/g)) {
        if (typeof resolve(m[1]!) !== "string") bad.push(`${file}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

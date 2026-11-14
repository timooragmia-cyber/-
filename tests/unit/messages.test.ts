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
});

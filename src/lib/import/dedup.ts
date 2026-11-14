import { createHash } from "node:crypto";
import { normalizeText } from "./text";
import type { NormalizedRow } from "./types";

/**
 * Deterministic duplicate key per account. Identical rows inside one file (two coffees, same
 * day, same price) get occurrence #1, #2… so both are kept, while re-importing the same file
 * (or an overlapping period) yields the same keys and the rows are recognized as duplicates.
 */
export function assignDedupKeys<T extends Pick<NormalizedRow, "date" | "amount" | "description">>(rows: readonly T[]): (T & { dedupKey: string })[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const base = `${r.date}|${r.amount.toString()}|${normalizeText(r.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...r, dedupKey: createHash("sha256").update(`${base}|#${n}`).digest("hex").slice(0, 40) };
  });
}

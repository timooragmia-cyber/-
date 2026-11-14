"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireAdvisor } from "@/server/auth/dal";
import { isCalculator } from "@/server/tax/calculators";
import { importCpiFile, saveRun, upsertCpi } from "@/server/tax/service";
import { parseIndexValue, parsePeriod } from "@/lib/tax/cpi-import";

export async function saveRunAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const calc = String(f.get("$calc") ?? "");
  const householdId = String(f.get("$household") ?? "");
  if (!isCalculator(calc) || !householdId) return { error: "form.invalid" };
  const raw = Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
  const r = await saveRun(user, householdId, calc, raw, String(f.get("$title") ?? "").trim() || null);
  if (!r.ok) return { error: "form.error" };
  revalidatePath(`/advisor/clients/${householdId}/calculations`);
  return { ok: true, message: "tax.saved" };
}

export async function importCpiAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "upload.errors.EMPTY" };
  const r = await importCpiFile(user, file, String(f.get("base") ?? "").trim());
  if (!r.ok) return { error: r.error.startsWith("upload:") ? `upload.errors.${r.error.slice(7)}` : `tax.cpi.errors.${r.error}`, values: "values" in r ? r.values : undefined };
  revalidatePath("/advisor/tax/cpi");
  return { ok: true, message: "tax.cpi.imported", values: { count: r.count } };
}

export async function upsertCpiAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const period = parsePeriod(String(f.get("period") ?? ""));
  const value = parseIndexValue(String(f.get("value") ?? ""));
  const base = String(f.get("base") ?? "").trim();
  if (!period || !value || !base) return { error: "tax.cpi.errors.invalid" };
  const r = await upsertCpi(user, period, value, base);
  if (!r.ok) return { error: `tax.cpi.errors.${r.error}`, values: r.values };
  revalidatePath("/advisor/tax/cpi");
  return { ok: true, message: "form.saved" };
}

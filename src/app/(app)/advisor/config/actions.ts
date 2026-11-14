"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireAdvisor } from "@/server/auth/dal";
import { confirmAdvisoryParameter, updateAdvisoryParameter } from "@/server/config/advisory-admin";
import { updateFeeBenchmark } from "@/server/config/fee-admin";
import { updateTaxRule } from "@/server/tax/service";

export async function updateParamAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const r = await updateAdvisoryParameter(user, String(f.get("key")), String(f.get("value")));
  if (!r.ok) return { error: r.error.startsWith("invalid_json") || r.error === "unknown_key" ? `configEdit.errors.${r.error}` : r.error };
  revalidatePath("/advisor/config");
  return { ok: true, message: "form.saved" };
}

export async function confirmParamAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  await confirmAdvisoryParameter(user, String(f.get("id")));
  revalidatePath("/advisor/config");
  return { ok: true, message: "form.saved" };
}

export async function updateFeeAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const r = await updateFeeBenchmark(user, String(f.get("id")), {
    benchmark: String(f.get("benchmark") ?? ""),
    ceiling: String(f.get("ceiling") ?? ""),
    sourceUrl: String(f.get("sourceUrl") ?? "").trim(),
    notes: String(f.get("notes") ?? "").trim(),
    verify: f.get("verify") === "on",
  });
  if (!r.ok) return { error: `feeEdit.errors.${r.error}` };
  revalidatePath("/advisor/config");
  return { ok: true, message: "form.saved" };
}

export async function updateTaxRuleAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const r = await updateTaxRule(user, String(f.get("id")), {
    paramsJson: String(f.get("params") ?? ""),
    sourceUrl: String(f.get("sourceUrl") ?? "").trim(),
    notes: String(f.get("notes") ?? "").trim(),
    verify: f.get("verify") === "on",
  });
  if (!r.ok) return { error: r.error.startsWith("schema:") ? r.error : `tax.ruleEdit.errors.${r.error}` };
  revalidatePath("/advisor/config");
  return { ok: true, message: "form.saved" };
}

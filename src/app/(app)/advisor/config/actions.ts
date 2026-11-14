"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireAdvisor } from "@/server/auth/dal";
import { confirmAdvisoryParameter, updateAdvisoryParameter } from "@/server/config/advisory-admin";

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

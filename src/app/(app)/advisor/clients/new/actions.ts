"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireAdvisor } from "@/server/auth/dal";
import { createHousehold, householdSchema } from "@/server/clients";

export async function createHouseholdAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const v = householdSchema.safeParse(Object.fromEntries([...f.entries()].map(([k, x]) => [k, String(x)])));
  if (!v.success) return { error: "form.invalid" };
  const h = await createHousehold(user, v.data);
  redirect(`/advisor/clients/${h.id}/accounts`);
}

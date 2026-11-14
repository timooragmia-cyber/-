"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireAdvisor } from "@/server/auth/dal";
import * as privacy from "@/server/privacy/service";

/** Advisor privacy actions. They work on restricted households by design (allowRestricted). */
const hid = (f: FormData) => {
  const v = String(f.get("householdId") ?? "");
  if (!/^[a-z0-9]{20,40}$/.test(v)) throw new Error("bad household id");
  return v;
};
const obj = (f: FormData) => Object.fromEntries([...f.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)]));
const refresh = (h: string) => {
  revalidatePath(`/advisor/privacy/${h}`);
  revalidatePath("/advisor");
};

export async function logRequestAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const h = hid(f);
  const v = privacy.requestSchema.safeParse(obj(f));
  if (!v.success) return { error: "form.invalid" };
  await privacy.createPrivacyRequest(user, h, v.data);
  refresh(h);
  return { ok: true, message: "privacy.requestLogged" };
}

export async function resolveRequestAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const h = hid(f);
  const v = privacy.resolveSchema.safeParse(obj(f));
  if (!v.success) return { error: "privacy.resolutionRequired" };
  await privacy.resolvePrivacyRequest(user, h, v.data);
  refresh(h);
  return { ok: true, message: "form.saved" };
}

export async function restrictAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const h = hid(f);
  const v = privacy.restrictSchema.safeParse(obj(f));
  if (!v.success) return { error: "privacy.reasonRequired" };
  try {
    await privacy.restrictHousehold(user, h, v.data);
  } catch (e) {
    if (e instanceof privacy.PrivacyConfirmError) return { error: "privacy.confirmMismatch" };
    throw e;
  }
  refresh(h);
  return { ok: true, message: "privacy.restricted" };
}

export async function liftAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const h = hid(f);
  await privacy.liftRestriction(user, h);
  refresh(h);
  return { ok: true, message: "privacy.lifted" };
}

export async function purgeAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireAdvisor();
  const h = hid(f);
  const status = await privacy.privacyStatus(user, h);
  if (String(f.get("confirmName") ?? "").trim() !== status.displayName.trim()) return { error: "privacy.purgeConfirm" };
  if (status.eligibility.state !== "ELIGIBLE") return { error: "privacy.purgeNotDue" };
  await privacy.purgeHousehold({ userId: user.id, role: "ADVISOR" }, h);
  revalidatePath("/advisor");
  redirect("/advisor?purged=1");
}

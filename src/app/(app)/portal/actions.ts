"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireClient } from "@/server/auth/dal";
import { setTaskStatus } from "@/server/clients";
import { UnsupportedFileError } from "@/server/import/adapters";
import { uploadStatement } from "@/server/import/service";
import { rateLimit } from "@/server/rate-limit";
import { updateRecommendation } from "@/server/plan/service";
import { createPrivacyRequest, requestSchema } from "@/server/privacy/service";

/** Client actions: the household id always comes from the session, never from the form. */
export async function clientUploadAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireClient();
  if (!rateLimit(`upload:${user.id}`, 20, 60 * 60_000).ok) return { error: "auth.rateLimited" };
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "upload.errors.EMPTY" };
  try {
    await uploadStatement(user, user.householdId, file);
  } catch (e) {
    if (e instanceof UnsupportedFileError) return { error: `upload.errors.${e.code}` };
    throw e;
  }
  revalidatePath("/portal/upload");
  return { ok: true, message: "upload.uploaded" };
}

export async function clientTaskStatusAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireClient();
  const status = String(f.get("status"));
  if (status !== "IN_PROGRESS" && status !== "DONE") return { error: "form.invalid" };
  await setTaskStatus(user, user.householdId, String(f.get("taskId")), status);
  revalidatePath("/portal");
  return { ok: true };
}

export async function clientPlanStatusAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireClient();
  const status = String(f.get("status"));
  if (status !== "IN_PROGRESS" && status !== "DONE") return { error: "form.invalid" };
  await updateRecommendation(user, user.householdId, String(f.get("recId")), { status });
  revalidatePath("/portal");
  return { ok: true };
}

export async function clientPrivacyRequestAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await requireClient();
  if (!rateLimit(`privacy-req:${user.id}`, 5, 24 * 60 * 60_000).ok) return { error: "auth.rateLimited" };
  const v = requestSchema.safeParse({ type: f.get("type"), details: f.get("details") ?? undefined });
  if (!v.success) return { error: "form.invalid" };
  await createPrivacyRequest(user, user.householdId, v.data);
  revalidatePath("/portal/privacy");
  return { ok: true, message: "portalPrivacy.requestSent" };
}

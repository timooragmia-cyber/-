"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { audit } from "@/server/audit";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

export async function setLocaleAction(form: FormData): Promise<void> {
  const user = await requireUser();
  const locale = form.get("locale");
  if (!isLocale(locale)) return;
  await db.user.update({ where: { id: user.id }, data: { locale } });
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "User.locale", entityId: user.id, metadata: { locale } });
  revalidatePath("/", "layout");
}

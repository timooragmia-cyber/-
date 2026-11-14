import "server-only";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal-guards";
import { db } from "@/server/db";
import { readDecrypted, storeEncrypted } from "@/server/storage";
import { buildReportHtml, type ReportKind } from "./build";
import { htmlToPdf } from "./pdf";

export async function generateReport(user: CurrentUser, householdId: string, kind: ReportKind, locale: "he" | "ar", period: string | null) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  assertHouseholdAccess(user, householdId);
  const { html, period: used } = await buildReportHtml(user, householdId, kind, locale, period);
  const pdf = await htmlToPdf(html, { left: "T.A Mortgages", right: "" });
  const { storageKey, sha256 } = await storeEncrypted(pdf);
  const r = await db.report.create({ data: { householdId, type: kind, period: used, locale, storageKey, sha256, sizeBytes: pdf.length, createdByUserId: user.id } });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "Report", entityId: r.id, householdId, metadata: { kind, locale } });
  return r;
}

export async function releaseReport(user: CurrentUser, householdId: string, id: string) {
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  await db.report.updateMany({ where: { id, householdId }, data: { releasedAt: new Date() } });
  await audit({ action: "UPDATE", actorUserId: user.id, actorRole: user.role, entityType: "Report.release", entityId: id, householdId });
}

/** Advisor: any report. Client: only released reports of their own household. */
export async function readReport(user: CurrentUser, id: string) {
  const r = await db.report.findUnique({ where: { id }, include: { household: { select: { displayName: true } } } });
  if (!r) return null;
  assertHouseholdAccess(user, r.householdId);
  if (user.role === "CLIENT" && !r.releasedAt) return null;
  const bytes = await readDecrypted(r.storageKey);
  await audit({ action: "EXPORT", actorUserId: user.id, actorRole: user.role, entityType: "Report", entityId: r.id, householdId: r.householdId });
  return { report: r, bytes };
}

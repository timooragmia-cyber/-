import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BackupPanel } from "@/components/app/backup-panel";
import { requireAdvisor } from "@/server/auth/dal";
import { isDesktop } from "@/server/desktop";

/** Desktop edition: encrypted backups to a folder of the advisor's choice, and restore. */
export default async function BackupPage() {
  await requireAdvisor();
  if (!isDesktop()) notFound();
  const t = await getTranslations("backup");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <BackupPanel />
    </div>
  );
}

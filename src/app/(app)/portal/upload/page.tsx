import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/select";
import { requireClient } from "@/server/auth/dal";
import { db } from "@/server/db";
import { clientUploadAction } from "../actions";

export default async function ClientUploadPage() {
  const user = await requireClient();
  const t = await getTranslations();
  const files = await db.uploadedFile.findMany({ where: { householdId: user.householdId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, originalName: true, createdAt: true, status: true } });
  const label = { PENDING_REVIEW: "upload.pending", IMPORTED: "upload.imported", REJECTED: "upload.rejected" } as const;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardTitle>{t("upload.title")}</CardTitle>
        <p className="mb-3 text-sm text-muted">{t("upload.clientHelp")}</p>
        <ActionForm action={clientUploadAction} submitLabel={t("upload.submit")}>
          <Field label={t("upload.file")} htmlFor="file"><Input id="file" name="file" type="file" accept=".csv,.txt,.xlsx,.xls" required /></Field>
        </ActionForm>
      </Card>
      <Card>
        <CardTitle>{t("upload.files")}</CardTitle>
        {files.length === 0 ? <p className="text-sm text-muted">{t("upload.noFiles")}</p> : (
          <ul className="space-y-2 text-sm">
            {files.map((f) => (
              <li key={f.id} className="flex justify-between gap-2">
                <span className="break-all">{f.originalName}</span>
                <Badge tone={f.status === "IMPORTED" ? "ok" : f.status === "REJECTED" ? "bad" : "warn"}>{t(label[f.status])}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

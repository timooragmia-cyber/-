import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { HouseholdField } from "@/components/app/hidden";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/select";
import { Table, Td, Th } from "@/components/ui/table";
import { requireAdvisor } from "@/server/auth/dal";
import { hasActiveConsent } from "@/server/clients";
import { db } from "@/server/db";
import * as A from "../actions";

const INSTITUTIONS = ["LEUMI", "HAPOALIM", "DISCOUNT", "MIZRAHI_TEFAHOT", "ISRACARD", "CAL", "MAX", "OTHER"] as const;

export default async function AccountsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdvisor();
  const { id } = await params;
  const t = await getTranslations();
  const [accounts, files, batches, members, consent] = await Promise.all([
    db.financialAccount.findMany({ where: { householdId: id }, orderBy: { createdAt: "asc" }, include: { _count: { select: { transactions: true } } } }),
    db.uploadedFile.findMany({ where: { householdId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.importBatch.findMany({ where: { householdId: id }, orderBy: { createdAt: "desc" }, take: 30, include: { account: { select: { nickname: true } } } }),
    db.person.findMany({ where: { householdId: id }, select: { id: true, firstName: true } }),
    hasActiveConsent(id),
  ]);
  const fileTone = { PENDING_REVIEW: "warn", IMPORTED: "ok", REJECTED: "bad" } as const;
  const fileLabel = { PENDING_REVIEW: "upload.pending", IMPORTED: "upload.imported", REJECTED: "upload.rejected" } as const;

  return (
    <div className="space-y-4">
      {!consent && <p role="alert" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad">{t("upload.consentRequired")}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>{t("accounts.title")}</CardTitle>
          {accounts.length === 0 ? (
            <p className="mb-3 text-sm text-muted">{t("accounts.none")}</p>
          ) : (
            <ul className="mb-4 space-y-1 text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>{a.nickname} · {t(`accountKind.${a.kind}`)} · {t(`institution.${a.institution}`)}</span>
                  <span className="num text-muted">{a.last4 ? `••${a.last4}` : ""} · {a._count.transactions}</span>
                </li>
              ))}
            </ul>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-medium text-brand">{t("accounts.add")}</summary>
            <ActionForm action={A.addAccountAction} submitLabel={t("form.add")} className="mt-3">
              <HouseholdField id={id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("accounts.kind")} htmlFor="a-kind">
                  <Select id="a-kind" name="kind">{(["BANK_ACCOUNT", "CREDIT_CARD", "CASH"] as const).map((k) => <option key={k} value={k}>{t(`accountKind.${k}`)}</option>)}</Select>
                </Field>
                <Field label={t("accounts.institution")} htmlFor="a-inst">
                  <Select id="a-inst" name="institution">{INSTITUTIONS.map((i) => <option key={i} value={i}>{t(`institution.${i}`)}</option>)}</Select>
                </Field>
                <Field label={t("accounts.nickname")} htmlFor="a-nick"><Input id="a-nick" name="nickname" required /></Field>
                <Field label={t("accounts.last4")} htmlFor="a-last4" hint={t("accounts.last4Note")}>
                  <Input id="a-last4" name="last4" inputMode="numeric" maxLength={4} pattern="\d{4}" dir="ltr" />
                </Field>
                <Field label={t("accounts.owner")} htmlFor="a-owner">
                  <Select id="a-owner" name="ownerPersonId"><option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.firstName}</option>)}</Select>
                </Field>
              </div>
            </ActionForm>
          </details>
        </Card>

        <Card>
          <CardTitle>{t("upload.title")}</CardTitle>
          <ActionForm action={A.uploadAction} submitLabel={t("upload.submit")}>
            <HouseholdField id={id} />
            <Field label={t("upload.file")} htmlFor="file">
              <Input id="file" name="file" type="file" accept=".csv,.txt,.xlsx,.xls" required />
            </Field>
          </ActionForm>
          <h3 className="mt-5 mb-2 font-medium">{t("upload.files")}</h3>
          {files.length === 0 ? (
            <p className="text-sm text-muted">{t("upload.noFiles")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {files.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="break-all">{f.originalName} <span className="num text-xs text-muted">{f.createdAt.toISOString().slice(0, 10)}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge tone={fileTone[f.status]}>{t(fileLabel[f.status])}</Badge>
                    {consent && accounts.length > 0 && (
                      <Link href={`/advisor/clients/${id}/import/${f.id}`} className="font-medium text-brand underline">{t("upload.import")}</Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-0 sm:p-0">
        <CardTitle className="px-4 pt-4">{t("batches.title")}</CardTitle>
        <Table>
          <thead>
            <tr><Th>{t("batches.file")}</Th><Th>{t("txn.account")}</Th><Th>{t("batches.status")}</Th><Th>{t("batches.rows")}</Th><Th /></tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <Td className="break-all">{b.fileName ?? b.adapter}<div className="num text-xs text-muted">{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</div></Td>
                <Td>{b.account.nickname}</Td>
                <Td><Badge tone={b.status === "COMMITTED" ? "ok" : b.status === "UNDONE" ? "neutral" : "warn"}>{t(`batches.${b.status}`)}</Badge></Td>
                <Td className="num">{b.rowsImported} / {b.rowsTotal}{b.rowsDuplicate ? ` (=${b.rowsDuplicate})` : ""}{b.rowsError ? ` (!${b.rowsError})` : ""}</Td>
                <Td>
                  {b.status === "COMMITTED" && (
                    <ActionForm action={A.undoImportAction} submitLabel={t("batches.undo")} variant="outline" confirm={t("batches.undoConfirm")}>
                      <HouseholdField id={id} />
                      <input type="hidden" name="batchId" value={b.id} />
                    </ActionForm>
                  )}
                  {b.status === "PREVIEW" && <Link className="text-brand underline" href={`/advisor/clients/${id}/import/batch/${b.id}`}>{t("batches.continue")}</Link>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

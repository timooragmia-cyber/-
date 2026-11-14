import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { PRESETS } from "@/lib/import/presets";
import type { MappingConfig } from "@/lib/import/types";
import { requireAdvisor, requireOpenHousehold } from "@/server/auth/dal";
import { UnsupportedFileError } from "@/server/import/adapters";
import { loadFileTables, proposeMapping } from "@/server/import/service";
import { db } from "@/server/db";
import { previewImportAction } from "../../actions";

function ColSelect({ name, value, options, notUsed }: { name: string; value: number | undefined; options: { value: number; label: string }[]; notUsed?: string }) {
  return (
    <Select id={name} name={name} defaultValue={value ?? ""}>
      {notUsed && <option value="">{notUsed}</option>}
      {options.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
    </Select>
  );
}

/**
 * Import wizard. Step 1 (GET form): choose account + sheet. Step 2: review the proposed
 * column mapping against the first rows of the file, then build a preview (nothing is
 * written to transactions until the advisor commits on the next screen).
 */
export default async function ImportWizard({ params, searchParams }: { params: Promise<{ id: string; fileId: string }>; searchParams: Promise<{ account?: string; sheet?: string }> }) {
  await requireAdvisor();
  const { id, fileId } = await params;
  await requireOpenHousehold(id);
  const sp = await searchParams;
  const t = await getTranslations();
  const file = await db.uploadedFile.findFirst({ where: { id: fileId, householdId: id } });
  if (!file) notFound();
  const accounts = await db.financialAccount.findMany({ where: { householdId: id, isActive: true }, orderBy: { createdAt: "asc" } });

  let tables;
  try {
    tables = (await loadFileTables(id, fileId)).tables;
  } catch (e) {
    if (e instanceof UnsupportedFileError) return <p role="alert" className="rounded-md bg-bad-bg p-3 text-bad">{t(`upload.errors.${e.code}`)}</p>;
    throw e;
  }
  const sheetIndex = Math.min(Math.max(Number(sp.sheet ?? 0) || 0, 0), tables.length - 1);
  const table = tables[sheetIndex]!;
  const account = accounts.find((a) => a.id === sp.account);
  const proposal = account ? await proposeMapping(id, account.id, table) : null;
  const m: Partial<MappingConfig> = proposal?.mapping ?? { headerRowIndex: 0, dateFormat: "DD/MM/YYYY" };
  const headerRow = table.rows[m.headerRowIndex ?? 0] ?? [];
  const width = Math.max(...table.rows.slice(0, 50).map((r) => r.length), 1);
  const colOptions = Array.from({ length: width }, (_, i) => ({ value: i, label: `${i + 1}: ${(headerRow[i] ?? "").slice(0, 30) || "—"}` }));
  const amt = m.amount;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{t("wizard.title")} — <span className="break-all">{file.originalName}</span></h2>

      <Card>
        <form method="get" className="grid items-end gap-3 sm:grid-cols-3">
          <Field label={t("wizard.account")} htmlFor="account">
            <Select id="account" name="account" defaultValue={account?.id ?? ""} required>
              <option value="" disabled>—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.nickname} ({t(`accountKind.${a.kind}`)})</option>)}
            </Select>
          </Field>
          {tables.length > 1 && (
            <Field label={t("wizard.sheet")} htmlFor="sheet">
              <Select id="sheet" name="sheet" defaultValue={String(sheetIndex)}>{tables.map((s, i) => <option key={i} value={i}>{s.sheetName ?? i + 1}</option>)}</Select>
            </Field>
          )}
          <Button type="submit" variant="outline">{t("batches.continue")}</Button>
        </form>
      </Card>

      {account && (
        <Card>
          <CardTitle>{t("wizard.title")}</CardTitle>
          <p role="status" className={`mb-3 rounded-md px-3 py-2 text-sm ${proposal?.source === "none" || proposal?.confidence === "low" ? "bg-warn-bg text-warn" : "bg-ok-bg text-ok"}`}>
            {proposal?.source === "saved" ? t("wizard.saved") : proposal?.source === "none" ? t("wizard.notDetected") : proposal?.confidence === "low" ? t("wizard.lowConfidence") : t("wizard.detected")}
            {account.institution !== "OTHER" && PRESETS[account.institution] && ` ${t("wizard.presetUnverified")}`}
          </p>
          <ActionForm action={previewImportAction} submitLabel={t("wizard.previewBtn")} resetOnSuccess={false}>
            <input type="hidden" name="householdId" value={id} />
            <input type="hidden" name="fileId" value={fileId} />
            <input type="hidden" name="accountId" value={account.id} />
            <input type="hidden" name="sheetIndex" value={sheetIndex} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t("wizard.headerRow")} htmlFor="headerRowIndex">
                <Select id="headerRowIndex" name="headerRowIndex" defaultValue={m.headerRowIndex ?? 0}>
                  {table.rows.slice(0, 40).map((r, i) => <option key={i} value={i}>{i + 1}: {r.filter(Boolean).join(" | ").slice(0, 50) || "—"}</option>)}
                </Select>
              </Field>
              <Field label={t("wizard.dateColumn")} htmlFor="dateColumn"><ColSelect name="dateColumn" value={m.dateColumn} options={colOptions} notUsed={undefined} /></Field>
              <Field label={t("wizard.dateFormat")} htmlFor="dateFormat">
                <Select id="dateFormat" name="dateFormat" defaultValue={m.dateFormat}>{["DD/MM/YYYY", "DD/MM/YY", "YYYY-MM-DD", "MM/DD/YYYY"].map((f) => <option key={f} value={f}>{f}</option>)}</Select>
              </Field>
              <Field label={t("wizard.descriptionColumn")} htmlFor="descriptionColumn"><ColSelect name="descriptionColumn" value={m.descriptionColumn} options={colOptions} notUsed={undefined} /></Field>
              <Field label={t("wizard.chargeDateColumn")} htmlFor="chargeDateColumn"><ColSelect name="chargeDateColumn" value={m.chargeDateColumn} options={colOptions} notUsed={t("wizard.notUsed")} /></Field>
              <Field label={t("wizard.amountMode")} htmlFor="amountMode">
                <Select id="amountMode" name="amountMode" defaultValue={amt?.mode ?? (account.kind === "CREDIT_CARD" ? "single" : "debitCredit")}>
                  <option value="single">{t("wizard.single")}</option>
                  <option value="debitCredit">{t("wizard.debitCredit")}</option>
                </Select>
              </Field>
              <Field label={t("wizard.amountColumn")} htmlFor="amountColumn"><ColSelect name="amountColumn" value={amt?.mode === "single" ? amt.column : undefined} options={colOptions} notUsed={t("wizard.notUsed")} /></Field>
              <Field label={t("wizard.debitColumn")} htmlFor="debitColumn"><ColSelect name="debitColumn" value={amt?.mode === "debitCredit" ? amt.debitColumn : undefined} options={colOptions} notUsed={t("wizard.notUsed")} /></Field>
              <Field label={t("wizard.creditColumn")} htmlFor="creditColumn"><ColSelect name="creditColumn" value={amt?.mode === "debitCredit" ? amt.creditColumn : undefined} options={colOptions} notUsed={t("wizard.notUsed")} /></Field>
              <Field label={t("wizard.installmentColumn")} htmlFor="installmentColumn"><ColSelect name="installmentColumn" value={m.installmentColumn} options={colOptions} notUsed={t("wizard.notUsed")} /></Field>
              <Field label={t("wizard.originalAmountColumn")} htmlFor="originalAmountColumn"><ColSelect name="originalAmountColumn" value={m.originalAmountColumn} options={colOptions} notUsed={t("wizard.notUsed")} /></Field>
              <Field label={t("wizard.currencyColumn")} htmlFor="originalCurrencyColumn"><ColSelect name="originalCurrencyColumn" value={m.originalCurrencyColumn} options={colOptions} notUsed={t("wizard.notUsed")} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="negate" defaultChecked={amt?.mode === "single" ? amt.negate : account.kind === "CREDIT_CARD"} /> {t("wizard.negate")}
            </label>
            <Field label={t("wizard.skipWords")} htmlFor="skipDescriptionsContaining">
              <Textarea id="skipDescriptionsContaining" name="skipDescriptionsContaining" rows={2} defaultValue={(m.skipDescriptionsContaining ?? []).join("\n")} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="saveMapping" defaultChecked={proposal?.source !== "saved"} /> {t("wizard.saveMapping")}
            </label>
          </ActionForm>
        </Card>
      )}

      <Card className="p-0 sm:p-0">
        <CardTitle className="px-4 pt-4">{t("wizard.rawPreview")}</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>{colOptions.map((c) => <th key={c.value} className="border-b border-border px-2 py-1 text-start text-muted num">{c.value + 1}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.slice(0, 15).map((r, i) => (
                <tr key={i} className={i === (m.headerRowIndex ?? -1) ? "bg-warn-bg font-semibold" : ""}>
                  {colOptions.map((c) => <td key={c.value} className="border-b border-border px-2 py-1 whitespace-nowrap">{r[c.value] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

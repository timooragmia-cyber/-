import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/app/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";
import type { RowError } from "@/lib/import/types";
import { formatMoney } from "@/lib/money";
import { requireAdvisor, requireOpenHousehold } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getPreview } from "@/server/import/service";
import { loadCategories } from "@/server/months";
import { catName, type Loc } from "@/server/view";
import { commitImportAction } from "../../../actions";

export default async function BatchPreview({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  await requireAdvisor();
  const { id, batchId } = await params;
  await requireOpenHousehold(id);
  const exists = await db.importBatch.findFirst({ where: { id: batchId, householdId: id }, select: { id: true } });
  if (!exists) notFound();
  const { batch, rows } = await getPreview(id, batchId);
  const t = await getTranslations();
  const locale = (await getLocale()) as Loc;
  const cats = await loadCategories();
  const errors = (batch.errors ?? []) as unknown as RowError[];
  const importable = rows.filter((r) => !r.duplicate).length;
  const dates = rows.map((r) => r.date).sort();

  if (batch.status !== "PREVIEW") {
    return (
      <Card>
        <p role="status" className={`rounded-md px-3 py-2 ${batch.status === "COMMITTED" ? "bg-ok-bg text-ok" : "bg-background"}`}>
          {batch.status === "COMMITTED" ? t("preview.committed", { count: batch.rowsImported }) : t(`batches.${batch.status}`)}
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          <Link href={`/advisor/clients/${id}/transactions?uncat=1`} className="font-medium text-brand underline">{t("tabs.transactions")}</Link>
          <Link href={`/advisor/clients/${id}/months`} className="font-medium text-brand underline">{t("tabs.months")}</Link>
          <Link href={`/advisor/clients/${id}/accounts`} className="font-medium text-brand underline">{t("tabs.accounts")}</Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>{t("preview.title")}</CardTitle>
        <p className="text-sm">
          {batch.account.nickname} · <span className="break-all">{batch.fileName}</span>
        </p>
        <p className="mt-2 font-medium">{t("preview.summary", { importable, duplicates: rows.length - importable, errors: errors.length })}</p>
        {dates.length > 0 && <p className="text-sm text-muted">{t("preview.range")}: <span className="num">{dates[0]} → {dates.at(-1)}</span></p>}
        <div className="mt-4 flex flex-wrap gap-3">
          {importable > 0 ? (
            <ActionForm action={commitImportAction} submitLabel={t("preview.commit", { count: importable })}>
              <input type="hidden" name="householdId" value={id} />
              <input type="hidden" name="batchId" value={batchId} />
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">{t("preview.nothing")}</p>
          )}
          <Link href={`/advisor/clients/${id}/import/${batch.fileId}?account=${batch.accountId}`} className="self-start rounded-md border border-border px-4 py-2 text-sm">{t("preview.back")}</Link>
        </div>
      </Card>

      {errors.length > 0 && (
        <Card>
          <CardTitle>{t("preview.errorsTitle")}</CardTitle>
          <ul className="space-y-1 text-sm">
            {errors.slice(0, 100).map((e) => (
              <li key={`${e.rowIndex}-${e.code}`}>
                {t("preview.row")} <span className="num">{e.rowIndex + 1}</span>: {t(`preview.errorCodes.${e.code}`)} — <span className="text-muted">{e.raw}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-0 sm:p-0">
        <Table>
          <thead>
            <tr><Th>{t("txn.date")}</Th><Th>{t("txn.description")}</Th><Th>{t("txn.amount")}</Th><Th>{t("txn.category")}</Th><Th /></tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((r) => (
              <tr key={r.dedupKey} className={r.duplicate ? "opacity-50" : ""}>
                <Td className="num whitespace-nowrap">{r.date}{r.chargeDate && r.chargeDate !== r.date && <div className="text-xs text-muted">→ {r.chargeDate}</div>}</Td>
                <Td>{r.description}{r.installmentNumber && <div className="text-xs text-muted">{t("txn.installment", { n: r.installmentNumber, t: r.installmentTotal ?? 0 })}</div>}</Td>
                <Td className={`num whitespace-nowrap ${BigInt(r.amount) < 0n ? "" : "text-ok"}`}>{formatMoney(BigInt(r.amount), locale)}</Td>
                <Td>{r.categoryId ? catName(cats.get(r.categoryId), locale) : <Badge tone="warn">{catName(null, locale, "?")}</Badge>}</Td>
                <Td>{r.duplicate && <Badge>{t("preview.duplicate")}</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

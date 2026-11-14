import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { assignDedupKeys } from "@/lib/import/dedup";
import { detectMapping } from "@/lib/import/detect";
import { normalizeTable } from "@/lib/import/normalize";
import { PRESETS } from "@/lib/import/presets";
import type { MappingConfig, NormalizedRow, RawTable, RowError } from "@/lib/import/types";
import { audit } from "@/server/audit";
import type { CurrentUser } from "@/server/auth/dal";
import { assertHouseholdAccess } from "@/server/auth/dal";
import { categorizeWith, loadRules } from "@/server/categorization";
import { db } from "@/server/db";
import { readDecrypted, storeEncrypted } from "@/server/storage";
import { MAX_FILE_BYTES, readFileTables, UnsupportedFileError } from "./adapters";

const ALLOWED_EXT = /\.(csv|txt|xlsx|xls)$/i;

/** Advisor or client uploads a statement. Clients' files wait for the advisor (PENDING_REVIEW). */
export async function uploadStatement(user: CurrentUser, householdId: string, file: File) {
  await assertHouseholdAccess(user, householdId);
  if (!ALLOWED_EXT.test(file.name)) throw new UnsupportedFileError("UNSUPPORTED");
  if (file.size > MAX_FILE_BYTES) throw new UnsupportedFileError("TOO_LARGE");
  const bytes = new Uint8Array(await file.arrayBuffer());
  await readFileTables(file.name, bytes); // validate it is parseable before storing
  const { storageKey, sha256 } = await storeEncrypted(bytes);
  const row = await db.uploadedFile.create({
    data: {
      householdId,
      uploadedByUserId: user.id,
      originalName: file.name.slice(0, 200),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      sha256,
      storageKey,
      purpose: "STATEMENT",
    },
  });
  await audit({ action: "CREATE", actorUserId: user.id, actorRole: user.role, entityType: "UploadedFile", entityId: row.id, householdId, metadata: { size: file.size } });
  return row;
}

export async function loadFileTables(householdId: string, fileId: string): Promise<{ adapter: string; tables: RawTable[]; fileName: string }> {
  const file = await db.uploadedFile.findFirstOrThrow({ where: { id: fileId, householdId } });
  const bytes = await readDecrypted(file.storageKey);
  const r = await readFileTables(file.originalName, bytes);
  return { ...r, fileName: file.originalName };
}

/** Initial mapping proposal: saved mapping for this household+institution, else auto-detect + preset. */
export async function proposeMapping(householdId: string, accountId: string, table: RawTable): Promise<{ mapping: MappingConfig | null; source: "saved" | "detected" | "none"; confidence?: "high" | "low" }> {
  const account = await db.financialAccount.findFirstOrThrow({ where: { id: accountId, householdId } });
  const saved = await db.importMapping.findFirst({ where: { householdId, institution: account.institution }, orderBy: { updatedAt: "desc" } });
  if (saved) {
    const cfg = saved.config as unknown as MappingConfig;
    // a saved mapping is reused only if its header row still looks like a header
    if (table.rows[cfg.headerRowIndex]?.[cfg.dateColumn]) return { mapping: cfg, source: "saved" };
  }
  const d = detectMapping(table, { isCreditCard: account.kind === "CREDIT_CARD" });
  if (!d) return { mapping: null, source: "none" };
  const preset = account.institution !== "OTHER" ? PRESETS[account.institution] : null;
  return { mapping: { ...d.mapping, ...(preset?.defaults ?? {}) }, source: "detected", confidence: d.confidence };
}

type PreviewRow = Omit<NormalizedRow, "amount" | "originalAmount"> & {
  amount: string;
  originalAmount: string | null;
  dedupKey: string;
  duplicate: boolean;
  categoryId: string | null;
  categorySource: "RULE" | "LEARNED" | "NONE";
};

export type PreviewSummary = { total: number; importable: number; duplicates: number; errors: RowError[]; skipped: number; fromDate: string | null; toDate: string | null };

/**
 * Builds (or rebuilds) a PREVIEW batch: normalize → dedup against existing rows → categorize.
 * Nothing touches the transactions table until commitImport.
 */
export async function createPreview(user: CurrentUser, p: { householdId: string; accountId: string; fileId: string; sheetIndex: number; mapping: MappingConfig; saveMapping: boolean }) {
  await assertHouseholdAccess(user, p.householdId);
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const account = await db.financialAccount.findFirstOrThrow({ where: { id: p.accountId, householdId: p.householdId } });
  const { adapter, tables, fileName } = await loadFileTables(p.householdId, p.fileId);
  const table = tables[p.sheetIndex];
  if (!table) throw new Error("Sheet not found");

  const norm = normalizeTable(table, p.mapping);
  const keyed = assignDedupKeys(norm.rows);
  const existing = new Set(
    (await db.transaction.findMany({ where: { accountId: account.id, dedupKey: { in: keyed.map((k) => k.dedupKey) } }, select: { dedupKey: true } })).map((t) => t.dedupKey),
  );
  const rules = await loadRules(p.householdId);
  const transferIds = new Set((await db.category.findMany({ where: { kind: "TRANSFER" }, select: { id: true } })).map((c) => c.id));

  const preview: PreviewRow[] = keyed.map((r) => {
    const c = categorizeWith(rules, r.description);
    return {
      ...r,
      amount: r.amount.toString(),
      originalAmount: r.originalAmount?.toString() ?? null,
      duplicate: existing.has(r.dedupKey),
      categoryId: c?.categoryId ?? null,
      categorySource: c ? c.source : "NONE",
      isTransfer: c ? transferIds.has(c.categoryId) : false,
    } as PreviewRow;
  });
  const dates = preview.map((r) => r.date).sort();
  const duplicates = preview.filter((r) => r.duplicate).length;

  let mappingId: string | null = null;
  if (p.saveMapping) {
    const m = await db.importMapping.create({
      data: { householdId: p.householdId, institution: account.institution, name: `${account.nickname} — ${fileName}`.slice(0, 120), config: p.mapping as unknown as Prisma.InputJsonValue },
    });
    mappingId = m.id;
  }

  // Replace any earlier preview of the same file/account.
  await db.importBatch.deleteMany({ where: { householdId: p.householdId, accountId: account.id, fileId: p.fileId, status: "PREVIEW" } });
  const batch = await db.importBatch.create({
    data: {
      householdId: p.householdId,
      accountId: account.id,
      fileId: p.fileId,
      mappingId,
      adapter,
      fileName,
      sheetName: table.sheetName ?? null,
      status: "PREVIEW",
      rowsTotal: preview.length + norm.errors.length,
      rowsDuplicate: duplicates,
      rowsError: norm.errors.length,
      errors: norm.errors as unknown as Prisma.InputJsonValue,
      preview: preview as unknown as Prisma.InputJsonValue,
      createdByUserId: user.id,
    },
  });
  const summary: PreviewSummary = {
    total: preview.length,
    importable: preview.length - duplicates,
    duplicates,
    errors: norm.errors,
    skipped: norm.skipped,
    fromDate: dates[0] ?? null,
    toDate: dates.at(-1) ?? null,
  };
  return { batchId: batch.id, summary };
}

export async function getPreview(householdId: string, batchId: string) {
  const b = await db.importBatch.findFirstOrThrow({ where: { id: batchId, householdId }, include: { account: true } });
  return { batch: b, rows: ((b.preview ?? []) as unknown as PreviewRow[]) };
}

/** Commit a PREVIEW batch. Duplicates are skipped (also guarded by the unique index). */
export async function commitImport(user: CurrentUser, householdId: string, batchId: string) {
  await assertHouseholdAccess(user, householdId);
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const { batch, rows } = await getPreview(householdId, batchId);
  if (batch.status !== "PREVIEW") throw new Error("Batch is not in preview");
  const toInsert = rows.filter((r) => !r.duplicate);
  const result = await db.$transaction(async (tx) => {
    const created = await tx.transaction.createMany({
      skipDuplicates: true,
      data: toInsert.map((r) => ({
        householdId,
        accountId: batch.accountId,
        importBatchId: batch.id,
        date: new Date(`${r.date}T00:00:00Z`),
        chargeDate: r.chargeDate ? new Date(`${r.chargeDate}T00:00:00Z`) : null,
        amount: BigInt(r.amount),
        originalAmount: r.originalAmount ? BigInt(r.originalAmount) : null,
        originalCurrency: r.originalCurrency?.slice(0, 3) || null,
        description: r.description.slice(0, 500),
        categoryId: r.categoryId,
        categorySource: r.categorySource,
        isTransfer: (r as PreviewRow & { isTransfer?: boolean }).isTransfer ?? false,
        installmentNumber: r.installmentNumber,
        installmentTotal: r.installmentTotal,
        dedupKey: r.dedupKey,
      })),
    });
    await tx.importBatch.update({
      where: { id: batch.id },
      data: { status: "COMMITTED", committedAt: new Date(), rowsImported: created.count, rowsDuplicate: rows.length - created.count, preview: Prisma.DbNull },
    });
    if (batch.fileId) await tx.uploadedFile.update({ where: { id: batch.fileId }, data: { status: "IMPORTED" } });
    return created.count;
  });
  await audit({ action: "IMPORT_COMMIT", actorUserId: user.id, actorRole: user.role, entityType: "ImportBatch", entityId: batch.id, householdId, metadata: { imported: result } });
  return { imported: result };
}

/** Full undo: removes every transaction created by the batch. Closed-month snapshots stay as they were (immutable) and are flagged as changed. */
export async function undoImport(user: CurrentUser, householdId: string, batchId: string) {
  await assertHouseholdAccess(user, householdId);
  if (user.role !== "ADVISOR") throw new Error("Advisor only");
  const batch = await db.importBatch.findFirstOrThrow({ where: { id: batchId, householdId } });
  if (batch.status !== "COMMITTED") throw new Error("Only committed batches can be undone");
  const removed = await db.$transaction(async (tx) => {
    const del = await tx.transaction.deleteMany({ where: { importBatchId: batch.id } });
    await tx.importBatch.update({ where: { id: batch.id }, data: { status: "UNDONE", undoneAt: new Date() } });
    return del.count;
  });
  await audit({ action: "IMPORT_UNDO", actorUserId: user.id, actorRole: user.role, entityType: "ImportBatch", entityId: batch.id, householdId, metadata: { removed } });
  return { removed };
}

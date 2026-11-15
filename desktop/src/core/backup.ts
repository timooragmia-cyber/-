/**
 * Encrypted backup / restore for the desktop app (no pg_dump needed).
 *
 * Backup = one consistent snapshot (REPEATABLE READ, read-only) of every table via COPY,
 * sequence positions, the list of applied migrations, all stored files (uploads, reports) and
 * the app's encryption keys — zipped, then encrypted with AES-256-GCM under a key derived
 * from the user's backup password (scrypt). Without the password the file is unreadable;
 * with it, everything can be restored on a new computer.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Writable } from "node:stream";
import JSZip from "jszip";
import { Client } from "pg";
import { from as copyFrom, to as copyTo } from "pg-copy-streams";
import { listMigrations, migrate } from "./migrate";

export type AppSecrets = { fieldKeys: string; blindIndexKey: string };
export type Manifest = {
  format: 1;
  app: string;
  appVersion: string;
  createdAt: string;
  migrations: string[];
  tables: { name: string; rows: number }[];
  sequences: { name: string; value: string }[];
  files: number;
};

const MAGIC = Buffer.from("TABK1\n");
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
export const BACKUP_EXT = ".tabackup";

export class BackupPasswordError extends Error {
  constructor() {
    super("Wrong backup password or damaged file");
    this.name = "BackupPasswordError";
  }
}

export function encrypt(plain: Buffer, password: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password.normalize("NFC"), salt, 32, SCRYPT);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(MAGIC);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}

export function decrypt(blob: Buffer, password: string): Buffer {
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Not a T.A Mortgages backup file");
  let o = MAGIC.length;
  const salt = blob.subarray(o, (o += 16));
  const iv = blob.subarray(o, (o += 12));
  const tag = blob.subarray(o, (o += 16));
  const key = scryptSync(password.normalize("NFC"), salt, 32, SCRYPT);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAAD(MAGIC);
  d.setAuthTag(tag);
  try {
    return Buffer.concat([d.update(blob.subarray(o)), d.final()]);
  } catch {
    throw new BackupPasswordError();
  }
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

async function copyOut(client: Client, sql: string): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await pipeline(client.query(copyTo(sql)), new Writable({ write(c, _e, cb) { chunks.push(c as Buffer); cb(); } }));
  return Buffer.concat(chunks);
}

function walk(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });
}

export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `TA-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}${BACKUP_EXT}`;
}

export async function createBackup(o: { url: string; storageDir: string; secrets: AppSecrets; appVersion: string; folder: string; password: string; keep?: number }): Promise<{ file: string; manifest: Manifest }> {
  const client = new Client({ connectionString: o.url });
  await client.connect();
  const zip = new JSZip();
  let manifest: Manifest;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const tables = (await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`)).rows.map((r) => r.tablename);
    const migrations = (await client.query<{ migration_name: string }>(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`)).rows.map((r) => r.migration_name);
    const sequences = (await client.query<{ name: string; value: string | null }>(`SELECT sequencename AS name, last_value::text AS value FROM pg_sequences WHERE schemaname = 'public'`)).rows
      .filter((s): s is { name: string; value: string } => s.value !== null);
    const counts: { name: string; rows: number }[] = [];
    for (const t of tables) {
      const data = await copyOut(client, `COPY ${q(t)} TO STDOUT`);
      zip.file(`tables/${t}.copy`, data);
      counts.push({ name: t, rows: data.length === 0 ? 0 : data.toString("utf8").split("\n").length - 1 });
    }
    await client.query("COMMIT");
    const files = walk(o.storageDir);
    for (const f of files) zip.file(`files/${f}`, readFileSync(path.join(o.storageDir, f)));
    zip.file("secrets.json", JSON.stringify(o.secrets));
    manifest = { format: 1, app: "ta-mortgages", appVersion: o.appVersion, createdAt: new Date().toISOString(), migrations, tables: counts, sequences, files: files.length };
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  } finally {
    await client.end();
  }
  const plain = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  mkdirSync(o.folder, { recursive: true });
  const file = path.join(o.folder, backupFileName());
  const tmp = `${file}.partial`;
  writeFileSync(tmp, encrypt(plain, o.password));
  renameSync(tmp, file); // never leave a half-written file under the final name
  prune(o.folder, o.keep ?? 30);
  return { file, manifest };
}

/** Keeps the newest `keep` backups in the folder; older ones are deleted. */
export function prune(folder: string, keep: number): string[] {
  const all = readdirSync(folder).filter((f) => f.startsWith("TA-backup-") && f.endsWith(BACKUP_EXT)).sort();
  const remove = all.slice(0, Math.max(0, all.length - keep));
  for (const f of remove) rmSync(path.join(folder, f), { force: true });
  return remove;
}

export async function readBackup(file: string, password: string): Promise<{ manifest: Manifest; zip: JSZip }> {
  const zip = await JSZip.loadAsync(decrypt(readFileSync(file), password));
  const m = zip.file("manifest.json");
  if (!m) throw new Error("Backup file has no manifest");
  return { manifest: JSON.parse(await m.async("string")) as Manifest, zip };
}

/**
 * Replaces the database and stored files with the backup's content. The caller must have
 * stopped the app server, and must save the returned secrets (the backup's encryption keys).
 */
export async function restoreBackup(o: { adminUrl: string; dbName: string; url: string; migrationsDir: string; storageDir: string; file: string; password: string }): Promise<{ manifest: Manifest; secrets: AppSecrets }> {
  const { manifest, zip } = await readBackup(o.file, o.password);
  const known = new Set(listMigrations(o.migrationsDir).map((m) => m.name));
  const unknown = manifest.migrations.filter((m) => !known.has(m));
  if (unknown.length) throw new Error(`The backup was made by a newer version of the program (${unknown[0]}). Update the program first.`);
  const secretsFile = zip.file("secrets.json");
  if (!secretsFile) throw new Error("Backup file has no keys");
  const secrets = JSON.parse(await secretsFile.async("string")) as AppSecrets;

  // 1. Fresh database with the schema exactly as it was when the backup was made.
  const admin = new Client({ connectionString: o.adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${q(o.dbName)} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${q(o.dbName)}`);
  } finally {
    await admin.end();
  }
  await migrate(o.url, o.migrationsDir, new Set(manifest.migrations));

  // 2. Data, with triggers and FK checks off for the load (immutability triggers included).
  const client = new Client({ connectionString: o.url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    for (const t of manifest.tables) {
      const f = zip.file(`tables/${t.name}.copy`);
      if (!f) throw new Error(`Backup is missing table ${t.name}`);
      const data = await f.async("nodebuffer");
      if (data.length) await pipeline(Readable.from([data]), client.query(copyFrom(`COPY ${q(t.name)} FROM STDIN`)));
    }
    for (const s of manifest.sequences) await client.query(`SELECT setval($1, $2::bigint, true)`, [`public.${q(s.name)}`, s.value]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }

  // 3. Newer migrations (backup from an older version).
  await migrate(o.url, o.migrationsDir);

  // 4. Files: the current folder is kept aside, never deleted here.
  if (existsSync(o.storageDir)) renameSync(o.storageDir, `${o.storageDir}.before-restore-${Date.now()}`);
  mkdirSync(o.storageDir, { recursive: true });
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name]!;
    if (entry.dir || !name.startsWith("files/")) continue;
    const rel = name.slice("files/".length);
    const target = path.resolve(o.storageDir, rel);
    if (!target.startsWith(path.resolve(o.storageDir) + path.sep)) throw new Error(`Unsafe path in backup: ${rel}`);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, await entry.async("nodebuffer"), { mode: 0o600 });
  }
  return { manifest, secrets };
}

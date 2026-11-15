/**
 * Integration test of the desktop core on a real PostgreSQL 16 (embedded binaries):
 * init → start → migrate → seed (demo) → backup → wipe → restore → verify → stop.
 * Run: npm run test:core (as a non-root user on Linux — PostgreSQL refuses root).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { Client } from "pg";
import { BackupPasswordError, createBackup, decrypt, encrypt, prune, readBackup, restoreBackup } from "./core/backup";
import { listMigrations, migrate } from "./core/migrate";
import { initCluster, startServer } from "./core/pg";
import { appPaths, backupDue, loadOrCreateSecrets, plainProtector } from "./core/store";

const repo = path.resolve(__dirname, "../..");
const pgPkg = process.platform === "win32" ? "windows-x64" : process.platform === "darwin" ? `darwin-${process.arch}` : "linux-x64";
const binDir = path.join(path.resolve(__dirname, ".."), `node_modules/@embedded-postgres/${pgPkg}/native/bin`);
const migrationsDir = path.join(repo, "prisma/migrations");

async function one<T>(url: string, sql: string, params: unknown[] = []): Promise<T> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query(sql, params)).rows[0] as T;
  } finally {
    await c.end();
  }
}

/** Decrypts a field the way the app does (v1:<base64> key ring, AES-256-GCM, "v1:iv:tag:ct"). */
function keyFrom(fieldKeys: string) {
  return Buffer.from(fieldKeys.split(",").at(-1)!.split(":")[1]!, "base64");
}

test("encryption: right password round-trips, wrong password is refused", () => {
  const blob = encrypt(Buffer.from("שלום"), "סיסמה-ארוכה-1");
  assert.equal(decrypt(blob, "סיסמה-ארוכה-1").toString(), "שלום");
  assert.throws(() => decrypt(blob, "wrong"), BackupPasswordError);
  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1]! ^= 1;
  assert.throws(() => decrypt(tampered, "סיסמה-ארוכה-1"), BackupPasswordError);
});

test("backup schedule and retention", () => {
  const s = { fieldKeys: "", blindIndexKey: "", pgPassword: "", backupPassword: "x" };
  assert.equal(backupDue({ setupDone: true }, s), false);
  assert.equal(backupDue({ setupDone: true, backupFolder: "/b" }, s), true);
  assert.equal(backupDue({ setupDone: true, backupFolder: "/b", lastBackupAt: new Date(Date.now() - 3_600_000).toISOString() }, s), false);
  const dir = mkdtempSync(path.join(tmpdir(), "ta-prune-"));
  for (let i = 1; i <= 5; i++) writeFileSync(path.join(dir, `TA-backup-2026-01-0${i}_00-00-00.tabackup`), "x");
  assert.deepEqual(prune(dir, 3).length, 2);
  assert.deepEqual(readdirSync(dir).sort()[0], "TA-backup-2026-01-03_00-00-00.tabackup");
});

test("full cycle on embedded PostgreSQL", { timeout: 600_000 }, async () => {
  const p = appPaths(mkdtempSync(path.join(tmpdir(), "ta-desktop-")));
  const secrets = loadOrCreateSecrets(p.secrets, plainProtector);
  assert.deepEqual(loadOrCreateSecrets(p.secrets, plainProtector), secrets, "secrets are stable across runs");

  await initCluster(binDir, p.pgData, secrets.pgPassword);
  const pg = await startServer(binDir, p.pgData, secrets.pgPassword, path.join(p.logs, "pg.log"));
  try {
    // listens on loopback only
    const listen = await one<{ listen_addresses: string }>(pg.url("postgres"), "SHOW listen_addresses");
    assert.equal(listen.listen_addresses, "127.0.0.1");
    await one(pg.url("postgres"), "CREATE DATABASE ta_platform");
    const applied = await migrate(pg.url(), migrationsDir);
    assert.equal(applied.length, listMigrations(migrationsDir).length);
    assert.deepEqual(await migrate(pg.url(), migrationsDir), [], "migrations are idempotent");

    // The real seed bundle, with demo data (as the app runs it).
    execFileSync(process.execPath, [path.join(__dirname, "seed.js")], {
      env: { ...process.env, DATABASE_URL: pg.url(), SEED_ADVISOR_EMAIL: "advisor@office.test", SEED_ADVISOR_PASSWORD: "Pw-for-test-123", SEED_DEMO_DATA: "true",
        SEED_DEMO_CLIENT_PASSWORD: "Pw-for-test-123", FIELD_ENCRYPTION_KEYS: secrets.fieldKeys, BLIND_INDEX_KEY: secrets.blindIndexKey, NODE_PATH: path.join(repo, "node_modules") },
      stdio: "pipe",
    });
    const before = await one<{ h: string; t: string; s: string; a: string }>(pg.url(),
      `SELECT (SELECT count(*) FROM households) h, (SELECT count(*) FROM transactions) t, (SELECT count(*) FROM monthly_snapshots) s, (SELECT count(*) FROM audit_log) a`);
    assert.ok(Number(before.h) >= 4 && Number(before.t) > 100 && Number(before.s) > 0);

    // A stored file and an audit row (sequence) to prove both survive.
    writeFileSync(path.join(p.storage, "ab.bin"), Buffer.from("encrypted-file-content"));
    await one(pg.url(), `INSERT INTO audit_log (action, "entityType") VALUES ('VIEW', 'test')`);
    const maxAudit = await one<{ m: string }>(pg.url(), "SELECT max(id)::text m FROM audit_log");

    const backupDir = path.join(p.root, "backups");
    const { file, manifest } = await createBackup({ url: pg.url(), storageDir: p.storage, secrets, appVersion: "test", folder: backupDir, password: "גיבוי-סודי-2026" });
    assert.ok(existsSync(file) && !existsSync(`${file}.partial`));
    assert.equal(manifest.files, 1);
    assert.equal(manifest.tables.find((t) => t.name === "transactions")!.rows, Number(before.t));
    await assert.rejects(readBackup(file, "wrong"), BackupPasswordError);

    // Disaster: everything is wiped (new keys too), then restored from the file.
    await one(pg.url("postgres"), "DROP DATABASE ta_platform WITH (FORCE)");
    await one(pg.url("postgres"), "CREATE DATABASE ta_platform");
    const r = await restoreBackup({ adminUrl: pg.url("postgres"), dbName: "ta_platform", url: pg.url(), migrationsDir, storageDir: p.storage, file, password: "גיבוי-סודי-2026" });
    assert.equal(r.secrets.fieldKeys, secrets.fieldKeys);
    const after = await one<typeof before>(pg.url(),
      `SELECT (SELECT count(*) FROM households) h, (SELECT count(*) FROM transactions) t, (SELECT count(*) FROM monthly_snapshots) s, (SELECT count(*) FROM audit_log) a`);
    assert.deepEqual(after, { ...before, a: String(Number(before.a) + 1) });
    assert.equal(existsSync(path.join(p.storage, "ab.bin")), true);

    // Immutability triggers are active again after the load.
    await assert.rejects(one(pg.url(), `UPDATE monthly_snapshots SET version = version`), /immutable/);
    await assert.rejects(one(pg.url(), `DELETE FROM audit_log`), /append-only/);
    // The sequence continues after the restored rows.
    const next = await one<{ id: string }>(pg.url(), `INSERT INTO audit_log (action) VALUES ('VIEW') RETURNING id::text id`);
    assert.ok(BigInt(next.id) > BigInt(maxAudit.m));
    // Encrypted secrets in the restored DB decrypt with the restored keys (TOTP secret, if any).
    const enc = await one<{ v: string | null }>(pg.url(), `SELECT "totpSecretEnc" v FROM users WHERE "totpSecretEnc" IS NOT NULL LIMIT 1`).catch(() => ({ v: null }));
    if (enc?.v) {
      const [, iv, tag, ct] = enc.v.split(":");
      const d = createDecipheriv("aes-256-gcm", keyFrom(r.secrets.fieldKeys), Buffer.from(iv!, "base64"));
      d.setAuthTag(Buffer.from(tag!, "base64"));
      assert.ok(d.update(Buffer.from(ct!, "base64")).length > 0);
    }
  } finally {
    await pg.stop();
  }
  // Clean stop: no server left, restart works (data persisted).
  const again = await startServer(binDir, p.pgData, secrets.pgPassword, path.join(p.logs, "pg.log"));
  try {
    const h = await one<{ n: string }>(again.url(), "SELECT count(*)::text n FROM households");
    assert.ok(Number(h.n) >= 4);
  } finally {
    await again.stop();
  }
});

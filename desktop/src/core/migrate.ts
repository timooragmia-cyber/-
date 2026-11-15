/**
 * Applies prisma/migrations/<name>/migration.sql in order, recording them in the same
 * `_prisma_migrations` table Prisma uses, so the desktop database stays compatible with
 * `prisma migrate deploy` (no native Prisma schema engine is shipped in the desktop app).
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

export type Migration = { name: string; sql: string; checksum: string };

export function listMigrations(dir: string): Migration[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(path.join(dir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

const TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
)`;

export async function appliedMigrations(client: Client): Promise<string[]> {
  await client.query(TABLE);
  const r = await client.query<{ migration_name: string }>(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`);
  return r.rows.map((x) => x.migration_name);
}

/**
 * Applies pending migrations, each in its own transaction. `only` limits the set (used when
 * restoring a backup made by an older version: schema first exactly as it was, then data,
 * then the newer migrations).
 */
export async function migrate(url: string, dir: string, only?: ReadonlySet<string>): Promise<string[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const done = new Set(await appliedMigrations(client));
    const applied: string[] = [];
    for (const m of listMigrations(dir)) {
      if (done.has(m.name) || (only && !only.has(m.name))) continue;
      const id = randomUUID();
      await client.query("BEGIN");
      try {
        await client.query(`INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at) VALUES ($1, $2, $3, now())`, [id, m.checksum, m.name]);
        await client.query(m.sql);
        await client.query(`UPDATE "_prisma_migrations" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`, [id]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${m.name} failed: ${(e as Error).message}`);
      }
      applied.push(m.name);
    }
    return applied;
  } finally {
    await client.end();
  }
}

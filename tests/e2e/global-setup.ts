import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { Client } from "pg";

export const E2E = {
  advisor: { email: "advisor@example.test", password: "e2e-advisor-password-123" },
  client: { email: "samer.demo@example.test", password: "e2e-client-password-123" },
};

/** Fresh, seeded test database for every run (never the dev database). */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://ta:ta_dev_pw@localhost:5432/ta_platform_test?schema=public";
  rmSync("test-results/.e2e-advisor-2fa.json", { force: true });
  if (!url.includes("_test")) throw new Error("Refusing to run E2E against a non-test database");
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  const pg = new Client({ connectionString: url });
  await pg.connect();
  const { rows } = await pg.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'",
  );
  // TRUNCATE does not fire the row-level immutability triggers; acceptable for a throwaway test DB only.
  await pg.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await pg.end();
  execSync("npx prisma db seed", {
    env: { ...env, SEED_ADVISOR_PASSWORD: E2E.advisor.password, SEED_DEMO_CLIENT_PASSWORD: E2E.client.password },
    stdio: "inherit",
  });
}

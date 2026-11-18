import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const TEST_DB = process.env.E2E_DATABASE_URL ?? "postgresql://ta:ta_dev_pw@localhost:5432/ta_platform_test?schema=public";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // An advisor login may wait up to 30s for a fresh TOTP window (replay protection).
  timeout: 90_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", locale: "he-IL", timezoneId: "Asia/Jerusalem" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // E2E_STANDALONE=1 runs the shipped artifact (.next/standalone/server.js, as in Docker).
    command: process.env.E2E_STANDALONE ? `node scripts/run-standalone.mjs` : `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: { DATABASE_URL: TEST_DB, PORT: String(PORT) },
    timeout: 60_000,
  },
});

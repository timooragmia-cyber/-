import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { totp } from "../../src/server/auth/totp";
import { E2E } from "./global-setup";

// The advisor enrolls 2FA once per run (first project); the secret and used codes are shared
// across projects through a file because each project runs in its own worker.
const STATE = "test-results/.e2e-advisor-2fa.json";
type State = { secret?: string; used: string[] };
const load = (): State => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { used: [] });
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s));

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "כניסה" }).click();
}

/** Waits for the next 30s TOTP window if needed so a code is never reused (replay protection). */
async function freshCode(secret: string) {
  for (;;) {
    const state = load();
    const code = totp(secret, Date.now());
    if (!state.used.includes(code)) {
      save({ ...state, secret, used: [...state.used, code] });
      return code;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

test.describe.serial("Phase 0 core flows", () => {
  test("unauthenticated user is redirected to login (Hebrew RTL)", async ({ page }) => {
    await page.goto("/advisor");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
  });

  test("wrong password shows a generic error", async ({ page }) => {
    await login(page, E2E.advisor.email, "definitely-wrong-password");
    await expect(page.getByRole("alert").filter({ hasText: "שגויים" })).toBeVisible();
  });

  test("advisor must enroll 2FA, then sees the dashboard", async ({ page }) => {
    await login(page, E2E.advisor.email, E2E.advisor.password);
    const secret = load().secret;
    if (!secret) {
      await expect(page).toHaveURL(/\/login\/setup-2fa$/);
      const newSecret = (await page.locator("code").innerText()).trim();
      await page.locator("#code").fill(await freshCode(newSecret));
      await page.getByRole("button", { name: "אימות" }).click();
      // One-time recovery codes must be shown before leaving the page
      await expect(page.getByText("קודי שחזור")).toBeVisible();
      await expect(page.locator("ul.num li")).toHaveCount(8);
      await page.getByRole("link", { name: "המשך" }).click();
    } else {
      await expect(page).toHaveURL(/\/login\/2fa$/);
      await page.locator("#code").fill(await freshCode(secret));
      await page.getByRole("button", { name: "אימות" }).click();
    }
    await expect(page).toHaveURL(/\/advisor$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("לוח בקרה");
    // 4 fictional households with traffic-light statuses
    await expect(page.getByRole("link", { name: "פתיחת תיק" })).toHaveCount(4);
    await expect(page.getByText("גירעון").first()).toBeVisible();
    await expect(page.getByText("חסר עדכון חודשי")).toBeVisible();

    await page.goto("/advisor/config");
    await expect(page.getByText("purchase_tax.single_residence")).toBeVisible();
    await expect(page.getByRole("status")).toContainText("טרם אומתו");
  });

  test("client sees only their own household and cannot reach advisor pages", async ({ page }) => {
    await login(page, E2E.client.email, E2E.client.password);
    await expect(page).toHaveURL(/\/portal$/);
    // Client locale is Arabic → RTL Arabic UI
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("وضعكم الشهري")).toBeVisible();
    await expect(page.getByText("2026-10")).toBeVisible();

    await page.goto("/advisor");
    await expect(page).toHaveURL(/\/portal$/);
    await page.goto("/advisor/config");
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("language switch persists per user", async ({ page }) => {
    await login(page, E2E.client.email, E2E.client.password);
    await expect(page).toHaveURL(/\/portal$/);
    await page.goto("/account");
    await page.getByLabel("עברית").check();
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    // switch back for other runs
    await page.getByLabel("العربية").check();
    await page.getByRole("button", { name: "שמירה" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });

  test("health endpoint exposes nothing sensitive", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(await res.json()).toEqual({ ok: true });
  });
});

import { expect, test } from "@playwright/test";
import { E2E } from "./global-setup";
import { login, loginAdvisor } from "./helpers";

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
    await loginAdvisor(page);
    await expect(page).toHaveURL(/\/advisor$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("לוח בקרה");
    // 4 fictional households with traffic-light statuses
    // 4 seeded households (+ any created by the Phase 1 flow in this run)
    expect(await page.getByRole("link", { name: "פתיחת תיק" }).count()).toBeGreaterThanOrEqual(4);
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
    await expect(page.getByText("2026-10").first()).toBeVisible();

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

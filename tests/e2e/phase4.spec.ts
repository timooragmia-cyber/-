import { expect, test } from "@playwright/test";
import { E2E } from "./global-setup";
import { login, loginAdvisor } from "./helpers";

test.describe.serial("Phase 4 — mortgage & debt, action plan, PDF reports", () => {
  test.skip(({ isMobile }) => isMobile, "Advisor flows run on desktop; mobile covers the portal.");
  let unreleasedReportUrl = "";

  test("mortgage scenarios, refinance, optimizer, debt ranking, consolidation", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAdvisor(page);
    const halabi = await page.locator("tr", { hasText: "חלבי" }).getByRole("link", { name: "פתיחת תיק" }).getAttribute("href");
    await page.goto(`${halabi}/debt`);
    await expect(page.getByText(/פריים 4.75%/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "דיסקונט למשכנתאות" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "תרחיש לחץ" })).toBeVisible();

    // Refinance the fixed-unlinked track 5.1% → 4.3% with ₪6,000 early-repayment fee
    await page.getByText("סימולטור מחזור / פירעון מוקדם").click();
    const fixed = page.locator("label", { hasText: "קבועה לא צמודה — ריבית חדשה" }).locator("input");
    await fixed.fill("4.3");
    await page.locator("input[name=earlyFee]").fill("6000");
    await page.getByRole("button", { name: "חישוב" }).first().click();
    await expect(page.getByText("נקודת איזון")).toBeVisible();
    await expect(page.getByText(/\d+ חודשים/).first()).toBeVisible();

    // Mix optimizer for a new ₪900,000 mortgage
    await page.locator("input[name=optAmount]").fill("900000");
    await page.locator("input[name=opt_FIXED_UNLINKED]").fill("5.0");
    await page.locator("input[name=opt_FIXED_LINKED]").fill("3.4");
    await page.locator("input[name=opt_VARIABLE_5_UNLINKED]").fill("4.6");
    await page.locator("input[name=opt_VARIABLE_5_LINKED]").fill("3.3");
    await page.locator("form", { has: page.locator("input[name=optAmount]") }).getByRole("button", { name: "חישוב" }).click();
    await expect(page.getByRole("cell", { name: "הזול ביותר (תרחיש בסיס)" })).toBeVisible();
    await expect(page.getByText(/תמהילים נבדקו/)).toBeVisible();

    // Osman: overdraft (from the bank account) ranked first; consolidate overdraft + consumer loan
    await page.goto("/advisor");
    const osman = await page.locator("tr", { hasText: "עות'מאן" }).getByRole("link", { name: "פתיחת תיק" }).getAttribute("href");
    await page.goto(`${osman}/debt`);
    const rows = page.locator("tbody tr").filter({ has: page.locator("input[name=cons]") });
    await expect(rows.first()).toContainText("מינוס בחשבון");
    await expect(page.getByText("לא נקבע סף 'חוב יקר'")).toBeVisible();
    await rows.nth(0).locator("input[name=cons]").check();
    await rows.nth(1).locator("input[name=cons]").check();
    await page.locator("input[name=consRate]").fill("7.5");
    await page.getByRole("button", { name: "חישוב" }).last().click();
    await expect(page.getByText("החזר חודשי אחרי")).toBeVisible();
  });

  test("set the expensive-debt threshold, generate and approve the plan, produce PDF reports", async ({ page }) => {
    test.setTimeout(240_000);
    await loginAdvisor(page);
    // Advisor sets the threshold (8%) in configuration — no developer needed
    await page.goto("/advisor/config");
    const p = page.locator("li", { hasText: "debt.expensive_threshold_ppm" });
    await p.locator("textarea[name=value]").fill("80000");
    await p.getByRole("button", { name: "עריכה" }).click();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.locator("li", { hasText: "debt.expensive_threshold_ppm" }).locator("textarea[name=value]")).toHaveValue("80000");

    await page.goto("/advisor");
    const khatib = await page.locator("tr", { hasText: "ח'טיב" }).getByRole("link", { name: "פתיחת תיק" }).getAttribute("href");
    await page.goto(`${khatib}/plan`);
    await page.getByRole("button", { name: "עדכון המלצות מהנתונים" }).click();
    await expect(page.getByText(/עודכנו \d+ המלצות/)).toBeVisible();
    await expect(page.getByText(/לבנות קרן חירום של 6 חודשים/)).toBeVisible();
    await expect(page.getByText(/להוריד דמי ניהול/).first()).toBeVisible();
    await expect(page.getByText(/לסלק חוב יקר: הלוואה 4471/)).toBeVisible(); // 8.9% > 8%
    // Conservative order: emergency fund first
    await expect(page.locator("ol > li").first()).toContainText("קרן חירום");

    // Approve the first two; the rest stay proposed (invisible to the client)
    for (let i = 0; i < 2; i++) {
      await page.locator("ol > li").filter({ hasText: "מוצע" }).first().getByRole("button", { name: "אישור" }).click();
      await expect(page.locator("ol > li").nth(i).getByText("אושר", { exact: true })).toBeVisible();
    }

    // Reports: monthly (Hebrew) and full review (Arabic)
    await page.goto(`${khatib}/reports`);
    await page.locator("select[name=locale]").selectOption("he");
    await page.getByRole("button", { name: "הפקת דוח" }).click();
    await expect(page.getByText("הדוח הופק.")).toBeVisible({ timeout: 60_000 });
    await page.reload();
    await page.locator("select[name=type]").selectOption("FULL_REVIEW");
    await page.locator("select[name=locale]").selectOption("ar");
    await page.getByRole("button", { name: "הפקת דוח" }).click();
    await expect(page.getByText("הדוח הופק.")).toBeVisible({ timeout: 60_000 });
    await page.reload();
    const links = page.getByRole("link", { name: "הורדה" });
    await expect(links).toHaveCount(2);
    const fullUrl = (await links.nth(0).getAttribute("href"))!;
    const res = await page.request.get(fullUrl);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    const body = await res.body();
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(body.length).toBeGreaterThan(20_000); // embedded Hebrew + Arabic fonts

    // Release only the monthly report
    await page.locator("li", { hasText: "דוח חודשי" }).getByRole("button", { name: "שחרור ללקוח" }).click();
    await expect(page.locator("li", { hasText: "דוח חודשי" }).getByText("שוחרר ללקוח")).toBeVisible();
    unreleasedReportUrl = fullUrl;
  });

  test("client sees only approved actions and released reports", async ({ page }) => {
    await login(page, E2E.client.email, E2E.client.password);
    await expect(page.getByText("خطة العمل الخاصة بكم")).toBeVisible();
    await expect(page.getByText(/بناء صندوق طوارئ/)).toBeVisible();
    await expect(page.getByText(/تسديد دين غالٍ/)).toBeVisible(); // approved 2nd
    await expect(page.getByText(/تخفيض رسوم الإدارة/)).toHaveCount(0); // proposed, not approved
    await expect(page.getByText("تقرير شهري", { exact: false })).toBeVisible();
    // Unreleased report is not reachable by the client
    expect((await page.request.get(unreleasedReportUrl)).status()).toBe(404);
    // Client marks the approved emergency-fund action as done
    const item = page.locator("li", { hasText: "بناء صندوق طوارئ" });
    await item.getByRole("button", { name: "أُنجزت" }).click();
    await expect(page.locator("li", { hasText: "بناء صندوق طوارئ" })).toContainText("✓");
  });
});

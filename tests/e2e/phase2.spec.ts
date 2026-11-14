import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { E2E } from "./global-setup";
import { login, loginAdvisor } from "./helpers";

test.describe.serial("Phase 2 — accounts, cards, cash flow, long-term savings", () => {
  test.skip(({ isMobile }) => isMobile, "Advisor flows run on desktop; mobile covers the portal.");

  test("savings: fee flags, savings potential, simulator, retirement, template import, config edit", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAdvisor(page);
    const href = await page.locator("tr", { hasText: "ח'טיב" }).getByRole("link", { name: "פתיחת תיק" }).getAttribute("href");

    // Long-term savings
    await page.goto(`${href}/savings`);
    await expect(page.getByText("פוטנציאל חיסכון בדמי ניהול עד הפרישה")).toBeVisible();
    await expect(page.getByText("מעל הרף").first()).toBeVisible();
    await expect(page.getByText("תוספת בפרישה").first()).toBeVisible();
    // Retirement projection for both earners, three scenarios
    await expect(page.getByRole("heading", { name: "תחזית פרישה" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /^שמרני/ }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: /^אופטימי/ }).first()).toBeVisible();

    // Simulator reacts to input: lowering the target fee increases the gain
    const sim = page.locator("#simulator");
    await expect(sim.getByText("תוספת לצבירה בפרישה")).toBeVisible();
    const gainBefore = await sim.locator("dd").first().innerText();
    await sim.getByLabel("מצבירה (%)").nth(1).fill("0.05");
    await expect(sim.locator("dd").first()).not.toHaveText(gainBefore);
    await sim.getByLabel("מצבירה (%)").nth(1).fill("abc");
    await expect(sim.getByRole("alert")).toContainText("בדקו");

    // Excel template: download, fill, import
    const res = await page.request.get("/api/savings-template");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.body()) as unknown as ArrayBuffer);
    wb.worksheets[0]!.addRow(["سامر", "PROVIDENT_FUND", "ילין לפידות גמל", "כללי", "", 12500, "2026-10-31", 0, 0, 0, 0, 0.9, "2020-01-01", "לא"]);
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await page.locator("input[name=file]").setInputFiles({ name: "filled-template.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
    await page.getByRole("button", { name: "העלאה" }).click();
    await expect(page.getByText("יובאו 1 מוצרים.")).toBeVisible();
    await page.reload();
    await expect(page.getByText(/קופת גמל — ילין לפידות גמל/)).toBeVisible();

    // Cards: what comes out of each card
    await page.goto(`${href}/cards`);
    await expect(page.getByText("מה יוצא מכל כרטיס ועל מה")).toBeVisible();
    await expect(page.getByText(/חיוב 2026-10-10/)).toBeVisible();
    await expect(page.getByText("מתוכם תשלומים").first()).toBeVisible();

    // Cash flow: calendar + projection from the latest balance
    await page.goto(`${href}/cashflow`);
    await expect(page.getByText("לוח תזרים חודשי")).toBeVisible();
    await expect(page.getByText(/יתרת פתיחה/)).toBeVisible();
    await expect(page.getByRole("status")).toBeVisible();

    // Accounts: record a balance and set overdraft details
    await page.goto(`${href}/accounts`);
    const bank = page.locator("div.rounded-md", { hasText: "לאומי עו\"ש" }).first();
    await bank.getByText("עדכון יתרה").click();
    await bank.locator("input[name=balance]").fill("-1500");
    await bank.getByRole("button", { name: "שמירה" }).first().click();
    await expect(page.getByText("שווי נקי")).toBeVisible();

    // Config: fee benchmark editing — verifying requires a source
    await page.goto("/advisor/config");
    const row = page.locator("li", { hasText: "קרן השתלמות · מצבירה" });
    await row.getByText("עריכת רף / תקרה").click();
    await row.locator("input[name=sourceUrl]").fill("");
    await row.locator("input[name=verify]").check();
    await row.getByRole("button", { name: "שמירה" }).click();
    await expect(row.getByRole("alert")).toContainText("יש לצרף קישור");
    await row.locator("input[name=sourceUrl]").fill("https://www.gov.il/he/departments/capital-market-insurance-and-savings-authority");
    await row.getByRole("button", { name: "שמירה" }).click();
    await expect(page.locator("li", { hasText: "קרן השתלמות · מצבירה" }).getByText("מאומת", { exact: true })).toBeVisible();
  });
});

test.describe("Phase 2 — portal", () => {
  test("client sees own savings balances (no fee analysis)", async ({ page }) => {
    await login(page, E2E.client.email, E2E.client.password);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByText("التقاعد والادخار")).toBeVisible();
    await expect(page.getByText(/مجدال مكفات|מגדל מקפת/)).toBeVisible();
    await expect(page.getByText("מעל הרף")).toHaveCount(0);
  });
});


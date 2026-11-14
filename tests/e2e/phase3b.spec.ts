import { expect, test } from "@playwright/test";
import { loginAdvisor } from "./helpers";

test.describe.serial("Phase 3b — investments and route comparison", () => {
  test.skip(({ isMobile }) => isMobile, "Advisor flows run on desktop.");

  test("real estate, portfolio, deposits and route comparison with the conservative order", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAdvisor(page);
    const halabi = await page.locator("tr", { hasText: "חלבי" }).getByRole("link", { name: "פתיחת תיק" }).getAttribute("href");

    // Investments: property analysis with an exit scenario using the betterment calculator
    await page.goto(`${halabi}/investments`);
    await expect(page.getByRole("heading", { name: /בית המשפחה/ })).toBeVisible();
    await expect(page.getByText("תשואה ברוטו")).toBeVisible();
    await expect(page.getByText(/מכירה בעוד 10 שנים/)).toBeVisible();
    await expect(page.getByText(/מס שבח \(פטור דירה יחידה/).first()).toBeVisible();

    // Portfolio: returns, fees, allocation drift, unrealized tax
    await expect(page.getByText("תשואה משוקללת זמן")).toBeVisible();
    await expect(page.getByText("תשואה משוקללת כסף (שנתית)")).toBeVisible();
    await expect(page.getByText("חבות מס לא ממומשת (הערכה)")).toBeVisible();
    await expect(page.getByRole("cell", { name: "מניות בחו\"ל" })).toBeVisible();

    // Add a dividend transaction and see cash change
    const cashBefore = await page.locator("dt", { hasText: "מזומן בתיק" }).locator("xpath=following-sibling::dd").innerText();
    await page.getByText("הוספת תנועה").click();
    const form = page.locator("form", { has: page.locator("select[name=type]") }).first();
    await form.locator("select[name=type]").selectOption("DIVIDEND");
    await form.locator("input[name=amount]").fill("500");
    await form.getByRole("button", { name: "הוספה" }).click();
    await expect(page.locator("dt", { hasText: "מזומן בתיק" }).locator("xpath=following-sibling::dd")).not.toHaveText(cashBefore);

    // BUY without units is refused with a clear message
    await form.locator("select[name=type]").selectOption("BUY");
    await form.locator("input[name=amount]").fill("1000");
    await form.getByRole("button", { name: "הוספה" }).click();
    await expect(form.getByRole("alert")).toContainText("יש לבחור נייר");

    // Deposits: net after tax and fee
    await expect(page.getByText("קרן כספית — כרית ביטחון")).toBeVisible();

    // Routes: Halabi (MEDIUM tolerance) — high-risk route not suitable
    await page.goto(`${halabi}/routes?amount=100000&years=5`);
    await expect(page.getByText("סדר שמרני — לפני השקעה")).toBeVisible();
    await expect(page.getByRole("row", { name: /מדד מניות/ })).toContainText("מעל רמת הסיכון");
    await expect(page.getByRole("row", { name: /קרן כספית/ })).toContainText("מתאים");

    // Khatib: emergency fund missing → gap recommendation first
    await page.goto("/advisor");
    const khatib = await page.locator("tr", { hasText: "ח'טיב" }).getByRole("link", { name: "פתיחת תיק" }).getAttribute("href");
    await page.goto(`${khatib}/routes`);
    await expect(page.getByText(/מומלץ להשלים קרן חירום/)).toBeVisible();
  });
});

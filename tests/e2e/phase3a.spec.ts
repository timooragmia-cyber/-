import { expect, test } from "@playwright/test";
import { loginAdvisor } from "./helpers";

test.describe.serial("Phase 3a — tax calculators", () => {
  test.skip(({ isMobile }) => isMobile, "Advisor flows run on desktop.");

  test("calculators reproduce documented examples, refuse missing rules, save to a client, CPI import", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAdvisor(page);

    // Purchase tax: published example ₪2,500,000 single apartment → ₪20,538.33
    await page.getByRole("link", { name: "מחשבוני מס" }).first().click();
    await page.getByRole("link", { name: /^מס רכישה/ }).click();
    await page.locator("#f-value").fill("2500000");
    await page.locator("#f-date").fill("2026-06-01");
    await page.getByRole("button", { name: "חישוב" }).click();
    await expect(page.getByText("20,538.33").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "כללים שבשימוש" })).toBeVisible();
    await expect(page.getByText("purchase_tax.single_residence")).toBeVisible();
    await expect(page.getByText("לא מאומת").first()).toBeVisible();
    await expect(page.getByText(/יש לאמת שיעורים ותקרות עדכניים מול רשות המסים/)).toBeVisible();

    // Save into the Khatib file, then find it under the client's saved calculations
    await page.locator("#save-h").selectOption({ label: "عائلة خطيب · משפחת ח'טיב" });
    await page.locator("#save-title").fill("דירה בעכו");
    await page.getByRole("button", { name: "שמירה בתיק לקוח" }).click();
    await expect(page.getByText("החישוב נשמר בתיק הלקוח.")).toBeVisible();

    // Additional apartment after the temporary provision's configured end → refusal, no number
    await page.goto("/advisor/tax/purchase-tax?run=1&kind=ADDITIONAL_RESIDENCE&value=2500000&date=2027-03-01");
    await expect(page.locator("main").getByRole("alert")).toContainText("purchase_tax.additional_residence");
    await expect(page.getByText("200,000")).toHaveCount(0);

    // Betterment tax with manual CPI (documented example) → ₪277,182.58
    await page.goto("/advisor/tax/betterment-tax?run=1&route=REGULAR&transfer=SALE&purchaseDate=2010-06-30&saleDate=2026-06-30&purchasePrice=1000000&salePrice=2600000&deductibleCosts=100000&saleCosts=40000&cpiPurchase=100&cpiSale=130");
    await expect(page.getByText("277,182.58").first()).toBeVisible();
    await expect(page.getByText(/550\/5844/)).toBeVisible();

    // Without CPI in the table and no manual values → clear request for the index
    await page.goto("/advisor/tax/betterment-tax?run=1&route=REGULAR&transfer=SALE&purchaseDate=2010-06-30&saleDate=2026-06-30&purchasePrice=1000000&salePrice=2600000&deductibleCosts=0&saleCosts=0");
    await expect(page.locator("main").getByRole("alert")).toContainText("חסר מדד");

    // CPI import (synthetic test series) → the same calculation now runs from the table
    await page.goto("/advisor/tax/cpi");
    const csv = "חודש,מדד\nמאי 2010,100.0\nמאי 2026,130.0\n"; // known index for 30 June = May
    await page.locator("#cpi-base").fill("TEST-BASE");
    await page.locator("input[name=file]").setInputFiles({ name: "cpi.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByRole("button", { name: "ייבוא קובץ" }).click();
    await expect(page.getByText("יובאו 2 חודשים.")).toBeVisible();
    await page.goto("/advisor/tax/betterment-tax?run=1&route=REGULAR&transfer=SALE&purchaseDate=2010-06-30&saleDate=2026-06-30&purchasePrice=1000000&salePrice=2600000&deductibleCosts=100000&saleCosts=40000");
    await expect(page.getByText("277,182.58").first()).toBeVisible();

    // Rental: cheapest route highlighted
    await page.goto("/advisor/tax/rental?run=1&monthlyRent=7000&otherAnnualIncome=228000&annualExpenses=10000&annualDepreciation=15000&year=2026");
    await expect(page.getByRole("row", { name: /מסלול 10% ✓/ })).toBeVisible();

    // Saved run appears in the client's file and reopens with the same result
    await page.goto("/advisor");
    await page.locator("tr", { hasText: "ח'טיב" }).getByRole("link", { name: "פתיחת תיק" }).click();
    await page.getByRole("link", { name: "חישובים שמורים" }).click();
    await expect(page.getByText("מס רכישה — דירה בעכו")).toBeVisible();
    await page.getByRole("link", { name: "פתיחה" }).first().click();
    await expect(page.getByText("20,538.33").first()).toBeVisible();

    // Config: rule edits are schema-validated; verifying needs a source
    await page.goto("/advisor/config");
    const rule = page.locator("li", { hasText: "rental_income.flat_rate" });
    await rule.getByText("עריכת כלל").click();
    await rule.locator("textarea[name=params]").fill('{"ratePpm": "ten"}');
    await rule.getByRole("button", { name: "שמירה" }).click();
    await expect(rule.getByRole("alert")).toContainText("schema");
    await rule.locator("textarea[name=params]").fill('{"ratePpm": 100000}');
    await rule.locator("input[name=sourceUrl]").fill("");
    await rule.locator("input[name=verify]").check();
    await rule.getByRole("button", { name: "שמירה" }).click();
    await expect(rule.getByRole("alert")).toContainText("קישור למקור");
  });
});

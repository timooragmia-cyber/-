import { expect, test } from "@playwright/test";
import { E2E } from "./global-setup";
import { login, loginAdvisor } from "./helpers";

/**
 * Definition of done (Phase 1 slice): a new client is onboarded, three months of bank and
 * card statements are imported, months are closed, and the advisor sees the closed-month view
 * and the trend — measured end to end.
 */
test.describe.serial("Phase 1 — onboarding to closed months", () => {
  test.skip(({ isMobile }) => isMobile, "Heavy advisor flow runs on desktop; mobile covers the portal.");
  let clientUrl = "";
  let tempLogin = "";

  test("onboard, import 3 months (bank CSV + card XLSX), dedup, learn, close, trend", async ({ page }) => {
    test.setTimeout(180_000);
    const started = Date.now();
    await loginAdvisor(page);

    // 1. New client with consent
    await page.getByRole("link", { name: /לקוח חדש/ }).click();
    await page.locator("#displayName").fill("משפחת בדיקה");
    await page.locator("#firstName").fill("נועה");
    await page.locator("#lastName").fill("בדיקה");
    await page.locator("#city").fill("כרמיאל");
    await page.getByRole("button", { name: "יצירת תיק" }).click();
    await expect(page).toHaveURL(/\/advisor\/clients\/\w+\/accounts$/);
    clientUrl = page.url().replace(/\/accounts$/, "");

    // 2. Accounts
    for (const [kind, inst, nick, last4] of [["BANK_ACCOUNT", "LEUMI", "לאומי עו\"ש", "9921"], ["CREDIT_CARD", "MAX", "מקס נועה", "4410"]]) {
      if (!(await page.locator("#a-kind").isVisible())) await page.getByText("הוספת חשבון / כרטיס").click();
      await page.locator("#a-kind").selectOption(kind!);
      await page.locator("#a-inst").selectOption(inst!);
      await page.locator("#a-nick").fill(nick!);
      await page.locator("#a-last4").fill(last4!);
      await page.getByRole("button", { name: "הוספה" }).click();
      await expect(page.getByText(nick!).first()).toBeVisible();
    }

    // 3. Upload + import both files
    // option 0 is the placeholder; accounts are listed in creation order (bank, card)
    const imports: [string, number, number][] = [
      ["tests/fixtures/demo-bank-aug-oct-2026.csv", 1, 28],
      ["tests/fixtures/demo-card-max-aug-oct-2026.xlsx", 2, 32],
    ];
    for (const [file, accountIndex, expected] of imports) {
      await page.goto(`${clientUrl}/accounts`);
      await page.locator("#file").setInputFiles(file);
      await page.getByRole("button", { name: "העלאה" }).click();
      await expect(page.getByRole("status").filter({ hasText: "הקובץ הועלה" })).toBeVisible();
      await page.getByRole("link", { name: "ייבוא", exact: true }).first().click();
      await page.locator("#account").selectOption({ index: accountIndex });
      await page.getByRole("button", { name: "המשך" }).click();
      await expect(page.getByText("המיפוי זוהה אוטומטית")).toBeVisible();
      await page.getByRole("button", { name: "תצוגה מקדימה" }).click();
      await expect(page).toHaveURL(/\/import\/batch\//);
      await expect(page.getByText(`${expected} שורות לייבוא · 0 כפולות · 0 שגיאות`)).toBeVisible();
      await page.getByRole("button", { name: `אישור וייבוא ${expected} שורות` }).click();
      await expect(page.getByText(`יובאו ${expected} שורות.`)).toBeVisible();
    }

    // 4. Re-import of the same bank file → everything recognized as duplicate
    await page.goto(`${clientUrl}/accounts`);
    await page.locator("#file").setInputFiles("tests/fixtures/demo-bank-aug-oct-2026.csv");
    await page.getByRole("button", { name: "העלאה" }).click();
    await expect(page.getByRole("status").filter({ hasText: "הקובץ הועלה" })).toBeVisible();
    await page.getByRole("link", { name: "ייבוא", exact: true }).first().click();
    await page.locator("#account").selectOption({ index: 1 });
    await page.getByRole("button", { name: "המשך" }).click();
    await expect(page.getByText("נעשה שימוש במיפוי שנשמר בעבר")).toBeVisible();
    await page.getByRole("button", { name: "תצוגה מקדימה" }).click();
    await expect(page.getByText("0 שורות לייבוא · 28 כפולות · 0 שגיאות")).toBeVisible();
    await expect(page.getByText("אין שורות חדשות לייבוא.")).toBeVisible();

    // 5. Categorize the unknown line, teaching the system
    await page.goto(`${clientUrl}/transactions?period=2026-10&uncat=1`);
    const row = page.locator("li").filter({ hasText: "העברה למשה - שיפוצים" });
    await row.locator("select[name=categoryId]").selectOption({ label: "בית וריהוט" });
    await row.getByRole("button", { name: "שמירה" }).click();
    // In the "uncategorized only" view the row leaves the list once categorized.
    await expect(page.locator("li").filter({ hasText: "העברה למשה - שיפוצים" })).toHaveCount(0);
    await page.goto(`${clientUrl}/transactions?period=2026-10`);
    await expect(page.locator("li").filter({ hasText: "העברה למשה - שיפוצים" }).getByText("ידני")).toBeVisible();

    // 6. Close three months (Aug–Oct) — card purchases count in their billing month
    for (const period of ["2026-08", "2026-09", "2026-10"]) {
      await page.goto(`${clientUrl}/months?period=${period}`);
      await expect(page.getByRole("heading", { name: `סגירת חודש ${period}` })).toBeVisible();
      await page.getByRole("button", { name: "סגירת החודש" }).click();
      await expect(page.getByText(/נסגר \(גרסה 1\)/)).toBeVisible();
    }
    await expect(page.getByText("לאן הלך הכסף")).toBeVisible();
    await expect(page.getByText("מזון וצריכה").first()).toBeVisible();

    // 7. Overview: trend chart, health score, recurring subscriptions, installments
    await page.goto(clientUrl);
    await expect(page.getByRole("heading", { name: "מגמה" })).toBeVisible();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "מדד בריאות פיננסית" })).toBeVisible();
    await expect(page.getByText("NETFLIX.COM").first()).toBeVisible();
    await expect(page.getByText(/איקאה/).first()).toBeVisible();

    const minutes = (Date.now() - started) / 60_000;
    console.log(`Onboarding → 3 closed months took ${minutes.toFixed(2)} min (DoD: < 15 min)`);
    expect(minutes).toBeLessThan(15);

    // 8. Undo the card import → closed months flagged as changed (snapshots stay immutable)
    await page.goto(`${clientUrl}/accounts`);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("row").filter({ hasText: "demo-card-max" }).getByRole("button", { name: "ביטול ייבוא" }).click();
    await expect(page.getByRole("row").filter({ hasText: "demo-card-max" }).getByText("בוטל")).toBeVisible();
    await page.goto(`${clientUrl}/months?period=2026-09`);
    await expect(page.getByText("הנתונים השתנו מאז הסגירה")).toBeVisible();
  });

  test("advisor creates a client login → client must change the temporary password", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await loginAdvisor(page);
    await page.goto(`${clientUrl}/profile`);
    await page.locator("#l-email").fill("noa.e2e@example.test");
    await page.getByRole("button", { name: "יצירת כניסה" }).click();
    tempLogin = (await page.locator("code").last().innerText()).trim();
    const [email, temp] = tempLogin.split("/").map((s) => s.trim());
    expect(email).toBe("noa.e2e@example.test");

    const ctx = await browser.newContext();
    const client = await ctx.newPage();
    await login(client, email!, temp!);
    await expect(client).toHaveURL(/\/account\/password$/);
    await client.goto("/portal");
    await expect(client).toHaveURL(/\/account\/password$/); // cannot skip
    await client.locator("#current").fill(temp!);
    await client.locator("#new").fill("a-much-longer-password-2026");
    await client.locator("#confirm").fill("a-much-longer-password-2026");
    await client.getByRole("button", { name: "עדכון סיסמה" }).click();
    await expect(client).toHaveURL(/\/portal$/);
    await expect(client.getByText("2026-10").first()).toBeVisible(); // sees own closed month
    await ctx.close();
  });
});

test.describe("Phase 1 — client portal", () => {
  test("client sees where the money went, marks a task, uploads a statement, cannot reach other households", async ({ page }, info) => {
    await login(page, E2E.client.email, E2E.client.password);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByText("أين ذهب المال هذا الشهر")).toBeVisible();
    await expect(page.getByText("نسبة الادخار").first()).toBeVisible();

    // Each project completes a different seeded task (the DB is shared within a run).
    const title = info.project.name === "mobile" ? "تحويل تلقائي" : "إلغاء اشتراكين غير مستخدمين";
    const task = page.locator("li").filter({ hasText: title });
    await task.getByRole("button", { name: "أُنجزت" }).click();
    await expect(page.locator("li").filter({ hasText: title })).toHaveCount(0);

    await page.goto("/portal/upload");
    await page.locator("#file").setInputFiles("tests/fixtures/demo-bank-aug-oct-2026.csv");
    await page.getByRole("button", { name: "رفع" }).click();
    await expect(page.getByRole("status").filter({ hasText: "تم رفع الملف" })).toBeVisible();
    await expect(page.getByText("بانتظار الاستيراد").first()).toBeVisible();

    // A client can never open advisor pages or another household
    await page.goto("/advisor/clients/someotherid/transactions");
    await expect(page).toHaveURL(/\/portal$/);
  });
});

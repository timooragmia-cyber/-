import { existsSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { Client } from "pg";
import { expect, test } from "@playwright/test";
import { E2E } from "./global-setup";
import { login, loginAdvisor } from "./helpers";

const TEST_DB = process.env.E2E_DATABASE_URL ?? "postgresql://ta:ta_dev_pw@localhost:5432/ta_platform_test?schema=public";
const WAEL = { email: "wael.demo@example.test", password: E2E.client.password }; // Halabi household, Hebrew UI
const HALABI = "משפחת חלבי · عائلة حلبي";
// Same default as src/server/env.ts; the E2E server runs from the repository root.
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");

async function sql<T = Record<string, unknown>>(q: string, params: unknown[] = []): Promise<T[]> {
  const pg = new Client({ connectionString: TEST_DB });
  await pg.connect();
  try {
    return (await pg.query(q, params)).rows as T[];
  } finally {
    await pg.end();
  }
}

test.describe("Phase 5 — security headers", () => {
  test("CSP with a per-request nonce and the security headers on every page", async ({ page, request }) => {
    const a = await request.get("/login");
    const b = await request.get("/login");
    const csp = a.headers()["content-security-policy"]!;
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{20,}' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toBe(b.headers()["content-security-policy"]); // fresh nonce each time
    expect(a.headers()["x-frame-options"]).toBe("DENY");
    expect(a.headers()["x-content-type-options"]).toBe("nosniff");
    expect(a.headers()["x-powered-by"]).toBeUndefined();
    // Next's scripts carry the nonce, and the page hydrates (login works under the CSP).
    const nonce = /'nonce-([^']+)'/.exec(csp)![1];
    expect(await a.text()).toContain(`nonce="${nonce}"`);
    const violations: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
    await login(page, E2E.client.email, E2E.client.password);
    await expect(page).toHaveURL(/\/portal$/);
    expect(violations).toEqual([]);
  });

  test("anonymous access to data endpoints is refused", async ({ request }) => {
    expect((await request.get("/api/privacy/export", { maxRedirects: 0 })).status()).toBe(307); // proxy → /login
    const r = await request.get("/api/privacy/export", { headers: { cookie: "ta_session=forged" } });
    expect(r.status()).toBe(401);
  });
});

test.describe.serial("Phase 5 — privacy: access, restriction, purge", () => {
  test.skip(({ isMobile }) => isMobile, "Advisor flows run on desktop; mobile covers the portal.");

  test("client: 2FA prompt, download own data, request deletion", async ({ page }) => {
    await login(page, WAEL.email, WAEL.password);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole("link", { name: "הפעלת אימות דו-שלבי" })).toBeVisible();
    // A statement upload, so the purge test can prove stored files are deleted too.
    await page.goto("/portal/upload");
    await page.locator("#file").setInputFiles("tests/fixtures/demo-bank-aug-oct-2026.csv");
    await page.getByRole("button", { name: "העלאה" }).click();
    await expect(page.getByRole("status").filter({ hasText: "הקובץ הועלה" })).toBeVisible();
    await page.getByRole("link", { name: "המידע שלי" }).click();
    const res = await page.request.get("/api/privacy/export?household=someone-else-entirely-0000");
    expect(res.status()).toBe(200); // the parameter is ignored for clients: always their own file
    expect(res.headers()["content-type"]).toBe("application/zip");
    const zip = await JSZip.loadAsync(await res.body());
    const data = JSON.parse(await zip.file("data.json")!.async("string"));
    expect(data.scope).toBe("client");
    expect(data.household.displayName).toBe(HALABI);
    expect(data.auditLog).toBeUndefined(); // advisor-internal material is not in the client export
    expect(JSON.stringify(data)).not.toMatch(/passwordHash|totpSecretEnc|storageKey/);
    const csv = await zip.file("transactions.csv")!.async("string");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toContain("amount_ils");
    expect(zip.file("README.txt")).not.toBeNull();
    const uploaded = Object.keys(zip.files).filter((n) => n.startsWith("files/") && n.endsWith(".csv"));
    expect(uploaded).toHaveLength(1);
    expect(await zip.file(uploaded[0]!)!.async("string")).toContain("2026"); // decrypted original

    await page.locator("select[name=type]").selectOption("DELETION");
    await page.locator("textarea[name=details]").fill("בקשה למחוק את כל המידע שלנו");
    await page.getByRole("button", { name: "שליחת הבקשה" }).click();
    await expect(page.getByText("הבקשה נשלחה ליועץ.")).toBeVisible();
    await expect(page.locator("li", { hasText: "מחיקת מידע" }).getByText("פתוחה")).toBeVisible();
  });

  test("advisor: sees the request, exports, restricts; the file and the client are locked", async ({ page, browser }) => {
    test.setTimeout(120_000);
    await loginAdvisor(page);
    const req = page.locator("li", { hasText: "מחיקת מידע" }).filter({ hasText: "חלבי" });
    await expect(req).toBeVisible();
    await req.getByRole("link").click();
    await expect(page).toHaveURL(/\/advisor\/privacy\//);
    const id = page.url().split("/").at(-1)!;

    const full = await JSZip.loadAsync(await (await page.request.get(`/api/privacy/export?household=${id}`)).body());
    const data = JSON.parse(await full.file("data.json")!.async("string"));
    expect(data.scope).toBe("full");
    expect(Array.isArray(data.auditLog)).toBe(true);

    await expect(page.getByText(/תקופת השמירה לא נקבעה/)).toBeVisible();
    // Wrong confirmation name → refused
    page.on("dialog", (d) => d.accept());
    await page.locator("input[name=reason]").fill("בקשת הלקוח מהפורטל");
    await page.locator("input[name=confirmName]").fill("משפחה אחרת");
    await page.getByRole("button", { name: "הגבלת התיק (בקשת מחיקה)" }).click();
    await expect(page.getByText("השם שהוקלד אינו תואם לשם התיק.")).toBeVisible();
    await page.locator("input[name=confirmName]").fill(HALABI);
    await page.getByRole("button", { name: "הגבלת התיק (בקשת מחיקה)" }).click();
    await expect(page.getByText(/התיק מוגבל מאז/)).toBeVisible();
    await expect(page.getByText("לא ידוע — תקופת השמירה לא נקבעה")).toBeVisible();
    await expect(page.getByRole("button", { name: "מחיקה סופית עכשיו" })).toHaveCount(0);

    // Every page of the file redirects to the privacy page; the dashboard flags it.
    for (const tab of ["", "/transactions", "/debt", "/reports"]) {
      await page.goto(`/advisor/clients/${id}${tab}`);
      await expect(page).toHaveURL(new RegExp(`/advisor/privacy/${id}$`));
    }
    await page.goto("/advisor");
    await expect(page.locator("tr", { hasText: "חלבי" }).getByText("מוגבל (בקשת מחיקה)")).toBeVisible();

    // The client is signed out and cannot log in.
    const ctx = await browser.newContext();
    const c = await ctx.newPage();
    await login(c, WAEL.email, WAEL.password);
    await expect(c.getByText('דוא"ל או סיסמה שגויים')).toBeVisible();
    await ctx.close();

    // The advisor closes the client's request.
    await page.goto(`/advisor/privacy/${id}`);
    await page.locator("input[name=resolution]").fill("התיק הוגבל; מחיקה סופית בתום תקופת השמירה");
    await page.getByRole("button", { name: "סגירת הבקשה" }).click();
    await expect(page.locator("li", { hasText: "מחיקת מידע" }).getByText("טופלה")).toBeVisible();
  });

  test("lift restriction restores access; restrict again", async ({ page, browser }) => {
    await loginAdvisor(page);
    const id = (await sql<{ id: string }>(`SELECT id FROM households WHERE "displayName" = $1`, [HALABI]))[0]!.id;
    await page.goto(`/advisor/privacy/${id}`);
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "ביטול ההגבלה" }).click();
    await expect(page.getByRole("button", { name: "הגבלת התיק (בקשת מחיקה)" })).toBeVisible();
    const ctx = await browser.newContext();
    const c = await ctx.newPage();
    await login(c, WAEL.email, WAEL.password);
    await expect(c).toHaveURL(/\/portal$/);
    await ctx.close();
    await page.locator("input[name=reason]").fill("בקשת מחיקה חוזרת");
    await page.locator("input[name=confirmName]").fill(HALABI);
    await page.getByRole("button", { name: "הגבלת התיק (בקשת מחיקה)" }).click();
    await expect(page.getByText(/התיק מוגבל מאז/)).toBeVisible();
  });

  test("purge after the retention period: every row and the snapshots are gone, the audit keeps ids only", async ({ page }) => {
    test.setTimeout(120_000);
    await loginAdvisor(page);
    const id = (await sql<{ id: string }>(`SELECT id FROM households WHERE "displayName" = $1`, [HALABI]))[0]!.id;
    expect(Number((await sql<{ n: string }>(`SELECT count(*) n FROM monthly_snapshots WHERE "householdId" = $1`, [id]))[0]!.n)).toBeGreaterThan(0);

    // The advisor sets the retention period on the configuration screen.
    await page.goto("/advisor/config");
    const p = page.locator("li", { hasText: "privacy.retention_years" });
    await p.locator("textarea[name=value]").fill("7");
    await p.getByRole("button", { name: "עריכה" }).click();
    await page.waitForLoadState("networkidle");

    await page.goto(`/advisor/privacy/${id}`);
    await expect(page.getByText("תקופת שמירה: 7 שנים מיום ההגבלה.")).toBeVisible();
    await expect(page.getByRole("button", { name: "מחיקה סופית עכשיו" })).toHaveCount(0); // not due yet

    const keys = (await sql<{ storageKey: string }>(`SELECT "storageKey" FROM uploaded_files WHERE "householdId" = $1`, [id])).map((r) => r.storageKey);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(existsSync(path.join(UPLOAD_DIR, k))).toBe(true);
    // Simulate time: the restriction happened 8 years ago.
    await sql(`UPDATE households SET "restrictedAt" = now() - interval '8 years' WHERE id = $1`, [id]);
    await page.reload();
    page.on("dialog", (d) => d.accept());
    const form = page.locator("form", { has: page.getByRole("button", { name: "מחיקה סופית עכשיו" }) });
    await form.locator("input[name=confirmName]").fill(HALABI);
    await form.getByRole("button", { name: "מחיקה סופית עכשיו" }).click();
    await expect(page).toHaveURL(/\/advisor\?purged=1$/);
    await expect(page.locator("tr", { hasText: "חלבי" })).toHaveCount(0);

    for (const t of ["households", "transactions", "monthly_snapshots", "users", "privacy_requests", "mortgages"]) {
      const col = t === "households" ? "id" : '"householdId"';
      expect(Number((await sql<{ n: string }>(`SELECT count(*) n FROM ${t} WHERE ${col} = $1`, [id]))[0]!.n), t).toBe(0);
    }
    for (const k of keys) expect(existsSync(path.join(UPLOAD_DIR, k)), "encrypted file removed").toBe(false);
    const purge = await sql<{ metadata: Record<string, unknown> }>(`SELECT metadata FROM audit_log WHERE action = 'PURGE' AND "householdId" = $1`, [id]);
    expect(purge).toHaveLength(1);
    expect(JSON.stringify(purge[0]!.metadata)).not.toContain("חלבי");
    expect(Number(purge[0]!.metadata.transactions)).toBeGreaterThan(0);
  });
});

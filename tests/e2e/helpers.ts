import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { totp } from "../../src/server/auth/totp";
import { E2E } from "./global-setup";

// The advisor enrolls 2FA once per run; the secret and used codes are shared across spec
// files and projects through a file because each runs in its own worker.
const STATE = "test-results/.e2e-advisor-2fa.json";
type State = { secret?: string; used: string[] };
export const loadState = (): State => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { used: [] });
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s));

/** Waits for the next 30s TOTP window if needed so a code is never reused (replay protection). */
export async function freshCode(secret: string) {
  for (;;) {
    const state = loadState();
    const code = totp(secret, Date.now());
    if (!state.used.includes(code)) {
      save({ ...state, secret, used: [...state.used, code] });
      return code;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("button[type=submit]").click();
}

/** Logs the advisor in, enrolling 2FA on first use. */
export async function loginAdvisor(page: Page) {
  await login(page, E2E.advisor.email, E2E.advisor.password);
  const secret = loadState().secret;
  if (!secret) {
    await expect(page).toHaveURL(/\/login\/setup-2fa$/);
    const newSecret = (await page.locator("code").innerText()).trim();
    await page.locator("#code").fill(await freshCode(newSecret));
    await page.locator("button[type=submit]").click();
    await expect(page.locator("ul.num li")).toHaveCount(8);
    await page.locator("a[href='/']").click();
  } else {
    await expect(page).toHaveURL(/\/login\/2fa$/);
    await page.locator("#code").fill(await freshCode(secret));
    await page.locator("button[type=submit]").click();
  }
  await expect(page).toHaveURL(/\/advisor$/);
}

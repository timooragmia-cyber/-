// End-to-end test of the desktop program (Linux build, virtual display):
//   first-run setup → login without 2FA → demo data → PDF report → backup → restart (data
//   persists, database stopped cleanly) → restore from the backup file.
// Run (as a non-root user, PostgreSQL refuses root):  xvfb-run node e2e.test.mjs
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const rootRequire = createRequire(path.resolve("../package.json"));
const require = createRequire(import.meta.url);
const { _electron: electron } = rootRequire("playwright");
const root = mkdtempSync(path.join(tmpdir(), "ta-e2e-"));
const userData = path.join(root, "userdata");
const backups = path.join(root, "backups");
const EMAIL = "advisor@office.test";
const PW = "Advisor-Pass-2026";
const step = (m) => console.log(`✔ ${m}`);
// On any failure, print the program's own logs so CI shows why.
const dump = () => {
  for (const f of [path.join(userData, "logs", "app.log"), path.join(userData, "logs", "postgres.log"), path.join(root, "electron.out")]) {
    try { console.error(`\n----- ${f} -----\n${readFileSync(f, "utf8").slice(-6000)}`); } catch { console.error(`(no ${f})`); }
  }
};
process.on("uncaughtException", (e) => { console.error(e); dump(); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error(e); dump(); process.exit(1); });

import { appendFileSync } from "node:fs";
const launch = async () => {
  const a = await electron.launch({
    // TA_E2E_EXE = the packaged program (what the user installs). Otherwise: Electron + dist.
    executablePath: process.env.TA_E2E_EXE || require(path.resolve("node_modules/electron")),
    args: [...(process.env.TA_E2E_EXE ? [] : [path.resolve("dist/main.js")]), ...(process.platform === "linux" ? ["--no-sandbox"] : [])],
    env: { ...process.env, TA_DESKTOP_TEST: "1", TA_DESKTOP_USERDATA: userData },
    timeout: 300_000,
  });
  // Keep the program's own output for diagnosis.
  for (const s of [a.process().stdout, a.process().stderr]) s?.on("data", (d) => appendFileSync(path.join(root, "electron.out"), d));
  return a;
};

async function mainWindow(app) {
  for (let i = 0; i < 720; i++) {
    for (const w of app.windows()) if (/\/login|\/advisor/.test(w.url())) return w;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("main window did not open");
}

async function login(win) {
  await win.locator("#email").fill(EMAIL);
  await win.locator("#password").fill(PW);
  await win.locator("button[type=submit]").click();
  await win.waitForURL(/\/advisor$/, { timeout: 30_000 });
}

// ── Run 1: first-run setup ──────────────────────────────────────────────────────────────
let app = await launch();
let setup;
for (let i = 0; i < 720 && !setup; i++) {
  setup = app.windows().find((w) => w.url().endsWith("setup.html"));
  if (!setup) await new Promise((r) => setTimeout(r, 500));
}
assert.ok(setup, "setup window shown on first run");
await setup.locator("#email").fill(EMAIL);
await setup.locator("#pw").fill(PW);
await setup.locator("#pw2").fill("different-password");
await setup.locator("#go").click();
assert.match(await setup.locator("#err").innerText(), /אינן זהות/);
await setup.locator("#pw2").fill(PW);
await setup.locator("#demo").check();
await setup.locator("#go").click();
step("first-run setup (validation, demo data)");

let win = await mainWindow(app);
await login(win);
await win.getByText("משפחת לוי").first().waitFor();
step("login without 2FA (desktop edition), demo households visible");

// Backup banner is shown until backups are configured.
await win.getByText(/הגיבוי לא מוגדר/).waitFor();
assert.equal(await win.getByRole("link", { name: "גיבוי", exact: true }).count(), 1);
step("dashboard warns that backup is not configured");

// PDF via Electron's Chromium.
const khatib = await win.locator("tr", { hasText: "ח'טיב" }).getByRole("link").last().getAttribute("href");
await win.goto(`${new URL(win.url()).origin}${khatib}/reports`);
await win.getByRole("button", { name: "הפקת דוח" }).click();
await win.getByText("הדוח הופק.").waitFor({ timeout: 60_000 });
await win.reload();
const pdfUrl = await win.getByRole("link", { name: "הורדה" }).first().getAttribute("href");
const pdf = await win.evaluate(async (u) => { const r = await fetch(u); return { type: r.headers.get("content-type"), size: (await r.arrayBuffer()).byteLength }; }, pdfUrl);
assert.equal(pdf.type, "application/pdf");
assert.ok(pdf.size > 20_000, `pdf size ${pdf.size}`);
step(`PDF report rendered by the program (${pdf.size} bytes)`);

// No client logins in the desktop edition.
await win.goto(`${new URL(win.url()).origin}${khatib}/profile`);
assert.equal(await win.getByText("כניסת לקוח").count(), 0);
step("client-login section hidden");

// Backup: folder (native dialog stubbed), password, backup now.
await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }); }, backups);
await win.goto(`${new URL(win.url()).origin}/advisor/backup`);
await win.getByRole("button", { name: "בחירת תיקייה" }).click();
await win.getByText("התיקייה נשמרה.").waitFor();
const inputs = win.locator("input[type=password]");
await inputs.nth(0).fill("Backup-Secret-2026");
await inputs.nth(1).fill("Backup-Secret-2026");
await win.getByRole("button", { name: "שמירת הסיסמה" }).click();
await win.getByText(/הסיסמה נשמרה/).waitFor();
await win.getByRole("button", { name: "גיבוי עכשיו" }).click();
await win.getByText("הגיבוי נשמר.").waitFor({ timeout: 60_000 });
const files = readdirSync(backups).filter((f) => f.endsWith(".tabackup"));
assert.equal(files.length, 1);
assert.ok(!readFileSync(path.join(backups, files[0])).includes(Buffer.from("משפחת")), "backup file is encrypted");
await win.goto(`${new URL(win.url()).origin}/advisor`);
assert.equal(await win.getByText(/הגיבוי לא מוגדר/).count(), 0);
step("encrypted backup created; dashboard warning gone");

// Mark the data so the restore can be proven: rename a household after the backup.
await app.evaluate(async () => undefined);
const settingsPath = path.join(userData, "settings.json");
await app.close();
assert.equal(existsSync(path.join(userData, "database", "postmaster.pid")), false, "database stopped cleanly on exit");
step("clean exit: database stopped");

// ── Run 2: restart keeps data, no setup ─────────────────────────────────────────────────
app = await launch();
win = await mainWindow(app);
assert.ok(!app.windows().some((w) => w.url().endsWith("setup.html")));
await login(win);
await win.getByText("משפחת לוי").first().waitFor();
step("restart: no setup, data persisted");

// Restore through the UI: file dialog stubbed, relaunch stubbed (we relaunch ourselves).
await app.evaluate(({ dialog, app: a }, file) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  a.relaunch = () => undefined;
}, path.join(backups, files[0]));
await win.goto(`${new URL(win.url()).origin}/advisor/backup`);
await win.getByRole("button", { name: "בחירת קובץ גיבוי" }).click();
await win.getByText(files[0]).waitFor(); // the restore form is rendered
await win.locator("input[type=password]").last().fill("wrong-password-xx");
win.once("dialog", (d) => d.accept());
await win.getByRole("button", { name: "שחזור והפעלה מחדש" }).click();
await win.getByText("סיסמה שגויה או קובץ פגום").waitFor();
await win.locator("input[type=password]").last().fill("Backup-Secret-2026");
win.once("dialog", (d) => d.accept());
const closed = app.waitForEvent("close", { timeout: 60_000 });
await win.getByRole("button", { name: "שחזור והפעלה מחדש" }).click();
await closed;
const s = JSON.parse(readFileSync(settingsPath, "utf8"));
assert.ok(s.pendingRestore, "restore scheduled for next start");
step("restore: wrong password refused; right password schedules restore and exits");

// ── Run 3: restore happens at startup ───────────────────────────────────────────────────
app = await launch();
win = await mainWindow(app);
await login(win);
await win.getByText("משפחת לוי").first().waitFor();
const log = readFileSync(path.join(userData, "logs", "app.log"), "utf8");
assert.match(log, /restore ok from/);
assert.equal(JSON.parse(readFileSync(settingsPath, "utf8")).pendingRestore, undefined);
assert.ok(readdirSync(path.join(userData, "safety-backups")).some((f) => f.endsWith(".tabackup")), "safety copy made before restore");
step("restore performed at startup (safety copy kept), login works");
await app.close();
writeFileSync(path.join(root, "DONE"), "ok");
console.log(`\nALL DESKTOP E2E STEPS PASSED (${root})`);

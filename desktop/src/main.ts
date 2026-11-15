/**
 * T.A Mortgages — Windows desktop shell.
 *
 * Starts a private PostgreSQL (loopback only), applies migrations, runs the first-time setup,
 * then runs the same Next.js server as the web edition inside this process on 127.0.0.1 and
 * shows it in a locked-down window. Data lives in %APPDATA%\T.A Mortgages; nothing is sent
 * anywhere. Backups: encrypted, daily and on exit, to a folder the user chooses.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, safeStorage, session, shell, type IpcMainInvokeEvent } from "electron";
import { Client } from "pg";
import { BACKUP_EXT, createBackup, readBackup, restoreBackup } from "./core/backup";
import { listMigrations, migrate } from "./core/migrate";
import { freePort, initCluster, startServer, type PgServer } from "./core/pg";
import { appPaths, backupDue, loadOrCreateSecrets, loadSettings, plainProtector, saveSecrets, saveSettings, type Protector, type Secrets, type Settings } from "./core/store";

const DB = "ta_platform";
// Automated tests only: separate data folder, no blocking message boxes.
const TEST = process.env.TA_DESKTOP_TEST === "1";
if (TEST && process.env.TA_DESKTOP_USERDATA) app.setPath("userData", process.env.TA_DESKTOP_USERDATA);
const notify = (opts: Electron.MessageBoxSyncOptions) => (TEST ? log(`dialog: ${opts.message} ${opts.detail ?? ""}`) : void dialog.showMessageBoxSync(opts));
const res = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "stage");
const R = {
  server: path.join(res, "server"),
  pgBin: path.join(res, "pg", "bin"),
  migrations: path.join(res, "migrations"),
  seed: path.join(res, "seed.js"),
  setupHtml: path.join(__dirname, "setup.html"),
  splashHtml: path.join(__dirname, "splash.html"),
};

let paths: ReturnType<typeof appPaths>;
let protector: Protector;
let secrets: Secrets;
let settings: Settings;
let pg: PgServer | undefined;
let origin = "";
let mainWin: BrowserWindow | undefined;
let quitting = false;
let booted = false; // until then, closing transient windows (splash/setup) must not quit

const saveS = () => saveSettings(paths.settings, { ...settings, backupPasswordSet: Boolean(secrets.backupPassword) });
const log = (m: string) => {
  try {
    writeFileSync(path.join(paths.logs, "app.log"), `${new Date().toISOString()} ${m}\n`, { flag: "a" });
  } catch {
    /* logging must never break the app */
  }
};

// ── Single instance ────────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });
  app.whenReady().then(boot).catch((e: unknown) => fatal(e));
}

function fatal(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  if (paths) log(`FATAL ${msg}`);
  dialog.showErrorBox("T.A Mortgages", `התוכנה לא הצליחה לעלות.\n\n${msg}\n\nפרטים בקובץ: ${paths ? path.join(paths.logs, "app.log") : ""}`);
  void shutdown().finally(() => app.exit(1));
}

// ── Boot ───────────────────────────────────────────────────────────────────────────────
async function boot() {
  paths = appPaths(app.getPath("userData"));
  protector = safeStorage.isEncryptionAvailable()
    ? { seal: (s) => safeStorage.encryptString(s), open: (b) => safeStorage.decryptString(b), strong: true }
    : plainProtector;
  if (!protector.strong) log("WARNING: OS encryption (DPAPI) unavailable; secrets stored unencrypted");
  secrets = loadOrCreateSecrets(paths.secrets, protector);
  settings = loadSettings(paths.settings);

  const splash = new BrowserWindow({ width: 420, height: 220, frame: false, resizable: false, show: false, webPreferences: { sandbox: true, javascript: false } });
  void splash.loadFile(R.splashHtml);
  splash.once("ready-to-show", () => splash.show());

  log(`boot ${app.getVersion()} resources=${res}`);
  await initCluster(R.pgBin, paths.pgData, secrets.pgPassword);
  pg = await startServer(R.pgBin, paths.pgData, secrets.pgPassword, path.join(paths.logs, "postgres.log"));
  await ensureDatabase();
  log(`postgres up on port ${pg.port}`);

  if (settings.pendingRestore) await runPendingRestore();

  // Before applying an update's migrations to existing data: automatic safety backup.
  const pending = await pendingMigrations();
  if (pending.length && settings.setupDone && secrets.backupPassword) {
    await createBackup({ url: pg.url(DB), storageDir: paths.storage, secrets, appVersion: app.getVersion(), folder: paths.safety, password: secrets.backupPassword, keep: 5 });
  }
  const appliedNow = await migrate(pg.url(DB), R.migrations);
  log(`migrations applied: ${appliedNow.length}`);

  if (!settings.setupDone) {
    splash.hide();
    const setup = await firstRunSetup();
    log("setup completed; seeding");
    splash.show();
    await runSeed({ SEED_ADVISOR_EMAIL: setup.email, SEED_ADVISOR_PASSWORD: setup.password, SEED_DEMO_DATA: setup.demo ? "true" : "false" });
    settings = { ...settings, setupDone: true, advisorEmail: setup.email, seededVersion: app.getVersion() };
    saveS();
  } else if (settings.seededVersion !== app.getVersion()) {
    // New version: refresh reference data (categories, new config rows). Never touches the
    // advisor's edits or the login, and never adds demo data.
    await runSeed({ SEED_ADVISOR_EMAIL: settings.advisorEmail ?? "advisor@office.local", SEED_DEMO_DATA: "false" });
    settings = { ...settings, seededVersion: app.getVersion() };
    saveS();
  }

  log("starting server");
  await startNext();
  log(`server up at ${origin}`);
  createMainWindow();
  booted = true;
  splash.destroy(); // after the main window exists: never a moment with zero windows
  void maintenance();
}

async function ensureDatabase() {
  const c = new Client({ connectionString: pg!.url("postgres") });
  await c.connect();
  try {
    const r = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB]);
    if (r.rowCount === 0) await c.query(`CREATE DATABASE ${DB}`);
  } finally {
    await c.end();
  }
}

async function pendingMigrations(): Promise<string[]> {
  const c = new Client({ connectionString: pg!.url(DB) });
  await c.connect();
  try {
    const t = await c.query("SELECT to_regclass('public._prisma_migrations') AS t");
    const done = t.rows[0]?.t ? new Set((await c.query<{ migration_name: string }>(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).rows.map((r) => r.migration_name)) : new Set<string>();
    return listMigrations(R.migrations).map((m) => m.name).filter((n) => !done.has(n));
  } finally {
    await c.end();
  }
}

function serverEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: pg!.url(DB),
    FIELD_ENCRYPTION_KEYS: secrets.fieldKeys,
    BLIND_INDEX_KEY: secrets.blindIndexKey,
    UPLOAD_DIR: paths.storage,
    TA_DESKTOP: "1",
    TA_DESKTOP_ROOT: paths.root,
    ...extra,
  };
}

function runSeed(env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [R.seed], {
      env: { ...serverEnv(env), SEED_CLIENT_LOGINS: "false", ELECTRON_RUN_AS_NODE: "1", NODE_PATH: path.join(R.server, "node_modules") },
      windowsHide: true,
    });
    // stdout is discarded on purpose: the seed prints generated passwords. Only errors are kept.
    let err = "";
    child.stdout.resume();
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("exit", (code) => {
      log(`seed exit ${code}${code === 0 ? "" : `: ${err.slice(-1500)}`}`);
      if (code === 0) resolve();
      else reject(new Error(`Initial data setup failed (code ${code})`));
    });
  });
}

// ── First-run setup (local page, no server yet) ─────────────────────────────────────────
type SetupResult = { email: string; password: string; demo: boolean };
function firstRunSetup(): Promise<SetupResult> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 560, height: 640, resizable: false, title: "T.A Mortgages — הגדרה ראשונית", autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    let completed = false;
    ipcMain.handle("setup:complete", (_e, d: SetupResult) => {
      const email = String(d.email ?? "").trim().toLowerCase();
      const password = String(d.password ?? "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10) return { ok: false };
      completed = true;
      ipcMain.removeHandler("setup:complete");
      resolve({ email, password, demo: Boolean(d.demo) });
      setImmediate(() => win.destroy());
      return { ok: true };
    });
    win.on("closed", () => {
      if (!completed) void quit(false); // closed without finishing: nothing was created yet
    });
    void win.loadFile(R.setupHtml);
  });
}

// ── Next.js server in-process ──────────────────────────────────────────────────────────
async function startNext() {
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  const token = randomBytes(32).toString("hex");
  Object.assign(process.env, serverEnv({ PORT: String(port), HOSTNAME: "127.0.0.1", APP_URL: origin, TA_DESKTOP_TOKEN: token, SESSION_IDLE_MINUTES: "60" }));
  (globalThis as { __taDesktopPdf?: unknown }).__taDesktopPdf = renderPdf;
  (globalThis as { __taDesktopToken?: string }).__taDesktopToken = token;
  // The standalone server chdirs to its own folder and listens on PORT/HOSTNAME.
  require(path.join(R.server, "server.js"));
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${origin}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("The application server did not start");
}

async function maintenance() {
  try {
    const token = (globalThis as { __taDesktopToken?: string }).__taDesktopToken ?? "";
    const r = await fetch(`${origin}/api/desktop/maintenance`, { method: "POST", headers: { "x-ta-desktop-token": token } });
    log(`maintenance ${r.status} ${await r.text()}`);
  } catch (e) {
    log(`maintenance failed ${(e as Error).message}`);
  }
  if (backupDue(settings, secrets)) await runBackup("auto");
}

// ── Windows ────────────────────────────────────────────────────────────────────────────
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1366, height: 900, minWidth: 1024, minHeight: 700, title: "T.A Mortgages", autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, devTools: !app.isPackaged },
  });
  mainWin.once("ready-to-show", () => mainWin!.show());
  const wc = mainWin.webContents;
  // Only our own server inside the window; anything else (e.g. a link) opens in the browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) && !url.startsWith(origin)) void shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (!url.startsWith(origin)) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    }
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  void mainWin.loadURL(`${origin}/login`);
  mainWin.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      void quit();
    }
  });
}

// ── PDF with Electron's Chromium (no network, no JavaScript) ────────────────────────────
async function renderPdf(html: string, footer: { left: string; right: string }): Promise<Uint8Array> {
  const file = path.join(tmpdir(), `ta-report-${randomBytes(8).toString("hex")}.html`);
  writeFileSync(file, html, { mode: 0o600 });
  const ses = session.fromPartition("ta-pdf");
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !(d.url.startsWith("file:") || d.url.startsWith("data:")) }));
  const win = new BrowserWindow({ show: false, webPreferences: { session: ses, javascript: false, sandbox: true } });
  try {
    await win.loadFile(file);
    const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
    const pdf = await win.webContents.printToPDF({
      pageSize: "A4", printBackground: true, displayHeaderFooter: true,
      margins: { top: 0.63, bottom: 0.71, left: 0.55, right: 0.55 },
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;display:flex;justify-content:space-between;color:#52514e;font-family:sans-serif"><span>${esc(footer.left)}</span><span>${esc(footer.right)} <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`,
    });
    return new Uint8Array(pdf);
  } finally {
    win.destroy();
    rmSync(file, { force: true });
  }
}

// ── Backups ────────────────────────────────────────────────────────────────────────────
let backupRunning: Promise<{ ok: boolean; error?: string }> | null = null;
function runBackup(reason: string): Promise<{ ok: boolean; error?: string }> {
  if (backupRunning) return backupRunning;
  backupRunning = (async () => {
    if (!settings.backupFolder || !secrets.backupPassword) return { ok: false, error: "יש לבחור תיקייה ולקבוע סיסמה" };
    try {
      const r = await createBackup({ url: pg!.url(DB), storageDir: paths.storage, secrets: { fieldKeys: secrets.fieldKeys, blindIndexKey: secrets.blindIndexKey }, appVersion: app.getVersion(), folder: settings.backupFolder, password: secrets.backupPassword });
      settings = { ...settings, lastBackupAt: new Date().toISOString(), lastBackupFile: r.file, lastBackupError: undefined };
      saveS();
      log(`backup ${reason} ok ${r.file}`);
      return { ok: true };
    } catch (e) {
      const msg = (e as Error).message;
      settings = { ...settings, lastBackupError: msg };
      saveS();
      log(`backup ${reason} FAILED ${msg}`);
      return { ok: false, error: msg };
    }
  })().finally(() => (backupRunning = null));
  return backupRunning;
}

function listBackups(): { name: string; size: number; date: string }[] {
  const dir = settings.backupFolder;
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith("TA-backup-") && f.endsWith(BACKUP_EXT))
    .map((f) => {
      const st = statSync(path.join(dir, f));
      return { name: f, size: st.size, date: st.mtime.toISOString() };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function runPendingRestore() {
  const file = settings.pendingRestore!.file;
  const password = secrets.pendingRestorePassword ?? "";
  const clear = () => {
    settings = { ...settings, pendingRestore: undefined };
    const { pendingRestorePassword: _drop, ...rest } = secrets;
    secrets = rest;
    saveSecrets(paths.secrets, secrets, protector);
    saveS();
  };
  try {
    await readBackup(file, password); // password and file checked before anything is touched
    // Safety copy of the current state, encrypted with the same password.
    await createBackup({ url: pg!.url(DB), storageDir: paths.storage, secrets, appVersion: app.getVersion(), folder: paths.safety, password, keep: 5 }).catch((e: Error) => log(`pre-restore safety backup skipped: ${e.message}`));
    const r = await restoreBackup({ adminUrl: pg!.url("postgres"), dbName: DB, url: pg!.url(DB), migrationsDir: R.migrations, storageDir: paths.storage, file, password });
    secrets = { ...secrets, fieldKeys: r.secrets.fieldKeys, blindIndexKey: r.secrets.blindIndexKey };
    settings = { ...settings, setupDone: true };
    clear();
    log(`restore ok from ${file} (${r.manifest.createdAt})`);
    notify({ type: "info", message: "השחזור הושלם", detail: `המידע שוחזר מגיבוי מתאריך ${new Date(r.manifest.createdAt).toLocaleString("he-IL")}.` });
  } catch (e) {
    clear();
    log(`restore FAILED ${(e as Error).message}`);
    notify({ type: "error", message: "השחזור נכשל", detail: `${(e as Error).message}\n\nעותק בטיחות של המצב הקודם נשמר בתיקייה:\n${paths.safety}` });
  }
}

// ── IPC (only from our own pages) ─────────────────────────────────────────────────────
function trusted(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? "";
  return (origin !== "" && url.startsWith(`${origin}/`)) || url.startsWith("file:");
}
function handle(channel: string, fn: (...args: never[]) => unknown) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trusted(e)) throw new Error("forbidden");
    return (fn as (...a: unknown[]) => unknown)(...args);
  });
}

handle("backup:status", () => ({
  folder: settings.backupFolder ?? null,
  passwordSet: Boolean(secrets.backupPassword),
  lastBackupAt: settings.lastBackupAt ?? null,
  lastBackupFile: settings.lastBackupFile ?? null,
  lastBackupError: settings.lastBackupError ?? null,
  backups: listBackups(),
}));
handle("backup:chooseFolder", async () => {
  const r = await dialog.showOpenDialog(mainWin!, { title: "בחירת תיקיית גיבוי", properties: ["openDirectory", "createDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  settings = { ...settings, backupFolder: r.filePaths[0] };
  saveS();
  return r.filePaths[0];
});
handle("backup:setPassword", (pw: string) => {
  if (typeof pw !== "string" || pw.length < 10) throw new Error("password too short");
  secrets = { ...secrets, backupPassword: pw };
  saveSecrets(paths.secrets, secrets, protector);
  saveS();
});
handle("backup:now", () => runBackup("manual"));
handle("backup:chooseRestoreFile", async () => {
  const r = await dialog.showOpenDialog(mainWin!, { title: "בחירת קובץ גיבוי", properties: ["openFile"], filters: [{ name: "T.A Mortgages backup", extensions: [BACKUP_EXT.slice(1)] }] });
  return r.canceled ? null : (r.filePaths[0] ?? null);
});
handle("backup:restore", async (file: string, pw: string) => {
  try {
    await readBackup(file, pw);
  } catch (e) {
    return { ok: false, error: (e as Error).name === "BackupPasswordError" ? "סיסמה שגויה או קובץ פגום" : (e as Error).message };
  }
  settings = { ...settings, pendingRestore: { file } };
  secrets = { ...secrets, pendingRestorePassword: pw };
  saveSecrets(paths.secrets, secrets, protector);
  saveS();
  setTimeout(() => {
    app.relaunch();
    void quit(false);
  }, 300);
  return { ok: true };
});
handle("backup:openFolder", () => (settings.backupFolder ? shell.openPath(settings.backupFolder) : ""));

// ── Shutdown: backup if due, then a clean database stop ───────────────────────────────
async function shutdown() {
  if (pg) {
    const p = pg;
    pg = undefined;
    await p.stop().catch(() => undefined);
  }
}

async function quit(withBackup = true) {
  if (quitting) return;
  quitting = true;
  try {
    if (withBackup && settings?.setupDone && settings.backupFolder && secrets.backupPassword) {
      const last = settings.lastBackupAt ? Date.now() - new Date(settings.lastBackupAt).getTime() : Infinity;
      if (last > 3_600_000) {
        mainWin?.hide();
        await runBackup("exit");
      }
    }
  } finally {
    await shutdown();
    app.exit(0);
  }
}

app.on("window-all-closed", () => {
  if (booted) void quit();
});
app.on("before-quit", (e) => {
  if (!quitting) {
    e.preventDefault();
    void quit();
  }
});

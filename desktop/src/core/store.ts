/**
 * Local secrets and settings for the desktop app, under the user's profile
 * (%APPDATA%\T.A Mortgages on Windows).
 *
 * Secrets (encryption keys, database password, backup password) are sealed with a Protector:
 * in the app that is Electron safeStorage = Windows DPAPI, readable only by this Windows user
 * on this computer. Tests use a plain protector.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type Protector = { seal: (s: string) => Buffer; open: (b: Buffer) => string; strong: boolean };
export const plainProtector: Protector = { seal: (s) => Buffer.from(s, "utf8"), open: (b) => b.toString("utf8"), strong: false };

export type Secrets = {
  fieldKeys: string; // "v1:<base64>[,v2:…]" — FIELD_ENCRYPTION_KEYS
  blindIndexKey: string;
  pgPassword: string;
  backupPassword?: string; // stored so automatic backups can run; the user must also keep it safely
  pendingRestorePassword?: string; // only between "restore" and the relaunch that performs it
};

export type Settings = {
  setupDone: boolean;
  advisorEmail?: string;
  backupFolder?: string;
  lastBackupAt?: string;
  lastBackupFile?: string;
  lastBackupError?: string;
  pendingRestore?: { file: string };
  /** For the web server's banner (never the password itself). */
  backupPasswordSet?: boolean;
  /** App version whose reference data was last seeded. */
  seededVersion?: string;
};

export type Paths = { root: string; pgData: string; storage: string; logs: string; secrets: string; settings: string; safety: string };

export function appPaths(root: string): Paths {
  const p = {
    root,
    pgData: path.join(root, "database"),
    storage: path.join(root, "files"),
    logs: path.join(root, "logs"),
    secrets: path.join(root, "secrets.bin"),
    settings: path.join(root, "settings.json"),
    safety: path.join(root, "safety-backups"),
  };
  for (const d of [root, p.storage, p.logs, p.safety]) mkdirSync(d, { recursive: true });
  return p;
}

function atomicWrite(file: string, data: Buffer | string) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, file);
}

const key32 = () => randomBytes(32).toString("base64");

export function loadOrCreateSecrets(file: string, protector: Protector): Secrets {
  if (existsSync(file)) return JSON.parse(protector.open(readFileSync(file))) as Secrets;
  const s: Secrets = { fieldKeys: `v1:${key32()}`, blindIndexKey: key32(), pgPassword: randomBytes(24).toString("hex") };
  saveSecrets(file, s, protector);
  return s;
}

export function saveSecrets(file: string, s: Secrets, protector: Protector) {
  atomicWrite(file, protector.seal(JSON.stringify(s)));
}

export function loadSettings(file: string): Settings {
  if (!existsSync(file)) return { setupDone: false };
  return JSON.parse(readFileSync(file, "utf8")) as Settings;
}

export function saveSettings(file: string, s: Settings) {
  atomicWrite(file, JSON.stringify(s, null, 2));
}

/** Automatic backup is due when a folder and password are set and the last one is > 20 h old. */
export function backupDue(s: Settings, secrets: Secrets, now = new Date()): boolean {
  if (!s.backupFolder || !secrets.backupPassword) return false;
  if (!s.lastBackupAt) return true;
  return now.getTime() - new Date(s.lastBackupAt).getTime() > 20 * 3_600_000;
}

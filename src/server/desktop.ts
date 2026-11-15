import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Desktop edition (Windows program, one computer, no internet, no client portal).
 * The Electron shell sets TA_DESKTOP=1 and TA_DESKTOP_ROOT before starting the server.
 */
export function isDesktop(): boolean {
  return process.env.TA_DESKTOP === "1";
}

export type DesktopBackupStatus = { configured: boolean; lastBackupAt: string | null; lastBackupError: string | null };

/** Backup status written by the desktop shell (settings.json); read-only here. */
export function desktopBackupStatus(): DesktopBackupStatus | null {
  if (!isDesktop() || !process.env.TA_DESKTOP_ROOT) return null;
  try {
    const s = JSON.parse(readFileSync(path.join(process.env.TA_DESKTOP_ROOT, "settings.json"), "utf8")) as { backupFolder?: string; lastBackupAt?: string; lastBackupError?: string; backupPasswordSet?: boolean };
    return { configured: Boolean(s.backupFolder && s.backupPasswordSet), lastBackupAt: s.lastBackupAt ?? null, lastBackupError: s.lastBackupError ?? null };
  } catch {
    return { configured: false, lastBackupAt: null, lastBackupError: null };
  }
}

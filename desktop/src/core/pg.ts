/**
 * Local PostgreSQL 16 for the desktop app, driven through the official pg_ctl / initdb tools.
 *
 * Why not spawn postgres directly: on Windows postgres.exe refuses to run under an
 * administrator account, while pg_ctl/initdb drop privileges themselves (restricted token).
 * pg_ctl also gives a clean "fast" shutdown — never a forced kill.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";

export type PgServer = { port: number; url: (db?: string) => string; stop: () => Promise<void> };

const exe = (binDir: string, name: string) => path.join(binDir, process.platform === "win32" ? `${name}.exe` : name);

function run(file: string, args: string[], timeoutMs = 120_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      const exitCode = (err as { code?: unknown } | null)?.code;
      const code = err ? (typeof exitCode === "number" ? exitCode : 1) : 0;
      resolve({ code, out: `${stdout ?? ""}${stderr ?? ""}` });
    });
  });
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

/** Creates the cluster on first run (UTF-8, password auth, superuser "ta"). */
export async function initCluster(binDir: string, dataDir: string, password: string): Promise<void> {
  if (existsSync(path.join(dataDir, "PG_VERSION"))) return;
  mkdirSync(dataDir, { recursive: true });
  const pw = path.join(tmpdir(), `ta-pw-${randomBytes(8).toString("hex")}`);
  writeFileSync(pw, password, { mode: 0o600 });
  try {
    const r = await run(exe(binDir, "initdb"), ["-D", dataDir, "-U", "ta", "--pwfile", pw, "--auth=scram-sha-256", "-E", "UTF8", "--locale=C"]);
    if (r.code !== 0) throw new Error(`initdb failed: ${r.out.slice(-2000)}`);
  } finally {
    rmSync(pw, { force: true });
  }
}

/** Port of a server already running on this data directory (e.g. after an app crash). */
function runningPort(dataDir: string): number | null {
  const pidFile = path.join(dataDir, "postmaster.pid");
  if (!existsSync(pidFile)) return null;
  const port = Number(readFileSync(pidFile, "utf8").split(/\r?\n/)[3]);
  return Number.isInteger(port) && port > 0 ? port : null;
}

export async function startServer(binDir: string, dataDir: string, password: string, logFile: string): Promise<PgServer> {
  const pgCtl = exe(binDir, "pg_ctl");
  let port: number;
  const status = await run(pgCtl, ["-D", dataDir, "status"]);
  const existing = status.code === 0 ? runningPort(dataDir) : null;
  if (existing) {
    port = existing; // reuse the server left running by a crashed session
  } else {
    port = await freePort();
    const r = await run(pgCtl, ["-D", dataDir, "-l", logFile, "-w", "-t", "90", "-o", `-p ${port} -c listen_addresses=127.0.0.1`, "start"], 120_000);
    if (r.code !== 0) throw new Error(`PostgreSQL did not start: ${r.out.slice(-2000)}\n${existsSync(logFile) ? readFileSync(logFile, "utf8").slice(-2000) : ""}`);
  }
  const url = (db = "ta_platform") => `postgresql://ta:${encodeURIComponent(password)}@127.0.0.1:${port}/${db}`;
  return {
    port,
    url,
    stop: async () => {
      await run(pgCtl, ["-D", dataDir, "-m", "fast", "-w", "-t", "60", "stop"], 90_000);
    },
  };
}

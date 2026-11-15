// Runs the production standalone server exactly as the Docker runtime does (server.js + static
// assets + messages), for E2E against the shipped artifact: E2E_STANDALONE=1 npm run test:e2e
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import "dotenv/config";

const root = process.cwd();
const sa = path.join(root, ".next", "standalone");
if (!existsSync(path.join(sa, "server.js"))) throw new Error("Run `npm run build` first (.next/standalone missing)");
cpSync(path.join(root, ".next", "static"), path.join(sa, ".next", "static"), { recursive: true });
cpSync(path.join(root, "messages"), path.join(sa, "messages"), { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: "production",
  HOSTNAME: "localhost",
  PORT: process.env.PORT ?? "3100",
  // The standalone server runs from .next/standalone; keep uploads where the test expects them.
  UPLOAD_DIR: path.resolve(root, process.env.UPLOAD_DIR ?? "./storage/uploads"),
};
const child = spawn(process.execPath, ["server.js"], { cwd: sa, env, stdio: "inherit" });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));

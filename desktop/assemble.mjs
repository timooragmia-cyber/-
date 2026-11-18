// Assembles desktop/stage/ for a target platform from the web build (.next/standalone):
//   node assemble.mjs --platform win32   (Windows installer)
//   node assemble.mjs --platform linux   (local tests)
// stage/server     Next.js standalone server (+ static assets, messages, platform natives)
// stage/pg         PostgreSQL 16 binaries for the platform
// stage/migrations SQL migrations
// stage/seed.js    reference data / advisor / optional demo data
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";

const platform = process.argv.includes("--platform") ? process.argv[process.argv.indexOf("--platform") + 1] : process.platform;
if (!["win32", "linux"].includes(platform)) throw new Error(`unsupported platform ${platform}`);
const root = path.resolve("..");
const stage = path.resolve("stage");
const cache = path.resolve(".cache");
mkdirSync(cache, { recursive: true });

const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("Run `npm run build` in the repository root first");
if (!existsSync("dist/seed.js")) throw new Error("Run `node build.mjs` first");

/** npm pack + extract a package (exact version) into the cache; returns its folder. */
function pkg(name, version) {
  const dir = path.join(cache, `${name.replace("/", "+")}@${version}`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    const tgz = execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["pack", `${name}@${version}`, "--silent", "--pack-destination", dir], { encoding: "utf8", shell: process.platform === "win32" }).trim().split(/\r?\n/).at(-1);
    execFileSync("tar", ["-xzf", path.join(dir, tgz), "-C", dir]);
    rmSync(path.join(dir, tgz));
  }
  return path.join(dir, "package");
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// 1. Server
const server = path.join(stage, "server");
cpSync(standalone, server, { recursive: true, verbatimSymlinks: true });
cpSync(path.join(root, ".next", "static"), path.join(server, ".next", "static"), { recursive: true });
cpSync(path.join(root, "messages"), path.join(server, "messages"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(server, "public"), { recursive: true });
// Next copies the build machine's .env into the standalone output: never ship it.
for (const f of readdirSync(server)) if (f === ".env" || f.startsWith(".env.")) rmSync(path.join(server, f), { force: true });
const nm = path.join(server, "node_modules");
// Not used by the desktop edition: PDFs come from Electron's Chromium; no next/image.
for (const d of ["playwright-core", "@img"]) rmSync(path.join(nm, d), { recursive: true, force: true });
// Native argon2 for the target platform only.
const version = (pkgJson) => JSON.parse(readFileSync(pkgJson, "utf8")).version;
const argonVersion = version(path.join(root, "node_modules", "@node-rs", "argon2", "package.json"));
for (const d of readdirSync(path.join(nm, "@node-rs"))) if (d.startsWith("argon2-")) rmSync(path.join(nm, "@node-rs", d), { recursive: true, force: true });
const argonNative = platform === "win32" ? "@node-rs/argon2-win32-x64-msvc" : "@node-rs/argon2-linux-x64-gnu";
cpSync(pkg(argonNative, argonVersion), path.join(nm, argonNative), { recursive: true });

// Next links its external packages under .next/node_modules with symlinks. Installers (and
// Windows) need real folders: copy each link's target in place; drop links whose target was
// removed above (e.g. playwright-core, unused in the desktop edition).
function materialize(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) {
      let target = null;
      try { target = realpathSync(p); } catch { /* dangling */ }
      rmSync(p, { recursive: true, force: true });
      if (target) cpSync(target, p, { recursive: true, dereference: true });
    } else if (st.isDirectory()) {
      materialize(p);
    }
  }
}
materialize(server);

// 2. PostgreSQL binaries
const pgVersion = version(path.resolve("node_modules", "embedded-postgres", "package.json"));
const pgPkg = platform === "win32" ? pkg("@embedded-postgres/windows-x64", pgVersion) : path.resolve("node_modules/@embedded-postgres/linux-x64");
cpSync(path.join(pgPkg, "native"), path.join(stage, "pg"), { recursive: true, verbatimSymlinks: true });

// 3. Migrations + seed
cpSync(path.join(root, "prisma", "migrations"), path.join(stage, "migrations"), { recursive: true });
cpSync("dist/seed.js", path.join(stage, "seed.js"));

console.log(`stage assembled for ${platform}: argon2 ${argonVersion}, postgres ${pgVersion}`);

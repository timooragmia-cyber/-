// electron-builder leaves out the server's top-level node_modules from extraResources.
// Copy it in after packing, then verify the packaged server is complete.
const { cpSync, existsSync, readdirSync } = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const resources = context.electronPlatformName === "darwin"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const src = path.join(__dirname, "..", "stage", "server", "node_modules");
  const dest = path.join(resources, "server", "node_modules");
  cpSync(src, dest, { recursive: true, dereference: true });
  const must = ["next/package.json", "@node-rs/argon2/package.json", "@prisma/client/package.json", "pg/package.json"];
  const missing = must.filter((m) => !existsSync(path.join(dest, m)));
  const native = readdirSync(path.join(dest, "@node-rs")).filter((d) => d.startsWith("argon2-"));
  if (missing.length || native.length === 0) throw new Error(`packaged server incomplete: missing ${missing.join(", ") || "argon2 native"}`);
  if (existsSync(path.join(resources, "server", ".env"))) throw new Error("a .env file must never be packaged");
  console.log(`  • afterPack: server node_modules copied (argon2 native: ${native.join(", ")})`);
};

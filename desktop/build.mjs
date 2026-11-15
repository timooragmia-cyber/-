// Bundles the Electron main/preload, the core test and the database seed with esbuild.
import { build } from "esbuild";

// CJS bundles: give ESM code that uses import.meta.url (the generated Prisma client) a real value.
const common = {
  bundle: true, platform: "node", target: "node22", format: "cjs", sourcemap: false, logLevel: "warning",
  define: { "import.meta.url": "__importMetaUrl" },
  banner: { js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;' },
};
await Promise.all([
  build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.js", external: ["electron", "pg-native"] }),
  // Sandboxed preload: only `electron` may be required — no banner, no Node built-ins.
  build({ bundle: true, platform: "node", target: "node22", format: "cjs", logLevel: "warning", entryPoints: ["src/preload.ts"], outfile: "dist/preload.js", external: ["electron"] }),
  build({ ...common, entryPoints: ["src/core.test.ts"], outfile: "dist/core.test.js", external: ["pg-native"] }),
  // The app's seed (reference data, tax rules, advisor login, optional demo data). Native
  // argon2 is resolved at run time from the bundled server's node_modules (NODE_PATH).
  build({ ...common, entryPoints: ["../prisma/seed/index.ts"], outfile: "dist/seed.js", tsconfig: "../tsconfig.json", external: ["@node-rs/argon2", "pg-native"] }),
]);
import { cpSync } from "node:fs";
cpSync("static", "dist", { recursive: true });
console.log("desktop bundles built");

// CI gate on known vulnerabilities in production dependencies.
// Fails on every advisory except the ones listed below, each with a reason and a review date.
// After the review date the exception expires and the gate fails again until reassessed.
import { execFileSync } from "node:child_process";

const EXCEPTIONS = {
  // picomatch ReDoS (all versions, no fix released yet). Reached only through next-intl's
  // message-extractor file watcher (@parcel/watcher), a development tool this app does not
  // use; glob patterns are never taken from users. Re-check when a patched picomatch ships.
  "GHSA-fc5q-39xc-vjpf": { until: "2027-02-01" },
};

let raw;
try {
  raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", shell: process.platform === "win32" });
} catch (e) {
  raw = e.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(raw);
const found = new Map();
for (const v of Object.values(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via === "object" && via.url) found.set(via.url.split("/").pop(), { pkg: via.name, severity: via.severity, title: via.title });
  }
}
const today = new Date().toISOString().slice(0, 10);
let failed = false;
for (const [id, a] of found) {
  const ex = EXCEPTIONS[id];
  if (ex && today <= ex.until) {
    console.log(`allowed until ${ex.until}: ${id} ${a.pkg} (${a.severity}) ${a.title}`);
  } else {
    failed = true;
    console.error(`${ex ? "EXPIRED EXCEPTION" : "NEW"}: ${id} ${a.pkg} (${a.severity}) ${a.title}`);
  }
}
console.log(failed ? "audit gate: FAILED" : `audit gate: OK (${found.size} advisory/ies, all reviewed)`);
process.exit(failed ? 1 : 0);

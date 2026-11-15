import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * cacheComponents is deliberately OFF: every screen is per-user financial data behind auth.
 * Rendering everything dynamically (no shared server cache) removes a whole class of
 * "one client sees another client's cached data" risks. Revisit only for public pages.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS is set by the reverse proxy in production (see docs/DEPLOYMENT.md), not here,
  // so local http development keeps working.
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "exceljs", "playwright-core"],
  // PDF fonts are read at runtime (src/server/reports/fonts.ts); ship exactly these files.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/@fontsource-variable/noto-sans-hebrew/files/noto-sans-hebrew-{hebrew,latin}-wght-normal.woff2",
      "./node_modules/@fontsource-variable/noto-sans-arabic/files/noto-sans-arabic-{arabic,latin}-wght-normal.woff2",
      // Playwright reads data files (browsers.json, …) at runtime that tracing does not see.
      "./node_modules/playwright-core/**",
    ],
  },
  experimental: {
    // Statement uploads go through server actions; files are capped at 10MB in code (adapters.ts).
    serverActions: { bodySizeLimit: "11mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);

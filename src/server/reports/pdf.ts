import "server-only";
import type { Browser } from "playwright-core";

/**
 * HTML → PDF in headless Chromium (correct Hebrew/Arabic shaping and RTL).
 * Production: set CHROMIUM_PATH to the system Chromium in the image (see Dockerfile).
 * JavaScript is disabled for report pages; content is static HTML built on the server.
 */
let browser: Promise<Browser> | undefined;

/**
 * Loaded lazily: pages that merely import the report actions never load Playwright.
 * A crashed or failed browser is dropped so the next report starts a fresh one.
 */
function getBrowser(): Promise<Browser> {
  browser ??= import("playwright-core")
    .then(({ chromium }) => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage"] }))
    .then((b) => {
      b.on("disconnected", () => (browser = undefined));
      return b;
    })
    .catch((e: unknown) => {
      browser = undefined;
      throw e;
    });
  return browser;
}

/** Desktop edition: the Electron shell renders with its own Chromium (no Playwright needed). */
type DesktopPdf = (html: string, footer: { left: string; right: string }) => Promise<Uint8Array>;

export async function htmlToPdf(html: string, footer: { left: string; right: string }): Promise<Uint8Array> {
  const desktop = (globalThis as { __taDesktopPdf?: DesktopPdf }).__taDesktopPdf;
  if (desktop) return desktop(html, footer);
  const b = await getBrowser();
  const ctx = await b.newContext({ javaScriptEnabled: false });
  try {
    const page = await ctx.newPage();
    // Block every network request: reports are fully self-contained (fonts embedded).
    await page.route("**/*", (r) => (r.request().url().startsWith("data:") ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "18mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div style="font-size:8px;width:100%;padding:0 14mm;display:flex;justify-content:space-between;color:#52514e;font-family:sans-serif"><span>${footer.left}</span><span>${footer.right} <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`,
    });
    return new Uint8Array(pdf);
  } finally {
    await ctx.close();
  }
}

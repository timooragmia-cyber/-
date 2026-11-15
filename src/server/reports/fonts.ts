import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Embeds the same self-hosted fonts the UI uses, so the PDF renders Hebrew and Arabic shaping exactly. */
let css: Promise<string> | undefined;

export function fontCss(): Promise<string> {
  css ??= (async () => {
    const dir = (pkg: string) => path.join(process.cwd(), "node_modules", "@fontsource-variable", pkg, "files");
    const files = [
      ["Noto Sans Hebrew", dir("noto-sans-hebrew"), "noto-sans-hebrew-hebrew-wght-normal.woff2"],
      ["Noto Sans Hebrew", dir("noto-sans-hebrew"), "noto-sans-hebrew-latin-wght-normal.woff2"],
      ["Noto Sans Arabic", dir("noto-sans-arabic"), "noto-sans-arabic-arabic-wght-normal.woff2"],
      ["Noto Sans Arabic", dir("noto-sans-arabic"), "noto-sans-arabic-latin-wght-normal.woff2"],
    ] as const;
    const faces = await Promise.all(
      files.map(async ([family, d, f]) => {
        // No silent fallback: a PDF without these fonts would show boxes instead of Hebrew/Arabic.
        // turbopackIgnore: without it Next traces the WHOLE project into the server output.
        // The four font files are included explicitly via outputFileTracingIncludes.
        const data = (await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ d, f))).toString("base64");
        return `@font-face{font-family:"${family}";font-weight:100 900;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
      }),
    );
    return faces.join("\n");
  })();
  css.catch(() => (css = undefined)); // retry on the next report instead of caching a failure
  return css;
}

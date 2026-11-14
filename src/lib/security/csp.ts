/**
 * Content-Security-Policy for every HTML response.
 * - Scripts: only Next's own, carrying the per-request nonce ('strict-dynamic' lets them load
 *   their chunks). Inline/injected scripts without the nonce are blocked → XSS containment.
 * - Styles: 'unsafe-inline' because server-rendered style attributes (charts) cannot carry a
 *   nonce; style injection is far lower risk than script injection.
 * - No third-party origins at all: fonts are self-hosted, nothing is loaded from a CDN.
 */
export function buildCsp(nonce: string, opts: { dev: boolean }): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // No upgrade-insecure-requests: TLS and the http→https redirect are the reverse proxy's job.
  ];
  return directives.join("; ");
}

/** 128-bit random nonce, base64. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

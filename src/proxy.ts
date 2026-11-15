import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, newNonce } from "@/lib/security/csp";

/**
 * 1) Content-Security-Policy with a fresh nonce on every request (all routes are dynamic,
 *    so Next applies the nonce to its scripts during server rendering).
 * 2) Optimistic gate only: no session cookie → redirect to /login. Real authorization
 *    (session validity, 2FA, role, household ownership, privacy restriction) happens in the
 *    DAL on every page/action (src/server/auth/dal.ts). Never rely on this file for security.
 */
// /api/desktop/*: desktop edition only, authenticated by a per-launch token inside the route.
const PUBLIC = ["/login", "/api/health", "/api/desktop"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = newNonce();
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === "development" });

  if (!PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !request.cookies.has("ta_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const res = NextResponse.redirect(url);
    res.headers.set("Content-Security-Policy", csp);
    return res;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:woff2?|png|svg|ico)$).*)"],
};

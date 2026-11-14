import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate only: no session cookie → redirect to /login. Real authorization
 * (session validity, 2FA, role, household ownership) happens in the DAL on every
 * page/action (src/server/auth/dal.ts). Never rely on this file for security.
 */
const PUBLIC = ["/login", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!request.cookies.has("ta_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:woff2?|png|svg|ico)$).*)"],
};

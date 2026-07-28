import { NextRequest, NextResponse } from "next/server";

import { resolveSession, SESSION_COOKIE_NAME } from "@/next-lib/userData/auth";
import { isSetupCompleted } from "@/next-lib/userData/publicationsConfig";

// CLAUDE-ADDED: This app is meant to be reachable over the open internet (remote server, not just
// a local machine), so every page and API route needs a real session before it does anything --
// the profile icon/login page alone wouldn't stop someone who just skips straight to a book URL or
// an /api/userdata/* endpoint. No `runtime` key here -- Proxy (the renamed Middleware convention,
// see the module filename) always runs on the Node.js runtime, which is required since
// resolveSession reads the file-backed session store (needs `fs`); Next rejects a `runtime` key in
// this file's config as an error rather than just ignoring it.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|locales/|fonts/|images/).*)"
  ]
};

// CLAUDE-ADDED: Kept to an allowlist of unauthenticated paths rather than trying to enumerate every
// protected one -- anything not explicitly public requires a session. /api/auth/* is the login flow
// itself (obviously can't require being logged in already), /api/users/*/avatar is public so the
// login page's avatar picker can render pictures before anyone is authenticated.
function isPublicPath(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (/^\/api\/users\/[^/]+\/avatar$/.test(pathname)) return true;
  // CLAUDE-ADDED: /login needs to read this before any session exists -- it's just a color, not
  // sensitive, and the route itself still gates POST to admins (see its own handler).
  if (pathname === "/api/settings/login-accent-color") return true;
  // CLAUDE-ADDED: Needed so these are reachable during the pre-setup window (see the gate at the
  // top of proxy() below) instead of immediately hitting this same "requires a session" check
  // right after -- there's no session to have yet on a fresh install. The route itself still
  // refuses once setup is actually complete, same "route double-checks itself" pattern as this
  // function's other entries.
  if (pathname === "/setup" || pathname === "/api/setup") return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // CLAUDE-ADDED: Takes priority over everything below -- a genuinely fresh install (no books
  // folder/userData folder/Readium URL chosen yet) shouldn't let anyone reach /login or any API,
  // since half of that machinery reads config that hasn't been set yet. /setup and /api/setup are
  // themselves in isPublicPath below, so they're exempt from this redirect.
  if (pathname !== "/setup" && pathname !== "/api/setup" && !isSetupCompleted()) {
    if (pathname.startsWith("/api/") || request.method !== "GET") {
      return NextResponse.json({ error: "Setup required" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = resolveSession(token);

  if (userId) return NextResponse.next();

  // CLAUDE-ADDED: A Server Action ("use server" functions called from a Client Component, e.g.
  // isManifestRouteEnabled in ManifestRouteEnabled.ts) is invoked as a POST to the *page's own URL*,
  // not to some distinguishable /api/ path -- there's no way to allowlist-by-path for these. Only a
  // plain GET (an actual page navigation) should ever get an HTML redirect; any other method is a
  // programmatic request (a Server Action, or a fetch call to a page path) whose caller expects a
  // structured response and will choke trying to parse a redirect's HTML as its result. Redirecting
  // those instead of 401-ing them is exactly what produced a client-side
  // `SyntaxError: Unexpected token '<' ... not valid JSON` the first time this shipped.
  if (pathname.startsWith("/api/") || request.method !== "GET") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

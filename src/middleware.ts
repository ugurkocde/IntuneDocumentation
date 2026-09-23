import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, siteBoundary } from "~/lib/site-boundary";

// Graph accepts a few minutes of clock skew, so allow the same here.
const EXPIRY_SKEW_MS = 5 * 60_000;

// Decodes, without verifying, the exp claim of a bearer token so a token that
// has already expired does not start minutes of Graph work.
function hasExpiredBearer(request: NextRequest): boolean {
  const token = /^Bearer (\S+)$/.exec(
    request.headers.get("authorization") ?? "",
  )?.[1];
  const payload = token?.split(".")[1];
  if (!payload) return false;
  try {
    const exp: unknown = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ).exp;
    return typeof exp === "number" && exp * 1000 + EXPIRY_SKEW_MS < Date.now();
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  // Next normalizes loopback URLs internally. Host identifies the actual
  // browser origin; do not trust client-supplied forwarded/site-mode headers.
  const origin = new URL(request.url);
  origin.host = request.headers.get("host") ?? origin.host;
  const boundary = siteBoundary(origin.origin);
  const path = request.nextUrl.pathname;
  if (boundary.mode === "public") {
    if (
      path === "/dashboard" ||
      path.startsWith("/dashboard/") ||
      path === "/sign-in"
    ) {
      return NextResponse.redirect(new URL(path, boundary.appOrigin));
    }
    if (path.startsWith("/api/intune") || path.startsWith("/api/config")) {
      return new NextResponse(null, { status: 404 });
    }
  }
  if (path.startsWith("/api/intune/") && hasExpiredBearer(request)) {
    // Early rejection only; Microsoft Graph still validates every token.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supportFrame = path === "/support-chat" && boundary.mode === "public";
  if (path === "/support-chat" && !supportFrame)
    return new NextResponse(null, { status: 404 });
  const supportOrigin =
    boundary.mode === "app" && origin.origin === boundary.appOrigin
      ? boundary.publicOrigin
      : "";
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(
    nonce,
    boundary.mode === "public",
    process.env.NODE_ENV === "development",
    supportOrigin,
    supportFrame ? boundary.appOrigin : "",
    path === "/support" && boundary.mode === "public",
  );
  const headers = new Headers(request.headers);
  // Replace client-supplied values, including on RSC and prefetch requests.
  headers.set("x-site-mode", boundary.mode);
  headers.set("x-app-origin", boundary.appOrigin);
  headers.set("x-nonce", nonce);
  headers.set("x-support-origin", supportOrigin);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  if (!supportFrame) response.headers.set("X-Frame-Options", "DENY");
  if (supportFrame) response.headers.set("Referrer-Policy", "no-referrer");
  if (boundary.mode === "app" || supportFrame)
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

// Skip only real static files. A broad extension rule would let an unknown
// path such as /foo.png render the not-found page without these headers,
// and the layout trusts the x-* request headers this middleware sets.
export const config = {
  matcher: [
    "/((?!_next/static/|_next/image|(?:favicon\\.ico|icon\\.svg|icon-192x192\\.png|icon-512x512\\.png|apple-touch-icon\\.png|og-image\\.png|logo\\.png|logo\\.svg|sign-in-light-mode\\.svg)$).*)",
  ],
};

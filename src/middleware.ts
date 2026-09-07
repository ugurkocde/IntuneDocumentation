import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, siteBoundary } from "~/lib/site-boundary";

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
  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(
    nonce,
    boundary.mode === "public",
    process.env.NODE_ENV === "development",
  );
  const headers = new Headers(request.headers);
  // Replace client-supplied values, including on RSC and prefetch requests.
  headers.set("x-site-mode", boundary.mode);
  headers.set("x-app-origin", boundary.appOrigin);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  if (boundary.mode === "app")
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|webp|svg|ico|woff2)$).*)",
  ],
};

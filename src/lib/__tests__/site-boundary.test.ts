import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "~/middleware";
import { contentSecurityPolicy, siteBoundary } from "../site-boundary";

afterEach(() => vi.unstubAllEnvs());
function configure() {
  vi.stubEnv("PUBLIC_SITE_ORIGIN", "https://intunedocumentation.com");
  vi.stubEnv("APP_SITE_ORIGIN", "https://app.intunedocumentation.com");
}
describe("public/app security boundary", () => {
  it("keeps unconfigured and preview hosts private", () => {
    vi.stubEnv("PUBLIC_SITE_ORIGIN", "");
    vi.stubEnv("APP_SITE_ORIGIN", "");
    expect(siteBoundary("https://localhost").mode).toBe("app");
    configure();
    expect(siteBoundary("https://preview.vercel.app").mode).toBe("app");
    expect(siteBoundary("https://intunedocumentation.com").mode).toBe("public");
  });
  it("uses the browser Host when Next normalizes a loopback URL", () => {
    vi.stubEnv("PUBLIC_SITE_ORIGIN", "http://localhost:3100");
    vi.stubEnv("APP_SITE_ORIGIN", "http://127.0.0.1:3100");
    const response = middleware(
      new NextRequest("http://localhost:3100", {
        headers: { host: "127.0.0.1:3100" },
      }),
    );
    expect(response.headers.get("x-middleware-request-x-site-mode")).toBe(
      "app",
    );
  });

  it("requires two distinct origins", () => {
    configure();
    vi.stubEnv("APP_SITE_ORIGIN", "https://intunedocumentation.com");
    expect(() => siteBoundary("https://intunedocumentation.com")).toThrow();
  });
  it("redirects dashboard visits but rejects public Graph collection", () => {
    configure();
    expect(
      middleware(
        new NextRequest(
          "https://intunedocumentation.com/dashboard?token=discard",
        ),
      ).headers.get("location"),
    ).toBe("https://app.intunedocumentation.com/dashboard");
    expect(
      middleware(
        new NextRequest(
          "https://intunedocumentation.com/api/intune/detailed-configurations-stream",
        ),
      ).status,
    ).toBe(404);
  });
  it("replaces forged routing and nonce headers, prevents caching, and uses fresh nonces", () => {
    configure();
    const request = new NextRequest(
      "https://app.intunedocumentation.com/dashboard",
      { headers: { "x-site-mode": "public", "x-nonce": "forged" } },
    );
    const first = middleware(request);
    const second = middleware(request);
    expect(first.headers.get("x-middleware-request-x-site-mode")).toBe("app");
    expect(first.headers.get("x-middleware-request-x-nonce")).not.toBe(
      "forged",
    );
    expect(first.headers.get("content-security-policy")).not.toBe(
      second.headers.get("content-security-policy"),
    );
    expect(first.headers.get("cache-control")).toBe("private, no-store");
  });
  it("excludes third-party connections and executable inline scripts from app policy", () => {
    const policy = contentSecurityPolicy("random", false);
    expect(policy).not.toMatch(/crisp|plausible|unsafe-eval/);
    expect(
      policy.split(";").find((part) => part.trim().startsWith("script-src ")),
    ).not.toContain("unsafe-inline");
    expect(policy).toContain("script-src-attr 'none'");
    expect(contentSecurityPolicy("random", true)).toContain(
      "https://plausible.io",
    );
  });
});

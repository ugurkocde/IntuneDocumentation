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

  it("lets no origin frame any page and removes the retired chat route", () => {
    configure();
    for (const url of [
      "https://intunedocumentation.com/",
      "https://intunedocumentation.com/support-chat",
      "https://app.intunedocumentation.com/dashboard",
      "https://app.intunedocumentation.com/support-chat",
    ]) {
      const response = middleware(new NextRequest(url));
      const policy = response.headers.get("content-security-policy")!;
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).not.toContain("crisp");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(
        response.headers.get("x-middleware-request-x-support-origin"),
      ).toBeNull();
    }
    expect(
      middleware(
        new NextRequest("https://app.intunedocumentation.com/dashboard"),
      ).headers.get("content-security-policy"),
    ).toContain("frame-src 'self' https://login.microsoftonline.com;");
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
    const publicPolicy = contentSecurityPolicy("random", true);
    expect(publicPolicy).toContain("https://plausible.io");
    expect(publicPolicy).not.toContain("crisp");
  });
});

it("allows Turnstile only on the public support form", () => {
  configure();
  for (const [url, allowed] of [
    ["https://intunedocumentation.com/support", true],
    ["https://intunedocumentation.com/", false],
    ["https://app.intunedocumentation.com/support", false],
    ["https://preview.vercel.app/support", false],
  ] as const) {
    const policy = middleware(new NextRequest(url)).headers.get(
      "content-security-policy",
    )!;
    expect(policy.includes("https://challenges.cloudflare.com")).toBe(allowed);
  }
});

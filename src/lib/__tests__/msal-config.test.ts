import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldUseRedirectLogin } from "../msal-config";

describe("shouldUseRedirectLogin", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["iPad", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", 5],
    [
      "iPad desktop mode",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
      5,
    ],
    ["Android", "Mozilla/5.0 (Linux; Android 15; Pixel Tablet)", 5],
  ])("uses redirect authentication on %s", (_, userAgent, maxTouchPoints) => {
    vi.stubGlobal("navigator", { userAgent, maxTouchPoints });

    expect(shouldUseRedirectLogin()).toBe(true);
  });

  it("keeps popup authentication on desktop browsers", () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0",
      maxTouchPoints: 0,
    });

    expect(shouldUseRedirectLogin()).toBe(false);
  });
});

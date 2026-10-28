import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { MANUAL_RECOMMENDATIONS_URL } from "../../../../src/lib/benchmarks/manual";

// esbuild injects these at build time.
vi.hoisted(() => {
  Object.assign(globalThis, {
    __LICENSE_API_BASE__: "",
    __LICENSE_PUBLIC_KEY__: "",
    __LICENSE_BUY_URL__: "",
    __LICENSE_PORTAL_URL__: "",
  });
});

const { HELP_URLS, helpUrl } = await import("./config");

describe("help links", () => {
  it("opens the CIS page of the manual recommendations notice by its key", () => {
    expect(helpUrl("cisBenchmarks")).toBe(MANUAL_RECOMMENDATIONS_URL);
    expect(helpUrl("cisBenchmarks")).toBe("https://www.cisecurity.org/cis-benchmarks");
  });

  it("answers every allowlisted key with its own page only", () => {
    for (const [key, url] of Object.entries(HELP_URLS)) expect(helpUrl(key)).toBe(url);
    expect(Object.keys(HELP_URLS).sort()).toEqual(["cisBenchmarks", "entraAppRegistrations", "gettingStarted", "support"]);
  });

  it("refuses URLs, unknown and inherited keys and anything but a string", () => {
    for (const key of [
      MANUAL_RECOMMENDATIONS_URL,
      "https://example.test/",
      "cisbenchmarks",
      "cisBenchmarks ",
      "toString",
      "__proto__",
      "constructor",
      "",
      undefined,
      null,
      7,
      ["cisBenchmarks"],
      { key: "cisBenchmarks" },
    ])
      expect(() => helpUrl(key)).toThrow("Refused to open an unexpected link.");
  });

  it("is the only way the help:open handler picks the page it opens", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const from = source.indexOf('handle("help:open"');
    expect(from).toBeGreaterThan(-1);
    const handler = source.slice(from, source.indexOf("\n  });\n", from));
    expect(handler).toMatch(/shell\.openExternal\(helpUrl\(key\)\)/);
    expect(handler.match(/openExternal/g)).toHaveLength(1);
  });
});

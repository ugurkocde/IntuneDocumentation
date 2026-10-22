import type { IpcMainInvokeEvent } from "electron";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkAssessmentView } from "../shared/ipc-types";

// Handler level tests of the CIS Benchmarks gate, the content client and
// the memory only cache. Synthetic content only. The licence is a stub of
// cisInternal and entitlementToken (license.test.ts covers the real claim
// checks); fs is wrapped so any use of it is seen.

const touched = vi.hoisted(() => {
  const calls: string[] = [];
  // Wraps the functions of a module (not its classes) so every call is recorded.
  const wrap = (name: string, mod: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(mod)) {
      out[key] =
        typeof value === "function" && /^[a-z]/.test(key)
          ? (...args: unknown[]) => {
              calls.push(`${name}.${key}`);
              return (value as (...rest: unknown[]) => unknown)(...args);
            }
          : value;
    }
    return out;
  };
  return { calls, wrap };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const wrapped = touched.wrap("fs", actual);
  wrapped.promises = touched.wrap("fs.promises", actual.promises as Record<string, unknown>);
  return { ...wrapped, default: wrapped };
});
vi.mock("node:fs/promises", async (importOriginal) => {
  const wrapped = touched.wrap("fs/promises", (await importOriginal()) as Record<string, unknown>);
  return { ...wrapped, default: wrapped };
});

// The real exports, observed: the wiring tests check what they receive.
vi.mock("../../../../src/lib/benchmarks/export", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("../../../../src/lib/benchmarks/export");
  return { ...actual, exportBenchmark: vi.fn(actual.exportBenchmark) };
});

const {
  RUN_NOT_KEPT,
  RUN_NOT_STORED,
  RUN_NOT_TIMED,
  BENCHMARK_ACCOUNT_CHANGED,
  BENCHMARK_ASSESS_FIRST,
  BENCHMARK_CONFIRM_DRAFTS,
  BENCHMARK_ENTITLEMENT_REQUIRED,
  BENCHMARKS_NOT_AVAILABLE,
  MAX_CACHED_CONTENT,
  benchmarkWork,
  contentBaseUrl,
  registerBenchmarksIpc,
} = await import("./benchmarks");
const exportModule = await import("../../../../src/lib/benchmarks/export");
const fixtures = await import("../../../../src/lib/benchmarks/__tests__/fixtures");
const { BENCHMARKS_COMING_SOON } = await import("../shared/ipc-types");

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";
const OWNER = "owner-1";
const TOKEN = "synthetic.entitlement-token";
const BASE = "https://content.example.test/";
const IDENTITY = { benchmark: "synthetic-bench", version: "9.9.9", level: 1 as const };
const NAME = "Synthetic Bench Name";
const TITLE = "Invented recommendation title";
const SETTING = "synthetic_setting_alpha";

const catalog = { benchmarks: [{ id: "synthetic-bench", name: NAME, version: "9.9.9", levels: [1, 2] }] };
const packOf = (level: 1 | 2 = 1, benchmark = "synthetic-bench") => ({
  benchmark,
  version: "9.9.9",
  level,
  policies: [{ name: "Synthetic policy", settings: [{ settingInstance: { settingDefinitionId: SETTING } }] }],
  recommendations: [{ id: "7.1.1", title: TITLE, level, settings: [SETTING] }],
});
const list = {
  benchmark: "synthetic-bench",
  version: "9.9.9",
  items: [{ identifier: "7.1.1", level: 1, automated: true, title: TITLE }],
};

function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

// Answers like the content service: catalog, packs per level, the list.
function service(url: string): Response {
  const path = new URL(url).pathname;
  if (path === "/api/cis/v1/catalog") return json(catalog);
  const pack = /^\/api\/cis\/v1\/packs\/([^/]+)\/9\.9\.9\/([12])$/.exec(path);
  if (pack) return json(packOf(Number(pack[2]) as 1 | 2, decodeURIComponent(pack[1]!)));
  if (path === "/api/cis/v1/lists/synthetic-bench/9.9.9") return json(list);
  return json({ error: "not found" }, { status: 404 });
}

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function harness(options: { work?: boolean } = {}) {
  const handlers = new Map<string, Listener>();
  const state = { tenant: TENANT as string | null, valid: true, claim: true };
  const license = {
    cisInternal: vi.fn(async (tenant: string | null) => state.valid && state.claim && tenant === state.tenant),
    entitlementToken: vi.fn(async (tenant: string | null) => (state.valid && tenant === state.tenant ? TOKEN : null)),
  };
  const fetch = vi.fn(async (url: string, _init: RequestInit) => service(url));
  const requireOwner = vi.fn(async () => OWNER);
  const requireLicense = vi.fn(async () => undefined);
  const saveFile = vi.fn(async (name: string) => `/saved/${name}`);
  const log = vi.fn();
  const work = {
    assessBenchmark: vi.fn(
      async (input: { pack: { benchmark: string; version: string; level: 1 | 2 } }): Promise<BenchmarkAssessmentView> => ({
        benchmark: input.pack.benchmark,
        version: input.pack.version,
        level: input.pack.level,
        assessedAt: "2026-10-22T10:00:00.000Z",
      }),
    ),
    draftsPreview: vi.fn(async () => ({ draftPolicies: 2, draftSettings: 3, notGenerated: [] })),
    exportBenchmark: vi.fn(async () => ({ fileName: "readiness.csv", bytes: new Uint8Array([1, 2]) })),
    benchmarkExceptions: vi.fn(async () => []),
    benchmarkHistory: vi.fn(async () => ({
      enabled: true,
      available: true,
      reason: null,
      trend: [],
      drift: [],
      runs: [],
    })),
    benchmarkPortfolio: vi.fn(async () => ({ available: true, reason: null, benchmarks: [], selected: null, rows: [] })),
  };
  const ipc = registerBenchmarksIpc({
    handle: (channel, listener) => handlers.set(channel, listener),
    requireOwner,
    requireLicense,
    signedInTenant: () => state.tenant,
    license,
    fetch,
    apiBase: BASE,
    track: (run) => run(),
    saveFile,
    log,
    ...(options.work === false ? {} : { work }),
  });
  const call = (channel: string, ...args: unknown[]) =>
    Promise.resolve().then(() => handlers.get(channel)!({} as IpcMainInvokeEvent, ...args));
  const packFetches = () => fetch.mock.calls.filter(([url]) => url.includes("/packs/")).length;
  return { handlers, state, license, fetch, requireOwner, requireLicense, saveFile, log, work, ipc, call, packFetches };
}

beforeEach(() => {
  touched.calls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("benchmarks gate", () => {
  const gated: Array<[string, unknown]> = [
    ["benchmarks:catalog", undefined],
    ["benchmarks:assess", IDENTITY],
    ["benchmarks:previewDrafts", undefined],
    ["benchmarks:export", { format: "csv" }],
    ["benchmarks:exceptions", { action: "list", ...IDENTITY }],
    ["benchmarks:history", IDENTITY],
    ["benchmarks:portfolio", undefined],
  ];

  it("registers exactly the eight benchmark channels", () => {
    expect([...harness().handlers.keys()].sort()).toEqual([
      "benchmarks:assess",
      "benchmarks:availability",
      "benchmarks:catalog",
      "benchmarks:exceptions",
      "benchmarks:export",
      "benchmarks:history",
      "benchmarks:portfolio",
      "benchmarks:previewDrafts",
    ]);
  });

  it("reports comingSoon without the claim, signed out, or when the check fails, and never throws", async () => {
    const h = harness();
    await expect(h.call("benchmarks:availability")).resolves.toEqual({ state: "internal" });
    h.state.claim = false;
    await expect(h.call("benchmarks:availability")).resolves.toEqual({ state: "comingSoon" });
    h.state.claim = true;
    h.state.tenant = null;
    await expect(h.call("benchmarks:availability")).resolves.toEqual({ state: "comingSoon" });
    h.state.tenant = TENANT;
    h.license.cisInternal.mockRejectedValueOnce(new Error("broken"));
    await expect(h.call("benchmarks:availability")).resolves.toEqual({ state: "comingSoon" });
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.requireLicense).not.toHaveBeenCalled();
  });

  it.each(gated)("%s refuses without the claim before sign-in, licence or content work", async (channel, input) => {
    const h = harness();
    h.state.claim = false;
    await expect(h.call(channel, input)).rejects.toThrow(BENCHMARKS_COMING_SOON);
    // Malformed input gets the same answer: the gate comes first.
    await expect(h.call(channel, { benchmark: "../x", format: 7, action: "drop" })).rejects.toThrow(
      BENCHMARKS_COMING_SOON,
    );
    h.state.claim = true;
    h.state.tenant = null;
    await expect(h.call(channel, input)).rejects.toThrow(BENCHMARKS_COMING_SOON);
    expect(h.requireOwner).not.toHaveBeenCalled();
    expect(h.requireLicense).not.toHaveBeenCalled();
    expect(h.license.entitlementToken).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.work.assessBenchmark).not.toHaveBeenCalled();
    expect(h.work.draftsPreview).not.toHaveBeenCalled();
    expect(h.work.exportBenchmark).not.toHaveBeenCalled();
    expect(h.work.benchmarkExceptions).not.toHaveBeenCalled();
    expect(h.work.benchmarkHistory).not.toHaveBeenCalled();
    expect(h.work.benchmarkPortfolio).not.toHaveBeenCalled();
  });

  it.each(gated)("%s checks the gate, then the owner, then the licence", async (channel, input) => {
    const h = harness();
    await h.call(channel, input).catch(() => undefined);
    const gate = h.license.cisInternal.mock.invocationCallOrder[0]!;
    const owner = h.requireOwner.mock.invocationCallOrder[0]!;
    const licence = h.requireLicense.mock.invocationCallOrder[0]!;
    expect(gate).toBeLessThan(owner);
    expect(owner).toBeLessThan(licence);
  });

  it("refuses when the licence refresh drops the claim", async () => {
    const h = harness();
    h.requireLicense.mockImplementation(async () => {
      h.state.claim = false;
    });
    await expect(h.call("benchmarks:catalog")).rejects.toThrow(BENCHMARKS_COMING_SOON);
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow(BENCHMARKS_COMING_SOON);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("answers Not available yet for parts that are not there, without fetching content", async () => {
    const h = harness({ work: false });
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow(BENCHMARKS_NOT_AVAILABLE);
    await expect(h.call("benchmarks:previewDrafts")).rejects.toThrow(BENCHMARKS_NOT_AVAILABLE);
    await expect(h.call("benchmarks:export", { format: "pdf" })).rejects.toThrow(BENCHMARKS_NOT_AVAILABLE);
    await expect(h.call("benchmarks:exceptions", { action: "list", ...IDENTITY })).rejects.toThrow(
      BENCHMARKS_NOT_AVAILABLE,
    );
    await expect(h.call("benchmarks:history")).rejects.toThrow(BENCHMARKS_NOT_AVAILABLE);
    await expect(h.call("benchmarks:portfolio")).rejects.toThrow(BENCHMARKS_NOT_AVAILABLE);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.requireLicense).toHaveBeenCalledTimes(6);
  });

  it("validates benchmark, export and exception input after the gate", async () => {
    const h = harness();
    await expect(h.call("benchmarks:assess", { ...IDENTITY, benchmark: "../x" })).rejects.toThrow(
      "Select a benchmark, version and level.",
    );
    await expect(h.call("benchmarks:export", { format: "xlsx" })).rejects.toThrow("Choose an export format.");
    await expect(h.call("benchmarks:exceptions", { action: "drop", ...IDENTITY })).rejects.toThrow(
      "Unknown exception action.",
    );
    await expect(
      h.call("benchmarks:exceptions", { action: "set", ...IDENTITY, settingId: SETTING, owner: "A", reason: "B", expiresOn: "soon" }),
    ).rejects.toThrow("YYYY-MM-DD");
    const request = { action: "set", ...IDENTITY, settingId: SETTING, owner: "A", reason: "B", expiresOn: "2027-01-31" };
    await expect(h.call("benchmarks:exceptions", request)).resolves.toEqual([]);
    expect(h.work.benchmarkExceptions).toHaveBeenCalledWith({ owner: OWNER, tenantId: TENANT, request });
    // The engine's limits: owner 100, reason 500 characters.
    await expect(h.call("benchmarks:exceptions", { ...request, owner: "x".repeat(101) })).rejects.toThrow("at most 100");
    await expect(h.call("benchmarks:exceptions", { ...request, reason: "x".repeat(501) })).rejects.toThrow("at most 500");
    await expect(h.call("benchmarks:history", { ...IDENTITY, level: 3 })).rejects.toThrow(
      "Select a benchmark, version and level.",
    );
    await expect(h.call("benchmarks:portfolio", { benchmark: "../x", version: "9.9.9" })).rejects.toThrow(
      "Select a benchmark, version and level.",
    );
    await h.call("benchmarks:history");
    await h.call("benchmarks:history", IDENTITY);
    await h.call("benchmarks:portfolio", { benchmark: "synthetic-bench", version: "9.9.9", extra: 1 });
    expect(h.work.benchmarkHistory.mock.calls.map(([input]) => input)).toEqual([
      { owner: OWNER, tenantId: TENANT, request: null },
      { owner: OWNER, tenantId: TENANT, request: IDENTITY },
    ]);
    expect(h.work.benchmarkPortfolio).toHaveBeenCalledWith({
      owner: OWNER,
      tenantId: TENANT,
      request: { benchmark: "synthetic-bench", version: "9.9.9" },
    });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe("benchmarks content client", () => {
  it("sends the entitlement token as bearer, refuses redirects and times out", async () => {
    const h = harness();
    await expect(h.call("benchmarks:catalog")).resolves.toEqual(catalog);
    await h.call("benchmarks:assess", IDENTITY);
    const urls = h.fetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "https://content.example.test/api/cis/v1/catalog",
      "https://content.example.test/api/cis/v1/packs/synthetic-bench/9.9.9/1",
      "https://content.example.test/api/cis/v1/lists/synthetic-bench/9.9.9",
    ]);
    for (const [, init] of h.fetch.mock.calls) {
      expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);
      expect(init.redirect).toBe("error");
      expect(init.method).toBe("GET");
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("refuses a redirect answer instead of following it", async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://elsewhere.test/" } }));
    await expect(h.call("benchmarks:catalog")).rejects.toThrow("returned 302");
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("requests nothing without a current entitlement token", async () => {
    const h = harness();
    h.license.entitlementToken.mockResolvedValue(null);
    await expect(h.call("benchmarks:catalog")).rejects.toThrow(BENCHMARK_ENTITLEMENT_REQUIRED);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("caps the catalog at 1 MB, the list at 8 MB and the pack at 16 MB", async () => {
    const h = harness();
    // Declared too large, and streamed past the cap with a small declared length.
    const streamed = (bytes: number) => new Response("x".repeat(bytes), { headers: { "content-length": "10" } });
    h.fetch.mockResolvedValueOnce(json(catalog, { headers: { "content-length": "1000001" } }));
    await expect(h.call("benchmarks:catalog")).rejects.toThrow("exceeds the 1000000 byte limit");
    h.fetch.mockResolvedValueOnce(streamed(1_000_001));
    await expect(h.call("benchmarks:catalog")).rejects.toThrow("exceeds the 1000000 byte limit");
    h.fetch.mockResolvedValueOnce(json(packOf(), { headers: { "content-length": "16000001" } }));
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow("exceeds the 16000000 byte limit");
    h.fetch.mockResolvedValueOnce(streamed(16_000_001));
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow("exceeds the 16000000 byte limit");
    // A pack over 8 MB but within 16 MB loads; a list over 8 MB does not.
    h.fetch.mockResolvedValueOnce(json({ ...packOf(), policies: [{ name: "x".repeat(9_000_000) }] }));
    h.fetch.mockResolvedValueOnce(streamed(8_000_001));
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow("exceeds the 8000000 byte limit");
    expect(h.work.assessBenchmark).not.toHaveBeenCalled();
    // A list over 1 MB but within 8 MB loads.
    const long = { ...list, items: [{ ...list.items[0], description: "x".repeat(1_500_000) }] };
    h.fetch.mockImplementation(async (url) => (url.includes("/lists/") ? json(long) : service(url)));
    await h.call("benchmarks:assess", IDENTITY);
    expect(h.work.assessBenchmark).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid payloads and caches none of them", async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(json({ benchmarks: [{ ...catalog.benchmarks[0], id: "Bad Slug" }] }));
    await expect(h.call("benchmarks:catalog")).rejects.toThrow("lowercase");
    h.fetch.mockResolvedValueOnce(new Response("not json", { headers: { "content-type": "application/json" } }));
    await expect(h.call("benchmarks:catalog")).rejects.toThrow("invalid response");
    h.fetch.mockResolvedValueOnce(json(packOf(2)));
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow("does not match");
    h.fetch.mockResolvedValueOnce(json({ ...packOf(), extra: true }));
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow("unknown field: extra");
    h.fetch.mockImplementationOnce(async (url) => service(url));
    h.fetch.mockResolvedValueOnce(json({ ...list, version: "1.0.0" }));
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow("does not match");
    // Only the valid pack of the last attempt is held.
    expect(h.ipc.cachedCount()).toBe(1);
    expect(h.work.assessBenchmark).not.toHaveBeenCalled();
  });

  it("asks again for a list that was not published at the next compare, and never holds a failed one (finding 4)", async () => {
    const h = harness();
    const lists = () => h.fetch.mock.calls.filter(([url]) => url.includes("/lists/")).length;
    h.fetch.mockImplementation(async (url) =>
      url.includes("/lists/") ? json({ error: "not found" }, { status: 404 }) : service(url),
    );
    await h.call("benchmarks:assess", IDENTITY);
    expect(h.work.assessBenchmark.mock.calls[0]?.[0]).toMatchObject({ list: null });
    expect(h.ipc.cachedCount()).toBe(1);
    // Published since: the next compare uses it.
    h.fetch.mockImplementation(async (url) => service(url));
    await h.call("benchmarks:assess", IDENTITY);
    expect(lists()).toBe(2);
    expect(h.work.assessBenchmark.mock.calls[1]?.[0]).toMatchObject({ list: { benchmark: "synthetic-bench" } });
    // A storage failure on the service (502) is an error, never "not published".
    const failing = harness();
    failing.fetch.mockImplementation(async (url) =>
      url.includes("/lists/") ? json({ error: "could not be loaded" }, { status: 502 }) : service(url),
    );
    await expect(failing.call("benchmarks:assess", IDENTITY)).rejects.toThrow("returned 502");
    expect(failing.ipc.cachedCount()).toBe(1);
    failing.fetch.mockImplementation(async (url) => service(url));
    await failing.call("benchmarks:assess", IDENTITY);
    expect(failing.work.assessBenchmark.mock.calls[0]?.[0]).toMatchObject({ list: { benchmark: "synthetic-bench" } });
  });

  it("treats a missing list as not delivered and other failures as errors", async () => {
    const h = harness();
    h.fetch.mockImplementation(async (url) =>
      url.includes("/lists/") ? json({ error: "not found" }, { status: 404 }) : service(url),
    );
    await h.call("benchmarks:assess", IDENTITY);
    expect(h.work.assessBenchmark.mock.calls[0]?.[0]).toMatchObject({ list: null });
    h.fetch.mockImplementation(async (url) =>
      url.includes("/packs/") ? json({ error: "boom" }, { status: 500 }) : service(url),
    );
    await expect(h.call("benchmarks:assess", { ...IDENTITY, level: 2 })).rejects.toThrow("returned 500");
  });

  it("reports a timeout as unreachable", async () => {
    const h = harness();
    h.fetch.mockRejectedValueOnce(Object.assign(new Error("timed out"), { name: "TimeoutError" }));
    await expect(h.call("benchmarks:catalog")).rejects.toThrow("could not be reached");
  });

  it("accepts only https, or http on this machine, without credentials, query or fragment", () => {
    expect(contentBaseUrl("https://intunedocumentation.com/")).toBe("https://intunedocumentation.com");
    expect(contentBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(contentBaseUrl("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
    for (const bad of ["http://content.example.test", "https://u:p@content.example.test", "https://a.test/?x=1", "https://a.test/#x", "nope"]) {
      expect(() => contentBaseUrl(bad)).toThrow("address is invalid");
    }
  });
});

describe("benchmarks memory cache", () => {
  it("holds packs per tenant, benchmark, version and level", async () => {
    const h = harness();
    await h.call("benchmarks:assess", IDENTITY);
    await h.call("benchmarks:assess", IDENTITY);
    expect(h.packFetches()).toBe(1);
    await h.call("benchmarks:assess", { ...IDENTITY, level: 2 });
    expect(h.packFetches()).toBe(2);
    // The list is per benchmark and version, shared by both levels.
    expect(h.fetch.mock.calls.filter(([url]) => url.includes("/lists/"))).toHaveLength(1);
    expect(h.ipc.cachedCount()).toBe(3);
    h.state.tenant = OTHER;
    await h.call("benchmarks:assess", IDENTITY);
    expect(h.packFetches()).toBe(3);
  });

  it("is purged by reset (sign out, account change, deactivation, quit)", async () => {
    const h = harness();
    await h.call("benchmarks:assess", IDENTITY);
    expect(h.ipc.cachedCount()).toBe(2);
    h.ipc.reset();
    expect(h.ipc.cachedCount()).toBe(0);
    // The last assessment went too.
    await expect(h.call("benchmarks:export", { format: "csv" })).rejects.toThrow(BENCHMARK_ASSESS_FIRST);
    await h.call("benchmarks:assess", IDENTITY);
    expect(h.packFetches()).toBe(2);
  });

  it("is purged when the claim is gone at the next use", async () => {
    const h = harness();
    await h.call("benchmarks:assess", IDENTITY);
    h.state.claim = false;
    await expect(h.call("benchmarks:assess", IDENTITY)).rejects.toThrow(BENCHMARKS_COMING_SOON);
    expect(h.ipc.cachedCount()).toBe(0);
    h.state.claim = true;
    await h.call("benchmarks:assess", IDENTITY);
    expect(h.packFetches()).toBe(2);
  });

  it("is purged when the activation expires, when signed out and when availability closes", async () => {
    for (const close of [
      (h: ReturnType<typeof harness>) => (h.state.valid = false),
      (h: ReturnType<typeof harness>) => (h.state.tenant = null),
    ]) {
      const h = harness();
      await h.call("benchmarks:assess", IDENTITY);
      close(h);
      await expect(h.call("benchmarks:availability")).resolves.toEqual({ state: "comingSoon" });
      expect(h.ipc.cachedCount()).toBe(0);
    }
  });

  it("is purged by revalidate after a licence change only once the claim is gone", async () => {
    const h = harness();
    await h.call("benchmarks:assess", IDENTITY);
    await h.ipc.revalidate();
    expect(h.ipc.cachedCount()).toBe(2);
    h.state.claim = false;
    await h.ipc.revalidate();
    expect(h.ipc.cachedCount()).toBe(0);
  });

  it("neither caches nor returns content that arrives after a purge", async () => {
    const h = harness();
    let release: (response: Response) => void = () => undefined;
    h.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)));
    const pending = h.call("benchmarks:assess", IDENTITY);
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    h.ipc.reset();
    release(json(packOf()));
    await expect(pending).rejects.toThrow(BENCHMARK_ACCOUNT_CHANGED);
    expect(h.ipc.cachedCount()).toBe(0);
    expect(h.work.assessBenchmark).not.toHaveBeenCalled();
  });

  it("refuses content fetched for a tenant that is no longer signed in", async () => {
    const h = harness();
    let release: (response: Response) => void = () => undefined;
    h.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)));
    const pending = h.call("benchmarks:assess", IDENTITY);
    await vi.waitFor(() => expect(h.fetch).toHaveBeenCalledTimes(1));
    h.state.tenant = OTHER;
    release(json(packOf()));
    await expect(pending).rejects.toThrow(BENCHMARK_ACCOUNT_CHANGED);
    expect(h.ipc.cachedCount()).toBe(0);
  });

  it(`keeps at most ${MAX_CACHED_CONTENT} packs and lists, dropping the oldest`, async () => {
    const h = harness();
    // Every benchmark has a published list here, so lists are held too.
    h.fetch.mockImplementation(async (url) => {
      const listed = /^\/api\/cis\/v1\/lists\/([^/]+)\/9\.9\.9$/.exec(new URL(url).pathname);
      return listed ? json({ ...list, benchmark: decodeURIComponent(listed[1]!) }) : service(url);
    });
    for (let index = 0; index < MAX_CACHED_CONTENT / 2; index += 1) {
      await h.call("benchmarks:assess", { ...IDENTITY, benchmark: `synthetic-${index}` });
    }
    expect(h.ipc.cachedCount()).toBe(MAX_CACHED_CONTENT);
    await h.call("benchmarks:assess", { ...IDENTITY, benchmark: `synthetic-${MAX_CACHED_CONTENT / 2}` });
    expect(h.ipc.cachedCount()).toBe(MAX_CACHED_CONTENT);
    await h.call("benchmarks:assess", { ...IDENTITY, benchmark: "synthetic-0" });
    expect(h.packFetches()).toBe(MAX_CACHED_CONTENT / 2 + 2);
  });

  it("exports the last assessment of the same tenant and owner, drafts only when confirmed", async () => {
    const h = harness();
    await expect(h.call("benchmarks:export", { format: "csv" })).rejects.toThrow(BENCHMARK_ASSESS_FIRST);
    await h.call("benchmarks:assess", IDENTITY);
    await expect(h.call("benchmarks:export", { format: "csv" })).resolves.toBe("/saved/readiness.csv");
    // The pack the assessment was made from goes with it (drafts need it);
    // only the PDF asks the catalog for the benchmark name.
    expect(h.work.exportBenchmark).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, format: "csv", pack: packOf(), benchmarkName: null }),
    );
    expect(h.fetch.mock.calls.some(([url]) => url.endsWith("/catalog"))).toBe(false);
    await h.call("benchmarks:export", { format: "pdf" });
    expect(h.work.exportBenchmark).toHaveBeenLastCalledWith(
      expect.objectContaining({ format: "pdf", benchmarkName: NAME }),
    );
    h.fetch.mockResolvedValueOnce(json({ error: "unavailable" }, { status: 503 }));
    await h.call("benchmarks:export", { format: "pdf" });
    expect(h.work.exportBenchmark).toHaveBeenLastCalledWith(expect.objectContaining({ benchmarkName: null }));
    expect(h.saveFile).toHaveBeenCalledWith("readiness.csv", new Uint8Array([1, 2]));
    await expect(h.call("benchmarks:export", { format: "drafts" })).rejects.toThrow(BENCHMARK_CONFIRM_DRAFTS);
    await expect(h.call("benchmarks:export", { format: "drafts", confirmed: true })).resolves.toBe(
      "/saved/readiness.csv",
    );
    h.requireOwner.mockResolvedValue("owner-2");
    await expect(h.call("benchmarks:export", { format: "csv" })).rejects.toThrow(BENCHMARK_ASSESS_FIRST);
  });

  it("previews the drafts of the last assessment of the same tenant and owner", async () => {
    const h = harness();
    await expect(h.call("benchmarks:previewDrafts")).rejects.toThrow(BENCHMARK_ASSESS_FIRST);
    expect(h.work.draftsPreview).not.toHaveBeenCalled();
    await h.call("benchmarks:assess", IDENTITY);
    const level2 = await h.call("benchmarks:assess", { ...IDENTITY, level: 2 });
    await expect(h.call("benchmarks:previewDrafts")).resolves.toEqual({
      draftPolicies: 2,
      draftSettings: 3,
      notGenerated: [],
    });
    // The newest assessment and the pack it was made from, nothing fetched again.
    expect(h.work.draftsPreview).toHaveBeenCalledWith({ assessment: level2, pack: packOf(2) });
    expect(h.packFetches()).toBe(2);
    h.requireOwner.mockResolvedValueOnce("owner-2");
    await expect(h.call("benchmarks:previewDrafts")).rejects.toThrow(BENCHMARK_ASSESS_FIRST);
    h.ipc.reset();
    await expect(h.call("benchmarks:previewDrafts")).rejects.toThrow(BENCHMARK_ASSESS_FIRST);
    expect(h.work.draftsPreview).toHaveBeenCalledTimes(1);
  });

  it("never touches the file system and never logs content or the token", async () => {
    const console = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
      vi.spyOn(globalThis.console, level).mockImplementation(() => undefined),
    );
    const h = harness();
    await h.call("benchmarks:availability");
    await h.call("benchmarks:catalog");
    await h.call("benchmarks:assess", IDENTITY);
    await h.call("benchmarks:assess", { ...IDENTITY, level: 2 });
    await h.call("benchmarks:export", { format: "json" });
    h.fetch.mockResolvedValueOnce(json({ ...packOf(), extra: TITLE }));
    await h.call("benchmarks:assess", { ...IDENTITY, benchmark: "synthetic-other" }).catch(() => undefined);
    h.fetch.mockResolvedValueOnce(json({ error: "refused" }, { status: 403 }));
    await h.call("benchmarks:catalog").catch(() => undefined);
    await h.ipc.revalidate();
    h.ipc.reset();
    h.state.claim = false;
    await h.call("benchmarks:catalog").catch(() => undefined);
    expect(touched.calls).toEqual([]);
    const logged = JSON.stringify(h.log.mock.calls);
    expect(h.log).toHaveBeenCalled();
    for (const secret of [TOKEN, NAME, TITLE, SETTING, "synthetic-bench", "9.9.9", "Synthetic policy", TENANT, OWNER]) {
      expect(logged).not.toContain(secret);
    }
    for (const spy of console) expect(spy).not.toHaveBeenCalled();
  });
});

describe("benchmark work wiring", () => {
  const { choice, collection, pack, tenantPolicy } = fixtures;
  const PACK_TITLE = "Synthetic alpha recommendation";
  const PACK_POLICY = "Synthetic pack policy name";
  const TENANT_POLICY = "Synthetic tenant policy name";
  const delivered = () =>
    pack(
      [{ name: PACK_POLICY, settings: [choice("synthetic_alpha", "on"), choice("synthetic_beta", "on")] }],
      [
        { id: "1.1", title: PACK_TITLE, level: 1, settings: ["synthetic_alpha"] },
        { id: "1.2", title: "Synthetic beta recommendation", level: 1, settings: ["synthetic_beta"] },
      ],
    );
  const collected = () =>
    collection({
      collectedAt: "2026-10-20T09:00:00.000Z",
      policies: [
        tenantPolicy({
          name: TENANT_POLICY,
          settings: [choice("synthetic_alpha", "on"), choice("synthetic_beta", "off")],
        }),
      ],
    });
  const exception = (overrides: Record<string, unknown> = {}) => ({
    id: "synthetic-exception-1",
    benchmark: fixtures.BENCH,
    version: fixtures.VERSION,
    level: 1 as const,
    settingId: "synthetic_beta",
    owner: "Synthetic Owner",
    reason: "Synthetic reason",
    expiresOn: "2099-12-31",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

  function workHarness() {
    const state = { collection: collected() as ReturnType<typeof collected> | null };
    const stored = [exception(), exception({ id: "other-level", level: 2 }), exception({ id: "other-version", version: "1.0.1" })];
    const deps = {
      collectionFor: vi.fn((owner: string) => (owner === OWNER ? state.collection : null)),
      exceptions: {
        list: vi.fn(async () => stored),
        set: vi.fn(async () => stored),
        remove: vi.fn(async () => stored),
      },
      isCurrent: vi.fn(() => true),
      recordRun: vi.fn(async () => true),
      history: {
        benchmarkHistory: vi.fn(async () => ({ enabled: true, available: true, reason: null, trend: [], drift: [], runs: [] })),
        benchmarkPortfolio: vi.fn(async () => ({ available: true, reason: null, benchmarks: [], selected: null, rows: [] })),
      },
      tenantLabel: (tenantId: string) => `${tenantId.slice(0, 8)}...`,
      log: vi.fn(),
    };
    return { state, deps, stored, work: benchmarkWork(deps) };
  }

  it("assesses the owner's last collection with the tenant's exceptions and stores the run without titles", async () => {
    const { deps, work } = workHarness();
    const assessment = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: delivered(), list: null });
    expect(assessment.recommendations.map((item) => [item.id, item.result])).toEqual([
      ["1.1", "Pass"],
      ["1.2", "Fail"],
    ]);
    expect(assessment.levels[0]!.headline).toMatchObject({ rate: 0.5, adjusted: 1, exceptionIds: ["synthetic-exception-1"] });
    expect(deps.recordRun).toHaveBeenCalledTimes(1);
    const [owner, tenantId, collectedAt, run] = deps.recordRun.mock.calls[0] as unknown as [string, string, string, object];
    expect([owner, tenantId, collectedAt]).toEqual([OWNER, TENANT, "2026-10-20T09:00:00.000Z"]);
    expect(run).toMatchObject({
      benchmark: fixtures.BENCH,
      level: 1,
      packDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      results: [
        ["1.1", "pass", []],
        ["1.2", "fail", ["synthetic_beta"]],
      ],
    });
    const text = JSON.stringify(run);
    for (const secret of [PACK_TITLE, PACK_POLICY, TENANT_POLICY, "Synthetic Owner", "Synthetic reason"]) {
      expect(text).not.toContain(secret);
    }
  });

  it("says in the view when a run is not recorded and why: schema limits, history off, no time (finding 6)", async () => {
    const { deps, state, work } = workHarness();
    const recorded = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: delivered(), list: null });
    expect(recorded.history).toEqual({ recorded: true, reason: null });

    const many = pack(
      [{ settings: [choice("synthetic_alpha", "on")] }],
      Array.from({ length: 5001 }, (_, index) => ({
        id: `1.${index + 1}`,
        title: `Synthetic ${index}`,
        level: 1 as const,
        settings: ["synthetic_alpha"],
      })),
    );
    deps.recordRun.mockClear();
    const tooMany = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: many, list: null });
    expect(tooMany.history).toEqual({
      recorded: false,
      reason: "This comparison is not stored in history. The stored benchmark run holds more than 5000 results.",
    });
    expect(deps.recordRun).not.toHaveBeenCalled();
    expect(tooMany.recommendations).toHaveLength(5001);

    const badId = pack(
      [{ settings: [choice("synthetic alpha", "on")] }],
      [{ id: "1.1", title: "Synthetic", level: 1, settings: ["synthetic alpha"] }],
    );
    const refused = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: badId, list: null });
    expect(refused.history?.recorded).toBe(false);
    expect(refused.history?.reason).toContain("an id is not 1 to 500 letters");
    expect(deps.recordRun).not.toHaveBeenCalled();

    deps.recordRun.mockResolvedValueOnce(false);
    const off = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: delivered(), list: null });
    expect(off.history).toEqual({ recorded: false, reason: RUN_NOT_KEPT });

    state.collection = { ...collected(), collectedAt: undefined } as unknown as ReturnType<typeof collected>;
    const untimed = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: delivered(), list: null });
    expect(untimed.history).toEqual({ recorded: false, reason: RUN_NOT_TIMED });
  });

  it("records one run per Level the comparison shows", async () => {
    const { deps, work } = workHarness();
    const mixed = pack(
      [{ settings: [choice("synthetic_alpha", "on"), choice("synthetic_beta", "on")] }],
      [
        { id: "1.1", title: PACK_TITLE, level: 1, settings: ["synthetic_alpha"] },
        { id: "2.1", title: "Synthetic beta recommendation", level: 2, settings: ["synthetic_beta"] },
      ],
      2,
    );
    const assessment = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: mixed, list: null });
    expect(assessment.history).toEqual({ recorded: true, reason: null });
    const runs = deps.recordRun.mock.calls.map((call) => (call as unknown as [string, string, string, { level: number; results: unknown[] }])[3]);
    expect(runs.map((run) => [run.level, run.results])).toEqual([
      [1, [["1.1", "pass", []]]],
      [2, [["2.1", "fail", ["synthetic_beta"]]]],
    ]);
  });

  it("needs the owner's own collection", async () => {
    const { deps, state, work } = workHarness();
    await expect(work.assessBenchmark({ owner: "owner-2", tenantId: TENANT, pack: delivered(), list: null })).rejects.toThrow(
      "Collect tenant data first.",
    );
    state.collection = null;
    await expect(work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: delivered(), list: null })).rejects.toThrow(
      "Collect tenant data first.",
    );
    expect(deps.recordRun).not.toHaveBeenCalled();
  });

  it("returns the assessment when exceptions or history cannot be used, logging reasons only", async () => {
    const { deps, work } = workHarness();
    deps.exceptions.list.mockRejectedValueOnce(new Error("The exceptions key could not be unlocked right now."));
    deps.recordRun.mockRejectedValueOnce(new Error("The stored benchmark run has an invalid result 1."));
    const assessment = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: delivered(), list: null });
    expect(assessment.levels[0]!.headline).toMatchObject({ rate: 0.5, adjusted: null });
    expect(assessment.history).toEqual({ recorded: false, reason: RUN_NOT_STORED });
    const logged = JSON.stringify(deps.log.mock.calls);
    expect(logged).toContain("benchmark run not stored");
    for (const secret of [PACK_TITLE, PACK_POLICY, TENANT_POLICY, fixtures.BENCH, TENANT, OWNER]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("exports with the assessed pack, the stored exceptions of that benchmark, version and level, and the catalog name", async () => {
    const { work } = workHarness();
    const used = delivered();
    const assessment = await work.assessBenchmark({ owner: OWNER, tenantId: TENANT, pack: used, list: null });
    const exportSpy = vi.mocked(exportModule.exportBenchmark);
    exportSpy.mockClear();
    const input = { owner: OWNER, tenantId: TENANT, assessment, pack: used, benchmarkName: NAME };
    const pdf = await work.exportBenchmark({ ...input, format: "pdf" });
    const [, format, options] = exportSpy.mock.calls[0]!;
    expect(format).toBe("pdf");
    expect(options!.pack).toBe(used);
    expect(options!.benchmarkName).toBe(NAME);
    expect(options!.tenantLabel).toBe("11111111...");
    expect(options!.exceptions).toEqual([exception()]);
    expect(new TextDecoder().decode(pdf.bytes.slice(0, 5))).toBe("%PDF-");
    // Drafts are made from the same pack; without a name the PDF uses the id.
    const drafts = await work.exportBenchmark({ ...input, benchmarkName: null, format: "drafts" });
    expect(exportSpy.mock.calls[1]![2]).not.toHaveProperty("benchmarkName");
    expect(exportSpy.mock.calls[1]![2]!.pack).toBe(used);
    expect([...drafts.bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    const csv = await work.exportBenchmark({ ...input, format: "csv" });
    const text = new TextDecoder().decode(csv.bytes);
    expect(text).toContain("1.2");
    expect(text).not.toContain(PACK_TITLE);
  });

  it("answers exceptions through the store with the account guard, and history through history", async () => {
    const { deps, work } = workHarness();
    const request = { action: "list" as const, benchmark: fixtures.BENCH, version: fixtures.VERSION, level: 1 as const };
    await expect(work.benchmarkExceptions({ owner: OWNER, tenantId: TENANT, request })).resolves.toEqual([exception()]);
    await work.benchmarkExceptions({
      owner: OWNER,
      tenantId: TENANT,
      request: { ...request, action: "set", settingId: "synthetic_beta", owner: "A", reason: "B", expiresOn: "2099-01-01" },
    });
    const guard = (deps.exceptions.set.mock.calls[0] as unknown[])[2] as () => boolean;
    guard();
    expect(deps.isCurrent).toHaveBeenCalledWith(OWNER, TENANT);
    await work.benchmarkHistory({ owner: OWNER, tenantId: TENANT, request: null });
    await work.benchmarkPortfolio({ owner: OWNER, tenantId: TENANT, request: null });
    expect(deps.history.benchmarkHistory).toHaveBeenCalledWith(OWNER, TENANT, null);
    expect(deps.history.benchmarkPortfolio).toHaveBeenCalledWith(OWNER, TENANT, null);
  });

  it("exports through the handlers exactly the pack that was assessed, kept in memory and purged with it", async () => {
    const { work } = workHarness();
    const h = harness();
    const ipc = registerBenchmarksIpc({
      handle: (channel, listener) => h.handlers.set(channel, listener),
      requireOwner: h.requireOwner,
      requireLicense: h.requireLicense,
      signedInTenant: () => h.state.tenant,
      license: h.license,
      fetch: async (url) =>
        url.includes("/packs/")
          ? json(delivered())
          : url.endsWith("/catalog")
            ? json({ benchmarks: [{ id: fixtures.BENCH, name: NAME, version: fixtures.VERSION, levels: [1] }] })
            : json({ error: "not found" }, { status: 404 }),
      apiBase: BASE,
      track: (run) => run(),
      saveFile: h.saveFile,
      log: h.log,
      work,
    });
    const identity = { benchmark: fixtures.BENCH, version: fixtures.VERSION, level: 1 };
    await h.call("benchmarks:assess", identity);
    const exportSpy = vi.mocked(exportModule.exportBenchmark);
    exportSpy.mockClear();
    await h.call("benchmarks:export", { format: "drafts", confirmed: true });
    await h.call("benchmarks:export", { format: "pdf" });
    expect(exportSpy.mock.calls[0]![2]!.pack).toEqual(delivered());
    expect(exportSpy.mock.calls[1]![2]!.benchmarkName).toBe(NAME);
    expect(h.saveFile.mock.calls.map(([name]) => String(name).split(".").at(-1))).toEqual(["zip", "pdf"]);
    ipc.reset();
    await expect(h.call("benchmarks:export", { format: "drafts", confirmed: true })).rejects.toThrow(BENCHMARK_ASSESS_FIRST);
  });

  it("previews through the handlers exactly the draft policies the drafts ZIP holds", async () => {
    const { state, work } = workHarness();
    const missingPack = () =>
      pack(
        [
          { settings: [choice("synthetic_alpha", "on"), choice("synthetic_gamma", "on")] },
          { settings: [choice("synthetic_delta", "on"), choice("synthetic_epsilon", "on")] },
        ],
        [{ id: "2.1", title: "Synthetic gamma recommendation", level: 1, settings: ["synthetic_gamma"] }],
      );
    // gamma and delta are missing (two drafts); epsilon is only on an
    // unassigned policy, so it needs review and gets no draft.
    state.collection = collection({
      collectedAt: "2026-10-20T09:00:00.000Z",
      policies: [
        tenantPolicy({ settings: [choice("synthetic_alpha", "on")] }),
        tenantPolicy({ settings: [choice("synthetic_epsilon", "on")], assignments: [] }),
      ],
    });
    const h = harness();
    registerBenchmarksIpc({
      handle: (channel, listener) => h.handlers.set(channel, listener),
      requireOwner: h.requireOwner,
      requireLicense: h.requireLicense,
      signedInTenant: () => h.state.tenant,
      license: h.license,
      fetch: async (url) =>
        url.includes("/packs/") ? json(missingPack()) : json({ error: "not found" }, { status: 404 }),
      apiBase: BASE,
      track: (run) => run(),
      saveFile: h.saveFile,
      log: h.log,
      work,
    });
    await h.call("benchmarks:assess", { benchmark: fixtures.BENCH, version: fixtures.VERSION, level: 1 });
    const preview = (await h.call("benchmarks:previewDrafts")) as {
      draftPolicies: number;
      draftSettings: number;
      notGenerated: Array<{ settingId: string; reason: string }>;
    };
    expect(preview).toMatchObject({ draftPolicies: 2, draftSettings: 2 });
    expect(preview.notGenerated).toEqual([
      expect.objectContaining({ settingId: "synthetic_epsilon", reason: expect.stringContaining("not assigned") }),
    ]);
    await h.call("benchmarks:export", { format: "drafts", confirmed: true });
    const zip = await JSZip.loadAsync(h.saveFile.mock.calls[0]![1] as Uint8Array);
    const drafts = Object.keys(zip.files).filter((name) => name.endsWith(".json"));
    expect(drafts).toHaveLength(preview.draftPolicies);
  });
});

// main.ts starts Electron when imported, so its wiring is checked in the source.
const realFs = await vi.importActual<typeof import("node:fs")>("node:fs");
const mainSource = realFs.readFileSync(new URL("./main.ts", import.meta.url), "utf8");

describe("main process wiring", () => {
  const source = mainSource;
  const body = (start: string) => {
    const from = source.indexOf(start);
    expect(from).toBeGreaterThan(-1);
    return source.slice(from, source.indexOf("\n  });\n", from) + 1);
  };
  const fn = (name: string) => {
    const from = source.indexOf(`function ${name}(`);
    expect(from).toBeGreaterThan(-1);
    return source.slice(from, source.indexOf("\n}\n", from));
  };

  it("registers the handlers through the trusted sender check with the real licence", () => {
    const registration = source.slice(source.indexOf("benchmarksIpc = registerBenchmarksIpc({"));
    expect(registration).toMatch(/^benchmarksIpc = registerBenchmarksIpc\(\{\s+handle,\s+requireOwner,\s+requireLicense,\s+signedInTenant,\s+license,/);
    expect(registration).toMatch(/fetch: \(url, init\) => net\.fetch\(url, init\)/);
    expect(registration).toMatch(/apiBase: LICENSE_API_BASE/);
  });

  it("purges on the session reset used by sign out, account change and settings changes", () => {
    expect(fn("resetHistorySession")).toContain("benchmarksIpc?.reset();");
    expect(body('handle("auth:signOut"')).toContain("resetHistorySession();");
    expect(body('handle("auth:interactive"')).toMatch(/getOwnerKey\(\) !== ownerBefore\) resetHistorySession\(\)/);
    expect(body('handle("settings:save"')).toContain("resetHistorySession();");
    expect(fn("clearLocalData")).toContain("resetHistorySession();");
  });

  it("purges before licence deactivation, after licence changes and at quit", () => {
    const deactivate = body('handle("license:deactivate"');
    expect(deactivate.indexOf("benchmarksIpc?.reset();")).toBeGreaterThan(-1);
    expect(deactivate.indexOf("benchmarksIpc?.reset();")).toBeLessThan(deactivate.indexOf("license.deactivate()"));
    expect(fn("pushLicense")).toContain("benchmarksIpc?.revalidate();");
    expect(source).toMatch(/app\.on\("will-quit", \(\) => benchmarksIpc\?\.reset\(\)\);/);
  });

  it("wires the work with the owner's own collection and stores runs after the snapshot was saved", () => {
    const registration = source.slice(source.indexOf("work: benchmarkWork({"), source.indexOf('handle("data:clear"'));
    expect(registration).toMatch(/collectionFor: \(owner\) =>\s+getCollectionOwner\(\) === owner \? getLastCollection\(\) : null,/);
    expect(registration).toMatch(/exceptions: benchmarkExceptions,/);
    expect(registration).toMatch(/auth\?\.getOwnerKey\(\) === owner &&\s+signedInTenant\(\)\?\.toLowerCase\(\) === tenantId/);
    expect(registration).toMatch(
      /recordRun: async \(owner, tenantId, collectedAt, run\) => \{\s+await snapshotSaving;\s+return historyHandlers\.recordBenchmarkRun\(/,
    );
    expect(registration).toMatch(/history: historyHandlers,/);
    // Manual and scheduled collections both expose their snapshot save.
    const start = source.indexOf("collected: async (owner, scheduled) => {");
    const collected = source.slice(start, source.indexOf("\n});\n", start));
    expect(collected.match(/snapshotSaving = /g)).toHaveLength(2);
  });

  it("drops the exceptions key with the session and removes the exceptions with clear local data", () => {
    expect(fn("resetHistorySession")).toContain("benchmarkExceptions.reset();");
    expect(fn("clearLocalData")).toContain("await benchmarkExceptions.clear()");
    expect(source).toMatch(/const LOCAL_DATA = \[[^\]]*"benchmark-exceptions",[^\]]*\];/);
    expect(source).toMatch(/new BenchmarkExceptionStore\(\{\s+dir: \(\) => path\.join\(app\.getPath\("userData"\), "benchmark-exceptions"\),/);
  });
});

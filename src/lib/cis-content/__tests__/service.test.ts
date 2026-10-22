import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  signEntitlement,
  type EntitlementPayload,
} from "~/lib/desktop-license/token";
import {
  cisCatalogResponse,
  cisListResponse,
  cisPackResponse,
  defaultCisDeps,
  listObjectKey,
  packObjectKey,
  parseDeliveryMode,
  stdoutAuditSink,
  type CisAuditEvent,
  type CisContentDeps,
  type CisDeliveryMode,
} from "../service";

// Synthetic content only: never real CIS benchmark text.
const { privateKey } = generateKeyPairSync("ed25519");
const NOW = 1_800_000_000_000;
const KEY_ID = "11111111-2222-4333-8444-555555555555";
const ACT = "22222222-2222-4333-8444-555555555555";
const TENANT = "33333333-2222-4333-8444-555555555555";
const INSTALL = "44444444-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const CATALOG = JSON.stringify({
  benchmarks: [
    {
      id: "synthetic-bench",
      name: "Synthetic Bench",
      version: "1.0.0",
      levels: [1, 2],
    },
  ],
});
const PACK = JSON.stringify({
  benchmark: "synthetic-bench",
  version: "1.0.0",
  level: 1,
  policies: [{ name: "Synthetic policy", settings: [] }],
});
const LIST = JSON.stringify({
  benchmark: "synthetic-bench",
  version: "1.0.0",
  items: [{ identifier: "9.9.1", level: 1, automated: true }],
});
const OBJECTS = {
  "catalog.json": CATALOG,
  "packs/synthetic-bench/1.0.0/1.json": PACK,
  "lists/synthetic-bench/1.0.0.json": LIST,
};

function payload(
  overrides: Partial<EntitlementPayload> = {},
): EntitlementPayload {
  return {
    v: 1,
    sub: KEY_ID,
    act: ACT,
    plan: "pro",
    tenantId: TENANT,
    installId: INSTALL,
    tenants: 1,
    status: "granted",
    iat: Math.floor(NOW / 1000) - 60,
    exp: Math.floor(NOW / 1000) + 3600,
    ...overrides,
  };
}

const token = (overrides: Partial<EntitlementPayload> = {}) =>
  signEntitlement(payload(overrides), privateKey);
const internalToken = (overrides: Partial<EntitlementPayload> = {}) =>
  token({ cis: "internal", ...overrides });

type TestDeps = CisContentDeps & {
  auditEvents: CisAuditEvent[];
  downloads: string[];
};

function deps(
  mode: CisDeliveryMode,
  objects: Record<string, string> = OBJECTS,
): TestDeps {
  const auditEvents: CisAuditEvent[] = [];
  const downloads: string[] = [];
  return {
    mode,
    publicKey: createPublicKey(privateKey),
    store: {
      download: async (key: string) => {
        downloads.push(key);
        return key in objects ? { text: objects[key]! } : null;
      },
    },
    now: () => NOW,
    audit: (event) => {
      auditEvents.push(event);
    },
    auditEvents,
    downloads,
  };
}

const request = (bearer?: string) =>
  new Request("https://intunedocumentation.com/api/cis/v1/catalog", {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });

const PACK_ID = { benchmark: "synthetic-bench", version: "1.0.0", level: "1" };
const LIST_ID = { benchmark: "synthetic-bench", version: "1.0.0" };

// The three content kinds share one gate; every gate test runs against all.
const SERVE: [
  string,
  (bearer: string | undefined, d: CisContentDeps) => Promise<Response>,
  string,
][] = [
  ["catalog", (bearer, d) => cisCatalogResponse(request(bearer), d), CATALOG],
  ["pack", (bearer, d) => cisPackResponse(request(bearer), PACK_ID, d), PACK],
  ["list", (bearer, d) => cisListResponse(request(bearer), LIST_ID, d), LIST],
];

beforeEach(() => {
  vi.stubEnv("DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS", KEY_ID);
  vi.stubEnv("DESKTOP_CIS_INTERNAL_INSTALL_IDS", INSTALL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseDeliveryMode", () => {
  it("defaults to off and fails closed on unknown values", () => {
    expect(parseDeliveryMode(undefined)).toBe("off");
    expect(parseDeliveryMode("")).toBe("off");
    expect(parseDeliveryMode("off")).toBe("off");
    expect(parseDeliveryMode("internal")).toBe("internal");
    expect(parseDeliveryMode("licensed")).toBe("licensed");
    expect(parseDeliveryMode("everything")).toBe("off");
  });

  it("reads exactly the strings src/env.js accepts, nothing trimmed or folded", async () => {
    const { z } = await import("zod");
    const source = (await import("node:fs")).readFileSync("src/env.js", "utf8");
    const values = /DESKTOP_CIS_DELIVERY_MODE: z\s*\.enum\(\[([^\]]*)\]\)/.exec(
      source,
    )?.[1];
    expect(values).toBeDefined();
    const accepted = z.enum(JSON.parse(`[${values}]`) as [string, ...string[]]);
    for (const value of [
      "off",
      "internal",
      "licensed",
      " licensed ",
      "Licensed",
      "INTERNAL",
      "internal\n",
      "",
    ]) {
      const valid = accepted.safeParse(value).success;
      // A value env.js refuses never selects a delivery mode here.
      expect(parseDeliveryMode(value)).toBe(valid ? value : "off");
    }
  });
});

describe.each(SERVE)("%s delivery", (_kind, serve, body) => {
  it("serves nothing while delivery is off, even to an internal token", async () => {
    const off = deps("off");
    const response = await serve(internalToken(), off);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(body);
    expect(off.downloads).toEqual([]);
    expect(off.auditEvents).toEqual([]);
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-token"],
  ])("rejects a %s bearer token", async (_label, bearer) => {
    expect((await serve(bearer, deps("internal"))).status).toBe(401);
  });

  it("rejects forged, expired and unknown-claim tokens", async () => {
    // Signed with a different key. Mutating the final base64url characters is
    // unreliable: the last signature character carries padding bits, so such
    // a mutation can decode to the identical signature and still verify.
    const { privateKey: otherKey } = generateKeyPairSync("ed25519");
    const forged = signEntitlement(payload({ cis: "internal" }), otherKey);
    expect((await serve(forged, deps("internal"))).status).toBe(401);
    const expired = internalToken({ exp: Math.floor(NOW / 1000) - 1 });
    expect((await serve(expired, deps("internal"))).status).toBe(401);
    const unknown = token({ cis: "customer" as never });
    expect((await serve(unknown, deps("internal"))).status).toBe(401);
  });

  it("serves an internal token whose key and installation are allowlisted", async () => {
    const allowed = deps("internal");
    const response = await serve(internalToken(), allowed);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(allowed.auditEvents).toHaveLength(1);
  });

  it("requires the internal claim in internal mode", async () => {
    const response = await serve(token(), deps("internal"));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(body);
  });

  it.each([
    ["installation", "DESKTOP_CIS_INTERNAL_INSTALL_IDS", OTHER],
    ["license key", "DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS", OTHER],
    ["installation", "DESKTOP_CIS_INTERNAL_INSTALL_IDS", ""],
    ["license key", "DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS", ""],
  ])(
    "refuses an internal token whose %s is not allowlisted",
    async (_label, name, value) => {
      vi.stubEnv(name, value);
      const refused = deps("internal");
      const response = await serve(internalToken(), refused);
      expect(response.status).toBe(403);
      expect(refused.downloads).toEqual([]);
    },
  );

  it("refuses a still valid internal token as soon as its allowlist entry is removed", async () => {
    const bearer = internalToken();
    const d = deps("internal");
    expect((await serve(bearer, d)).status).toBe(200);
    vi.stubEnv("DESKTOP_CIS_INTERNAL_INSTALL_IDS", OTHER);
    expect((await serve(bearer, d)).status).toBe(403);
    vi.stubEnv("DESKTOP_CIS_INTERNAL_INSTALL_IDS", INSTALL);
    vi.stubEnv("DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS", ` ${OTHER} `);
    expect((await serve(bearer, d)).status).toBe(403);
    expect(d.auditEvents).toHaveLength(1);
  });

  it("serves a pilot license key on any installation and stops when the key is removed", async () => {
    vi.stubEnv("DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS", "");
    vi.stubEnv("DESKTOP_CIS_INTERNAL_INSTALL_IDS", "");
    vi.stubEnv(
      "DESKTOP_CIS_PILOT_LICENSE_KEY_IDS",
      `${OTHER}, ${KEY_ID.toUpperCase()}`,
    );
    const bearer = internalToken();
    const d = deps("internal");
    expect((await serve(bearer, d)).status).toBe(200);
    vi.stubEnv("DESKTOP_CIS_PILOT_LICENSE_KEY_IDS", OTHER);
    expect((await serve(bearer, d)).status).toBe(403);
    expect(d.auditEvents).toHaveLength(1);
  });

  it("does not serve a pilot license key without the claim", async () => {
    vi.stubEnv("DESKTOP_CIS_PILOT_LICENSE_KEY_IDS", KEY_ID);
    const refused = deps("internal");
    expect((await serve(token(), refused)).status).toBe(403);
    expect(refused.downloads).toEqual([]);
  });

  it("matches allowlist entries case-insensitively in a comma separated list", async () => {
    vi.stubEnv(
      "DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS",
      `${OTHER}, ${KEY_ID.toUpperCase()}`,
    );
    vi.stubEnv("DESKTOP_CIS_INTERNAL_INSTALL_IDS", `${INSTALL.toUpperCase()},`);
    expect((await serve(internalToken(), deps("internal"))).status).toBe(200);
  });

  it("serves licensed Pro and MSP grants without the internal claim or allowlists", async () => {
    vi.stubEnv("DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS", "");
    vi.stubEnv("DESKTOP_CIS_INTERNAL_INSTALL_IDS", "");
    expect((await serve(token(), deps("licensed"))).status).toBe(200);
    expect((await serve(token({ plan: "msp" }), deps("licensed"))).status).toBe(
      200,
    );
  });

  it.each<[string, Partial<EntitlementPayload>]>([
    ["another plan", { plan: "free" as never }],
    ["a status other than granted", { status: "revoked" as never }],
    ["a tenant that is not a GUID", { tenantId: "contoso.onmicrosoft.com" }],
    ["an installation that is not a GUID", { installId: "install-1" }],
    ["an empty activation", { act: " " }],
  ])("refuses a licensed token with %s", async (_label, overrides) => {
    const refused = deps("licensed");
    expect((await serve(token(overrides), refused)).status).toBe(403);
    // The internal claim does not lift the plan rules either.
    expect(
      (await serve(internalToken(overrides), deps("internal"))).status,
    ).toBe(403);
    expect(refused.downloads).toEqual([]);
  });

  it.each<[string, keyof CisContentDeps]>([
    ["store", "store"],
    ["public key", "publicKey"],
    ["audit sink", "audit"],
  ])(
    "answers 503 without touching storage when the %s is missing",
    async (_label, field) => {
      const missing = deps("internal");
      const downloads = missing.downloads;
      Object.assign(missing, { [field]: null });
      const response = await serve(internalToken(), missing);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain(body);
      expect(downloads).toEqual([]);
    },
  );

  it("fails closed when the audit entry cannot be written", async () => {
    const throwing = deps("internal");
    throwing.audit = () => {
      throw new Error("audit sink down");
    };
    const response = await serve(internalToken(), throwing);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain(body);
    expect(text).not.toContain("audit sink down");

    const rejecting = deps("licensed");
    rejecting.audit = () => Promise.reject(new Error("drain down"));
    expect((await serve(token(), rejecting)).status).toBe(503);
  });

  it("hides storage failures and oversized content", async () => {
    const failing = deps("internal");
    failing.store = {
      download: () =>
        Promise.reject(new Error("supabase storage refused at /object/x")),
    };
    const failed = await serve(internalToken(), failing);
    expect(failed.status).toBe(502);
    const text = await failed.text();
    expect(text).not.toContain("supabase");
    expect(text).not.toContain("at /object");
    expect(failed.headers.get("cache-control")).toBe("no-store");
    expect(failing.auditEvents).toEqual([]);

    const missing = await serve(internalToken(), deps("internal", {}));
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain("supabase");
  });

  it("audits the download without logging the token", async () => {
    const audited = deps("internal");
    const bearer = internalToken();
    await serve(bearer, audited);
    expect(JSON.stringify(audited.auditEvents)).not.toContain(bearer);
    expect(audited.auditEvents[0]).toMatchObject({
      tenantId: TENANT,
      installId: INSTALL,
      licenseKeyId: KEY_ID,
      mode: "internal",
    });
  });
});

describe("audit events", () => {
  it("names the kind, benchmark, version and level of each download", async () => {
    const audited = deps("licensed");
    await cisCatalogResponse(request(token()), audited);
    await cisPackResponse(
      request(token()),
      { ...PACK_ID, level: "1" },
      audited,
    );
    await cisListResponse(request(token()), LIST_ID, audited);
    const who = {
      tenantId: TENANT,
      installId: INSTALL,
      licenseKeyId: KEY_ID,
      mode: "licensed",
    };
    expect(audited.auditEvents).toEqual([
      { kind: "catalog", ...who },
      {
        kind: "pack",
        benchmark: "synthetic-bench",
        version: "1.0.0",
        level: 1,
        ...who,
      },
      { kind: "list", benchmark: "synthetic-bench", version: "1.0.0", ...who },
    ]);
    expect(audited.downloads).toEqual([
      "catalog.json",
      "packs/synthetic-bench/1.0.0/1.json",
      "lists/synthetic-bench/1.0.0.json",
    ]);
  });

  it("refuses content larger than the per kind limit", async () => {
    const big = "x".repeat(1_000_001);
    const response = await cisCatalogResponse(
      request(internalToken()),
      deps("internal", { "catalog.json": big }),
    );
    expect(response.status).toBe(502);
  });
});

describe("content identity", () => {
  it.each([
    ["benchmark traversal", { ...PACK_ID, benchmark: "../secret" }],
    ["encoded traversal", { ...PACK_ID, benchmark: "..%2fsecret" }],
    ["nested path", { ...PACK_ID, benchmark: "synthetic/bench" }],
    ["benchmark case", { ...PACK_ID, benchmark: "Synthetic" }],
    ["leading hyphen", { ...PACK_ID, benchmark: "-synthetic" }],
    ["long benchmark", { ...PACK_ID, benchmark: "a".repeat(101) }],
    ["version shape", { ...PACK_ID, version: "1.0" }],
    ["version traversal", { ...PACK_ID, version: "1.0.0/../2" }],
    ["level range", { ...PACK_ID, level: "3" }],
    ["level zero", { ...PACK_ID, level: "0" }],
    ["level padding", { ...PACK_ID, level: "01" }],
  ])("rejects an invalid pack identity: %s", async (_label, params) => {
    expect(packObjectKey(params)).toBeNull();
    const d = deps("internal");
    const response = await cisPackResponse(request(internalToken()), params, d);
    expect(response.status).toBe(400);
    expect(d.downloads).toEqual([]);
  });

  it.each([
    ["benchmark traversal", { ...LIST_ID, benchmark: ".." }],
    ["benchmark case", { ...LIST_ID, benchmark: "Synthetic-Bench" }],
    ["version shape", { ...LIST_ID, version: "v1.0.0" }],
    ["version suffix", { ...LIST_ID, version: "1.0.0.json" }],
  ])("rejects an invalid list identity: %s", async (_label, params) => {
    expect(listObjectKey(params)).toBeNull();
    const d = deps("internal");
    const response = await cisListResponse(request(internalToken()), params, d);
    expect(response.status).toBe(400);
    expect(d.downloads).toEqual([]);
  });

  it("maps valid identities to fixed object keys", () => {
    expect(packObjectKey({ ...PACK_ID, level: "2" })).toBe(
      "packs/synthetic-bench/1.0.0/2.json",
    );
    expect(listObjectKey(LIST_ID)).toBe("lists/synthetic-bench/1.0.0.json");
  });

  it("answers 503 for any identity while delivery is off", async () => {
    const response = await cisPackResponse(
      request(internalToken()),
      { ...PACK_ID, benchmark: "../secret" },
      deps("off"),
    );
    expect(response.status).toBe(503);
  });
});

describe("stdoutAuditSink", () => {
  const event: CisAuditEvent = {
    kind: "catalog",
    tenantId: "t",
    installId: "i",
    licenseKeyId: "k",
    mode: "internal",
  };

  it("acknowledges production audit writes and fails delivery when the stream errors", async () => {
    const writes: string[] = [];
    const okStream = {
      write: (chunk: string, callback: (error?: Error | null) => void) => {
        writes.push(chunk);
        callback(null);
        return true;
      },
    };
    await stdoutAuditSink(okStream)(event);
    expect(JSON.parse(writes.join(""))).toEqual({
      event: "cis_content_download",
      ...event,
    });

    const failingStream = {
      write: (_chunk: string, callback: (error?: Error | null) => void) => {
        callback(new Error("EBADF"));
        return false;
      },
    };
    await expect(stdoutAuditSink(failingStream)(event)).rejects.toThrow(
      "EBADF",
    );

    const withAudit = deps("internal");
    withAudit.audit = stdoutAuditSink(failingStream);
    const response = await cisCatalogResponse(
      request(internalToken()),
      withAudit,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(CATALOG);
  });

  it("does not wait for a write callback the host never invokes", async () => {
    const window = { acceptedGraceMs: 5, backpressureTimeoutMs: 20 };
    const writes: string[] = [];
    const silentStream = {
      write: (chunk: string) => {
        writes.push(chunk);
        return true;
      },
    };
    await stdoutAuditSink(silentStream, window)(event);
    expect(writes.join("")).toContain("cis_content_download");

    const withAudit = deps("internal");
    withAudit.audit = stdoutAuditSink(silentStream, window);
    const response = await cisCatalogResponse(
      request(internalToken()),
      withAudit,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(CATALOG);

    const stalledStream = { write: () => false };
    await expect(stdoutAuditSink(stalledStream, window)(event)).rejects.toThrow(
      "not acknowledged",
    );
    const drainedStream = {
      write: (_chunk: string, callback: (error?: Error | null) => void) => {
        setTimeout(() => callback(null), 1);
        return false;
      },
    };
    await expect(
      stdoutAuditSink(drainedStream, window)(event),
    ).resolves.toBeUndefined();
  });

  it("fails delivery when an accepted write reports an error within the acknowledgement window", async () => {
    const lateError = {
      write: (_chunk: string, callback: (error?: Error | null) => void) => {
        setTimeout(() => callback(new Error("EBADF")), 1);
        return true;
      },
    };
    const withAudit = deps("internal");
    withAudit.audit = stdoutAuditSink(lateError, {
      acceptedGraceMs: 200,
      backpressureTimeoutMs: 200,
    });
    const response = await cisCatalogResponse(
      request(internalToken()),
      withAudit,
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(CATALOG);
  });

  it("fails closed when the stream throws", async () => {
    const throwing = {
      write: () => {
        throw new Error("closed");
      },
    };
    await expect(stdoutAuditSink(throwing)(event)).rejects.toThrow("closed");
  });
});

describe("defaultCisDeps", () => {
  it("is off with nothing configured when the mode is unset or unknown", async () => {
    vi.stubEnv("DESKTOP_CIS_DELIVERY_MODE", "");
    expect(await defaultCisDeps()).toEqual({
      mode: "off",
      publicKey: null,
      store: null,
      audit: null,
    });
    vi.stubEnv("DESKTOP_CIS_DELIVERY_MODE", "on");
    expect((await defaultCisDeps()).mode).toBe("off");
  });

  it("has no public key without a valid signing key, so delivery answers 503", async () => {
    vi.stubEnv("DESKTOP_CIS_DELIVERY_MODE", "internal");
    vi.stubEnv("DESKTOP_LICENSE_SIGNING_KEY", "");
    expect((await defaultCisDeps()).publicKey).toBeNull();
    vi.stubEnv("DESKTOP_LICENSE_SIGNING_KEY", "not a key");
    const d = await defaultCisDeps();
    expect(d.publicKey).toBeNull();
    expect((await cisCatalogResponse(request(internalToken()), d)).status).toBe(
      503,
    );
  });

  it("derives the public key from the license signing key", async () => {
    vi.stubEnv("DESKTOP_CIS_DELIVERY_MODE", "licensed");
    const pem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
    vi.stubEnv(
      "DESKTOP_LICENSE_SIGNING_KEY",
      Buffer.from(pem).toString("base64"),
    );
    const d = await defaultCisDeps();
    expect(d.mode).toBe("licensed");
    expect(
      d.publicKey?.export({ format: "pem", type: "spki" }).toString(),
    ).toBe(
      createPublicKey(privateKey)
        .export({ format: "pem", type: "spki" })
        .toString(),
    );
    expect(d.audit).toBeTypeOf("function");
  });
});

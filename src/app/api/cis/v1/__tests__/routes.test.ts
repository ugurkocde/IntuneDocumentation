import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  signEntitlement,
  type EntitlementPayload,
} from "~/lib/desktop-license/token";
import { GET as catalog } from "../catalog/route";
import { GET as list } from "../lists/[benchmark]/[version]/route";
import { GET as pack } from "../packs/[benchmark]/[version]/[level]/route";

// No Supabase client in these tests: without CIS_CONTENT_LOCAL_DIR the store
// is missing, exactly as in a deploy without the service role key.
vi.mock("~/lib/supabase", () => ({ supabase: null, supabaseWriter: null }));

// Synthetic content only: never real CIS benchmark text.
const KEY_ID = "5a0e2f6c-8a41-4a8e-9b33-0c6e2d1f7a10";
const TENANT = "11111111-2222-4333-8444-555555555555";
const INSTALL = "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f";
const CATALOG = '{"benchmarks":[{"id":"synthetic-bench"}]}';
const PACK = '{"benchmark":"synthetic-bench","level":1}';
const LIST = '{"benchmark":"synthetic-bench","items":[]}';

const { privateKey } = generateKeyPairSync("ed25519");
const signingPem = privateKey.export({
  format: "pem",
  type: "pkcs8",
}) as string;

const root = mkdtempSync(join(tmpdir(), "cis-routes-"));
writeFileSync(join(root, "catalog.json"), CATALOG);
mkdirSync(join(root, "packs", "synthetic-bench", "1.0.0"), { recursive: true });
writeFileSync(join(root, "packs", "synthetic-bench", "1.0.0", "1.json"), PACK);
mkdirSync(join(root, "lists", "synthetic-bench"), { recursive: true });
writeFileSync(join(root, "lists", "synthetic-bench", "1.0.0.json"), LIST);
// A file next to the content root that no identity may reach.
writeFileSync(join(root, "..", "cis-routes-secret.json"), "secret");

function token(overrides: Partial<EntitlementPayload> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signEntitlement(
    {
      v: 1,
      sub: KEY_ID,
      act: "act-route-test",
      plan: "pro",
      tenantId: TENANT,
      installId: INSTALL,
      tenants: 1,
      status: "granted",
      iat: now,
      exp: now + 3600,
      ...overrides,
    },
    privateKey,
  );
}

const get = (url: string, bearer?: string) =>
  new Request(`https://intunedocumentation.com/api/cis/v1/${url}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });

const getCatalog = (bearer?: string) => catalog(get("catalog", bearer));
const getPack = (
  params: { benchmark: string; version: string; level: string },
  bearer?: string,
) =>
  pack(get("packs", bearer), {
    params: Promise.resolve(params),
  });
const getList = (
  params: { benchmark: string; version: string },
  bearer?: string,
) =>
  list(get("lists", bearer), {
    params: Promise.resolve(params),
  });

const PACK_ID = { benchmark: "synthetic-bench", version: "1.0.0", level: "1" };
const LIST_ID = { benchmark: "synthetic-bench", version: "1.0.0" };

const ROUTES: [string, (bearer?: string) => Promise<Response>, string][] = [
  ["catalog", getCatalog, CATALOG],
  ["pack", (bearer) => getPack(PACK_ID, bearer), PACK],
  ["list", (bearer) => getList(LIST_ID, bearer), LIST],
];

let auditLines: string[];
// Set by a test to make the stdout audit write report an error.
let auditError: Error | null;

beforeEach(() => {
  vi.stubEnv(
    "DESKTOP_LICENSE_SIGNING_KEY",
    Buffer.from(signingPem).toString("base64"),
  );
  vi.stubEnv("DESKTOP_CIS_DELIVERY_MODE", "internal");
  vi.stubEnv("DESKTOP_CIS_INTERNAL_LICENSE_KEY_IDS", KEY_ID);
  vi.stubEnv("DESKTOP_CIS_INTERNAL_INSTALL_IDS", INSTALL);
  vi.stubEnv("CIS_CONTENT_LOCAL_DIR", root);
  auditLines = [];
  auditError = null;
  const write = process.stdout.write.bind(process.stdout);
  vi.spyOn(process.stdout, "write").mockImplementation(((
    chunk: string | Uint8Array,
    ...rest: unknown[]
  ) => {
    const text = String(chunk);
    if (!text.includes("cis_content_download"))
      return write(chunk, ...(rest as []));
    const callback = rest.find((value) => typeof value === "function") as
      | ((error?: Error | null) => void)
      | undefined;
    if (!auditError) auditLines.push(text);
    callback?.(auditError);
    return !auditError;
  }) as typeof process.stdout.write);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(ROUTES)("GET %s", (kind, call, body) => {
  it("serves nothing when the delivery mode is unset", async () => {
    vi.stubEnv("DESKTOP_CIS_DELIVERY_MODE", "");
    const response = await call(token({ cis: "internal" }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(body);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(auditLines).toEqual([]);
  });

  it("serves an allowlisted internal installation and audits it first", async () => {
    const response = await call(token({ cis: "internal" }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(auditLines).toHaveLength(1);
    expect(JSON.parse(auditLines[0]!)).toMatchObject({
      event: "cis_content_download",
      kind,
      tenantId: TENANT,
      installId: INSTALL,
      licenseKeyId: KEY_ID,
      mode: "internal",
    });
  });

  it("refuses an unlisted installation in internal mode", async () => {
    vi.stubEnv(
      "DESKTOP_CIS_INTERNAL_INSTALL_IDS",
      "66666666-7777-4888-8999-aaaaaaaaaaaa",
    );
    const response = await call(token({ cis: "internal" }));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(body);
    expect(auditLines).toEqual([]);
  });

  it("requires a bearer entitlement", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("a.b")).status).toBe(401);
  });

  it("serves licensed Pro grants and refuses tokens that are not granted", async () => {
    vi.stubEnv("DESKTOP_CIS_DELIVERY_MODE", "licensed");
    expect((await call(token())).status).toBe(200);
    expect((await call(token({ status: "revoked" as never }))).status).toBe(
      403,
    );
  });

  it("answers 503 when no content store is configured", async () => {
    vi.stubEnv("CIS_CONTENT_LOCAL_DIR", "");
    const response = await call(token({ cis: "internal" }));
    expect(response.status).toBe(503);
    expect(auditLines).toEqual([]);
  });

  it("answers 503 and serves nothing when the audit line cannot be written", async () => {
    auditError = new Error("EPIPE");
    const response = await call(token({ cis: "internal" }));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain(body);
    expect(text).not.toContain("EPIPE");
  });
});

describe("path parameters", () => {
  it.each([
    ["traversal", { ...PACK_ID, benchmark: ".." }],
    [
      "traversal to a sibling",
      { ...PACK_ID, benchmark: "../cis-routes-secret" },
    ],
    ["encoded traversal", { ...PACK_ID, benchmark: "%2e%2e" }],
    ["upper case", { ...PACK_ID, benchmark: "Synthetic-Bench" }],
    ["two part version", { ...PACK_ID, version: "1.0" }],
    ["version with a path", { ...PACK_ID, version: "1.0.0/.." }],
    ["level 3", { ...PACK_ID, level: "3" }],
    ["level name", { ...PACK_ID, level: "L1" }],
  ])("rejects a pack request with %s", async (_label, params) => {
    const response = await getPack(params, token({ cis: "internal" }));
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain("secret");
    expect(text).not.toContain(root);
    expect(auditLines).toEqual([]);
  });

  it.each([
    ["traversal", { ...LIST_ID, benchmark: "../lists" }],
    ["empty benchmark", { ...LIST_ID, benchmark: "" }],
    ["version with an extension", { ...LIST_ID, version: "1.0.0.json" }],
    ["prerelease version", { ...LIST_ID, version: "1.0.0-beta" }],
  ])("rejects a list request with %s", async (_label, params) => {
    const response = await getList(params, token({ cis: "internal" }));
    expect(response.status).toBe(400);
    expect(auditLines).toEqual([]);
  });

  it("answers 404 for an unpublished level or version without storage detail", async () => {
    const level2 = await getPack(
      { ...PACK_ID, level: "2" },
      token({ cis: "internal" }),
    );
    expect(level2.status).toBe(404);
    const text = await level2.text();
    expect(text).not.toContain(root);
    expect(text).not.toContain("ENOENT");
    expect(
      (
        await getList(
          { ...LIST_ID, version: "9.9.9" },
          token({ cis: "internal" }),
        )
      ).status,
    ).toBe(404);
    expect(auditLines).toEqual([]);
  });
});

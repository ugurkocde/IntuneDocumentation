import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  jwksResponse,
  signedIdToken,
  unsignedIdToken,
} from "~/lib/__tests__/helpers/entra-id-token";
import {
  overrideTenantLicenseStore,
  resetRateLimit,
} from "~/lib/desktop-license/http";
import type {
  TenantLicense,
  TenantLicenseStore,
} from "~/lib/desktop-license/tenant-store";
import { verifyEntitlement } from "~/lib/desktop-license/token";
import { POST as activate } from "../activate/route";
import { GET as health } from "../health/route";
import { POST as refresh } from "../refresh/route";
import { POST as tenant } from "../tenant/route";

const ORG = "6f3797c8-0811-49bb-a1da-7b2239c506a5";
const PRO = "1ad31514-dc12-42f1-86b6-128d65b889e1";
const MSP = "9eee1da8-98d9-4547-b378-692430c96c80";
const KEY_ID = "5a0e2f6c-8a41-4a8e-9b33-0c6e2d1f7a10";
const SUB_ID = "7c1d9e2a-4b5f-4c6d-8e7f-9a0b1c2d3e4f";
const TENANT_A = "11111111-2222-4333-8444-555555555555";
const TENANT_B = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const INSTALL_A = "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f";
const INSTALL_B = "1e2d3c4b-5a69-4788-9a0b-1c2d3e4f5a6b";
const KEY = "IDOC-GOOD-KEY-0001";
// The key holder's app registration.
const APP_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const GRAPH = "00000003-0000-0000-c000-000000000000";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signingPem = privateKey.export({
  format: "pem",
  type: "pkcs8",
}) as string;

type Activation = { id: string; meta: Record<string, string> };
let key: {
  benefit_id: string;
  status: string;
  activations: Activation[];
  units: number | null;
  deleted: boolean;
};
let mappings: Map<string, TenantLicense>;
const fetchMock = vi.fn();
const polarCalls = () =>
  fetchMock.mock.calls.filter((call) =>
    String(call[0]).startsWith("https://sandbox-api.polar.sh"),
  );

const memoryStore = (): TenantLicenseStore => ({
  get: async (tenantId) => mappings.get(tenantId) ?? null,
  put: async (record) => {
    mappings.set(record.tenantId, record);
  },
  delete: async (tenantId, licenseKeyId) => {
    if (mappings.get(tenantId)?.licenseKeyId === licenseKeyId)
      mappings.delete(tenantId);
  },
});

function polar(url: string, init?: RequestInit) {
  const path = new URL(url).pathname;
  const body = init?.body ? JSON.parse(init.body as string) : {};
  const base = {
    id: KEY_ID,
    customer_id: "c0ffee00-0000-4000-8000-000000000001",
    benefit_id: key.benefit_id,
    status: key.status,
    expires_at: null,
  };
  if (path === "/v1/license-keys/validate") {
    if (body.key !== KEY || key.status !== "granted" || key.deleted)
      return Response.json({ error: "ResourceNotFound" }, { status: 404 });
    const activation = body.activation_id
      ? key.activations.find((a) => a.id === body.activation_id)
      : undefined;
    if (body.activation_id && !activation)
      return Response.json({ error: "ResourceNotFound" }, { status: 404 });
    return Response.json({ ...base, activation: activation ?? null });
  }
  if (path === `/v1/license-keys/${KEY_ID}`)
    return key.deleted
      ? Response.json({ error: "ResourceNotFound" }, { status: 404 })
      : Response.json({
          ...base,
          key: KEY,
          display_key: "****-0001",
          activations: key.activations,
        });
  if (path === "/v1/license-keys/activate") {
    const created = { id: crypto.randomUUID(), meta: body.meta };
    key.activations.push(created);
    return Response.json({ ...created, label: body.label });
  }
  if (path === "/v1/license-keys/deactivate") {
    key.activations = key.activations.filter(
      (a) => a.id !== body.activation_id,
    );
    return new Response(null, { status: 204 });
  }
  if (path === `/v1/benefits/${MSP}/grants`)
    return Response.json({
      items: [
        { subscription_id: SUB_ID, properties: { license_key_id: KEY_ID } },
      ],
    });
  if (path === `/v1/subscriptions/${SUB_ID}`)
    return Response.json({ units: key.units });
  return Response.json({ error: "unexpected" }, { status: 500 });
}

const post = async (
  handler: (r: Request) => Promise<Response>,
  data: object,
) => {
  const response = await handler(
    new Request("https://intunedocumentation.com/api/desktop-license", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    text,
    body: JSON.parse(text) as Record<string, unknown>,
  };
};

const idToken = (
  tenantId = TENANT_A,
  overrides: Record<string, unknown> = {},
  options: Parameters<typeof signedIdToken>[1] = {},
) =>
  signedIdToken(
    {
      aud: APP_ID,
      tid: tenantId,
      iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      ...overrides,
    },
    options,
  );

const claim = (
  action: "activate" | "refresh" | "deactivate" = "activate",
  extra: Record<string, unknown> = {},
) =>
  post(tenant, {
    idToken: idToken(),
    installId: INSTALL_B,
    os: "win32",
    appVersion: "0.1.1",
    action,
    ...extra,
  });

const holderActivates = (extra: Record<string, unknown> = {}) =>
  post(activate, {
    key: KEY,
    installId: INSTALL_A,
    tenantId: TENANT_A,
    os: "darwin",
    appVersion: "0.1.1",
    clientId: APP_ID,
    idToken: idToken(),
    ...extra,
  });

const holderRefreshes = (activationId: string, shareWithTenant?: boolean) =>
  post(refresh, {
    key: KEY,
    activationId,
    installId: INSTALL_A,
    tenantId: TENANT_A,
    clientId: APP_ID,
    idToken: idToken(),
    ...(shareWithTenant === undefined ? {} : { shareWithTenant }),
  });

beforeEach(() => {
  vi.stubEnv("POLAR_API_BASE", "https://sandbox-api.polar.sh");
  vi.stubEnv("POLAR_ORGANIZATION_ID", ORG);
  vi.stubEnv("POLAR_ACCESS_TOKEN", "test-token");
  vi.stubEnv("DESKTOP_LICENSE_PRO_BENEFIT_ID", PRO);
  vi.stubEnv("DESKTOP_LICENSE_MSP_BENEFIT_ID", MSP);
  vi.stubEnv(
    "DESKTOP_LICENSE_SIGNING_KEY",
    Buffer.from(signingPem).toString("base64"),
  );
  key = {
    benefit_id: PRO,
    status: "granted",
    activations: [],
    units: null,
    deleted: false,
  };
  mappings = new Map();
  overrideTenantLicenseStore(memoryStore());
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    url.startsWith("https://login.microsoftonline.com/")
      ? jwksResponse()
      : polar(url, init),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  resetRateLimit();
});

afterEach(() => {
  overrideTenantLicenseStore(undefined);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("organization license sharing", () => {
  it("shares a Pro key with its tenant by default", async () => {
    const response = await holderActivates();
    expect(response.status).toBe(200);
    expect(response.body.shared).toBe(true);
    expect(mappings.get(TENANT_A)).toEqual({
      tenantId: TENANT_A,
      licenseKeyId: KEY_ID,
      benefitId: PRO,
      clientId: APP_ID,
      sharedByActivationId: response.body.activationId,
    });
  });

  it("licenses another install in the tenant without the key", async () => {
    await holderActivates();
    const claimed = await claim();
    expect(claimed.status).toBe(200);
    expect(claimed.text).not.toContain(KEY);
    expect(claimed.body).toMatchObject({
      plan: "pro",
      source: "tenant",
      displayKey: "****Y-0001",
    });
    const payload = verifyEntitlement(claimed.body.token as string, publicKey);
    expect(payload).toMatchObject({
      tenantId: TENANT_A,
      installId: INSTALL_B,
      act: claimed.body.activationId,
    });
    expect(key.activations).toHaveLength(2);

    const refreshed = await claim("refresh", {
      activationId: claimed.body.activationId,
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.text).not.toContain(KEY);
    expect(refreshed.body.activationId).toBe(claimed.body.activationId);

    const released = await claim("deactivate", {
      activationId: claimed.body.activationId,
    });
    expect(released.status).toBe(200);
    expect(released.text).not.toContain(KEY);
    expect(key.activations).toHaveLength(1);
  });

  it("does not share an MSP key until the holder turns sharing on", async () => {
    key.benefit_id = MSP;
    key.units = 3;
    const held = await holderActivates();
    expect(held.body.shared).toBe(false);
    expect(mappings.size).toBe(0);

    const refused = await claim();
    expect(refused.status).toBe(403);
    expect(refused.body.reason).toBe("tenant_not_licensed");

    const shared = await holderRefreshes(
      held.body.activationId as string,
      true,
    );
    expect(shared.body.shared).toBe(true);
    expect(mappings.get(TENANT_A)?.benefitId).toBe(MSP);
    const claimed = await claim();
    expect(claimed.status).toBe(200);
    expect(claimed.body.plan).toBe("msp");

    // Turning it off stops refreshes and new claims.
    const unshared = await holderRefreshes(
      held.body.activationId as string,
      false,
    );
    expect(unshared.body.shared).toBe(false);
    expect(mappings.size).toBe(0);
    const stopped = await claim("refresh", {
      activationId: claimed.body.activationId,
    });
    expect(stopped.body.reason).toBe("tenant_not_licensed");
  });

  it("removes the mapping when a Pro holder stops sharing", async () => {
    const held = await holderActivates();
    const off = await holderRefreshes(held.body.activationId as string, false);
    expect(off.status).toBe(200);
    expect(off.body.shared).toBe(false);
    expect(mappings.size).toBe(0);
    expect((await claim()).body.reason).toBe("tenant_not_licensed");
  });

  it("only removes a mapping that points to this key", async () => {
    const other = {
      tenantId: TENANT_A,
      licenseKeyId: "99999999-0000-4000-8000-000000000009",
      benefitId: PRO,
      clientId: APP_ID,
      sharedByActivationId: null,
    };
    mappings.set(TENANT_A, other);
    await holderActivates({ shareWithTenant: false });
    expect(mappings.get(TENANT_A)).toEqual(other);
  });

  it("writes the mapping only with a sign-in to that tenant and app registration", async () => {
    const cases: [string, Record<string, unknown>][] = [
      ["no token, as from an older app", { idToken: undefined }],
      ["no app registration", { clientId: undefined }],
      // A key holder claims tenant A with a sign-in to tenant B.
      ["a token for another tenant", { idToken: idToken(TENANT_B) }],
      [
        "a token for another app registration",
        { idToken: idToken(TENANT_A, { aud: crypto.randomUUID() }) },
      ],
      ["an access token", { idToken: idToken(TENANT_A, { scp: "User.Read" }) }],
    ];
    for (const [name, extra] of cases) {
      const held = await holderActivates(extra);
      expect(held.status, name).toBe(200);
      expect(held.body, name).toMatchObject({
        shared: false,
        sharedReason: "sign_in_required",
      });
      expect(held.body.token, name).toEqual(expect.any(String));
      expect(mappings.size, name).toBe(0);
    }
    const valid = await holderActivates();
    expect(valid.body.shared).toBe(true);
    expect(valid.body).not.toHaveProperty("sharedReason");
    expect(mappings.get(TENANT_A)?.clientId).toBe(APP_ID);
  });

  it("does not overwrite another tenant's mapping from a forged tenant id", async () => {
    const victim = {
      tenantId: TENANT_B,
      licenseKeyId: "99999999-0000-4000-8000-000000000009",
      benefitId: PRO,
      clientId: APP_ID,
      sharedByActivationId: null,
    };
    mappings.set(TENANT_B, victim);
    const forged = await holderActivates({
      tenantId: TENANT_B,
      idToken: idToken(TENANT_A),
    });
    expect(forged.status).toBe(200);
    expect(forged.body.sharedReason).toBe("sign_in_required");
    expect(mappings.get(TENANT_B)).toEqual(victim);
  });

  it("stops sharing without a token", async () => {
    const held = await holderActivates();
    const off = await post(refresh, {
      key: KEY,
      activationId: held.body.activationId,
      installId: INSTALL_A,
      tenantId: TENANT_A,
      shareWithTenant: false,
    });
    expect(off.body.shared).toBe(false);
    expect(mappings.size).toBe(0);
  });

  it("keeps key licenses working when storage is not configured", async () => {
    overrideTenantLicenseStore(null);
    const held = await holderActivates();
    expect(held.status).toBe(200);
    expect(held.body).not.toHaveProperty("shared");
    const refused = await claim();
    expect(refused.status).toBe(503);
    expect(refused.body.reason).toBe("storage_unavailable");
  });

  it("keeps key licenses working when storage fails", async () => {
    const { TenantStoreUnavailable } = await import(
      "~/lib/desktop-license/tenant-store"
    );
    overrideTenantLicenseStore({
      ...memoryStore(),
      put: () => Promise.reject(new TenantStoreUnavailable("down")),
    });
    const held = await holderActivates();
    expect(held.status).toBe(200);
    expect(held.body).not.toHaveProperty("shared");
  });
});

describe("organization license token checks", () => {
  beforeEach(async () => {
    await holderActivates();
    fetchMock.mockClear();
  });

  it.each([
    ["an unsigned alg none token", () => unsignedIdToken({ tid: TENANT_A })],
    [
      "a token signed by another key",
      () => idToken(TENANT_A, {}, { key: "other" }),
    ],
    [
      "an issuer of another tenant",
      () =>
        idToken(TENANT_A, {
          iss: `https://login.microsoftonline.com/${TENANT_B}/v2.0`,
        }),
    ],
    [
      "a v1 issuer",
      () => idToken(TENANT_A, { iss: `https://sts.windows.net/${TENANT_A}/` }),
    ],
    ["an expired token", () => idToken(TENANT_A, {}, { expiresIn: -300 })],
    [
      "a token issued too long ago",
      () => idToken(TENANT_A, { iat: Math.floor(Date.now() / 1000) - 16 * 60 }),
    ],
    [
      "a token issued in the future",
      () => idToken(TENANT_A, { iat: Math.floor(Date.now() / 1000) + 600 }),
    ],
    [
      "an audience that is not an app id",
      () => idToken(TENANT_A, { aud: "api://other" }),
    ],
    [
      "a Graph access token",
      () =>
        idToken(TENANT_A, { aud: GRAPH, scp: "User.Read", nonce: undefined }),
    ],
    [
      "an access token for the app itself",
      () => idToken(TENANT_A, { scp: "access_as_user" }),
    ],
    [
      "an app only token",
      () => idToken(TENANT_A, { roles: ["License.Read"], nonce: undefined }),
    ],
    ["a tenant that is not a GUID", () => idToken("contoso.onmicrosoft.com")],
  ])("refuses %s with 401", async (_name, token) => {
    const response = await post(tenant, {
      idToken: token(),
      installId: INSTALL_B,
      os: "win32",
      appVersion: "0.1.1",
      action: "activate",
    });
    expect(response.status).toBe(401);
    expect(response.body.reason).toBe("invalid_token");
    expect(polarCalls()).toHaveLength(0);
    expect(key.activations).toHaveLength(1);
  });

  it("licenses only sign-ins to the key holder's app registration", async () => {
    const other = await post(tenant, {
      idToken: idToken(TENANT_A, { aud: crypto.randomUUID() }),
      installId: INSTALL_B,
      os: "win32",
      appVersion: "0.1.1",
      action: "activate",
    });
    expect(other.status).toBe(403);
    expect(other.body.reason).toBe("tenant_not_licensed");
    expect(polarCalls()).toHaveLength(0);
    const own = await claim();
    expect(own.status).toBe(200);
  });

  it("takes the tenant from the token, so another tenant is not licensed", async () => {
    const response = await post(tenant, {
      idToken: idToken(TENANT_B),
      installId: INSTALL_B,
      os: "win32",
      appVersion: "0.1.1",
      action: "activate",
      tenantId: TENANT_A,
    });
    expect(response.status).toBe(403);
    expect(response.body.reason).toBe("tenant_not_licensed");
  });
});

describe("organization license limits", () => {
  it("refuses a revoked key and forgets the mapping", async () => {
    await holderActivates();
    key.status = "revoked";
    const response = await claim();
    expect(response.status).toBe(403);
    expect(response.body.reason).toBe("revoked");
    expect(mappings.size).toBe(0);
  });

  it("forgets the mapping of a key Polar no longer knows", async () => {
    await holderActivates();
    key.deleted = true;
    const response = await claim();
    expect(response.status).toBe(403);
    expect(response.body.reason).toBe("not_found");
    expect(mappings.size).toBe(0);
  });

  it("keeps the mapping when only this install's activation is gone", async () => {
    await holderActivates();
    const response = await claim("refresh", {
      activationId: crypto.randomUUID(),
    });
    expect(response.status).toBe(403);
    expect(response.body.reason).toBe("not_found");
    expect(mappings.size).toBe(1);
  });

  it("refuses a sixth install in the tenant", async () => {
    await holderActivates();
    for (let i = 0; i < 4; i++)
      key.activations.push({
        id: crypto.randomUUID(),
        meta: { installId: crypto.randomUUID(), tenantId: TENANT_A },
      });
    const response = await claim();
    expect(response.status).toBe(403);
    expect(response.body.reason).toBe("install_limit");
    expect(key.activations).toHaveLength(5);
  });

  it("refuses to refresh or release another install's activation", async () => {
    const held = await holderActivates();
    const activationId = held.body.activationId;
    const refreshed = await claim("refresh", { activationId });
    expect(refreshed.body.reason).toBe("activation_mismatch");
    const released = await claim("deactivate", { activationId });
    expect(released.status).toBe(403);
    expect(released.body.reason).toBe("activation_mismatch");
    expect(key.activations).toHaveLength(1);
  });

  it("requires an activation id to refresh or release", async () => {
    await holderActivates();
    expect((await claim("refresh")).body.reason).toBe("activation_mismatch");
    expect((await claim("deactivate")).body.reason).toBe("activation_mismatch");
  });

  it("rejects a malformed token without contacting anyone", async () => {
    const response = await post(tenant, {
      idToken: "not a token",
      installId: INSTALL_B,
      os: "win32",
      appVersion: "0.1.1",
      action: "activate",
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("health", () => {
  it("reports organization license storage separately", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const response = health();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      organizationLicenses: {
        ok: false,
        missing: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
      },
    });
  });
});

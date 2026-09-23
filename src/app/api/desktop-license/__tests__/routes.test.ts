import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimit } from "~/lib/desktop-license/http";
import { verifyEntitlement } from "~/lib/desktop-license/token";
import { POST as activate } from "../activate/route";
import { POST as deactivate } from "../deactivate/route";
import { POST as refresh } from "../refresh/route";

const ORG = "6f3797c8-0811-49bb-a1da-7b2239c506a5";
const PRO = "1ad31514-dc12-42f1-86b6-128d65b889e1";
const MSP = "9eee1da8-98d9-4547-b378-692430c96c80";
const OTHER = "0b8a5d1e-3c1f-4a47-9d3e-1f2a3b4c5d6e";
const KEY_ID = "5a0e2f6c-8a41-4a8e-9b33-0c6e2d1f7a10";
const SUB_ID = "7c1d9e2a-4b5f-4c6d-8e7f-9a0b1c2d3e4f";
const TENANT_A = "11111111-2222-4333-8444-555555555555";
const TENANT_B = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const INSTALL = "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const signingPem = privateKey.export({
  format: "pem",
  type: "pkcs8",
}) as string;

type Activation = {
  id: string;
  meta: Record<string, string>;
  created_at?: string;
};
let key: {
  benefit_id: string;
  status: string;
  activations: Activation[];
  units: number | null;
};
const fetchMock = vi.fn();

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
    // Like Polar, answer 404 for unknown, revoked or disabled keys.
    if (body.key !== "IDOC-GOOD-KEY-0001" || key.status !== "granted")
      return Response.json({ error: "ResourceNotFound" }, { status: 404 });
    const activation = body.activation_id
      ? key.activations.find((a) => a.id === body.activation_id)
      : undefined;
    if (body.activation_id && !activation)
      return Response.json({ error: "ResourceNotFound" }, { status: 404 });
    return Response.json({ ...base, activation: activation ?? null });
  }
  if (path === `/v1/license-keys/${KEY_ID}`)
    return Response.json({ ...base, activations: key.activations });
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

const post = (
  handler: (r: Request) => Promise<Response>,
  data: object,
  headers: Record<string, string> = {},
) =>
  handler(
    new Request("https://intunedocumentation.com/api/desktop-license", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(data),
    }),
  );

const activation = (tenantId = TENANT_A, installId = INSTALL) => ({
  key: "IDOC-GOOD-KEY-0001",
  installId,
  tenantId,
  os: "darwin",
  appVersion: "0.1.0",
});

const act = (tenantId: string, installId: string): Activation => ({
  id: crypto.randomUUID(),
  meta: { installId, tenantId, os: "win32", appVersion: "0.1.0" },
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
  key = { benefit_id: PRO, status: "granted", activations: [], units: null };
  fetchMock.mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(polar(url, init)),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  resetRateLimit();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("desktop license activation", () => {
  it("activates a Pro key and returns a verifiable token", async () => {
    const response = await post(activate, activation());
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      token: string;
      activationId: string;
      plan: string;
    };
    expect(body.plan).toBe("pro");
    expect(key.activations).toHaveLength(1);
    expect(key.activations[0]!.meta).toMatchObject({
      installId: INSTALL,
      tenantId: TENANT_A,
    });
    const payload = verifyEntitlement(body.token, publicKey);
    expect(payload).toMatchObject({
      sub: KEY_ID,
      act: body.activationId,
      tenantId: TENANT_A,
      installId: INSTALL,
      tenants: 1,
    });
    expect(payload!.exp - payload!.iat).toBe(14 * 24 * 60 * 60);
    expect(body.token).not.toContain("IDOC");
    const auth = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(auth.Authorization).toBe("Bearer test-token");
  });

  it("rejects keys from other benefits such as LicenseMeter", async () => {
    key.benefit_id = OTHER;
    const response = await post(activate, activation());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "invalid_key" });
    expect(key.activations).toHaveLength(0);
  });

  it("rejects revoked keys", async () => {
    key.status = "revoked";
    const response = await post(activate, activation());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "not_found" });
    expect(key.activations).toHaveLength(0);
  });

  it("rejects unknown keys", async () => {
    const response = await post(activate, {
      ...activation(),
      key: "IDOC-UNKNOWN-KEY",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "not_found" });
  });

  it("refuses a second tenant on a Pro key", async () => {
    key.activations.push(act(TENANT_A, INSTALL));
    const response = await post(activate, activation(TENANT_B));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "tenant_limit" });
  });

  it("rolls back an activation that lost a race for the Pro tenant", async () => {
    // A concurrent request binds tenant B between our check and our activate.
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (new URL(url).pathname === "/v1/license-keys/activate")
        key.activations.push(act(TENANT_B, crypto.randomUUID()));
      return Promise.resolve(polar(url, init));
    });
    const response = await post(activate, activation(TENANT_A));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "tenant_limit" });
    expect(key.activations.map((a) => a.meta.tenantId)).toEqual([TENANT_B]);
  });

  it("keeps exactly the older of two racing activations", async () => {
    // Hold each activate response until both requests have activated, so both
    // pass the first check and both see the other in the re-read.
    let release!: () => void;
    const bothActivated = new Promise<void>((resolve) => (release = resolve));
    let activations = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const response = polar(url, init);
      if (new URL(url).pathname === "/v1/license-keys/activate") {
        if (++activations === 2) release();
        await bothActivated;
      }
      return response;
    });
    const [first, second] = await Promise.all([
      post(activate, activation(TENANT_A)),
      post(activate, activation(TENANT_B)),
    ]);
    expect(activations).toBe(2);
    expect([first.status, second.status].sort()).toEqual([200, 403]);
    expect(key.activations).toHaveLength(1);
  });

  it("retries a failed rollback once", async () => {
    let deactivations = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/v1/license-keys/activate")
        key.activations.push(act(TENANT_B, crypto.randomUUID()));
      if (path === "/v1/license-keys/deactivate" && deactivations++ === 0)
        return Promise.resolve(new Response("busy", { status: 503 }));
      return Promise.resolve(polar(url, init));
    });
    const response = await post(activate, activation(TENANT_A));
    expect(response.status).toBe(403);
    expect(deactivations).toBe(2);
    expect(key.activations.map((a) => a.meta.tenantId)).toEqual([TENANT_B]);
  });

  it("logs a rollback that fails twice and still refuses", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/v1/license-keys/activate")
        key.activations.push(act(TENANT_B, crypto.randomUUID()));
      if (path === "/v1/license-keys/deactivate")
        return Promise.resolve(new Response("busy", { status: 503 }));
      return Promise.resolve(polar(url, init));
    });
    const response = await post(activate, activation(TENANT_A));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "tenant_limit" });
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("rollback of over-limit activation"),
      expect.anything(),
    );
  });

  it("allows MSP keys up to the subscription tenant quantity", async () => {
    key.benefit_id = MSP;
    key.units = 3;
    key.activations.push(
      act("aaaaaaaa-0000-4000-8000-000000000001", INSTALL),
      act(TENANT_A, INSTALL),
    );
    const allowed = await post(activate, activation(TENANT_B));
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ plan: "msp", tenants: 3 });
    const refused = await post(
      activate,
      activation("bbbbbbbb-0000-4000-8000-000000000002"),
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ reason: "tenant_limit" });
  });

  it("fails closed with a retryable 503 when no tenant quantity is found", async () => {
    key.benefit_id = MSP;
    const response = await post(activate, activation());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      reason: "tenant_quantity_unknown",
    });
    expect(key.activations).toHaveLength(0);

    const existing = act(TENANT_A, INSTALL);
    key.activations.push(existing);
    const refreshed = await post(refresh, {
      key: "IDOC-GOOD-KEY-0001",
      activationId: existing.id,
      installId: INSTALL,
      tenantId: TENANT_A,
    });
    expect(refreshed.status).toBe(503);
  });

  it("stops licensing tenants beyond a lowered MSP quantity on refresh and reuse", async () => {
    key.benefit_id = MSP;
    key.units = 3;
    const tenants = [
      TENANT_A,
      TENANT_B,
      "cccccccc-0000-4000-8000-000000000003",
    ];
    const ids: string[] = [];
    for (const tenant of tenants) {
      const response = await post(activate, activation(tenant));
      expect(response.status).toBe(200);
      ids.push(
        ((await response.json()) as { activationId: string }).activationId,
      );
    }
    key.units = 1;
    const refreshOf = (i: number) =>
      post(refresh, {
        key: "IDOC-GOOD-KEY-0001",
        activationId: ids[i],
        installId: INSTALL,
        tenantId: tenants[i],
      });

    const refused = await refreshOf(2);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ reason: "tenant_limit" });
    const reused = await post(activate, activation(tenants[2]));
    expect(reused.status).toBe(403);
    expect(await reused.json()).toMatchObject({ reason: "tenant_limit" });
    // Another install cannot pick up an unlicensed tenant either.
    const other = await post(
      activate,
      activation(tenants[1], crypto.randomUUID()),
    );
    expect(await other.json()).toMatchObject({ reason: "tenant_limit" });

    // The oldest tenant keeps working.
    const kept = await refreshOf(0);
    expect(kept.status).toBe(200);
    expect(await kept.json()).toMatchObject({ tenants: 1 });
    expect((await post(activate, activation(tenants[0]))).status).toBe(200);
    expect(key.activations).toHaveLength(3);
  });

  it("ranks tenants by activation creation time when Polar provides it", async () => {
    key.benefit_id = MSP;
    key.units = 1;
    const newer = {
      ...act(TENANT_A, INSTALL),
      created_at: "2026-09-02T00:00:00Z",
    };
    const older = {
      ...act(TENANT_B, INSTALL),
      created_at: "2026-09-01T00:00:00Z",
    };
    key.activations.push(newer, older);
    expect((await post(activate, activation(TENANT_B))).status).toBe(200);
    const refused = await post(activate, activation(TENANT_A));
    expect(await refused.json()).toMatchObject({ reason: "tenant_limit" });
  });

  it("applies the one tenant Pro rule to tenants that are already bound", async () => {
    const first = act(TENANT_A, INSTALL);
    const second = act(TENANT_B, INSTALL);
    key.activations.push(first, second);
    const refused = await post(refresh, {
      key: "IDOC-GOOD-KEY-0001",
      activationId: second.id,
      installId: INSTALL,
      tenantId: TENANT_B,
    });
    expect(await refused.json()).toMatchObject({ reason: "tenant_limit" });
    const kept = await post(refresh, {
      key: "IDOC-GOOD-KEY-0001",
      activationId: first.id,
      installId: INSTALL,
      tenantId: TENANT_A,
    });
    expect(kept.status).toBe(200);
  });

  it("rejects a sixth install on the same tenant", async () => {
    for (let i = 0; i < 5; i++)
      key.activations.push(act(TENANT_A, crypto.randomUUID()));
    const response = await post(activate, activation());
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "install_limit" });
    expect(key.activations).toHaveLength(5);
  });

  it("reuses an existing activation for the same install and tenant", async () => {
    const existing = act(TENANT_A, INSTALL);
    key.activations.push(existing);
    const response = await post(activate, activation());
    expect(await response.json()).toMatchObject({ activationId: existing.id });
    expect(key.activations).toHaveLength(1);
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).endsWith("/v1/license-keys/activate"),
      ),
    ).toBe(false);
  });

  it("maps a Polar outage to 502, not a refusal", async () => {
    fetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    const response = await post(activate, activation());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ reason: "upstream" });
  });

  it("rejects malformed input without contacting Polar", async () => {
    for (const bad of [
      { ...activation(), tenantId: "contoso.onmicrosoft.com" },
      { ...activation(), installId: "1234" },
      { ...activation(), key: "x" },
      { ...activation(), os: "android" },
    ]) {
      expect((await post(activate, bad)).status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when licensing is not configured", async () => {
    vi.stubEnv("DESKTOP_LICENSE_SIGNING_KEY", "");
    expect((await post(activate, activation())).status).toBe(503);
  });
});

describe("desktop license refresh and deactivate", () => {
  it("issues a fresh token for a matching activation", async () => {
    const existing = act(TENANT_A, INSTALL);
    key.activations.push(existing);
    const response = await post(refresh, {
      key: "IDOC-GOOD-KEY-0001",
      activationId: existing.id,
      installId: INSTALL,
      tenantId: TENANT_A,
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { token: string };
    expect(verifyEntitlement(body.token, publicKey)?.act).toBe(existing.id);
  });

  it("refuses an activation that belongs to another tenant or install", async () => {
    const existing = act(TENANT_A, INSTALL);
    key.activations.push(existing);
    const response = await post(refresh, {
      key: "IDOC-GOOD-KEY-0001",
      activationId: existing.id,
      installId: INSTALL,
      tenantId: TENANT_B,
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      reason: "activation_mismatch",
    });
  });

  it("refuses a revoked key on refresh and a removed activation", async () => {
    const existing = act(TENANT_A, INSTALL);
    key.activations.push(existing);
    const input = {
      key: "IDOC-GOOD-KEY-0001",
      activationId: existing.id,
      installId: INSTALL,
      tenantId: TENANT_A,
    };
    key.status = "revoked";
    const revoked = await post(refresh, input);
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).toMatchObject({ reason: "not_found" });
    key.status = "granted";
    key.activations = [];
    const gone = await post(refresh, input);
    expect(gone.status).toBe(403);
    expect(await gone.json()).toMatchObject({ reason: "not_found" });
  });

  it("maps a network failure on refresh to 502", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const response = await post(refresh, {
      key: "IDOC-GOOD-KEY-0001",
      activationId: crypto.randomUUID(),
      installId: INSTALL,
      tenantId: TENANT_A,
    });
    expect(response.status).toBe(502);
  });

  it("releases the activation slot on deactivate", async () => {
    const existing = act(TENANT_A, INSTALL);
    key.activations.push(existing);
    const response = await post(deactivate, {
      key: "IDOC-GOOD-KEY-0001",
      activationId: existing.id,
    });
    expect(response.status).toBe(200);
    expect(key.activations).toHaveLength(0);
  });
});

describe("rate limit", () => {
  const bad = { ...activation(), installId: "1234" };

  it("keys on the platform client IP, not a caller supplied X-Forwarded-For", async () => {
    for (let i = 0; i < 20; i++) {
      const response = await post(activate, bad, {
        "x-real-ip": "203.0.113.7",
        "x-forwarded-for": `198.51.100.${i}`,
      });
      expect(response.status).toBe(400);
    }
    const limitedResponse = await post(activate, bad, {
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.99",
    });
    expect(limitedResponse.status).toBe(429);
    // Another client is unaffected.
    expect(
      (await post(activate, bad, { "x-real-ip": "203.0.113.8" })).status,
    ).toBe(400);
  });

  it("falls back to X-Vercel-Forwarded-For, then the first X-Forwarded-For entry", async () => {
    for (let i = 0; i < 20; i++)
      await post(activate, bad, {
        "x-vercel-forwarded-for": "203.0.113.9",
      });
    expect(
      (await post(activate, bad, { "x-vercel-forwarded-for": "203.0.113.9" }))
        .status,
    ).toBe(429);
    for (let i = 0; i < 20; i++)
      await post(activate, bad, {
        "x-forwarded-for": `192.0.2.1, 10.0.0.${i}`,
      });
    expect(
      (await post(activate, bad, { "x-forwarded-for": "192.0.2.1" })).status,
    ).toBe(429);
  });

  it("does not put callers without an address into one shared bucket", async () => {
    for (let i = 0; i < 25; i++)
      expect((await post(activate, bad)).status).toBe(400);
  });
});

describe("entitlement token", () => {
  it("fails verification when tampered with or signed by another key", async () => {
    const response = await post(activate, activation());
    const { token } = (await response.json()) as { token: string };
    const [body, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(body!, "base64url").toString());
    const forged = Buffer.from(
      JSON.stringify({ ...payload, tenantId: TENANT_B }),
    ).toString("base64url");
    expect(verifyEntitlement(`${forged}.${signature}`, publicKey)).toBeNull();
    const other = generateKeyPairSync("ed25519").publicKey;
    expect(verifyEntitlement(token, other)).toBeNull();
    expect(verifyEntitlement(`${token}.x`, publicKey)).toBeNull();
    expect(verifyEntitlement(token, publicKey)).not.toBeNull();
  });
});

describe("health", () => {
  it("reports missing configuration by name only", async () => {
    const { GET } = await import("../health/route");
    const saved = process.env.POLAR_ACCESS_TOKEN;
    delete process.env.POLAR_ACCESS_TOKEN;
    try {
      const response = GET();
      expect(response.status).toBe(503);
      const body = (await response.json()) as { missing: string[] };
      expect(body.missing).toContain("POLAR_ACCESS_TOKEN");
    } finally {
      if (saved !== undefined) process.env.POLAR_ACCESS_TOKEN = saved;
    }
  });
});

import { sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted runs before the imports above, so it loads crypto itself.
const keys = await vi.hoisted(async () => {
  const crypto = await import("node:crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    dir: { current: "" },
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: () => keys.dir.current,
    getVersion: () => "0.0.0-test",
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(text, "utf8"),
    decryptString: (bytes: Buffer) => bytes.toString("utf8"),
  },
}));

vi.mock("./config", () => ({
  LICENSE_API_BASE: "http://127.0.0.1:9",
  LICENSE_PUBLIC_KEY: keys.publicPem,
}));

const { CLOCK_TOLERANCE_MS, LicenseService, entitlementCurrent } = await import(
  "./license"
);

const TENANT = "11111111-2222-3333-4444-555555555555";
const INSTALL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const DAY = 24 * 60 * 60_000;
const T0 = Date.UTC(2026, 8, 1, 12, 0, 0);

function token(overrides: Record<string, unknown> = {}): string {
  const iat = Math.floor(T0 / 1000);
  const payload = {
    v: 1,
    sub: "sub",
    act: "act-1",
    plan: "pro",
    tenantId: TENANT,
    installId: INSTALL,
    tenants: 1,
    status: "granted",
    iat,
    exp: iat + 14 * 24 * 60 * 60,
    ...overrides,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(null, Buffer.from(body), keys.privatePem);
  return `${body}.${signature.toString("base64url")}`;
}

function storeLicense(tokenValue: string, seen?: number): void {
  writeFileSync(path.join(keys.dir.current, "install-id"), INSTALL);
  writeFileSync(
    path.join(keys.dir.current, "license.bin"),
    JSON.stringify({
      key: "TEST-LICENSE-KEY",
      activations: { [TENANT]: { activationId: "act-1", token: tokenValue } },
      ...(seen !== undefined ? { seen } : {}),
    }),
  );
}

async function entitledAt(time: number): Promise<boolean> {
  vi.setSystemTime(time);
  return (await new LicenseService().status(TENANT)).entitled;
}

describe("entitlementCurrent", () => {
  const exp = Math.floor(T0 / 1000) + 3600;

  it("requires a granted status and a finite expiry", () => {
    expect(entitlementCurrent({ exp, status: "granted" }, T0, T0)).toBe(true);
    expect(
      entitlementCurrent({ exp, status: "revoked" as "granted" }, T0, T0),
    ).toBe(false);
    expect(
      entitlementCurrent({ exp: `${exp}` as unknown as number, status: "granted" }, T0, T0),
    ).toBe(false);
    expect(entitlementCurrent({ exp: Infinity, status: "granted" }, T0, T0)).toBe(
      false,
    );
  });

  it("rejects a clock set back beyond the tolerance", () => {
    const seen = T0 + CLOCK_TOLERANCE_MS + 1;
    expect(entitlementCurrent({ exp, status: "granted" }, T0, seen)).toBe(false);
    expect(
      entitlementCurrent({ exp, status: "granted" }, T0, T0 + CLOCK_TOLERANCE_MS),
    ).toBe(true);
  });
});

describe("LicenseService clock guard", () => {
  beforeEach(() => {
    keys.dir.current = mkdtempSync(path.join(tmpdir(), "license-test-"));
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(keys.dir.current, { recursive: true, force: true });
  });

  it("stays valid offline for the token lifetime", async () => {
    storeLicense(token());
    expect(await entitledAt(T0 + DAY)).toBe(true);
    expect(await entitledAt(T0 + 13 * DAY)).toBe(true);
    expect(await entitledAt(T0 + 15 * DAY)).toBe(false);
  });

  it("refuses the cached token after the clock is set back, across restarts", async () => {
    storeLicense(token());
    // Observed and persisted while the token is still valid.
    expect(await entitledAt(T0 + 13 * DAY)).toBe(true);
    // A restart with the clock set back a week does not revive it.
    expect(await entitledAt(T0 + 6 * DAY)).toBe(false);
    // A small correction within the tolerance is fine.
    expect(await entitledAt(T0 + 13 * DAY - CLOCK_TOLERANCE_MS)).toBe(true);
  });

  it("refuses a stored mark that is ahead of the clock", async () => {
    storeLicense(token(), T0 + 5 * DAY);
    expect(await entitledAt(T0 + 2 * DAY)).toBe(false);
  });

  it("refuses a signed token without a granted status or numeric expiry", async () => {
    storeLicense(token({ status: undefined }));
    expect(await entitledAt(T0 + DAY)).toBe(false);
    storeLicense(token({ exp: `${Math.floor(T0 / 1000) + 14 * 86400}` }));
    expect(await entitledAt(T0 + DAY)).toBe(false);
  });
});

describe("LicenseService organization licenses", () => {
  type Call = { action: string; body: Record<string, unknown> };
  let calls: Call[];
  let answer: (call: Call) => Response;

  const fresh = (act: string, plan = "pro") =>
    token({
      act,
      plan,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 14 * 86400,
    });
  const granted = (act: string, extra: Record<string, unknown> = {}) =>
    Response.json({ token: fresh(act), activationId: act, plan: "pro", ...extra });
  const denied = (reason: string) =>
    Response.json({ reason }, { status: 403 });

  beforeEach(() => {
    keys.dir.current = mkdtempSync(path.join(tmpdir(), "license-test-"));
    writeFileSync(path.join(keys.dir.current, "install-id"), INSTALL);
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const call = {
          action: url.split("/").pop() ?? "",
          body: JSON.parse(init.body as string) as Record<string, unknown>,
        };
        calls.push(call);
        return answer(call);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(keys.dir.current, { recursive: true, force: true });
  });

  const APP_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
  const service = (idToken: string | null = "id.token.value") =>
    new LicenseService(
      async (tenant) => (tenant === TENANT ? idToken : null),
      (tenant) => (tenant === TENANT ? APP_ID : null),
    );

  it("licenses a tenant without a key through the organization license", async () => {
    answer = () => granted("act-org", { source: "tenant", displayKey: "****ABCDEF" });
    const license = service();
    await license.requireEntitlement(TENANT);
    expect(calls).toEqual([
      {
        action: "tenant",
        body: expect.objectContaining({
          idToken: "id.token.value",
          installId: INSTALL,
          action: "activate",
        }),
      },
    ]);
    expect(calls[0]!.body).not.toHaveProperty("key");
    const status = await license.status(TENANT);
    expect(status).toMatchObject({
      entitled: true,
      hasKey: false,
      keyHint: null,
      source: "tenant",
      displayKey: "****ABCDEF",
      shared: null,
    });
    // Survives a restart without a key.
    expect((await new LicenseService().status(TENANT)).source).toBe("tenant");
  });

  it("asks for a key without an error when the tenant has no organization license", async () => {
    answer = () => denied("tenant_not_licensed");
    const license = service();
    await expect(license.requireEntitlement(TENANT)).rejects.toThrow(
      "A license is required",
    );
    const status = await license.status(TENANT);
    expect(status).toMatchObject({ entitled: false, message: null, hasKey: false });
  });

  it("refreshes a tenant activation with a fresh ID token, and keeps it without one", async () => {
    answer = () => granted("act-org", { source: "tenant" });
    await service().requireEntitlement(TENANT);
    calls = [];
    await service(null).refreshAll();
    expect(calls).toHaveLength(0);
    expect((await service(null).status(TENANT)).entitled).toBe(true);

    await service().refreshAll();
    expect(calls).toEqual([
      {
        action: "tenant",
        body: expect.objectContaining({ action: "refresh", activationId: "act-org" }),
      },
    ]);

    answer = () => denied("tenant_not_licensed");
    await service().refreshAll();
    expect((await service().status(TENANT)).entitled).toBe(false);
  });

  it("releases a tenant activation through the organization license route", async () => {
    const KEY_ID = "5a0e2f6c-8a41-4a8e-9b33-0c6e2d1f7a10";
    answer = () =>
      granted("act-org", { source: "tenant", licenseKeyId: KEY_ID });
    const license = service();
    await license.requireEntitlement(TENANT);
    answer = () => Response.json({ success: true });
    await license.deactivate();
    expect(calls.at(-1)).toEqual({
      action: "tenant",
      body: expect.objectContaining({
        action: "deactivate",
        activationId: "act-org",
        licenseKeyId: KEY_ID,
      }),
    });
    expect((await license.status(TENANT)).entitled).toBe(false);
  });

  it("lets the key holder share the license and remembers the choice", async () => {
    answer = ({ action, body }) =>
      action === "activate"
        ? granted("act-key", { shared: false })
        : granted("act-key", { shared: body.shareWithTenant });
    const license = service();
    await license.setKey("TEST-LICENSE-KEY", TENANT);
    expect(calls[0]!.body).not.toHaveProperty("shareWithTenant");
    expect(calls[0]!.body).toMatchObject({
      clientId: APP_ID,
      idToken: "id.token.value",
    });
    expect(await license.status(TENANT)).toMatchObject({
      source: "key",
      shared: false,
      hasKey: true,
    });

    expect((await license.setShared(TENANT, true)).shared).toBe(true);
    expect(calls.at(-1)).toMatchObject({
      action: "refresh",
      body: {
        shareWithTenant: true,
        key: "TEST-LICENSE-KEY",
        clientId: APP_ID,
        idToken: "id.token.value",
      },
    });
    await license.refreshAll();
    expect(calls.at(-1)!.body.shareWithTenant).toBe(true);
  });

  it("reports a sharing change the service could not store", async () => {
    answer = ({ action }) =>
      action === "activate" ? granted("act-key", { shared: true }) : granted("act-key");
    const license = service();
    await license.setKey("TEST-LICENSE-KEY", TENANT);
    await expect(license.setShared(TENANT, false)).rejects.toThrow(
      "could not be saved",
    );
    expect((await license.status(TENANT)).shared).toBe(true);
  });

  it("keeps the sharing choice when the service needs a fresh sign-in", async () => {
    answer = ({ action, body }) =>
      // Like the service: sharing needs a sign-in, stopping does not.
      action === "activate" || body.idToken || body.shareWithTenant === false
        ? granted("act-key", { shared: body.shareWithTenant ?? true })
        : granted("act-key", { shared: false, sharedReason: "sign_in_required" });
    await service().setKey("TEST-LICENSE-KEY", TENANT);
    // A background refresh without a sign-in does not turn sharing off.
    await service(null).refreshAll();
    expect(calls.at(-1)!.body).toMatchObject({ shareWithTenant: true });
    expect(calls.at(-1)!.body).not.toHaveProperty("idToken");
    const status = await service(null).status(TENANT);
    expect(status).toMatchObject({ shared: true, shareNeedsSignIn: true });
    await expect(service(null).setShared(TENANT, true)).rejects.toThrow(
      "Sign in again",
    );
    // Stopping needs no sign-in and sends no token.
    await service(null).setShared(TENANT, false);
    expect(calls.at(-1)!.body).toMatchObject({ shareWithTenant: false });
    expect(calls.at(-1)!.body).not.toHaveProperty("idToken");
    await service().refreshAll();
    expect(await service().status(TENANT)).toMatchObject({
      shared: false,
      shareNeedsSignIn: false,
    });
  });

  it("falls back to the organization license when the key is refused for the tenant", async () => {
    answer = ({ action }) =>
      action === "activate"
        ? denied("tenant_limit")
        : granted("act-org", { source: "tenant" });
    const license = service();
    await license.setKey("TEST-LICENSE-KEY", null);
    await license.requireEntitlement(TENANT);
    expect(calls.map((call) => call.action)).toEqual(["activate", "tenant"]);
    expect(await license.status(TENANT)).toMatchObject({
      entitled: true,
      source: "tenant",
      hasKey: true,
    });
  });

  it("keeps the key's refusal when the tenant has no organization license", async () => {
    answer = ({ action }) =>
      action === "activate" ? denied("tenant_limit") : denied("tenant_not_licensed");
    const license = service();
    await license.setKey("TEST-LICENSE-KEY", null);
    await expect(license.requireEntitlement(TENANT)).rejects.toThrow(
      "maximum number of tenants",
    );
  });
});

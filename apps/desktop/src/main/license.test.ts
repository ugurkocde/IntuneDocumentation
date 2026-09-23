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

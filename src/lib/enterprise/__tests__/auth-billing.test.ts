import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Webhook } from "standardwebhooks";
import { authenticate } from "../auth";
import { catalogPrices, verifyBillingEvent } from "../billing";
const tenant = "00000000-0000-4000-8000-000000000001",
  client = "00000000-0000-4000-8000-000000000002",
  audience = "00000000-0000-4000-8000-000000000003";
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  vi.stubEnv("ENTERPRISE_ENABLED", "true");
  vi.stubEnv("ENTERPRISE_ENTRA_CLIENT_ID", client);
  vi.stubEnv("ENTERPRISE_ENTRA_API_ID", audience);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        keys: [{ ...jwk, kid: "test-key", use: "sig", alg: "RS256" }],
      }),
    ),
  );
});
afterAll(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function token(
  overrides: Record<string, unknown> = {},
  privateKey = keys.privateKey,
) {
  return new SignJWT({
    tid: tenant,
    oid: "00000000-0000-4000-8000-000000000004",
    azp: client,
    scp: "access_as_user",
    ver: "2.0",
    name: "Signed user",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(`https://login.microsoftonline.com/${tenant}/v2.0`)
    .setAudience(audience)
    .setIssuedAt()
    .setNotBefore("-1m")
    .setExpirationTime("5m")
    .sign(privateKey);
}
const request = (bearer: string) =>
  new Request("https://example.test/api/enterprise/workspaces", {
    headers: { Authorization: `Bearer ${bearer}` },
  });
describe("Microsoft API access tokens", () => {
  it("validates the signature, issuer, audience, client, and scope", async () => {
    expect(await authenticate(request(await token()))).toMatchObject({
      tenantId: tenant,
      name: "Signed user",
    });
  });
  it("rejects an attacker-signed JWT even with valid-looking claims", async () => {
    const attacker = await generateKeyPair("RS256");
    await expect(
      authenticate(request(await token({}, attacker.privateKey))),
    ).rejects.toThrow(/not valid/);
  });
  it("rejects Graph tokens or ID tokens without our delegated API scope", async () => {
    await expect(
      authenticate(request(await token({ scp: "User.Read" }))),
    ).rejects.toThrow();
    await expect(
      authenticate(request(await token({ azp: "different-client" }))),
    ).rejects.toThrow();
  });
  it("rejects personal Microsoft account tenants", async () => {
    await expect(
      authenticate(
        request(await token({ tid: "9188040d-6c67-4c5b-b112-36a304b66dad" })),
      ),
    ).rejects.toThrow();
  });
  it("rejects missing authentication", async () => {
    await expect(
      authenticate(new Request("https://example.test")),
    ).rejects.toThrow(/Sign in/);
  });
});
describe("Polar event authenticity", () => {
  it("validates new Standard Webhooks secrets over the raw body", () => {
    const secret = `whsec_${Buffer.alloc(32, 4).toString("base64")}`;
    vi.stubEnv("POLAR_WEBHOOK_SECRET", secret);
    vi.stubEnv("POLAR_WEBHOOK_SECRET_FORMAT", "standard");
    const verifier = new Webhook(secret),
      date = new Date(),
      body = JSON.stringify({
        type: "subscription.active",
        data: { id: "sub-1" },
      }),
      headers = {
        "webhook-id": "event-1",
        "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
        "webhook-signature": verifier.sign("event-1", date, body),
      };
    expect(verifyBillingEvent(body, headers).data.id).toBe("sub-1");
    expect(() =>
      verifyBillingEvent(body.replace("sub-1", "sub-2"), headers),
    ).toThrow();
  });
  it("rejects old replay timestamps", () => {
    const secret = `whsec_${Buffer.alloc(32, 4).toString("base64")}`;
    vi.stubEnv("POLAR_WEBHOOK_SECRET", secret);
    const verifier = new Webhook(secret),
      date = new Date(Date.now() - 3600000),
      body = JSON.stringify({
        type: "subscription.active",
        data: { id: "sub-1" },
      });
    expect(() =>
      verifyBillingEvent(body, {
        "webhook-id": "old",
        "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
        "webhook-signature": verifier.sign("old", date, body),
      }),
    ).toThrow();
  });
  it("keeps included tenants free and humans out of unit billing", () => {
    const prices = catalogPrices("msp", "month");
    expect(prices[0]).toMatchObject({ priceAmount: 24900 });
    expect(prices[1]).toMatchObject({
      seatTiers: {
        seatTierType: "graduated",
        tiers: [
          { minSeats: 1, maxSeats: 10, pricePerSeat: 0 },
          { minSeats: 11, maxSeats: null, pricePerSeat: 2000 },
        ],
      },
    });
  });
});

describe("customer connection authorization", () => {
  it("does not accept an MSP identity just because collector consent already exists", async () => {
    const { requireTenantAdministrator } = await import("../auth");
    const identity = {
      tenantId: tenant,
      objectId: client,
      name: "Admin",
      issuedAt: Math.floor(Date.now() / 1000),
      directoryRoles: ["62e90394-69f5-4237-9190-012177145e10"],
    };
    expect(() => requireTenantAdministrator(identity, audience)).toThrow();
    expect(() =>
      requireTenantAdministrator({ ...identity, directoryRoles: [] }, tenant),
    ).toThrow();
    expect(() =>
      requireTenantAdministrator({ ...identity, issuedAt: 1 }, tenant),
    ).toThrow();
    expect(() => requireTenantAdministrator(identity, tenant)).not.toThrow();
  });
});

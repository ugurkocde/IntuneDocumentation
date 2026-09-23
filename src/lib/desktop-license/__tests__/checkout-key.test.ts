import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCheckoutLicenseKeys } from "../checkout-key";

const PRO = "1ad31514-dc12-42f1-86b6-128d65b889e1";
const MSP = "9eee1da8-98d9-4547-b378-692430c96c80";
const OTHER = "0b8a5d1e-3c1f-4a47-9d3e-1f2a3b4c5d6e";
const TOKEN = "polar_cst_TestTokenForUnitTestsOnly0000000000";

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("fetchCheckoutLicenseKeys", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("POLAR_API_BASE", "https://sandbox-api.polar.sh/v1");
    vi.stubEnv("DESKTOP_LICENSE_PRO_BENEFIT_ID", PRO);
    vi.stubEnv("DESKTOP_LICENSE_MSP_BENEFIT_ID", MSP);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns granted desktop keys, newest first, using the session token", async () => {
    reply(200, {
      items: [
        {
          key: "IDOC-OLD",
          benefit_id: PRO,
          status: "granted",
          created_at: "2026-09-01T00:00:00Z",
        },
        {
          key: "IDOC-NEW",
          benefit_id: MSP,
          status: "granted",
          created_at: "2026-09-23T00:00:00Z",
        },
        {
          key: "IDOC-REVOKED",
          benefit_id: PRO,
          status: "revoked",
          created_at: "2026-09-22T00:00:00Z",
        },
        {
          key: "OTHER-PRODUCT",
          benefit_id: OTHER,
          status: "granted",
          created_at: "2026-09-23T00:00:00Z",
        },
      ],
    });
    await expect(fetchCheckoutLicenseKeys(TOKEN)).resolves.toEqual({
      status: "ready",
      keys: ["IDOC-NEW", "IDOC-OLD"],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://sandbox-api.polar.sh/v1/customer-portal/license-keys/?limit=20",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
  });

  it("is pending while Polar has not granted the key yet", async () => {
    reply(200, { items: [] });
    await expect(fetchCheckoutLicenseKeys(TOKEN)).resolves.toEqual({
      status: "pending",
    });
  });

  it("is unavailable when the session token expired", async () => {
    reply(401, { error: "invalid_token" });
    await expect(fetchCheckoutLicenseKeys(TOKEN)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("is unavailable when Polar cannot be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    await expect(fetchCheckoutLicenseKeys(TOKEN)).resolves.toEqual({
      status: "unavailable",
    });
  });

  it("does not call Polar for a missing or malformed token", async () => {
    await expect(fetchCheckoutLicenseKeys(undefined)).resolves.toEqual({
      status: "unavailable",
    });
    await expect(
      fetchCheckoutLicenseKeys("polar_cst_abc/../../v1/orders"),
    ).resolves.toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

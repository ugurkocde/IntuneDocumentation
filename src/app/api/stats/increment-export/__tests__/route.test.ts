import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ID,
  jwksResponse,
  signedIdToken,
  unsignedIdToken,
} from "~/lib/__tests__/helpers/entra-id-token";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("~/lib/supabase", () => ({ supabase: { rpc }, supabaseWriter: { rpc } }));

import { POST } from "../route";

const fetchMock = vi.fn();
const request = (token?: string, ip = "198.51.100.1") =>
  new Request("https://app.example.invalid/api/stats/increment-export", {
    method: "POST",
    headers: {
      "x-forwarded-for": ip,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

beforeEach(() => {
  vi.stubEnv("AZURE_AD_CLIENT_ID", CLIENT_ID);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => jwksResponse());
  rpc.mockResolvedValue({ error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  rpc.mockReset();
});

describe("increment-export", () => {
  it.each([
    ["no token", undefined],
    ["an unsigned alg none token", unsignedIdToken()],
    ["a wrong audience", signedIdToken({ aud: "not-this-app" })],
    ["an access token with scp", signedIdToken({ scp: "User.Read" })],
    ["an app only token with roles", signedIdToken({ roles: ["Stats.Write"] })],
  ])("rejects %s with 401 without calling rpc", async (_name, token) => {
    const response = await POST(request(token));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("increments for a verified user and throttles repeated calls", async () => {
    const token = signedIdToken({
      oid: "aaaaaaaa-0000-0000-0000-00000000000a",
    });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      // A fresh IP each time, so only the per user limit applies
      statuses.push((await POST(request(token, `203.0.113.${i}`))).status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect(rpc).toHaveBeenCalledTimes(30);
    expect(rpc).toHaveBeenCalledWith("increment_export_count");
  });

  it("throttles one IP across many users", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      const token = signedIdToken({
        oid: `bbbbbbbb-0000-0000-0000-${String(i).padStart(12, "0")}`,
      });
      statuses.push((await POST(request(token, "198.51.100.77"))).status);
    }
    expect(statuses.filter((status) => status === 200)).toHaveLength(60);
    expect(statuses[60]).toBe(429);
    expect(rpc).toHaveBeenCalledTimes(60);
  });
});

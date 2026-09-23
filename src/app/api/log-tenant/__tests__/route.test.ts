import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ID,
  TENANT_ID,
  jwksResponse,
  signedIdToken,
  unsignedIdToken,
} from "~/lib/__tests__/helpers/entra-id-token";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("~/lib/supabase", () => ({ supabase: { rpc }, supabaseWriter: { rpc } }));

import { POST } from "../route";

const fetchMock = vi.fn();
const sha = (value: string) =>
  createHash("sha256").update(value.toLowerCase()).digest("hex");
const request = (token?: string) =>
  new NextRequest("https://app.example.invalid/api/log-tenant", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
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

describe("log-tenant", () => {
  it("logs the hashed identity from a verified ID token", async () => {
    const response = await POST(request(signedIdToken()));
    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    expect(rpc).toHaveBeenCalledWith("log_user_access", {
      p_user_hash: sha("admin@example.invalid"),
      p_tenant_hash: sha(TENANT_ID),
    });
  });

  it.each([
    ["no token", undefined],
    ["an unsigned alg none token", unsignedIdToken()],
    ["a token signed by another key", signedIdToken({}, { key: "other" })],
    ["a wrong audience", signedIdToken({ aud: "not-this-app" })],
    [
      "an issuer for a different tenant",
      signedIdToken({
        iss: "https://login.microsoftonline.com/00000000-0000-0000-0000-000000000002/v2.0",
      }),
    ],
    ["an expired token", signedIdToken({}, { expiresIn: -600 })],
  ])("rejects %s with 401 without calling rpc", async (_name, token) => {
    const response = await POST(request(token));
    expect(response.status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects every token when the client ID is not configured", async () => {
    vi.stubEnv("AZURE_AD_CLIENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_AZURE_AD_CLIENT_ID", "");
    const response = await POST(request(signedIdToken()));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});

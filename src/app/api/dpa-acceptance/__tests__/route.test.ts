import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_ID,
  TENANT_ID,
  jwksResponse,
  signedIdToken,
} from "~/lib/__tests__/helpers/entra-id-token";
import { DPA_VERSION } from "~/lib/legal/dpa";

const db = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle,
  };
  const upsert = vi.fn();
  const from = vi.fn(() => ({ ...query, upsert }));
  return { from, upsert, maybeSingle, query };
});
const env = vi.hoisted(() => ({
  SUPABASE_SERVICE_ROLE_KEY: "service" as string | undefined,
}));
vi.mock("~/lib/supabase", () => ({ supabaseWriter: { from: db.from } }));
vi.mock("~/env", () => ({ env }));

import { GET, POST } from "../route";

const fetchMock = vi.fn();
const sha = (value: string) =>
  createHash("sha256").update(value.toLowerCase()).digest("hex");
const url = "https://app.example.invalid/api/dpa-acceptance";
const auth = (token?: string): Record<string, string> =>
  token ? { authorization: `Bearer ${token}` } : {};
const post = (body: unknown, token: string | null = signedIdToken()) =>
  new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...auth(token ?? undefined),
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.stubEnv("AZURE_AD_CLIENT_ID", CLIENT_ID);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => jwksResponse());
  env.SUPABASE_SERVICE_ROLE_KEY = "service";
  db.upsert.mockResolvedValue({ error: null });
  db.maybeSingle.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("dpa-acceptance", () => {
  it("records hashed identity and the current version", async () => {
    const response = await POST(post({ version: DPA_VERSION }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ recorded: true });
    expect(db.from).toHaveBeenCalledWith("dpa_acceptances");
    expect(db.upsert).toHaveBeenCalledWith(
      {
        user_hash: sha("admin@example.invalid"),
        tenant_hash: sha(TENANT_ID),
        dpa_version: DPA_VERSION,
      },
      expect.objectContaining({ ignoreDuplicates: true }),
    );
  });

  it("rejects requests without a verified token", async () => {
    expect((await POST(post({ version: DPA_VERSION }, null))).status).toBe(401);
    expect((await GET(new Request(url))).status).toBe(401);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("rejects an outdated agreement version", async () => {
    const response = await POST(post({ version: "2000-01-01" }));
    expect(response.status).toBe(409);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("reports a failed write so the user can retry", async () => {
    db.upsert.mockResolvedValue({ error: { message: "down" } });
    expect((await POST(post({ version: DPA_VERSION }))).status).toBe(503);
  });

  it("never writes through the anon client", async () => {
    env.SUPABASE_SERVICE_ROLE_KEY = undefined;
    const response = await POST(post({ version: DPA_VERSION }));
    expect(await response.json()).toMatchObject({ recorded: false });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("answers whether the current version was accepted", async () => {
    db.maybeSingle.mockResolvedValue({
      data: { accepted_at: "x" },
      error: null,
    });
    const response = await GET(
      new Request(url, { headers: auth(signedIdToken()) }),
    );
    expect(await response.json()).toEqual({
      version: DPA_VERSION,
      accepted: true,
    });
    expect(db.query.eq).toHaveBeenCalledWith("dpa_version", DPA_VERSION);
  });
});

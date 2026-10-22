import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => ({
  supabase: null as unknown,
  supabaseWriter: null as unknown,
}));

vi.mock("~/lib/supabase", () => ({
  get supabase() {
    return clients.supabase;
  },
  get supabaseWriter() {
    return clients.supabaseWriter;
  },
}));

import {
  CIS_CONTENT_BUCKET,
  defaultCisStore,
  localDirCisStore,
  supabaseCisStore,
} from "../storage";

type Download = (
  key: string,
) => Promise<{ data: Blob | null; error: Error | null }>;

function storageClient(download: Download) {
  const buckets: string[] = [];
  return {
    buckets,
    client: {
      storage: {
        from: (bucket: string) => {
          buckets.push(bucket);
          return { download };
        },
      },
    },
  };
}

beforeEach(() => {
  clients.supabase = null;
  clients.supabaseWriter = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("localDirCisStore", () => {
  it("serves files inside the directory and refuses symlink escapes", async () => {
    const root = mkdtempSync(join(tmpdir(), "cis-content-root-"));
    const outside = mkdtempSync(join(tmpdir(), "cis-content-outside-"));
    writeFileSync(join(root, "catalog.json"), "inside");
    writeFileSync(join(outside, "secret.json"), "outside");
    mkdirSync(join(root, "packs"));
    symlinkSync(
      join(outside, "secret.json"),
      join(root, "packs", "escape.json"),
    );

    const store = localDirCisStore(root);
    expect(await store.download("catalog.json")).toEqual({ text: "inside" });
    expect(await store.download("packs/escape.json")).toBeNull();
    expect(await store.download("../secret.json")).toBeNull();
    expect(await store.download("missing.json")).toBeNull();
  });
});

describe("supabaseCisStore", () => {
  it("reads objects from the private cis-content bucket with the service role client", async () => {
    const keys: string[] = [];
    const { client, buckets } = storageClient(async (key) => {
      keys.push(key);
      return { data: new Blob(["synthetic"]), error: null };
    });
    clients.supabase = { anon: true };
    clients.supabaseWriter = client;
    const store = supabaseCisStore();
    expect(store).not.toBeNull();
    expect(await store!.download("catalog.json")).toEqual({
      text: "synthetic",
    });
    expect(buckets).toEqual([CIS_CONTENT_BUCKET]);
    expect(CIS_CONTENT_BUCKET).toBe("cis-content");
    expect(keys).toEqual(["catalog.json"]);
  });

  it("is unavailable without the service role key, even with the anon client", () => {
    expect(supabaseCisStore()).toBeNull();
    const anon = storageClient(async () => ({ data: null, error: null }));
    // supabaseWriter falls back to the anon client when no service role key
    // is configured.
    clients.supabase = anon.client;
    clients.supabaseWriter = anon.client;
    expect(supabaseCisStore()).toBeNull();
  });

  // The shapes storage-js 2.x returns for a download, seen against this
  // project's Storage API on 2026-10-22: an HTTP error is a
  // StorageUnknownError whose originalError is the Response.
  const storageError = (
    originalError: unknown,
    extra: Record<string, unknown> = {},
  ) =>
    Object.assign(new Error("{}"), {
      name: "StorageUnknownError",
      __isStorageError: true,
      originalError,
      ...extra,
    });
  const answer = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  it("reports only a missing object as unpublished", async () => {
    for (const error of [
      storageError(
        answer(400, {
          statusCode: "404",
          error: "not_found",
          message: "Object not found",
          code: "NoSuchKey",
        }),
      ),
      storageError(
        answer(404, {
          statusCode: "404",
          error: "not_found",
          message: "Object not found",
        }),
      ),
      Object.assign(new Error("Object not found"), {
        name: "StorageApiError",
        status: 400,
        statusCode: "404",
      }),
    ]) {
      const { client } = storageClient(async () => ({ data: null, error }));
      clients.supabaseWriter = client;
      expect(await supabaseCisStore()!.download("catalog.json")).toBeNull();
    }
  });

  it("throws on any other storage failure, so the service answers 502 and not 404", async () => {
    for (const error of [
      storageError(new TypeError("fetch failed")),
      storageError(
        answer(500, {
          statusCode: "500",
          error: "internal",
          message: "Synthetic outage",
        }),
      ),
      storageError(answer(503, { message: "Synthetic unavailable" })),
      storageError(
        answer(400, {
          statusCode: "404",
          error: "Bucket not found",
          message: "Bucket not found",
          code: "NoSuchBucket",
        }),
      ),
      storageError(
        answer(403, {
          statusCode: "403",
          error: "Unauthorized",
          message: "Synthetic denied",
        }),
      ),
      new Error("Synthetic unknown"),
    ]) {
      const { client } = storageClient(async () => ({ data: null, error }));
      clients.supabaseWriter = client;
      await expect(
        supabaseCisStore()!.download("catalog.json"),
      ).rejects.toThrow("CIS content storage failed.");
    }
  });
});

describe("defaultCisStore", () => {
  it("uses a local directory outside production only", async () => {
    const root = mkdtempSync(join(tmpdir(), "cis-content-local-"));
    writeFileSync(join(root, "catalog.json"), "local");
    vi.stubEnv("CIS_CONTENT_LOCAL_DIR", root);
    expect(await defaultCisStore()!.download("catalog.json")).toEqual({
      text: "local",
    });
    vi.stubEnv("NODE_ENV", "production");
    expect(defaultCisStore()).toBeNull();
  });
});

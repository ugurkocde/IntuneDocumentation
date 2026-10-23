import { readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { supabase, supabaseWriter } from "~/lib/supabase";
import type { CisObjectStore } from "./service";

// Converted CIS packs live in Intune Documentation's own private cis-content
// Storage bucket, in its own Supabase project, holding the same objects as
// TenuVault's (catalog, packs and lists); no TenuVault credential is used
// here. No public URL exists for any object, and the service role key never
// leaves this server. Objects are published out of band (operator upload),
// never from this repository.
export const CIS_CONTENT_BUCKET = "cis-content";

// storage-js 2.x reads a download with noResolveJson, so an HTTP error comes
// back as a StorageUnknownError whose originalError is the Response, and a
// network failure as one whose originalError is the thrown error (both seen
// on 2026-10-22 against this project's Storage API). The Storage server
// answers a missing object with HTTP 400 or 404 and a body of statusCode
// "404" and code "NoSuchKey"; a missing bucket has code "NoSuchBucket". Only
// a missing object means not published: anything else, a missing bucket
// included, is a storage failure.
function missingObject(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = body as { statusCode?: unknown; code?: unknown };
  if (String(value.statusCode) !== "404") return false;
  return value.code === undefined || value.code === "NoSuchKey";
}

async function notFound(error: unknown): Promise<boolean> {
  if (typeof error !== "object" || error === null) return false;
  const value = error as { originalError?: unknown };
  // A StorageApiError (a resolved JSON error) carries the body fields itself.
  if (missingObject(error)) return true;
  const response = value.originalError;
  if (!(response instanceof Response)) return false;
  if (response.status !== 400 && response.status !== 404) return false;
  try {
    return missingObject(await response.clone().json());
  } catch {
    return false;
  }
}

// Only the service role client. supabaseWriter falls back to the anon client,
// which a private bucket refuses; that would turn missing configuration into
// a misleading "not published" instead of 503.
export function supabaseCisStore(): CisObjectStore | null {
  if (!supabaseWriter || supabaseWriter === supabase) return null;
  const bucket = supabaseWriter.storage.from(CIS_CONTENT_BUCKET);
  return {
    // Null only when the object is not published; any other failure throws,
    // and the service answers 502 instead of 404.
    async download(key: string) {
      const { data, error } = await bucket.download(key);
      if (error) {
        if (await notFound(error)) return null;
        throw new Error("CIS content storage failed.");
      }
      if (!data) throw new Error("CIS content storage returned no object.");
      return { text: await data.text() };
    },
  };
}

// Local development only: serves synthetic packs from a directory outside the
// repository so the delivery path can be exercised end to end without any
// real CIS content in the repo. Never set this in production deployments.
export function localDirCisStore(dir: string): CisObjectStore {
  const root = resolve(dir);
  return {
    async download(key: string) {
      try {
        // Canonical containment: a symlink inside the directory must not let
        // a valid-looking key read files outside it.
        const canonicalRoot = await realpath(root);
        const canonicalTarget = await realpath(resolve(join(root, key)));
        if (!canonicalTarget.startsWith(canonicalRoot + sep)) return null;
        return { text: await readFile(canonicalTarget, "utf8") };
      } catch {
        return null;
      }
    },
  };
}

export function defaultCisStore(): CisObjectStore | null {
  const localDir = process.env.CIS_CONTENT_LOCAL_DIR;
  if (localDir && process.env.NODE_ENV !== "production") {
    return localDirCisStore(localDir);
  }
  return supabaseCisStore();
}

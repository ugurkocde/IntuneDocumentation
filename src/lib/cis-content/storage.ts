import { readFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { supabase, supabaseWriter } from "~/lib/supabase";
import type { CisObjectStore } from "./service";

// Converted CIS packs live in a private Storage bucket of the Supabase project
// shared with TenuVault: no public URL exists for any object, and the service
// role key never leaves this server. Objects are published out of band
// (operator upload), never from this repository.
export const CIS_CONTENT_BUCKET = "cis-content";

// Only the service role client. supabaseWriter falls back to the anon client,
// which a private bucket refuses; that would turn missing configuration into
// a misleading "not published" instead of 503.
export function supabaseCisStore(): CisObjectStore | null {
  if (!supabaseWriter || supabaseWriter === supabase) return null;
  const bucket = supabaseWriter.storage.from(CIS_CONTENT_BUCKET);
  return {
    async download(key: string) {
      const { data, error } = await bucket.download(key);
      if (error || !data) return null;
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

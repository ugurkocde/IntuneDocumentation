import { createClient } from "@supabase/supabase-js";
import { env } from "~/env";

// Only create client if environment variables are set
export const supabase =
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      )
    : null;

// Server-only client for the metric write functions. Once the service role
// key is configured, EXECUTE on those functions can be revoked from anon so
// the public key can no longer write the counters directly. Falls back to the
// anon client until then.
export const supabaseWriter =
  env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      )
    : supabase;

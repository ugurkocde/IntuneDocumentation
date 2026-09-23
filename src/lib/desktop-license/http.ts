import { z } from "zod";
import { supabaseWriter } from "~/lib/supabase";
import { createPolarClient, PolarUnavailable } from "./polar";
import {
  LicenseDenied,
  LicenseUnauthorized,
  LicenseUnavailable,
  type LicenseContext,
} from "./service";
import {
  supabaseTenantLicenseStore,
  type TenantLicenseStore,
} from "./tenant-store";
import { loadSigningKey } from "./token";

const reply = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const guid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());

export const fields = {
  key: z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[\x21-\x7e]+$/),
  installId: guid,
  tenantId: guid,
  activationId: guid,
  clientId: guid,
  licenseKeyId: guid,
  // An Entra ID token: three base64url segments. Tokens with many claims
  // run to a few KB, hence the larger body limit where it is accepted.
  idToken: z
    .string()
    .max(12000)
    .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/),
  os: z.enum(["win32", "darwin", "linux"]),
  appVersion: z
    .string()
    .max(40)
    .regex(/^\d+\.\d+\.\d+[0-9A-Za-z.+-]*$/),
};

const REQUIRED_ENV = [
  "POLAR_API_BASE",
  "POLAR_ORGANIZATION_ID",
  "POLAR_ACCESS_TOKEN",
  "DESKTOP_LICENSE_PRO_BENEFIT_ID",
  "DESKTOP_LICENSE_MSP_BENEFIT_ID",
  "DESKTOP_LICENSE_SIGNING_KEY",
] as const;

// Organization licenses also need the service role key. Key licenses work
// without it.
const TENANT_REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export function missingTenantConfiguration(): string[] {
  return TENANT_REQUIRED_ENV.filter((name) => !process.env[name]);
}

let storeOverride: TenantLicenseStore | null | undefined;

// Tests swap in an in-memory store; undefined restores the default.
export function overrideTenantLicenseStore(
  store: TenantLicenseStore | null | undefined,
) {
  storeOverride = store;
}

// Only the service role client: supabaseWriter falls back to the anon client,
// which the table's RLS refuses.
function tenantLicenseStore(): TenantLicenseStore | null {
  if (storeOverride !== undefined) return storeOverride;
  if (missingTenantConfiguration().length > 0 || !supabaseWriter) return null;
  return supabaseTenantLicenseStore(supabaseWriter);
}

// Names of missing configuration, never values. Used by the health route so a
// deploy can be smoke tested before customers hit a 503.
export function missingConfiguration(): string[] {
  const missing: string[] = REQUIRED_ENV.filter((name) => !process.env[name]);
  const signing = process.env.DESKTOP_LICENSE_SIGNING_KEY;
  if (signing) {
    try {
      loadSigningKey(signing);
    } catch {
      missing.push("DESKTOP_LICENSE_SIGNING_KEY (invalid)");
    }
  }
  return missing;
}

function context(): LicenseContext | null {
  const base = process.env.POLAR_API_BASE;
  const organizationId = process.env.POLAR_ORGANIZATION_ID;
  const token = process.env.POLAR_ACCESS_TOKEN;
  const proBenefitId = process.env.DESKTOP_LICENSE_PRO_BENEFIT_ID;
  const mspBenefitId = process.env.DESKTOP_LICENSE_MSP_BENEFIT_ID;
  const signing = process.env.DESKTOP_LICENSE_SIGNING_KEY;
  if (
    !base ||
    !organizationId ||
    !token ||
    !proBenefitId ||
    !mspBenefitId ||
    !signing
  )
    return null;
  return {
    polar: createPolarClient({
      base: new URL(base).origin,
      organizationId,
      token,
    }),
    signingKey: loadSigningKey(signing),
    proBenefitId,
    mspBenefitId,
    tenantLicenses: tenantLicenseStore(),
  };
}

// Best-effort per-IP limiter. It lives in one server instance's memory, so
// serverless instances each count separately and a restart resets it; the
// Vercel firewall is the place for a hard limit.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const hits = new Map<string, { count: number; reset: number }>();

// Vercel overwrites X-Real-IP and X-Vercel-Forwarded-For with the connecting
// client's address (X-Real-IP is what ipAddress() in @vercel/functions reads),
// so a caller cannot choose its bucket there. The first X-Forwarded-For entry
// is the fallback for other proxies that set it.
export function clientIp(request: Request): string | null {
  const first = (name: string) =>
    request.headers.get(name)?.split(",")[0]?.trim() || null;
  return (
    first("x-real-ip") ??
    first("x-vercel-forwarded-for") ??
    first("x-forwarded-for")
  );
}

function limited(request: Request): boolean {
  const ip = clientIp(request);
  // Without an address (no proxy in front, as in local development) there is
  // nothing to key on. One shared bucket would let a single caller lock out
  // every other one, so such requests are not limited here.
  if (!ip) return false;
  const now = Date.now();
  if (hits.size > 10000) {
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry || entry.reset <= now) {
    hits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

// Bound the streamed body too, rather than trusting Content-Length.
async function readBounded(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function resetRateLimit() {
  hits.clear();
}

export function licenseHandler<T extends z.ZodTypeAny>(
  schema: T,
  run: (ctx: LicenseContext, input: z.infer<T>) => Promise<object>,
  options: { maxBytes?: number } = {},
) {
  return async (request: Request): Promise<Response> => {
    if (limited(request))
      return reply(
        { error: "Too many requests.", reason: "rate_limited" },
        429,
      );
    let ctx: LicenseContext | null;
    try {
      ctx = context();
    } catch (error) {
      console.error("desktop-license: invalid configuration", error);
      ctx = null;
    }
    if (!ctx)
      return reply(
        { error: "Licensing is not available.", reason: "unavailable" },
        503,
      );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return reply(
        { error: "Expected a JSON request.", reason: "bad_request" },
        415,
      );
    let input: unknown;
    try {
      const text = await readBounded(request, options.maxBytes ?? 4096);
      if (text === null)
        return reply(
          { error: "Request too large.", reason: "bad_request" },
          413,
        );
      input = JSON.parse(text);
    } catch {
      return reply({ error: "Invalid request.", reason: "bad_request" }, 400);
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success)
      return reply({ error: "Invalid request.", reason: "bad_request" }, 400);
    try {
      return reply(await run(ctx, parsed.data));
    } catch (error) {
      if (error instanceof LicenseUnauthorized)
        return reply(
          {
            error: "The Microsoft sign-in could not be verified.",
            reason: "invalid_token",
          },
          401,
        );
      if (error instanceof LicenseDenied)
        return reply(
          { error: "The license was not accepted.", reason: error.reason },
          403,
        );
      if (error instanceof LicenseUnavailable)
        return reply(
          {
            error: "The license could not be checked. Please try again later.",
            reason: error.reason,
          },
          503,
        );
      if (error instanceof PolarUnavailable)
        console.warn(`desktop-license: ${error.message}`);
      else console.error("desktop-license: unexpected failure", error);
      return reply(
        {
          error: "The licensing service is temporarily unavailable.",
          reason: "upstream",
        },
        502,
      );
    }
  };
}

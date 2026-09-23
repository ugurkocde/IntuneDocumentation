import { z } from "zod";
import { createPolarClient, PolarUnavailable } from "./polar";
import { LicenseDenied, type LicenseContext } from "./service";
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
  };
}

// Best-effort per-IP limiter. It lives in one server instance's memory, so
// serverless instances each count separately and a restart resets it; the
// Vercel firewall is the place for a hard limit. The client IP comes from the
// proxy's X-Forwarded-For, which is only trustworthy behind a proxy that sets it.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const hits = new Map<string, { count: number; reset: number }>();

function limited(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
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
      const text = await readBounded(request, 4096);
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
      if (error instanceof LicenseDenied)
        return reply(
          { error: "The license was not accepted.", reason: error.reason },
          403,
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

import { createPublicKey, type KeyObject } from "node:crypto";
import { cisInternalAllowed } from "~/lib/desktop-license/cis-claim";
import {
  loadSigningKey,
  verifyEntitlement,
  type EntitlementPayload,
} from "~/lib/desktop-license/token";

// CIS Benchmark content delivered to the desktop app from a private object
// store, never bundled. Ported from the TenuVault content service; this app
// signs its own entitlements and keeps its own delivery mode and audit stream.

export type CisDeliveryMode = "off" | "internal" | "licensed";

export interface CisObjectStore {
  download(key: string): Promise<{ text: string } | null>;
}

export interface CisAuditEvent {
  kind: "catalog" | "pack" | "list";
  benchmark?: string;
  version?: string;
  level?: number;
  tenantId: string;
  installId: string;
  licenseKeyId: string;
  mode: CisDeliveryMode;
}

export interface CisContentDeps {
  mode: CisDeliveryMode;
  publicKey: KeyObject | null;
  store: CisObjectStore | null;
  now?: () => number;
  // Every served download must be auditable. When no sink is configured, or
  // it fails, delivery fails closed and no content leaves the server.
  audit: ((event: CisAuditEvent) => void | Promise<void>) | null;
}

const MAX_CATALOG_BYTES = 1_000_000;
const MAX_PACK_BYTES = 16_000_000;
const MAX_LIST_BYTES = 8_000_000;
const BENCHMARK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const MAX_BENCHMARK_ID_LENGTH = 100;
const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CATALOG_KEY = "catalog.json";

// DESKTOP_CIS_DELIVERY_MODE takes the exact strings off, internal or licensed,
// as src/env.js validates them: no trimming and no case folding, so the
// server never runs in a mode the environment check would refuse. Anything
// else, and no value, is off.
export function parseDeliveryMode(value: string | undefined): CisDeliveryMode {
  return value === "internal" || value === "licensed" ? value : "off";
}

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

// Fixed messages only: no stack, storage error or entitlement value is ever
// echoed back.
function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: HEADERS,
  });
}

const unavailable = () =>
  errorResponse(503, "CIS benchmark delivery is not available.");

// A valid entitlement proves the Polar-backed grant at the time the token
// was issued, not now: a grant revoked since then stays usable until the
// token expires. Licensed mode therefore needs a live grant check or a
// shorter token lifetime before it is enabled. Every token binds tenant,
// installation and activation. CIS delivery additionally
// requires those bindings to be real identifiers, a Pro or MSP plan and a
// granted status. In internal mode the token must carry the server-issued
// internal claim and its license key and installation must still be on both
// allowlists now, so removing an entry revokes access on the next request.
function authorize(
  request: Request,
  deps: CisContentDeps,
  publicKey: KeyObject,
): EntitlementPayload | Response {
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : "";
  if (!bearer)
    return errorResponse(401, "A current license entitlement is required.");
  const payload = verifyEntitlement(bearer, publicKey);
  if (!payload) return errorResponse(401, "The entitlement is not valid.");
  const nowSeconds = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds)
    return errorResponse(401, "The entitlement has expired.");
  if (
    typeof payload.sub !== "string" ||
    typeof payload.act !== "string" ||
    typeof payload.tenantId !== "string" ||
    typeof payload.installId !== "string" ||
    !payload.sub.trim() ||
    !payload.act.trim() ||
    !GUID_PATTERN.test(payload.tenantId) ||
    !GUID_PATTERN.test(payload.installId) ||
    (payload.plan !== "pro" && payload.plan !== "msp") ||
    payload.status !== "granted"
  )
    return errorResponse(
      403,
      "This entitlement does not include CIS benchmarks.",
    );
  if (
    deps.mode === "internal" &&
    (payload.cis !== "internal" || !cisInternalAllowed(payload))
  )
    return errorResponse(
      403,
      "CIS benchmarks are not available on this installation.",
    );
  return payload;
}

// The order is fixed: delivery off answers 503 before anything else, an
// invalid identity never reaches authorization or storage, missing
// configuration (key, store or audit sink) is 503 whatever token is sent, and
// the audit line is written before any content is released.
async function serveObject(
  request: Request,
  deps: CisContentDeps,
  key: string | null,
  maxBytes: number,
  auditEvent: (payload: EntitlementPayload) => CisAuditEvent,
): Promise<Response> {
  if (deps.mode === "off") return unavailable();
  if (!key)
    return errorResponse(400, "The benchmark content identity is invalid.");
  const { publicKey, store, audit } = deps;
  if (!publicKey || !store || !audit) return unavailable();
  const authorized = authorize(request, deps, publicKey);
  if (authorized instanceof Response) return authorized;
  let object: { text: string } | null;
  try {
    object = await store.download(key);
  } catch {
    return errorResponse(502, "CIS benchmark content could not be loaded.");
  }
  if (!object)
    return errorResponse(
      404,
      "The requested CIS benchmark content is not published.",
    );
  if (Buffer.byteLength(object.text, "utf8") > maxBytes)
    return errorResponse(502, "CIS benchmark content is unavailable.");
  try {
    await audit(auditEvent(authorized));
  } catch {
    return unavailable();
  }
  return new Response(object.text, { status: 200, headers: HEADERS });
}

const identity = (payload: EntitlementPayload, mode: CisDeliveryMode) => ({
  tenantId: payload.tenantId,
  installId: payload.installId,
  licenseKeyId: payload.sub,
  mode,
});

export async function cisCatalogResponse(
  request: Request,
  deps: CisContentDeps,
): Promise<Response> {
  return serveObject(
    request,
    deps,
    CATALOG_KEY,
    MAX_CATALOG_BYTES,
    (payload) => ({
      kind: "catalog",
      ...identity(payload, deps.mode),
    }),
  );
}

function validBenchmark(benchmark: string, version: string): boolean {
  return (
    BENCHMARK_ID_PATTERN.test(benchmark) &&
    benchmark.length <= MAX_BENCHMARK_ID_LENGTH &&
    VERSION_PATTERN.test(version)
  );
}

export function packObjectKey(params: {
  benchmark: string;
  version: string;
  level: string;
}): string | null {
  if (
    !validBenchmark(params.benchmark, params.version) ||
    (params.level !== "1" && params.level !== "2")
  )
    return null;
  return `packs/${params.benchmark}/${params.version}/${params.level}.json`;
}

export function listObjectKey(params: {
  benchmark: string;
  version: string;
}): string | null {
  if (!validBenchmark(params.benchmark, params.version)) return null;
  return `lists/${params.benchmark}/${params.version}.json`;
}

export async function cisPackResponse(
  request: Request,
  params: { benchmark: string; version: string; level: string },
  deps: CisContentDeps,
): Promise<Response> {
  return serveObject(
    request,
    deps,
    packObjectKey(params),
    MAX_PACK_BYTES,
    (payload) => ({
      kind: "pack",
      benchmark: params.benchmark,
      version: params.version,
      level: Number(params.level),
      ...identity(payload, deps.mode),
    }),
  );
}

// The recommendation list of the full benchmark, the denominator the desktop
// needs to state coverage of the whole benchmark.
export async function cisListResponse(
  request: Request,
  params: { benchmark: string; version: string },
  deps: CisContentDeps,
): Promise<Response> {
  return serveObject(
    request,
    deps,
    listObjectKey(params),
    MAX_LIST_BYTES,
    (payload) => ({
      kind: "list",
      benchmark: params.benchmark,
      version: params.version,
      ...identity(payload, deps.mode),
    }),
  );
}

interface AuditStream {
  write(chunk: string, callback: (error?: Error | null) => void): boolean;
}

export interface AuditAckWindow {
  // How long an accepted write waits for its callback before counting as acknowledged.
  acceptedGraceMs: number;
  // How long a write under backpressure waits for its callback before failing closed.
  backpressureTimeoutMs: number;
}

const DEFAULT_AUDIT_ACK_WINDOW: AuditAckWindow = {
  acceptedGraceMs: 250,
  backpressureTimeoutMs: 2_000,
};

// The production audit sink writes one structured line per download to
// stdout, which the host log drain collects. Unlike console.info, which
// ignores stream errors, a write error reported through the callback rejects,
// and delivery then fails closed instead of serving unaudited content. The
// callback is not a reliable acknowledgement on its own: the Vercel runtime
// wraps stdout for log capture and never invokes it. Every write therefore
// waits a bounded time for its callback. An error within that window fails
// closed. A write the stream accepted (any return other than false) that stays
// silent counts as acknowledged once the short grace period ends; a write
// under backpressure (false) that stays silent fails closed. An error reported
// after the window cannot be observed without hanging, so the window bounds
// what fail closed covers.
export function stdoutAuditSink(
  stream: AuditStream = process.stdout,
  window: AuditAckWindow = DEFAULT_AUDIT_ACK_WINDOW,
): (event: CisAuditEvent) => Promise<void> {
  return (event) =>
    new Promise<void>((resolve, reject) => {
      // The callback can run synchronously, before the timer exists.
      const state: {
        settled: boolean;
        timer?: ReturnType<typeof setTimeout>;
      } = { settled: false };
      const settle = (error?: Error | null) => {
        if (state.settled) return;
        state.settled = true;
        if (state.timer) clearTimeout(state.timer);
        if (error) reject(error);
        else resolve();
      };
      let accepted: boolean;
      try {
        accepted = stream.write(
          `${JSON.stringify({ event: "cis_content_download", ...event })}\n`,
          (error) => settle(error),
        );
      } catch (error) {
        settle(
          error instanceof Error ? error : new Error("audit write failed"),
        );
        return;
      }
      if (state.settled) return;
      state.timer =
        accepted !== false
          ? setTimeout(() => settle(), window.acceptedGraceMs)
          : setTimeout(
              () => settle(new Error("audit write was not acknowledged")),
              window.backpressureTimeoutMs,
            );
    });
}

// Read per request, so a mode or allowlist change applies to the next
// download. The entitlement public key is derived from the existing license
// signing key, so delivery needs no key material beyond what the license
// service already holds. Storage is loaded lazily to keep route imports light.
export async function defaultCisDeps(): Promise<CisContentDeps> {
  const mode = parseDeliveryMode(process.env.DESKTOP_CIS_DELIVERY_MODE);
  if (mode === "off")
    return { mode, publicKey: null, store: null, audit: null };
  let publicKey: KeyObject | null = null;
  try {
    const signing = process.env.DESKTOP_LICENSE_SIGNING_KEY;
    if (signing) publicKey = createPublicKey(loadSigningKey(signing));
  } catch {
    publicKey = null;
  }
  let store: CisObjectStore | null = null;
  try {
    const { defaultCisStore } = await import("./storage");
    store = defaultCisStore();
  } catch {
    store = null;
  }
  return { mode, publicKey, store, audit: stdoutAuditSink() };
}

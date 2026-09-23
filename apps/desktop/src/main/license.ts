import { app, safeStorage } from "electron";
import { createPublicKey, randomUUID, verify } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LICENSE_API_BASE, LICENSE_PUBLIC_KEY } from "./config";
import { log } from "./logger";

interface Entitlement {
  v: 1;
  sub: string;
  act: string;
  plan: "pro" | "msp";
  tenantId: string;
  installId: string;
  tenants: number;
  status: "granted";
  iat: number;
  exp: number;
}

// One activation per signed-in tenant, keyed by lowercase tenant id. seen is
// the latest wall clock time (ms) the app has observed.
interface StoredLicense {
  key: string;
  activations: Record<string, { activationId: string; token: string }>;
  seen?: number;
}

export interface LicenseStatus {
  hasKey: boolean;
  keyHint: string | null;
  persisted: boolean;
  tenantId: string | null;
  entitled: boolean;
  plan: "pro" | "msp" | null;
  tenants: number | null;
  expiresAt: string | null;
  message: string | null;
  // The last call to the licensing service failed to reach it.
  offline: boolean;
  // A tenant with a still valid cached activation, reported while no tenant
  // is signed in.
  cachedTenantId: string | null;
}

// The licensing service refused (HTTP 403). Anything else, including 5xx and
// network errors, is treated as "unreachable" and never drops a cached token.
class LicenseDenied extends Error {}

const REASONS: Record<string, string> = {
  invalid_key: "This license key is not valid for Intune Documentation.",
  not_found:
    "This license key is not valid, or it has been revoked or has expired. Check your subscription in the customer portal.",
  revoked: "This license has been revoked. Check your subscription.",
  disabled: "This license key has been disabled.",
  expired: "This license key has expired.",
  tenant_limit:
    "This license already covers its maximum number of tenants. Upgrade or deactivate a tenant in the customer portal.",
  install_limit:
    "This tenant already has 5 active installations. Deactivate one in the app or the customer portal.",
  activation_limit:
    "This license has no activations left. Deactivate an installation in the customer portal.",
  activation_mismatch:
    "This installation is no longer activated. It will activate again on the next collection or export.",
};

// How far the clock may move back (an NTP correction, a restored VM snapshot,
// a time zone or RTC mix-up) before cached tokens stop counting offline. A
// larger rollback could otherwise keep an expired token alive indefinitely;
// this bounds that to two days past expiry.
export const CLOCK_TOLERANCE_MS = 48 * 60 * 60_000;
// The high-water mark is written at most this often outside other saves.
const SEEN_PERSIST_MS = 60 * 60_000;

// Time and status checks for a token whose signature already verified.
export function entitlementCurrent(
  payload: Pick<Entitlement, "exp" | "status">,
  now: number,
  seen: number,
): boolean {
  return (
    payload.status === "granted" &&
    Number.isFinite(payload.exp) &&
    payload.exp * 1000 > now &&
    seen - now <= CLOCK_TOLERANCE_MS
  );
}

const publicKey = createPublicKey(LICENSE_PUBLIC_KEY);
const guidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function userDataFile(name: string): string {
  return path.join(app.getPath("userData"), name);
}

function decodeToken(token: string): Entitlement | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  try {
    if (
      !verify(
        null,
        Buffer.from(body),
        publicKey,
        Buffer.from(signature, "base64url"),
      )
    ) {
      return null;
    }
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Entitlement;
    return payload.v === 1 ? payload : null;
  } catch {
    return null;
  }
}

export class LicenseService {
  private state: StoredLicense | null = null;
  private installId = "";
  private message: string | null = null;
  private offline = false;
  private loaded: Promise<void> | null = null;
  private savedSeen = 0;

  load(): Promise<void> {
    this.loaded ??= this.read();
    return this.loaded;
  }

  private async read(): Promise<void> {
    const idFile = userDataFile("install-id");
    const stored = await fs.readFile(idFile, "utf8").catch(() => "");
    if (guidPattern.test(stored.trim())) {
      this.installId = stored.trim();
    } else {
      this.installId = randomUUID();
      await fs
        .writeFile(idFile, this.installId, { mode: 0o600 })
        .catch(() => undefined);
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return;
    }
    let raw: Buffer;
    try {
      raw = await fs.readFile(userDataFile("license.bin"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log("warn", "stored license ignored", {
          reason: "unreadable",
          code: (error as NodeJS.ErrnoException).code,
        });
      }
      return;
    }
    // Only the reason is logged, never the content.
    let text: string;
    try {
      text = safeStorage.decryptString(raw);
    } catch {
      log("warn", "stored license ignored", { reason: "decrypt_failed" });
      return;
    }
    try {
      const parsed = JSON.parse(text) as Partial<StoredLicense> | null;
      if (
        parsed &&
        typeof parsed.key === "string" &&
        typeof parsed.activations === "object" &&
        parsed.activations !== null
      ) {
        this.state = parsed as StoredLicense;
        if (!Number.isFinite(this.state.seen)) delete this.state.seen;
        this.savedSeen = this.state.seen ?? 0;
        return;
      }
      log("warn", "stored license ignored", { reason: "invalid_format" });
    } catch {
      log("warn", "stored license ignored", { reason: "invalid_json" });
    }
  }

  // Refuses to write the key in plaintext: without OS encryption the license
  // lives in memory only and must be entered again after a restart.
  private async save(): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) return;
    const file = userDataFile("license.bin");
    if (!this.state) {
      await fs.rm(file, { force: true });
      return;
    }
    await fs.writeFile(
      file,
      safeStorage.encryptString(JSON.stringify(this.state)),
      { mode: 0o600 },
    );
    this.savedSeen = this.state.seen ?? 0;
  }

  // Advances the high-water mark of observed time and returns the current
  // time.
  private observe(): number {
    const now = Date.now();
    if (this.state && now > (this.state.seen ?? 0)) this.state.seen = now;
    return now;
  }

  // Persists the mark now and then, so a restart with a clock set back
  // still sees it. Failures only cost precision.
  private async keepSeen(): Promise<void> {
    const seen = this.state?.seen ?? 0;
    if (seen - this.savedSeen < SEEN_PERSIST_MS) return;
    await this.save().catch(() => undefined);
  }

  private valid(tenantId: string | null): Entitlement | null {
    if (!tenantId || !this.state) return null;
    const entry = this.state.activations[tenantId.toLowerCase()];
    if (!entry) return null;
    const payload = decodeToken(entry.token);
    const now = this.observe();
    if (
      !payload ||
      !entitlementCurrent(payload, now, this.state.seen ?? now) ||
      payload.tenantId !== tenantId.toLowerCase() ||
      payload.installId !== this.installId ||
      payload.act !== entry.activationId
    ) {
      return null;
    }
    return payload;
  }

  private async call(
    action: "activate" | "refresh" | "deactivate",
    body: object,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetch(
        `${LICENSE_API_BASE}/api/desktop-license/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        },
      );
    } catch {
      this.offline = true;
      log("warn", "license service unreachable", { action });
      throw new Error("The licensing service could not be reached.");
    }
    // Like a network failure, any refusal other than 403 means the service
    // could not answer the request.
    this.offline = !response.ok && response.status !== 403;
    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const reasonCode =
      typeof data.reason === "string" ? data.reason.slice(0, 40) : undefined;
    log(response.ok ? "info" : "warn", "license call", {
      action,
      status: response.status,
      reason: reasonCode,
    });
    if (response.status === 403) {
      const reason = reasonCode ?? "";
      throw new LicenseDenied(
        REASONS[reason] ?? "The license was not accepted.",
      );
    }
    if (!response.ok) {
      throw new Error(
        "The licensing service is unavailable. Please try again later.",
      );
    }
    return data;
  }

  private async store(
    tenantId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (
      !this.state ||
      typeof data.token !== "string" ||
      typeof data.activationId !== "string"
    ) {
      throw new Error("The licensing service returned an invalid response.");
    }
    // Verify the new token before it replaces the cached one: a response that
    // fails verification must not cost a still valid activation. A mark
    // ahead of both the clock and the server's issue time came from a clock
    // that once ran ahead, so it comes down to the later of the two.
    const previous = this.state.activations[tenantId];
    const previousSeen = this.state.seen;
    const issued = (decodeToken(data.token)?.iat ?? NaN) * 1000;
    const now = Date.now();
    this.state.seen = Math.min(
      previousSeen ?? now,
      Number.isFinite(issued) ? Math.max(now, issued) : now,
    );
    this.state.activations[tenantId] = {
      activationId: data.activationId,
      token: data.token,
    };
    if (!this.valid(tenantId)) {
      if (previous) this.state.activations[tenantId] = previous;
      else delete this.state.activations[tenantId];
      this.state.seen = previousSeen;
      throw new Error("The license token could not be verified.");
    }
    this.message = null;
    await this.save();
  }

  private async activate(tenantId: string): Promise<void> {
    if (!this.state) throw new Error("Enter a license key first.");
    const data = await this.call("activate", {
      key: this.state.key,
      installId: this.installId,
      tenantId,
      os: process.platform,
      appVersion: app.getVersion(),
    });
    await this.store(tenantId, data);
  }

  private async refresh(tenantId: string): Promise<void> {
    const entry = this.state?.activations[tenantId];
    if (!this.state || !entry) return;
    try {
      const data = await this.call("refresh", {
        key: this.state.key,
        activationId: entry.activationId,
        installId: this.installId,
        tenantId,
      });
      await this.store(tenantId, data);
    } catch (error) {
      if (error instanceof LicenseDenied) {
        delete this.state.activations[tenantId];
        await this.save();
      }
      this.message = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  // Refresh every cached activation. Network failures keep the cached token
  // until it expires; a confirmed refusal drops it.
  async refreshAll(): Promise<void> {
    await this.load();
    for (const tenantId of Object.keys(this.state?.activations ?? {})) {
      await this.refresh(tenantId).catch(() => undefined);
    }
  }

  async setKey(key: string, tenantId: string | null): Promise<LicenseStatus> {
    await this.load();
    const trimmed = key.trim();
    if (!/^[\x21-\x7e]{8,128}$/.test(trimmed)) {
      throw new Error("Enter a valid license key.");
    }
    const previous = this.state;
    if (
      previous &&
      previous.key !== trimmed &&
      Object.keys(previous.activations).length > 0
    ) {
      throw new Error(
        "Deactivate this machine before entering a different license key.",
      );
    }
    this.state = {
      key: trimmed,
      activations: previous?.key === trimmed ? previous.activations : {},
      ...(previous?.seen !== undefined ? { seen: previous.seen } : {}),
    };
    if (tenantId) {
      try {
        await this.activate(tenantId.toLowerCase());
      } catch (error) {
        this.state = previous;
        throw error;
      }
    } else {
      this.message = "Sign in to activate the license for your tenant.";
      await this.save();
    }
    return this.status(tenantId);
  }

  // Called by the privileged IPC handlers. Activates on first use for a
  // tenant and refreshes an expired token when the service is reachable.
  async requireEntitlement(tenantId: string | null): Promise<void> {
    await this.load();
    if (!tenantId) throw new Error("Sign in before continuing.");
    if (this.valid(tenantId)) {
      await this.keepSeen();
      return;
    }
    if (!this.state) {
      throw new Error(
        "A license is required to collect and export. Add your license key under License and account.",
      );
    }
    const tenant = tenantId.toLowerCase();
    try {
      if (this.state.activations[tenant]) {
        // A refused refresh drops the activation (for example after it was
        // released in the customer portal); try one fresh activation.
        await this.refresh(tenant).catch((error: unknown) => {
          if (!(error instanceof LicenseDenied)) throw error;
          return this.activate(tenant);
        });
      } else {
        await this.activate(tenant);
      }
    } catch (error) {
      this.message = error instanceof Error ? error.message : String(error);
      throw error;
    }
    if (!this.valid(tenantId)) {
      throw new Error("The license is not valid for this tenant.");
    }
  }

  // Best effort activation after sign-in so the panel reflects the tenant.
  async activateForTenant(tenantId: string | null): Promise<void> {
    if (!tenantId) return;
    await this.requireEntitlement(tenantId).catch(() => undefined);
  }

  async deactivate(): Promise<LicenseStatus> {
    await this.load();
    if (!this.state) return this.status(null);
    let failure: unknown = null;
    for (const [tenantId, entry] of Object.entries(this.state.activations)) {
      try {
        await this.call("deactivate", {
          key: this.state.key,
          activationId: entry.activationId,
        });
        delete this.state.activations[tenantId];
      } catch (error) {
        if (error instanceof LicenseDenied) {
          delete this.state.activations[tenantId];
        } else {
          failure = error;
        }
      }
    }
    if (failure) {
      await this.save();
      throw failure;
    }
    this.state = null;
    this.message = null;
    await this.save();
    return this.status(null);
  }

  async status(tenantId: string | null): Promise<LicenseStatus> {
    await this.load();
    const payload = this.valid(tenantId);
    const cachedTenantId = tenantId
      ? null
      : (Object.keys(this.state?.activations ?? {}).find((tenant) =>
          this.valid(tenant),
        ) ?? null);
    await this.keepSeen();
    return {
      hasKey: this.state !== null,
      keyHint: this.state ? `****${this.state.key.slice(-4)}` : null,
      persisted: safeStorage.isEncryptionAvailable(),
      tenantId,
      entitled: payload !== null,
      plan: payload?.plan ?? null,
      tenants: payload?.tenants ?? null,
      expiresAt: payload ? new Date(payload.exp * 1000).toISOString() : null,
      message: this.message,
      offline: this.offline,
      cachedTenantId,
    };
  }
}

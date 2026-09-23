import { app, safeStorage } from "electron";
import { createPublicKey, randomUUID, verify } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { LICENSE_API_BASE, LICENSE_PUBLIC_KEY } from "./config";
import { log } from "./logger";
import type { LicenseStatus } from "../shared/ipc-types";

export type { LicenseStatus };

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

// An activation either comes from this machine's license key, or, with
// source "tenant", from the organization license the key holder shared with
// the tenant; those are checked with a Microsoft ID token and the key never
// reaches this machine.
interface StoredActivation {
  activationId: string;
  token: string;
  source?: "tenant";
  // Key activations: whether the service last confirmed the license as
  // shared with the tenant's other admins.
  shared?: boolean;
  // Key activations: the service could not share the license because the
  // request lacked a fresh sign-in to the tenant.
  shareNeedsSignIn?: true;
  // Tenant activations: the masked key, for display.
  displayKey?: string;
  // Tenant activations: the Polar id of that key (never the key itself), so
  // the activation can be released after the tenant stops sharing it.
  licenseKeyId?: string;
}

// One activation per signed-in tenant, keyed by lowercase tenant id. seen is
// the latest wall clock time (ms) the app has observed.
interface StoredLicense {
  key?: string;
  activations: Record<string, StoredActivation>;
  seen?: number;
}

// A recent Microsoft ID token for the tenant, or null when the tenant is not
// signed in or no token can be had silently.
export type IdTokenProvider = (tenantId: string) => Promise<string | null>;
// The app registration client ID the tenant is signed in with, or null when
// the tenant is not signed in. The service pins organization licenses to it.
export type ClientIdProvider = (tenantId: string) => string | null;

// The licensing service refused (HTTP 403). Anything else, including 5xx and
// network errors, is treated as "unreachable" and never drops a cached token.
class LicenseDenied extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
  }
}

const LICENSE_REQUIRED =
  "A license is required to collect and export. Add your license key under License and account.";

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
  tenant_not_licensed: "Your organization has no license for this tenant.",
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

  constructor(
    private readonly idToken: IdTokenProvider = async () => null,
    private readonly clientId: ClientIdProvider = () => null,
  ) {}

  // The proof of the tenant the service needs to share the license with it:
  // the app registration and a fresh sign-in to it. Not needed to stop
  // sharing. Without it the service still licenses this machine but leaves
  // the sharing unchanged.
  private async sharingFields(
    tenantId: string,
    share?: boolean,
  ): Promise<{ clientId?: string; idToken?: string }> {
    const clientId = this.clientId(tenantId)?.toLowerCase();
    if (share === false || !clientId || !guidPattern.test(clientId)) return {};
    const idToken = await this.idToken(tenantId);
    return idToken ? { clientId, idToken } : { clientId };
  }

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
        (parsed.key === undefined || typeof parsed.key === "string") &&
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
    action: "activate" | "refresh" | "deactivate" | "tenant",
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
    // Like a network failure, any refusal other than 403 and 401 means the
    // service could not answer the request.
    this.offline =
      !response.ok && response.status !== 403 && response.status !== 401;
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
        reason,
      );
    }
    // The organization license route could not verify the Microsoft sign-in.
    if (response.status === 401) {
      throw new Error(
        "Your Microsoft sign-in could not be verified by the licensing service. Sign in again and retry.",
      );
    }
    if (!response.ok) {
      throw new Error(
        reasonCode === "tenant_quantity_unknown"
          ? "The tenant quantity of this subscription could not be read. Please try again later or contact support."
          : "The licensing service is unavailable. Please try again later.",
      );
    }
    return data;
  }

  private async store(
    tenantId: string,
    data: Record<string, unknown>,
    source: "key" | "tenant",
  ): Promise<void> {
    if (
      typeof data.token !== "string" ||
      typeof data.activationId !== "string"
    ) {
      throw new Error("The licensing service returned an invalid response.");
    }
    const hadState = this.state !== null;
    this.state ??= { activations: {} };
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
    // shared is left out of a response when the service could not update
    // it, and is false without sharing being changed when the request lacked
    // a sign-in; either way the last confirmed value stands.
    const shareNeedsSignIn = data.sharedReason === "sign_in_required";
    const shared =
      typeof data.shared === "boolean" && !shareNeedsSignIn
        ? data.shared
        : previous?.source === undefined
          ? previous?.shared
          : undefined;
    this.state.activations[tenantId] = {
      activationId: data.activationId,
      token: data.token,
      ...(source === "tenant"
        ? {
            source,
            ...(typeof data.displayKey === "string"
              ? { displayKey: data.displayKey.slice(0, 20) }
              : {}),
            ...(typeof data.licenseKeyId === "string" &&
            guidPattern.test(data.licenseKeyId)
              ? { licenseKeyId: data.licenseKeyId }
              : {}),
          }
        : {
            ...(shared !== undefined ? { shared } : {}),
            ...(shareNeedsSignIn ? { shareNeedsSignIn: true as const } : {}),
          }),
    };
    if (!this.valid(tenantId)) {
      if (!hadState) this.state = null;
      else {
        if (previous) this.state.activations[tenantId] = previous;
        else delete this.state.activations[tenantId];
        this.state.seen = previousSeen;
      }
      throw new Error("The license token could not be verified.");
    }
    this.message = null;
    await this.save();
  }

  private async activate(tenantId: string): Promise<void> {
    if (!this.state?.key) throw new Error("Enter a license key first.");
    const data = await this.call("activate", {
      key: this.state.key,
      installId: this.installId,
      tenantId,
      os: process.platform,
      appVersion: app.getVersion(),
      ...(await this.sharingFields(tenantId)),
    });
    await this.store(tenantId, data, "key");
  }

  // A request to the organization license route. Throws when no ID token for
  // the tenant can be had silently.
  private async tenantCall(
    tenantId: string,
    action: "activate" | "refresh" | "deactivate",
    entry?: StoredActivation,
    token?: string,
  ): Promise<Record<string, unknown>> {
    const idToken = token ?? (await this.idToken(tenantId));
    if (!idToken) {
      throw new Error(
        "Sign in to this tenant again to check your organization's license.",
      );
    }
    return this.call("tenant", {
      idToken,
      installId: this.installId,
      os: process.platform,
      appVersion: app.getVersion(),
      action,
      ...(entry ? { activationId: entry.activationId } : {}),
      ...(entry?.licenseKeyId ? { licenseKeyId: entry.licenseKeyId } : {}),
    });
  }

  private async activateTenant(tenantId: string): Promise<void> {
    await this.store(
      tenantId,
      await this.tenantCall(tenantId, "activate"),
      "tenant",
    );
  }

  // Activates with this machine's key, and falls back to the tenant's
  // organization license when there is no key or the key is refused for this
  // tenant. A tenant without an organization license reports the key's
  // refusal, or that a license is needed.
  private async activateAny(tenantId: string): Promise<void> {
    if (!this.state?.key) {
      await this.activateTenant(tenantId);
      return;
    }
    try {
      await this.activate(tenantId);
    } catch (keyError) {
      if (!(keyError instanceof LicenseDenied)) throw keyError;
      await this.activateTenant(tenantId).catch((error: unknown) => {
        throw error instanceof LicenseDenied &&
          error.reason === "tenant_not_licensed"
          ? keyError
          : error;
      });
    }
  }

  // share, for a key activation, asks the service to share the license with
  // the tenant or stop; otherwise the last confirmed choice is sent again, or
  // nothing so the service applies the plan's default. A tenant activation
  // without an ID token keeps its cached token until it expires.
  private async refresh(tenantId: string, share?: boolean): Promise<void> {
    const entry = this.state?.activations[tenantId];
    if (!this.state || !entry) return;
    try {
      if (entry.source === "tenant") {
        const idToken = await this.idToken(tenantId);
        if (!idToken) return;
        const data = await this.tenantCall(tenantId, "refresh", entry, idToken);
        await this.store(tenantId, data, "tenant");
        return;
      }
      if (!this.state.key) throw new Error("Enter a license key first.");
      const shareWithTenant = share ?? entry.shared;
      const data = await this.call("refresh", {
        key: this.state.key,
        activationId: entry.activationId,
        installId: this.installId,
        tenantId,
        ...(await this.sharingFields(tenantId, shareWithTenant)),
        ...(shareWithTenant === undefined ? {} : { shareWithTenant }),
      });
      await this.store(tenantId, data, "key");
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

  // The key holder lets the tenant's other admins use the license, or stops.
  async setShared(
    tenantId: string | null,
    share: boolean,
  ): Promise<LicenseStatus> {
    await this.load();
    const tenant = tenantId?.toLowerCase() ?? "";
    const entry = this.state?.activations[tenant];
    if (!this.state?.key || !entry || entry.source === "tenant") {
      throw new Error(
        "Only the machine that holds the license key can change sharing.",
      );
    }
    await this.refresh(tenant, share);
    if (share && this.state?.activations[tenant]?.shareNeedsSignIn) {
      throw new Error("Sign in again to share the license with this tenant.");
    }
    if (this.state?.activations[tenant]?.shared !== share) {
      throw new Error(
        "The sharing setting could not be saved. Please try again later.",
      );
    }
    return this.status(tenantId);
  }

  async setKey(key: string, tenantId: string | null): Promise<LicenseStatus> {
    await this.load();
    const trimmed = key.trim();
    if (!/^[\x21-\x7e]{8,128}$/.test(trimmed)) {
      throw new Error("Enter a valid license key.");
    }
    const previous = this.state;
    // Organization license activations do not depend on the key and stay.
    if (
      previous?.key &&
      previous.key !== trimmed &&
      Object.values(previous.activations).some((entry) => !entry.source)
    ) {
      throw new Error(
        "Deactivate this machine before entering a different license key.",
      );
    }
    this.state = {
      key: trimmed,
      activations: { ...previous?.activations },
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
    const tenant = tenantId.toLowerCase();
    try {
      if (this.state?.activations[tenant]) {
        // A refused refresh drops the activation (for example after it was
        // released in the customer portal); try one fresh activation.
        await this.refresh(tenant).catch((error: unknown) => {
          if (!(error instanceof LicenseDenied)) throw error;
          return this.activateAny(tenant);
        });
      } else {
        await this.activateAny(tenant);
      }
    } catch (error) {
      // Without a key and an organization license there is nothing to fix
      // but adding a key, which the panel already asks for.
      if (
        error instanceof LicenseDenied &&
        error.reason === "tenant_not_licensed"
      ) {
        this.message = null;
        throw new Error(LICENSE_REQUIRED);
      }
      this.message = error instanceof Error ? error.message : String(error);
      throw error;
    }
    if (!this.valid(tenantId)) {
      throw new Error(
        this.state?.activations[tenant]?.source === "tenant"
          ? "Sign in to this tenant again to check your organization's license."
          : "The license is not valid for this tenant.",
      );
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
        if (entry.source === "tenant") {
          await this.tenantCall(tenantId, "deactivate", entry);
        } else if (this.state.key) {
          await this.call("deactivate", {
            key: this.state.key,
            activationId: entry.activationId,
          });
        }
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
    const entry = payload
      ? this.state?.activations[tenantId!.toLowerCase()]
      : undefined;
    const source = entry ? (entry.source ?? "key") : null;
    return {
      hasKey: Boolean(this.state?.key),
      keyHint: this.state?.key ? `****${this.state.key.slice(-4)}` : null,
      source,
      shared: source === "key" ? (entry?.shared ?? null) : null,
      shareNeedsSignIn: source === "key" && Boolean(entry?.shareNeedsSignIn),
      displayKey: source === "tenant" ? (entry?.displayKey ?? null) : null,
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

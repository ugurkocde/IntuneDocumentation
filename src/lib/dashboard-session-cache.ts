import type { IntuneConfigurations } from "~/components/dashboard/types";

// This module stores configuration snapshots only in this browser tab's
// sessionStorage. Never add a server, localStorage, or IndexedDB fallback.
export const DASHBOARD_SESSION_KEY = "intune-dashboard-session:v1";
export const SNAPSHOT_FRESHNESS_MS = 30 * 60 * 1000;
export const SNAPSHOT_MAX_AGE_MS = 60 * 60 * 1000;
export const DASHBOARD_LOGOUT_CHANNEL = "intune-dashboard-logout";

export interface DashboardSessionScope {
  accountId: string;
  tenantId: string;
  includeCA: boolean;
}

export interface DashboardSessionSnapshot {
  configurations: IntuneConfigurations;
  lastFetched: string;
  groupNames: [string, string][] | null;
  caConsentStatus: "unknown" | "included" | "missing";
}

let revision = 0;
let writesEnabled = true;
let expiryTimer: ReturnType<typeof setTimeout> | undefined;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function clearDashboardSession(broadcast = true): void {
  revision++;
  writesEnabled = false;
  clearTimeout(expiryTimer);
  try {
    storage()?.removeItem(DASHBOARD_SESSION_KEY);
  } catch {
    // Sign-out must work even when browser storage is blocked.
  }
  if (broadcast && typeof window !== "undefined" && window.BroadcastChannel) {
    try {
      const channel = new window.BroadcastChannel(DASHBOARD_LOGOUT_CHANNEL);
      channel.postMessage("clear");
      channel.close();
    } catch {
      /* Logout must work even if cross-tab messaging is unavailable. */
    }
  }
}

function validExpiry(expiresAt: unknown): expiresAt is number {
  return (
    typeof expiresAt === "number" &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() &&
    expiresAt <= Date.now() + SNAPSHOT_MAX_AGE_MS
  );
}

// Expiry purges the stored snapshot, not the currently visible report. A later
// reload must collect fresh data. Browser suspension is handled on focus/resume.
export function enforceDashboardSessionExpiry(): void {
  clearTimeout(expiryTimer);
  try {
    const raw = storage()?.getItem(DASHBOARD_SESSION_KEY);
    if (!raw) return;
    const envelope = JSON.parse(raw);
    if (envelope.version !== 2 || !validExpiry(envelope.expiresAt)) {
      revision++;
      storage()?.removeItem(DASHBOARD_SESSION_KEY);
      return;
    }
    expiryTimer = setTimeout(
      enforceDashboardSessionExpiry,
      envelope.expiresAt - Date.now(),
    );
  } catch {
    try {
      storage()?.removeItem(DASHBOARD_SESSION_KEY);
    } catch {
      /* unavailable */
    }
  }
}

export function observeDashboardSession(
  onRemoteLogout: () => void,
): () => void {
  enforceDashboardSessionExpiry();
  let channel: BroadcastChannel | undefined;
  try {
    if (window.BroadcastChannel) {
      channel = new window.BroadcastChannel(DASHBOARD_LOGOUT_CHANNEL);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (event.data !== "clear") return;
        clearDashboardSession(false);
        onRemoteLogout();
      };
    }
  } catch {
    /* The expiry guard still runs if messaging is blocked. */
  }
  window.addEventListener("focus", enforceDashboardSessionExpiry);
  window.addEventListener("pageshow", enforceDashboardSessionExpiry);
  document.addEventListener("visibilitychange", enforceDashboardSessionExpiry);
  return () => {
    channel?.close();
    clearTimeout(expiryTimer);
    window.removeEventListener("focus", enforceDashboardSessionExpiry);
    window.removeEventListener("pageshow", enforceDashboardSessionExpiry);
    document.removeEventListener(
      "visibilitychange",
      enforceDashboardSessionExpiry,
    );
  };
}

function validSnapshot(value: any): value is DashboardSessionSnapshot {
  const config = value?.configurations;
  return Boolean(
    config &&
      [
        "settingsCatalog",
        "deviceConfigurations",
        "administrativeTemplates",
        "securityBaselines",
        "compliancePolicies",
        "appProtectionPolicies",
        "appConfigurations",
        "windowsUpdatePolicies",
        "enrollmentConfigurations",
        "conditionalAccessPolicies",
        "sections",
      ].every((key) => Array.isArray(config[key])) &&
      config.sections.every(
        (section: any) =>
          typeof section?.key === "string" &&
          typeof section.familyKey === "string" &&
          Array.isArray(section.items),
      ) &&
      Array.isArray(config.scripts?.windows) &&
      Array.isArray(config.scripts?.macOS) &&
      typeof config.summary?.totalConfigurations === "number" &&
      config.summary.byType &&
      typeof value.lastFetched === "string" &&
      Number.isFinite(Date.parse(value.lastFetched)) &&
      ["unknown", "included", "missing"].includes(value.caConsentStatus) &&
      (value.groupNames === null ||
        (Array.isArray(value.groupNames) &&
          value.groupNames.every(
            (entry: any) =>
              Array.isArray(entry) &&
              entry.length === 2 &&
              entry.every((part: any) => typeof part === "string"),
          ))),
  );
}

async function encode(
  json: string,
): Promise<{ encoding: string; payload: string }> {
  if (typeof CompressionStream === "undefined")
    return { encoding: "json", payload: json };
  const compressed = await new Response(
    new Blob([json]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  const bytes = new Uint8Array(compressed);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return { encoding: "gzip", payload: btoa(binary) };
}

export async function readDashboardSession(
  scope: DashboardSessionScope,
): Promise<DashboardSessionSnapshot | null> {
  writesEnabled = true;
  const readRevision = ++revision;
  const session = storage();
  if (!session) return null;
  try {
    const raw = session.getItem(DASHBOARD_SESSION_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    if (
      envelope.version !== 2 ||
      !validExpiry(envelope.expiresAt) ||
      envelope.scope?.accountId !== scope.accountId ||
      envelope.scope?.tenantId !== scope.tenantId ||
      envelope.scope?.includeCA !== scope.includeCA
    ) {
      session.removeItem(DASHBOARD_SESSION_KEY);
      return null;
    }
    let json: string;
    if (envelope.encoding === "gzip") {
      const bytes = Uint8Array.from(atob(envelope.payload), (char) =>
        char.charCodeAt(0),
      );
      json = await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
      ).text();
    } else if (
      envelope.encoding === "json" &&
      typeof envelope.payload === "string"
    ) {
      json = envelope.payload;
    } else throw new Error("Unsupported snapshot encoding");
    if (revision !== readRevision) return null;
    const snapshot: unknown = JSON.parse(json);
    if (!validSnapshot(snapshot)) throw new Error("Invalid dashboard snapshot");
    if (
      Date.parse(snapshot.lastFetched) + SNAPSHOT_MAX_AGE_MS !==
        envelope.expiresAt ||
      !validExpiry(envelope.expiresAt)
    )
      throw new Error("Expired dashboard snapshot");
    enforceDashboardSessionExpiry();
    return snapshot;
  } catch {
    if (revision === readRevision) {
      try {
        session.removeItem(DASHBOARD_SESSION_KEY);
      } catch {
        /* storage unavailable */
      }
    }
    return null;
  }
}

export async function saveDashboardSession(
  scope: DashboardSessionScope,
  snapshot: DashboardSessionSnapshot,
): Promise<"saved" | "unavailable" | "cancelled"> {
  if (!writesEnabled) return "cancelled";
  const expiresAt = Date.parse(snapshot.lastFetched) + SNAPSHOT_MAX_AGE_MS;
  if (!validExpiry(expiresAt)) {
    enforceDashboardSessionExpiry();
    return "cancelled";
  }
  const writeRevision = ++revision;
  const session = storage();
  if (!session) return "unavailable";
  try {
    // Only these explicit fields are serialized. Auth tokens never enter the cache.
    const json = JSON.stringify({
      configurations: snapshot.configurations,
      lastFetched: snapshot.lastFetched,
      groupNames: snapshot.groupNames,
      caConsentStatus: snapshot.caConsentStatus,
    });
    const encoded = await encode(json);
    if (revision !== writeRevision || !writesEnabled || !validExpiry(expiresAt))
      return "cancelled";
    session.setItem(
      DASHBOARD_SESSION_KEY,
      JSON.stringify({ version: 2, scope, expiresAt, ...encoded }),
    );
    enforceDashboardSessionExpiry();
    return "saved";
  } catch {
    if (revision !== writeRevision) return "cancelled";
    // Do not leave an older snapshot masquerading as the latest successful fetch.
    try {
      session.removeItem(DASHBOARD_SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
    return "unavailable";
  }
}

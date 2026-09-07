import type { IntuneConfigurations } from "~/components/dashboard/types";

// This module stores configuration snapshots only in this browser tab's
// sessionStorage. Never add a server, localStorage, or IndexedDB fallback.
export const DASHBOARD_SESSION_KEY = "intune-dashboard-session:v1";
export const SNAPSHOT_FRESHNESS_MS = 30 * 60 * 1000;

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

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function clearDashboardSession(): void {
  revision++;
  writesEnabled = false;
  try {
    storage()?.removeItem(DASHBOARD_SESSION_KEY);
  } catch {
    // Sign-out must work even when browser storage is blocked.
  }
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
      envelope.version !== 1 ||
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
    if (revision !== writeRevision || !writesEnabled) return "cancelled";
    session.setItem(
      DASHBOARD_SESSION_KEY,
      JSON.stringify({ version: 1, scope, ...encoded }),
    );
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

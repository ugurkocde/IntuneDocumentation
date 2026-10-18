import type {
  CapabilityEvidence,
  PolicyDeviceStatus,
  PolicyDeviceStatusRow,
  PolicyStatusSource,
} from "./types";

// The device status annex lists Intune's per-policy status counts next to the
// policies a report cites. It is context only and never an input to a status:
// a policy missing from Intune's summary is "No status reported", never zero.

/** Report source that summarises each collected policy family. */
const SOURCE_BY_FAMILY: Readonly<Record<string, PolicyStatusSource>> = {
  // The configuration policy report covers Settings Catalog, ADMX and intents.
  settingsCatalog: "configurationPolicies",
  administrativeTemplates: "configurationPolicies",
  securityBaselines: "configurationPolicies",
  compliancePolicies: "compliancePolicies",
  deviceConfigurations: "deviceConfigurations",
  windowsUpdatePolicies: "deviceConfigurations",
};

export function policyStatusSourceFor(
  familyKey: string | undefined,
): PolicyStatusSource | undefined {
  return familyKey ? SOURCE_BY_FAMILY[familyKey] : undefined;
}

export interface DeviceStatusAnnexRow {
  policyId: string;
  policyName: string;
  source: PolicyStatusSource;
  state: "reported" | "noStatusReported" | "notCollected";
  counts?: Pick<
    PolicyDeviceStatusRow,
    "succeeded" | "error" | "conflict" | "notApplicable" | "pending"
  >;
}

/** True when at least one status source was collected. */
export function hasPolicyDeviceStatus(
  status: PolicyDeviceStatus | undefined,
): status is PolicyDeviceStatus {
  return Boolean(status && Object.values(status.sources).includes("collected"));
}

/**
 * One row per distinct device policy in the cited evidence, in first-cited
 * order. Tenant policies and other families without a status source are left
 * out, because Intune reports no device status for them.
 */
export function deviceStatusAnnexRows(
  evidence: readonly Pick<
    CapabilityEvidence,
    "policyId" | "policyName" | "familyKey"
  >[],
  status: PolicyDeviceStatus,
): DeviceStatusAnnexRow[] {
  const seen = new Set<string>();
  const rows: DeviceStatusAnnexRow[] = [];
  for (const item of evidence) {
    const source = policyStatusSourceFor(item.familyKey);
    if (!source || !item.policyId) continue;
    const key = `${source}:${item.policyId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const base = {
      policyId: item.policyId,
      policyName: item.policyName,
      source,
    };
    if (status.sources[source] !== "collected") {
      rows.push({ ...base, state: "notCollected" });
      continue;
    }
    const reported = status.rows.find(
      (row) => row.source === source && row.policyId === item.policyId,
    );
    rows.push(
      reported
        ? {
            ...base,
            state: "reported",
            counts: {
              succeeded: reported.succeeded,
              error: reported.error,
              conflict: reported.conflict,
              notApplicable: reported.notApplicable,
              pending: reported.pending,
            },
          }
        : { ...base, state: "noStatusReported" },
    );
  }
  return rows;
}

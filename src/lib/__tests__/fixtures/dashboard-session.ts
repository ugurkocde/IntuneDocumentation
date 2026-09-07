import type { DashboardSessionSnapshot } from "../../dashboard-session-cache";

export const sessionScope = {
  accountId: "account-a",
  tenantId: "tenant-a",
  includeCA: false,
};
export function sessionSnapshot(): DashboardSessionSnapshot {
  const policy = {
    id: "policy-a",
    displayName: "Cached policy",
    assignments: [],
  };
  return {
    lastFetched: "2026-09-07T12:00:00.000Z",
    groupNames: [["group-a", "Pilot group"]],
    caConsentStatus: "unknown",
    configurations: {
      collectedAt: "2026-09-07T12:00:00.000Z",
      settingsCatalog: [policy],
      deviceConfigurations: [],
      administrativeTemplates: [],
      securityBaselines: [],
      compliancePolicies: [],
      appProtectionPolicies: [],
      scripts: { windows: [], macOS: [] },
      appConfigurations: [],
      windowsUpdatePolicies: [],
      enrollmentConfigurations: [],
      conditionalAccessPolicies: [],
      sections: [
        {
          key: "settingsCatalog",
          familyKey: "settingsCatalog",
          label: "Settings Catalog",
          selectionPrefix: "catalog",
          items: [policy],
        },
      ],
      collectionSkippedFamilies: ["conditionalAccessPolicies"],
      fetchErrors: [
        {
          policyId: "warning",
          policyName: "Incomplete policy",
          policyType: "Settings Catalog",
          error: "Missing settings",
          partial: true,
        },
      ],
      summary: { totalConfigurations: 1, byType: { settingsCatalog: 1 } },
    },
  };
}

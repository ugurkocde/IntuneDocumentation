import type { ConfigurationSectionData } from "./configuration-sections";
// Shared stream indexes keep retries and dashboard status aligned.
export const COLLECTION_STEPS = [
  { name: "Connecting to Microsoft Graph API", families: [] },
  { name: "Settings Catalog", families: ["settingsCatalog"] },
  { name: "Device Configurations", families: ["deviceConfigurations"] },
  { name: "Administrative Templates", families: ["administrativeTemplates"] },
  { name: "Security Baselines", families: ["securityBaselines"] },
  { name: "Compliance Policies", families: ["compliancePolicies"] },
  { name: "App Protection Policies", families: ["appProtectionPolicies"] },
  { name: "Scripts", families: ["scripts"] },
  { name: "App Configurations", families: ["appConfigurations"] },
  { name: "Windows Update Policies", families: ["windowsUpdatePolicies"] },
  { name: "Enrollment Configurations", families: ["enrollmentConfigurations"] },
  {
    name: "Additional Intune coverage",
    families: [
      "windowsUpdateProfiles",
      "scriptsAndRemediations",
      "enrollmentAndProvisioning",
      "applications",
      "assignmentAndRbac",
      "tenantAndService",
      "connectors",
      "specialistPolicies",
    ],
  },
  {
    name: "Conditional Access Policies",
    families: ["conditionalAccessPolicies"],
  },
];
export interface CollectionStep {
  name: string;
  status: "pending" | "loading" | "completed" | "error";
  current?: number;
  total?: number;
}
export function collectionSteps(
  includeCA: boolean,
  retry?: number[],
): CollectionStep[] {
  return COLLECTION_STEPS.slice(0, includeCA ? undefined : -1).map(
    (step, index) => ({
      name: step.name,
      status:
        retry && index > 0 && !retry.includes(index) ? "completed" : "pending",
    }),
  );
}
export function stepForFamily(family: string): number {
  return COLLECTION_STEPS.findIndex((step) => step.families.includes(family));
}

export function countCompletedResources(
  receivedSections: Iterable<ConfigurationSectionData>,
  completedSteps: ReadonlySet<number>,
): number {
  let count = 0;
  for (const section of receivedSections) {
    if (!section.error && completedSteps.has(stepForFamily(section.familyKey)))
      count += section.items.filter((item) => !item.hasFetchError).length;
  }
  return count;
}

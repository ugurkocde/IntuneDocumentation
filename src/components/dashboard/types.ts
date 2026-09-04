import type { ConfigurationSectionData } from "~/lib/configuration-sections";

export interface PermissionError {
  resource: string;
  requiredPermission: string;
  message: string;
}

export interface FetchError {
  policyId: string;
  policyName: string;
  policyType: string;
  familyKey?: string;
  error: string;
  errorCode?: string;
  statusCode?: number;
  endpoint?: string;
  permissionHint?: string;
  partial?: boolean;
}

export interface DashboardConfigurationItem {
  id: string;
  displayName?: string;
  name?: string;
  description?: string;
  hasFetchError?: boolean;
  platformType?: string;
  lastModifiedDateTime?: string;
  version?: string | number;
  technologies?: string;
  fileName?: string;
  [key: string]: any;
}

export type ConfigurationTypeCounts = Record<string, number>;

export interface IntuneConfigurations {
  collectedAt?: string;
  collectionStartedAt?: string;
  collectionSkippedFamilies?: string[];
  settingsCatalog: DashboardConfigurationItem[];
  deviceConfigurations: DashboardConfigurationItem[];
  administrativeTemplates: DashboardConfigurationItem[];
  securityBaselines: DashboardConfigurationItem[];
  compliancePolicies: DashboardConfigurationItem[];
  appProtectionPolicies: DashboardConfigurationItem[];
  scripts: {
    macOS: DashboardConfigurationItem[];
    windows: DashboardConfigurationItem[];
  };
  appConfigurations: DashboardConfigurationItem[];
  windowsUpdatePolicies: DashboardConfigurationItem[];
  enrollmentConfigurations: DashboardConfigurationItem[];
  conditionalAccessPolicies: DashboardConfigurationItem[];
  sections: ConfigurationSectionData[];
  permissionErrors?: PermissionError[];
  fetchErrors?: FetchError[];
  summary: {
    totalConfigurations: number;
    byType: ConfigurationTypeCounts;
  };
}

export type ConfigurationTypeKey =
  | "settingsCatalog"
  | "deviceConfigurations"
  | "administrativeTemplates"
  | "conditionalAccessPolicies"
  | "securityBaselines"
  | "compliancePolicies"
  | "appProtectionPolicies"
  | "scripts"
  | "appConfigurations"
  | "windowsUpdatePolicies"
  | "enrollmentConfigurations"
  | "windowsUpdateProfiles"
  | "scriptsAndRemediations"
  | "enrollmentAndProvisioning"
  | "applications"
  | "assignmentAndRbac"
  | "tenantAndService"
  | "connectors"
  | "specialistPolicies";
export type DashboardView =
  | "overview"
  | ConfigurationTypeKey
  | "compliance"
  | "settings";

export interface DashboardTypeStat {
  key: ConfigurationTypeKey;
  label: string;
  compactLabel: string;
  total: number;
  selected: number;
}

export const DASHBOARD_TYPE_LABELS: Record<ConfigurationTypeKey, string> = {
  settingsCatalog: "Settings Catalog",
  deviceConfigurations: "Device Configs",
  administrativeTemplates: "Admin Templates",
  conditionalAccessPolicies: "Conditional Access",
  securityBaselines: "Security Baselines",
  compliancePolicies: "Compliance",
  appProtectionPolicies: "App Protection",
  scripts: "Scripts",
  appConfigurations: "App Configs",
  windowsUpdatePolicies: "Windows Update",
  enrollmentConfigurations: "Enrollment",
  windowsUpdateProfiles: "Update profiles",
  scriptsAndRemediations: "Scripts & remediation",
  enrollmentAndProvisioning: "Provisioning",
  applications: "Applications",
  assignmentAndRbac: "Assignment & RBAC",
  tenantAndService: "Tenant & service",
  connectors: "Connectors",
  specialistPolicies: "Specialist policies",
};

export const DASHBOARD_VIEW_LABELS: Record<DashboardView, string> = {
  overview: "Overview",
  ...DASHBOARD_TYPE_LABELS,
  compliance: "Compliance Evidence",
  settings: "Settings",
};

const FAMILY_ORDER: ConfigurationTypeKey[] = [
  "settingsCatalog",
  "deviceConfigurations",
  "administrativeTemplates",
  "conditionalAccessPolicies",
  "securityBaselines",
  "compliancePolicies",
  "appProtectionPolicies",
  "scripts",
  "appConfigurations",
  "windowsUpdatePolicies",
  "enrollmentConfigurations",
  "windowsUpdateProfiles",
  "scriptsAndRemediations",
  "enrollmentAndProvisioning",
  "applications",
  "assignmentAndRbac",
  "tenantAndService",
  "connectors",
  "specialistPolicies",
];

export function buildDashboardTypeStats(
  configurations: IntuneConfigurations,
  selectedConfigs: Set<string>,
): DashboardTypeStat[] {
  return FAMILY_ORDER.map((key) => {
    const sections = configurations.sections.filter(
      (section) => section.familyKey === key,
    );
    return {
      key,
      label: DASHBOARD_TYPE_LABELS[key],
      compactLabel: DASHBOARD_TYPE_LABELS[key],
      total: sections.reduce(
        (count, section) => count + section.items.length,
        0,
      ),
      selected: sections.reduce(
        (count, section) =>
          count +
          section.items.filter((item) =>
            selectedConfigs.has(`${section.selectionPrefix}-${item.id}`),
          ).length,
        0,
      ),
    };
  });
}

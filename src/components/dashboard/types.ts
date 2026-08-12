export interface PermissionError {
  resource: string;
  requiredPermission: string;
  message: string;
}

export interface FetchError {
  policyId: string;
  policyName: string;
  policyType: string;
  error: string;
  errorCode?: string;
  statusCode?: number;
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

export interface ConfigurationTypeCounts {
  settingsCatalog: number;
  deviceConfigurations: number;
  administrativeTemplates: number;
  securityBaselines: number;
  compliancePolicies: number;
  appProtectionPolicies: number;
  scripts: number;
  appConfigurations: number;
  windowsUpdatePolicies: number;
  enrollmentConfigurations: number;
  conditionalAccessPolicies: number;
}

export interface IntuneConfigurations {
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
  permissionErrors?: PermissionError[];
  fetchErrors?: FetchError[];
  summary: {
    totalConfigurations: number;
    byType: ConfigurationTypeCounts;
  };
}

export type ConfigurationTypeKey = keyof ConfigurationTypeCounts;
export type DashboardView = "overview" | ConfigurationTypeKey | "settings";

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
};

export const DASHBOARD_VIEW_LABELS: Record<DashboardView, string> = {
  overview: "Overview",
  ...DASHBOARD_TYPE_LABELS,
  settings: "Settings",
};

function countSelected(
  items: DashboardConfigurationItem[],
  prefix: string,
  selectedConfigs: Set<string>,
) {
  return items.filter((item) => selectedConfigs.has(`${prefix}-${item.id}`))
    .length;
}

export function buildDashboardTypeStats(
  configurations: IntuneConfigurations,
  selectedConfigs: Set<string>,
): DashboardTypeStat[] {
  const counts = configurations.summary.byType;

  return [
    {
      key: "settingsCatalog",
      label: DASHBOARD_TYPE_LABELS.settingsCatalog,
      compactLabel: "Catalog",
      total: counts.settingsCatalog,
      selected: countSelected(
        configurations.settingsCatalog,
        "catalog",
        selectedConfigs,
      ),
    },
    {
      key: "deviceConfigurations",
      label: DASHBOARD_TYPE_LABELS.deviceConfigurations,
      compactLabel: "Devices",
      total: counts.deviceConfigurations,
      selected: countSelected(
        configurations.deviceConfigurations,
        "device",
        selectedConfigs,
      ),
    },
    {
      key: "administrativeTemplates",
      label: DASHBOARD_TYPE_LABELS.administrativeTemplates,
      compactLabel: "Templates",
      total: counts.administrativeTemplates,
      selected: countSelected(
        configurations.administrativeTemplates,
        "admx",
        selectedConfigs,
      ),
    },
    {
      key: "conditionalAccessPolicies",
      label: DASHBOARD_TYPE_LABELS.conditionalAccessPolicies,
      compactLabel: "Access",
      total: counts.conditionalAccessPolicies,
      selected: countSelected(
        configurations.conditionalAccessPolicies,
        "ca",
        selectedConfigs,
      ),
    },
    {
      key: "securityBaselines",
      label: DASHBOARD_TYPE_LABELS.securityBaselines,
      compactLabel: "Security",
      total: counts.securityBaselines,
      selected: countSelected(
        configurations.securityBaselines,
        "security",
        selectedConfigs,
      ),
    },
    {
      key: "compliancePolicies",
      label: DASHBOARD_TYPE_LABELS.compliancePolicies,
      compactLabel: "Compliance",
      total: counts.compliancePolicies,
      selected: countSelected(
        configurations.compliancePolicies,
        "compliance",
        selectedConfigs,
      ),
    },
    {
      key: "appProtectionPolicies",
      label: DASHBOARD_TYPE_LABELS.appProtectionPolicies,
      compactLabel: "Protection",
      total: counts.appProtectionPolicies,
      selected: countSelected(
        configurations.appProtectionPolicies,
        "app-protection",
        selectedConfigs,
      ),
    },
    {
      key: "scripts",
      label: DASHBOARD_TYPE_LABELS.scripts,
      compactLabel: "Scripts",
      total: counts.scripts,
      selected:
        countSelected(configurations.scripts.macOS, "script-mac", selectedConfigs) +
        countSelected(
          configurations.scripts.windows,
          "script-win",
          selectedConfigs,
        ),
    },
    {
      key: "appConfigurations",
      label: DASHBOARD_TYPE_LABELS.appConfigurations,
      compactLabel: "Apps",
      total: counts.appConfigurations,
      selected: countSelected(
        configurations.appConfigurations,
        "app",
        selectedConfigs,
      ),
    },
    {
      key: "windowsUpdatePolicies",
      label: DASHBOARD_TYPE_LABELS.windowsUpdatePolicies,
      compactLabel: "Updates",
      total: counts.windowsUpdatePolicies,
      selected: countSelected(
        configurations.windowsUpdatePolicies,
        "update",
        selectedConfigs,
      ),
    },
    {
      key: "enrollmentConfigurations",
      label: DASHBOARD_TYPE_LABELS.enrollmentConfigurations,
      compactLabel: "Enrollment",
      total: counts.enrollmentConfigurations,
      selected: countSelected(
        configurations.enrollmentConfigurations,
        "enrollment",
        selectedConfigs,
      ),
    },
  ];
}

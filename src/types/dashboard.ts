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

export interface ConfigurationItem {
  id: string;
  displayName?: string;
  name?: string;
  description?: string;
  lastModifiedDateTime?: string;
  version?: string;
  platformType?: string;
  technologies?: string;
  fileName?: string;
  hasFetchError?: boolean;
}

export interface IntuneConfigurations {
  settingsCatalog: ConfigurationItem[];
  deviceConfigurations: ConfigurationItem[];
  administrativeTemplates: ConfigurationItem[];
  securityBaselines: ConfigurationItem[];
  compliancePolicies: ConfigurationItem[];
  scripts: {
    macOS: ConfigurationItem[];
    windows: ConfigurationItem[];
  };
  appConfigurations: ConfigurationItem[];
  windowsUpdatePolicies: ConfigurationItem[];
  enrollmentConfigurations: ConfigurationItem[];
  conditionalAccessPolicies: ConfigurationItem[];
  permissionErrors?: PermissionError[];
  fetchErrors?: FetchError[];
  summary: {
    totalConfigurations: number;
    byType: {
      settingsCatalog: number;
      deviceConfigurations: number;
      administrativeTemplates: number;
      securityBaselines: number;
      compliancePolicies: number;
      scripts: number;
      appConfigurations: number;
      windowsUpdatePolicies: number;
      enrollmentConfigurations: number;
      conditionalAccessPolicies: number;
    };
  };
}

export interface FetchProgressStep {
  name: string;
  status: "pending" | "loading" | "completed" | "error";
}

export interface FetchProgress {
  steps: FetchProgressStep[];
  currentStep: number;
}

export type ViewType =
  | "overview"
  | "settingsCatalog"
  | "deviceConfigurations"
  | "administrativeTemplates"
  | "conditionalAccessPolicies"
  | "securityBaselines"
  | "compliancePolicies"
  | "scripts"
  | "appConfigurations"
  | "windowsUpdatePolicies"
  | "enrollmentConfigurations"
  | "settings";

export type CAConsentStatus = "unknown" | "included" | "missing";

export interface NavigationItem {
  id: ViewType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  badgeColor: string;
  isVisible?: boolean;
}

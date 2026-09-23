// Delegated Microsoft Graph scopes the app requests, all read only, and why.
export const DEFAULT_SCOPES = [
  "User.Read",
  "DeviceManagementConfiguration.Read.All",
  "DeviceManagementApps.Read.All",
  "DeviceManagementManagedDevices.Read.All",
  "DeviceManagementRBAC.Read.All",
  "DeviceManagementServiceConfig.Read.All",
  "DeviceManagementScripts.Read.All",
  "Group.Read.All",
  "Policy.Read.All",
];

// Shown next to each scope in the setup wizard. Keep in step with
// DEFAULT_SCOPES.
export const SCOPE_REASONS: Record<string, string> = {
  "User.Read": "Sign in and read your profile",
  "DeviceManagementConfiguration.Read.All":
    "Configuration profiles, settings catalog, compliance, baselines, administrative templates",
  "DeviceManagementApps.Read.All":
    "Apps, app protection and app configuration policies",
  "DeviceManagementManagedDevices.Read.All": "Device counts",
  "DeviceManagementRBAC.Read.All": "Scope tags, roles, role assignments",
  "DeviceManagementServiceConfig.Read.All":
    "Enrollment, Autopilot, Windows update and tenant service settings",
  "DeviceManagementScripts.Read.All":
    "PowerShell and shell scripts, remediations",
  "Group.Read.All": "Assignment group names",
  "Policy.Read.All": "Conditional Access policies",
};

export interface DesktopAuthConfig {
  clientId: string;
  tenantId: string;
  scopes: string[];
}

export const DEFAULT_SCOPES = [
  "User.Read",
  "DeviceManagementConfiguration.Read.All",
  "DeviceManagementApps.Read.All",
  "DeviceManagementManagedDevices.Read.All",
  "DeviceManagementRBAC.Read.All",
  "DeviceManagementServiceConfig.Read.All",
  "DeviceManagementScripts.Read.All",
  "Group.Read.All",
];

export const DEFAULT_TENANT = "organizations";

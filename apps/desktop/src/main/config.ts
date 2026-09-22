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
  "Policy.Read.All",
];

export const DEFAULT_TENANT = "organizations";

declare const __LICENSE_API_BASE__: string;
declare const __LICENSE_PUBLIC_KEY__: string;
declare const __LICENSE_BUY_URL__: string;
declare const __LICENSE_PORTAL_URL__: string;

// Injected by esbuild.config.mjs at build time.
export const LICENSE_API_BASE = __LICENSE_API_BASE__;
export const LICENSE_PUBLIC_KEY = __LICENSE_PUBLIC_KEY__;
export const LICENSE_BUY_URL = __LICENSE_BUY_URL__;
export const LICENSE_PORTAL_URL = __LICENSE_PORTAL_URL__;

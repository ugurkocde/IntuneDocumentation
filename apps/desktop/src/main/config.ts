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

export function loadAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): DesktopAuthConfig {
  const clientId = env.INTUNEDOC_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error(
      "Set INTUNEDOC_CLIENT_ID to the client id of your own Entra app registration.",
    );
  }
  const tenantId = env.INTUNEDOC_TENANT_ID?.trim() || "organizations";
  return { clientId, tenantId, scopes: [...DEFAULT_SCOPES] };
}

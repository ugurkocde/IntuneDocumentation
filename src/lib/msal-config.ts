import type { Configuration, PopupRequest, EventMessage, EventType } from "@azure/msal-browser";
import { PublicClientApplication } from "@azure/msal-browser";
import { env } from "~/env";
import { extractTenantFromToken, logTenantAccess } from "~/lib/tenant-tracker";

export const msalConfig: Configuration = {
  auth: {
    clientId: env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${env.NEXT_PUBLIC_AZURE_AD_TENANT_ID}`,
    redirectUri: env.NEXT_PUBLIC_REDIRECT_URI,
    postLogoutRedirectUri: env.NEXT_PUBLIC_REDIRECT_URI || "/",
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false,
  },
};

export const loginRequest: PopupRequest = {
  scopes: [
    "User.Read",
    "DeviceManagementConfiguration.Read.All",
    "DeviceManagementApps.Read.All",
    "DeviceManagementManagedDevices.Read.All",
    "DeviceManagementRBAC.Read.All",
    "DeviceManagementServiceConfig.Read.All",
    "Group.Read.All",
  ],
};

export const graphScopes = {
  scopes: [...loginRequest.scopes],
};

let msalInstance: PublicClientApplication | undefined;

export function getMsalInstance() {
  if (typeof window === "undefined") {
    return undefined;
  }
  
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
    void msalInstance.initialize().then(() => {
      // Add event callback to track tenant access on successful login
      msalInstance.addEventCallback((event: EventMessage) => {
        if (event.eventType === "msal:loginSuccess" || event.eventType === "msal:acquireTokenSuccess") {
          const payload = event.payload as any;
          if (payload?.account) {
            const tenantInfo = extractTenantFromToken(payload.account.idTokenClaims);
            if (tenantInfo) {
              logTenantAccess({
                ...tenantInfo,
                tenantId: tenantInfo.tenantId || "",
                userPrincipalName: tenantInfo.userPrincipalName || "",
                timestamp: new Date().toISOString()
              }, "MSAL-Login");
            }
          }
        }
      });
    });
  }
  
  return msalInstance;
}
import type { Configuration, PopupRequest } from "@azure/msal-browser";
import { PublicClientApplication } from "@azure/msal-browser";
import { env } from "~/env";

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
    void msalInstance.initialize();
  }
  
  return msalInstance;
}

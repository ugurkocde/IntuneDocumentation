import type { Configuration, PopupRequest } from "@azure/msal-browser";
import { PublicClientApplication } from "@azure/msal-browser";

export const loginRequest: PopupRequest = {
  scopes: [
    "User.Read",
    "DeviceManagementConfiguration.Read.All",
    "DeviceManagementApps.Read.All",
    "DeviceManagementManagedDevices.Read.All",
    "DeviceManagementRBAC.Read.All",
    "DeviceManagementServiceConfig.Read.All",
    "DeviceManagementScripts.Read.All",
    "Group.Read.All",
  ],
};

export const graphScopes = {
  scopes: [...loginRequest.scopes],
};

interface RuntimeConfig {
  clientId: string;
  tenantId: string;
  error?: string;
}

let msalInstancePromise: Promise<PublicClientApplication> | undefined;

async function createMsalInstance() {
  const response = await fetch("/api/config");
  const runtimeConfig = (await response.json()) as RuntimeConfig;

  if (!response.ok) {
    throw new Error(
      runtimeConfig.error ?? "Failed to load Microsoft Entra configuration.",
    );
  }

  const redirectUri = window.location.origin;
  const msalConfig: Configuration = {
    auth: {
      clientId: runtimeConfig.clientId,
      authority: `https://login.microsoftonline.com/${runtimeConfig.tenantId}`,
      redirectUri,
      postLogoutRedirectUri: redirectUri,
      navigateToLoginRequestUrl: true,
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    },
  };

  const msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();

  return msalInstance;
}

export async function getMsalInstance() {
  if (typeof window === "undefined") {
    return undefined;
  }

  msalInstancePromise ??= createMsalInstance().catch((error: unknown) => {
    // Do not cache failures, so a transient config fetch error can be retried.
    msalInstancePromise = undefined;
    throw error;
  });

  return msalInstancePromise;
}

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

interface EntraConfig {
  clientId: string;
  tenantId: string;
}

interface RuntimeConfig extends EntraConfig {
  error?: string;
}

declare global {
  interface Window {
    __ENTRA_CONFIG__?: EntraConfig;
  }
}

let msalInstance: PublicClientApplication | undefined;
let msalInstancePromise: Promise<PublicClientApplication> | undefined;

function createMsalInstance(runtimeConfig: EntraConfig) {
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

  msalInstance = new PublicClientApplication(msalConfig);

  return msalInstance;
}

function cacheMsalInstancePromise(
  instancePromise: Promise<PublicClientApplication>,
) {
  msalInstancePromise = instancePromise;

  void instancePromise.catch(() => {
    if (msalInstancePromise === instancePromise) {
      msalInstance = undefined;
      msalInstancePromise = undefined;
    }
  });
}

export function getMsalInstanceSync() {
  if (typeof window === "undefined") {
    return undefined;
  }

  if (msalInstance) {
    return msalInstance;
  }

  const runtimeConfig = window.__ENTRA_CONFIG__;
  if (!runtimeConfig) {
    return undefined;
  }

  const instance = createMsalInstance(runtimeConfig);
  const instancePromise = instance.initialize().then(() => instance);
  cacheMsalInstancePromise(instancePromise);

  return instance;
}

export async function getMsalInstance() {
  if (typeof window === "undefined") {
    return undefined;
  }

  const syncInstance = getMsalInstanceSync();
  if (syncInstance) {
    return msalInstancePromise ?? syncInstance;
  }

  if (!msalInstancePromise) {
    const instancePromise = fetch("/api/config").then(async (response) => {
      const runtimeConfig = (await response.json()) as RuntimeConfig;

      if (!response.ok) {
        throw new Error(
          runtimeConfig.error ??
            "Failed to load Microsoft Entra configuration.",
        );
      }

      const instance = createMsalInstance(runtimeConfig);
      await instance.initialize();

      return instance;
    });

    cacheMsalInstancePromise(instancePromise);
  }

  return msalInstancePromise;
}

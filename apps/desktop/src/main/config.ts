export interface DesktopAuthConfig {
  clientId: string;
  tenantId: string;
  scopes: string[];
}

// Shared with the renderer so the setup wizard lists the same scopes.
export { DEFAULT_SCOPES, SCOPE_REASONS } from "../shared/scopes";

// The only external pages the renderer may open, by key.
export const HELP_URLS = {
  entraAppRegistrations:
    "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  gettingStarted: "https://intunedocumentation.com/desktop/getting-started",
  support: "https://intunedocumentation.com/support",
} as const;

export const WEBSITE_URL = "https://intunedocumentation.com";

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

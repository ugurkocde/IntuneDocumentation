import { env } from "~/env";

// Product constants for the paid desktop app. The /desktop marketing page and
// the getting started guide read from here so prices, limits, and permissions
// stay in one place. The legal pages state the same limits in fixed text.

export const DESKTOP_APP_NAME = "Intune Documentation Desktop";
export const DESKTOP_APP_VERSION = "0.1.0";
export const DESKTOP_CURRENCY = "EUR";
export const DESKTOP_TRIAL_DAYS = 30;

// Mirrors INSTALLS_PER_TENANT in src/lib/desktop-license/service.ts. That
// module pulls in node:crypto, so it cannot be imported by client pages.
export const DESKTOP_INSTALLS_PER_TENANT = 5;

// Entitlement tokens are valid for 14 days (TOKEN_LIFETIME_SECONDS), so the
// app keeps working offline for that long after its last successful check.
export const DESKTOP_OFFLINE_GRACE_DAYS = 14;

export const DESKTOP_PRICING_PATH = "/desktop#pricing";
export const DESKTOP_GETTING_STARTED_PATH = "/desktop/getting-started";
export const DESKTOP_DOWNLOAD_URL =
  "https://github.com/ugurkocde/IntuneDocumentation/releases?q=desktop-v";

// Stable links to the newest installers, resolved by the update feed route.
export const DESKTOP_DOWNLOADS = {
  macArm64: "/api/desktop-update/mac-arm64",
  macX64: "/api/desktop-update/mac-x64",
  windows: "/api/desktop-update/windows",
} as const;
export const DESKTOP_PORTAL_URL =
  env.NEXT_PUBLIC_POLAR_PORTAL_URL ?? "https://polar.sh/ugurlabs/portal";

export type BillingInterval = "monthly" | "yearly";
export type DesktopPlanId = "pro" | "msp";

export interface DesktopPlan {
  id: DesktopPlanId;
  name: string;
  audience: string;
  tenantsIncluded: number;
  price: Record<BillingInterval, number>;
  // Price per tenant above tenantsIncluded, or null when the plan is fixed.
  extraTenantPrice: Record<BillingInterval, number> | null;
  features: string[];
  checkoutUrl: Record<BillingInterval, string>;
}

export const DESKTOP_PLANS: Record<DesktopPlanId, DesktopPlan> = {
  pro: {
    id: "pro",
    name: "Pro",
    audience: "For one organization documenting its own tenant.",
    tenantsIncluded: 1,
    price: { monthly: 99, yearly: 990 },
    extraTenantPrice: null,
    features: [
      "1 Microsoft Entra tenant",
      `Up to ${DESKTOP_INSTALLS_PER_TENANT} installations`,
      "Word and PDF exports",
      "Compliance evidence for 10 frameworks",
      `${DESKTOP_OFFLINE_GRACE_DAYS} days of offline use between license checks`,
      "Automatic updates",
    ],
    checkoutUrl: {
      monthly:
        env.NEXT_PUBLIC_POLAR_CHECKOUT_PRO_MONTHLY ??
        "https://buy.polar.sh/polar_cl_p9S59fMAgCTA3jZFPZk3HWG0t4jwEppBYAbc11oMQJe",
      yearly:
        env.NEXT_PUBLIC_POLAR_CHECKOUT_PRO_YEARLY ??
        "https://buy.polar.sh/polar_cl_NTrlkfk9H6jsKNumiVZH6mFSDJ5UjEp86Se4v3W8qVe",
    },
  },
  msp: {
    id: "msp",
    name: "MSP",
    audience: "For partners who document many customer tenants.",
    tenantsIncluded: 10,
    price: { monthly: 199, yearly: 1990 },
    extraTenantPrice: { monthly: 15, yearly: 150 },
    features: [
      "10 Microsoft Entra tenants included",
      "Add tenants above 10 at any time",
      `Up to ${DESKTOP_INSTALLS_PER_TENANT} installations per tenant`,
      "Word and PDF exports for every tenant",
      "Compliance evidence for 10 frameworks",
      "Switch tenants without extra keys",
    ],
    checkoutUrl: {
      monthly:
        env.NEXT_PUBLIC_POLAR_CHECKOUT_MSP_MONTHLY ??
        "https://buy.polar.sh/polar_cl_W0ELNRLkIf260KU5XrnjPAbczSCQw5rQBnW2u1DdMBk",
      yearly:
        env.NEXT_PUBLIC_POLAR_CHECKOUT_MSP_YEARLY ??
        "https://buy.polar.sh/polar_cl_AvIwR0OPaKE6f0npXdp5BpkCapNDfKnmTeGtz4An7jj",
    },
  },
};

export function formatDesktopPrice(amount: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: DESKTOP_CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

export interface GraphPermission {
  scope: string;
  reason: string;
}

// Delegated Microsoft Graph permissions the desktop app requests. Keep in
// sync with DEFAULT_SCOPES in apps/desktop/src/main/config.ts.
export const DESKTOP_GRAPH_PERMISSIONS: readonly GraphPermission[] = [
  {
    scope: "User.Read",
    reason: "Sign in and read the signed-in admin's profile.",
  },
  {
    scope: "DeviceManagementConfiguration.Read.All",
    reason:
      "Configuration profiles, settings catalog, compliance, baselines, and templates.",
  },
  {
    scope: "DeviceManagementApps.Read.All",
    reason: "Apps, app protection, and app configuration policies.",
  },
  {
    scope: "DeviceManagementManagedDevices.Read.All",
    reason: "Device counts per assignment.",
  },
  {
    scope: "DeviceManagementRBAC.Read.All",
    reason: "Scope tags, roles, and role assignments.",
  },
  {
    scope: "DeviceManagementServiceConfig.Read.All",
    reason:
      "Enrollment configurations, Autopilot, and tenant service settings.",
  },
  {
    scope: "DeviceManagementScripts.Read.All",
    reason: "PowerShell and shell scripts, and remediations.",
  },
  {
    scope: "Group.Read.All",
    reason: "Resolve assignment group names.",
  },
  {
    scope: "Policy.Read.All",
    reason: "Conditional Access policies.",
  },
];

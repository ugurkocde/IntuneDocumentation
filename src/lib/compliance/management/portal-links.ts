import type { ComplianceCapability, DetectionSignal } from "../types";
import type { PortalAreaId } from "./types";

// Admin center pages where a next action is carried out. Links open a list
// page, never a specific policy, so they contain no tenant data.
//
// Sources, reviewed on Microsoft Learn on 1 October 2026:
// - Verbatim in Learn: configurationProfiles (Defender for Endpoint macOS
//   deployment with Intune), diskEncryption, firewall, antivirus,
//   accountProtection and attackSurfaceReduction (Microsoft 365 Business
//   Premium device protection), appProtection (Defender for Endpoint on iOS
//   with MAM), conditionalAccess (Set up MFA for Microsoft 365) and
//   intuneHome (the admin center root used throughout Intune docs).
// - Not documented as a link: Learn gives only the menu path Devices >
//   Compliance, so compliancePolicies opens the admin center root and the
//   label names the path. windowsUpdates opens the documented Windows platform
//   page (Devices > Windows), where Windows updates sits under Manage updates;
//   Learn documents no direct link to the update rings tab.
export const PORTAL_AREAS: Record<
  PortalAreaId,
  { url: string; label: { en: string; de: string } }
> = {
  configurationProfiles: {
    url: "https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration",
    label: { en: "Devices > Configuration", de: "Geräte > Konfiguration" },
  },
  compliancePolicies: {
    url: "https://intune.microsoft.com/",
    label: { en: "Devices > Compliance", de: "Geräte > Compliance" },
  },
  diskEncryption: {
    url: "https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/diskencryption",
    label: {
      en: "Endpoint security > Disk encryption",
      de: "Endpunktsicherheit > Datenträgerverschlüsselung",
    },
  },
  firewall: {
    url: "https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/firewall",
    label: {
      en: "Endpoint security > Firewall",
      de: "Endpunktsicherheit > Firewall",
    },
  },
  antivirus: {
    url: "https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/antivirus",
    label: {
      en: "Endpoint security > Antivirus",
      de: "Endpunktsicherheit > Antivirus",
    },
  },
  accountProtection: {
    url: "https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/accountprotection",
    label: {
      en: "Endpoint security > Account protection",
      de: "Endpunktsicherheit > Kontoschutz",
    },
  },
  attackSurfaceReduction: {
    url: "https://intune.microsoft.com/#view/Microsoft_Intune_Workflows/SecurityManagementMenu/~/asr",
    label: {
      en: "Endpoint security > Attack surface reduction",
      de: "Endpunktsicherheit > Verringerung der Angriffsfläche",
    },
  },
  windowsUpdates: {
    url: "https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesWindowsMenu/~/windowsDevices",
    label: {
      en: "Devices > Windows > Windows updates",
      de: "Geräte > Windows > Windows-Updates",
    },
  },
  appProtection: {
    url: "https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/AppsMenu/~/protection",
    label: { en: "Apps > Protection", de: "Apps > Schutz" },
  },
  conditionalAccess: {
    url: "https://entra.microsoft.com/#view/Microsoft_AAD_ConditionalAccess/ConditionalAccessBlade/~/Policies",
    label: {
      en: "Conditional Access > Policies",
      de: "Bedingter Zugriff > Richtlinien",
    },
  },
  intuneHome: {
    url: "https://intune.microsoft.com/",
    label: { en: "Intune admin center", de: "Intune Admin Center" },
  },
};

/** Exact identifiers a signal matches on, compared against the rules below. */
function signalKeys(signal: DetectionSignal): string[] {
  switch (signal.source) {
    case "settingsCatalog":
      return [signal.settingDefinitionId];
    case "graphProperty":
      return signal.odataTypes.map((type) => `${type}.${signal.propertyPath}`);
    case "policyCheck":
      return [signal.check];
    default:
      return [signal.settingId];
  }
}

// Routing only, never evidence: these patterns pick the admin center page for
// a capability. First matching rule wins, so the order matters (attack surface
// reduction rules use Defender identifiers and must precede antivirus).
const AREA_RULES: readonly (readonly [PortalAreaId, RegExp])[] = [
  ["conditionalAccess", /^conditionalAccess/],
  ["appProtection", /^\w+ManagedAppProtection\./],
  [
    "attackSurfaceReduction",
    /_attacksurfacereductionrules_|\.defender(Office|AdobeReader|PreventCredentialStealing)|\.appLockerApplicationControl$|^appLockerRuleCollections$/,
  ],
  [
    "accountProtection",
    /_localsecurityauthority_|_deviceguard_lsacfgflags$|_laps_|_credssp_restrictedremoteadministration|\.deviceGuardLocalSystemAuthorityCredentialGuardSettings$/,
  ],
  ["diskEncryption", /bitlocker|filevault/i],
  ["firewall", /firewall/i],
  [
    "antivirus",
    /_policy_config_defender_|\.defender|^scheduledAntivirusScan$|\/Policy\/Config\/Defender\//,
  ],
  [
    "windowsUpdates",
    /^windowsUpdateForBusinessConfiguration\.|_policy_config_update_|^qualityUpdateDeadline$|\/Policy\/Config\/Update\//,
  ],
];

const COMPLIANCE_POLICY_KEY = /^\w+CompliancePolicy\./;

export function portalAreaFor(capability: ComplianceCapability): PortalAreaId {
  if (capability.platform === "tenant") return "conditionalAccess";
  const keys = capability.signals.flatMap(signalKeys);
  if (!keys.length) return "intuneHome";
  // Only compliance policies carry the evidence, for example minimum OS versions.
  if (keys.every((key) => COMPLIANCE_POLICY_KEY.test(key)))
    return "compliancePolicies";
  for (const [area, pattern] of AREA_RULES)
    if (keys.some((key) => pattern.test(key))) return area;
  return "configurationProfiles";
}

export function portalUrlFor(capability: ComplianceCapability): string {
  return PORTAL_AREAS[portalAreaFor(capability)].url;
}

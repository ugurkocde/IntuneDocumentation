import type { ComplianceCapability, GraphPropertySignal } from "./types";

const compliance = "windows10CompliancePolicy";
const general = "windows10GeneralConfiguration";
const endpoint = "windows10EndpointProtectionConfiguration";
const bool = (type: string, propertyPath: string): GraphPropertySignal => ({
  source: "graphProperty",
  odataTypes: [type],
  propertyPath,
  enforcedWhen: { kind: "equals", value: true },
  // A compliance requirement set to false says nothing about device state.
  ...(type === compliance
    ? {}
    : { disabledWhen: { kind: "equals" as const, value: false } }),
});
const endpointDocs =
  "https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-windows10endpointprotectionconfiguration?view=graph-rest-beta";
const generalDocs =
  "https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-windows10generalconfiguration?view=graph-rest-beta";
const complianceDocs =
  "https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-windows10compliancepolicy?view=graph-rest-beta";

export const ADDITIONAL_CAPABILITIES: readonly ComplianceCapability[] = [
  {
    id: "windows-antivirus-required",
    platform: "windows",
    name: "Antivirus presence required",
    description:
      "A Windows compliance policy requires registered antivirus software. This does not establish real-time protection or a particular vendor.",
    documentationUrl: complianceDocs,
    signals: [
      bool(compliance, "antivirusRequired"),
      bool(compliance, "defenderEnabled"),
    ],
  },
  {
    id: "windows-periodic-antimalware-scan",
    platform: "windows",
    name: "Periodic antimalware scans configured",
    description:
      "A scheduled quick or full scan has an explicit day and time. Successful execution and exclusions need separate review.",
    documentationUrl: generalDocs,
    signals: [{ source: "policyCheck", check: "scheduledAntivirusScan" }],
  },
  {
    id: "windows-quality-update-deadline",
    platform: "windows",
    name: "Quality update timing within 14 days",
    description:
      "Automatic installation is configured, updates are not paused, and deferral plus deadline plus grace is at most 14 days. Actual installation timing and application updates remain unassessed.",
    documentationUrl:
      "https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-windowsupdateforbusinessconfiguration?view=graph-rest-beta",
    signals: [{ source: "policyCheck", check: "qualityUpdateDeadline" }],
  },
  {
    id: "windows-application-control",
    platform: "windows",
    name: "Application control in enforcement mode",
    description:
      "Windows application control is configured to enforce a trusted application policy. Audit-only modes are not enforcement evidence; approved software and exceptions still need review.",
    documentationUrl: endpointDocs,
    signals: [
      {
        source: "graphProperty",
        odataTypes: [endpoint],
        propertyPath: "appLockerApplicationControl",
        enforcedWhen: {
          kind: "oneOf",
          values: [
            "enforceComponentsAndStoreApps",
            "enforceComponentsStoreAppsAndSmartlocker",
          ],
        },
        disabledWhen: {
          kind: "oneOf",
          values: [
            "auditComponentsAndStoreApps",
            "auditComponentsStoreAppsAndSmartlocker",
          ],
        },
      },
    ],
  },
  {
    id: "windows-behavior-monitoring",
    platform: "windows",
    name: "Antimalware behavior monitoring",
    description:
      "Microsoft Defender behavior monitoring is configured. Detection events and response effectiveness are unassessed.",
    documentationUrl: generalDocs,
    signals: [
      bool(general, "defenderRequireBehaviorMonitoring"),
      bool(endpoint, "defenderAllowBehaviorMonitoring"),
    ],
  },
  {
    id: "windows-network-inspection",
    platform: "windows",
    name: "Antimalware network inspection",
    description:
      "Microsoft Defender network inspection is configured. Observed network detections and response are unassessed.",
    documentationUrl: generalDocs,
    signals: [
      bool(general, "defenderRequireNetworkInspectionSystem"),
      bool(endpoint, "defenderAllowIntrusionPreventionSystem"),
    ],
  },
  {
    id: "windows-memory-integrity",
    platform: "windows",
    name: "Memory integrity requirement (HVCI)",
    description:
      "Windows compliance requires hardware-backed memory integrity attestation.",
    documentationUrl: complianceDocs,
    signals: [bool(compliance, "memoryIntegrityEnabled")],
  },
  {
    id: "windows-virtualization-security",
    platform: "windows",
    name: "Virtualization-based security",
    description:
      "Virtualization-based security is configured or required by compliance policy.",
    documentationUrl: complianceDocs,
    signals: [
      bool(compliance, "virtualizationBasedSecurityEnabled"),
      bool(endpoint, "deviceGuardEnableVirtualizationBasedSecurity"),
    ],
  },
  {
    id: "windows-credential-guard",
    platform: "windows",
    name: "Credential Guard configuration",
    description:
      "Credential Guard is configured. Hardware prerequisites, LSA monitoring and actual device activation are unassessed.",
    documentationUrl: endpointDocs,
    signals: [
      {
        source: "graphProperty",
        odataTypes: [endpoint],
        propertyPath: "deviceGuardLocalSystemAuthorityCredentialGuardSettings",
        enforcedWhen: {
          kind: "oneOf",
          values: ["enableWithUEFILock", "enableWithoutUEFILock"],
        },
        disabledWhen: { kind: "equals", value: "disable" },
      },
    ],
  },
  {
    id: "windows-credential-theft-protection",
    platform: "windows",
    name: "Credential theft reduction rule",
    description:
      "The Defender attack surface reduction rule protecting LSASS credentials is enabled; exclusions and actual enforcement are unassessed.",
    documentationUrl: endpointDocs,
    signals: [
      {
        source: "graphProperty",
        odataTypes: [endpoint],
        propertyPath: "defenderPreventCredentialStealingType",
        enforcedWhen: { kind: "equals", value: "enable" },
        disabledWhen: { kind: "oneOf", values: ["auditMode", "warn"] },
      },
    ],
  },
  {
    id: "tenant-mfa-required",
    platform: "tenant",
    name: "Conditional Access MFA requirement",
    description:
      "An enabled Conditional Access policy requires MFA for its configured users and applications. Exclusions, other conditions and effective sign-ins require review.",
    documentationUrl:
      "https://learn.microsoft.com/en-us/graph/api/resources/conditionalaccessgrantcontrols?view=graph-rest-1.0",
    signals: [{ source: "policyCheck", check: "conditionalAccessMfa" }],
  },
  {
    id: "tenant-compliant-device-required",
    platform: "tenant",
    name: "Conditional Access compliant-device requirement",
    description:
      "An enabled Conditional Access policy requires compliant devices for its configured scope. This is not proof that a particular device or sign-in is blocked.",
    documentationUrl:
      "https://learn.microsoft.com/en-us/graph/api/resources/conditionalaccessgrantcontrols?view=graph-rest-1.0",
    signals: [
      { source: "policyCheck", check: "conditionalAccessCompliantDevice" },
    ],
  },
  ...(["ios", "android"] as const).map((platform) => ({
    id: `${platform}-app-data-transfer`,
    platform,
    name: `Managed app data transfer restrictions (${platform === "ios" ? "iOS" : "Android"})`,
    description:
      "Managed app policy limits outgoing data transfers. Targeted apps, exclusions and effective app protection need separate review.",
    documentationUrl: `https://learn.microsoft.com/en-us/graph/api/resources/intune-mam-${platform}managedappprotection?view=graph-rest-beta`,
    signals: [
      {
        source: "graphProperty" as const,
        odataTypes: [`${platform}ManagedAppProtection`],
        propertyPath: "allowedOutboundDataTransferDestinations",
        enforcedWhen: {
          kind: "oneOf" as const,
          values: ["managedApps", "none"],
        },
        disabledWhen: { kind: "equals" as const, value: "allApps" },
      },
    ],
  })),
];

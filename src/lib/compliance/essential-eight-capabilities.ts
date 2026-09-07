import type { ComplianceCapability } from "./types";

// Graph endpoint-protection enums verified against Microsoft documentation, 2026-09-06.
// Audit, warn and userDefined values never count as blocking evidence.
export const ESSENTIAL_EIGHT_CAPABILITIES: readonly ComplianceCapability[] = [
  [
    "windows-office-macro-win32-block",
    "Office macro Win32 calls blocked",
    "defenderOfficeMacroCodeAllowWin32ImportsType",
    "block",
  ],
  [
    "windows-office-child-process-block",
    "Office child processes blocked",
    "defenderOfficeAppsLaunchChildProcessType",
    "block",
  ],
  [
    "windows-office-executable-block",
    "Office executable content blocked",
    "defenderOfficeAppsExecutableContentCreationOrLaunchType",
    "block",
  ],
  [
    "windows-office-injection-block",
    "Office process injection blocked",
    "defenderOfficeAppsOtherProcessInjectionType",
    "block",
  ],
  [
    "windows-adobe-child-process-block",
    "Adobe Reader child processes blocked",
    "defenderAdobeReaderLaunchChildProcess",
    "enable",
  ],
].map(([id, name, propertyPath, blockingValue]) => ({
  id: id!,
  name: name!,
  platform: "windows",
  description:
    "An explicit endpoint-protection rule blocks this behaviour. ASR exclusions, effective deployment and execution remain unverified.",
  documentationUrl:
    "https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-windows10endpointprotectionconfiguration?view=graph-rest-beta",
  signals: [
    {
      source: "graphProperty",
      odataTypes: ["windows10EndpointProtectionConfiguration"],
      propertyPath: propertyPath!,
      enforcedWhen: { kind: "equals", value: blockingValue! },
      disabledWhen: { kind: "oneOf", values: ["auditMode", "warn", "disable"] },
    },
  ],
}));

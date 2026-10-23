// The values Microsoft Graph documents for the enum fields that checks and
// comparisons read (Microsoft Graph beta reference on Microsoft Learn,
// checked 21 October 2026). A value is definite only when it is one of
// these: one Graph did not document, such as unknownFutureValue, is
// unknown, so it is never a match, a difference, evidence or a change.
// unknownFutureValue is the evolvable enum sentinel, so it is never listed.

const DEFENDER_PROTECTION = [
  "userDefined",
  "enable",
  "auditMode",
  "warn",
  "notConfigured",
] as const;
const DEFENDER_ATTACK_SURFACE = [
  "userDefined",
  "block",
  "auditMode",
  "warn",
  "disable",
] as const;
const STATE_MANAGEMENT = ["notConfigured", "blocked", "allowed"] as const;
const MANAGED_APP_DATA_TRANSFER = ["allApps", "managedApps", "none"] as const;

export const DOCUMENTED_VALUES = {
  automaticUpdateMode: [
    "userDefined",
    "notifyDownload",
    "autoInstallAtMaintenanceTime",
    "autoInstallAndRebootAtMaintenanceTime",
    "autoInstallAndRebootAtScheduledTime",
    "autoInstallAndRebootWithoutEndUserControl",
    "windowsDefault",
  ],
  defenderScanType: ["userDefined", "disabled", "quick", "full"],
  weeklySchedule: [
    "userDefined",
    "everyday",
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "noScheduledScan",
  ],
  // Graph property signals by property path.
  allowedOutboundDataTransferDestinations: MANAGED_APP_DATA_TRANSFER,
  gatekeeperAllowedAppSource: [
    "notConfigured",
    "macAppStore",
    "macAppStoreAndIdentifiedDevelopers",
    "anywhere",
  ],
  appLockerApplicationControl: [
    "notConfigured",
    "enforceComponentsAndStoreApps",
    "auditComponentsAndStoreApps",
    "enforceComponentsStoreAppsAndSmartlocker",
    "auditComponentsStoreAppsAndSmartlocker",
  ],
  defenderAdobeReaderLaunchChildProcess: DEFENDER_PROTECTION,
  defenderPreventCredentialStealingType: DEFENDER_PROTECTION,
  defenderOfficeAppsExecutableContentCreationOrLaunchType:
    DEFENDER_ATTACK_SURFACE,
  defenderOfficeAppsLaunchChildProcessType: DEFENDER_ATTACK_SURFACE,
  defenderOfficeAppsOtherProcessInjectionType: DEFENDER_ATTACK_SURFACE,
  defenderOfficeMacroCodeAllowWin32ImportsType: DEFENDER_ATTACK_SURFACE,
  deviceGuardLocalSystemAuthorityCredentialGuardSettings: [
    "notConfigured",
    "enableWithUEFILock",
    "enableWithoutUEFILock",
    "disable",
  ],
  "firewallProfileDomain.firewallEnabled": STATE_MANAGEMENT,
  "firewallProfilePrivate.firewallEnabled": STATE_MANAGEMENT,
  "firewallProfilePublic.firewallEnabled": STATE_MANAGEMENT,
  diagnosticsDataSubmissionMode: [
    "userDefined",
    "none",
    "basic",
    "enhanced",
    "full",
  ],
  // Conditional Access. riskRemediation is listed after the sentinel, so
  // Graph returns it only to clients that ask for it.
  conditionalAccessGrantControl: [
    "block",
    "mfa",
    "compliantDevice",
    "domainJoinedDevice",
    "approvedApplication",
    "compliantApplication",
    "passwordChange",
    "riskRemediation",
  ],
  authenticationStrengthRequirements: ["none", "mfa"],
  // One mode of an allowed combination such as "password,sms".
  authenticationMethodModes: [
    "password",
    "voice",
    "hardwareOath",
    "softwareOath",
    "sms",
    "fido2",
    "windowsHelloForBusiness",
    "microsoftAuthenticatorPush",
    "deviceBasedPush",
    "temporaryAccessPassOneTime",
    "temporaryAccessPassMultiUse",
    "email",
    "x509CertificateSingleFactor",
    "x509CertificateMultiFactor",
    "federatedSingleFactor",
    "federatedMultiFactor",
    "qrCodePin",
  ],
  // Entra authentication methods policy.
  authenticationMethodState: ["enabled", "disabled"],
  authenticationMethodTargetType: ["user", "group"],
  x509CertificateAuthenticationMode: [
    "x509CertificateSingleFactor",
    "x509CertificateMultiFactor",
  ],
  advancedConfigState: ["default", "enabled", "disabled"],
  // Graph returns these two in another casing than documented (lab tenant,
  // 21 October 2026: "FIDO2"), so they are matched ignoring case.
  authenticationMethodsPolicyMigrationState: [
    "preMigration",
    "migrationInProgress",
    "migrationComplete",
  ],
  targetedAuthenticationMethod: ["Fido2", "microsoftAuthenticator"],
  // Conditional Access and script enum types the snapshot projection keeps,
  // by Graph enum type (Graph beta reference and beta $metadata, checked
  // 23 October 2026). linux is listed after the sentinel, so Graph returns
  // it only to clients that ask for it.
  conditionalAccessPolicyState: [
    "enabled",
    "disabled",
    "enabledForReportingButNotEnforced",
  ],
  riskLevel: ["low", "medium", "high", "hidden", "none"],
  conditionalAccessInsiderRiskLevels: ["minor", "moderate", "elevated"],
  conditionalAccessAgentIdRiskLevels: ["low", "medium", "high"],
  conditionalAccessClientApp: [
    "all",
    "browser",
    "mobileAppsAndDesktopClients",
    "exchangeActiveSync",
    "easSupported",
    "other",
  ],
  conditionalAccessDevicePlatform: [
    "android",
    "iOS",
    "windows",
    "windowsPhone",
    "macOS",
    "all",
    "linux",
  ],
  conditionalAccessGuestOrExternalUserTypes: [
    "none",
    "internalGuest",
    "b2bCollaborationGuest",
    "b2bCollaborationMember",
    "b2bDirectConnectUser",
    "otherExternalUser",
    "serviceProvider",
  ],
  conditionalAccessExternalTenantsMembershipKind: ["all", "enumerated"],
  filterMode: ["include", "exclude"],
  conditionalAccessTransferMethods: [
    "none",
    "deviceCodeFlow",
    "authenticationTransfer",
  ],
  authenticationStrengthPolicyType: ["builtIn", "custom"],
  runAsAccountType: ["system", "user"],
} as const satisfies Record<string, readonly string[]>;

export type DocumentedField = keyof typeof DOCUMENTED_VALUES;

const IGNORE_CASE: ReadonlySet<DocumentedField> = new Set([
  "authenticationMethodsPolicyMigrationState",
  "targetedAuthenticationMethod",
]);

/** Whether Graph documents the value for the field. */
export function isDocumented(field: DocumentedField, value: unknown): boolean {
  if (typeof value !== "string") return false;
  const values: readonly string[] = DOCUMENTED_VALUES[field];
  return IGNORE_CASE.has(field)
    ? values.some((item) => item.toLowerCase() === value.toLowerCase())
    : values.includes(value);
}

/** The documented values of a Graph property signal, when it is an enum. */
export function graphPropertyValues(
  propertyPath: string,
): readonly string[] | undefined {
  return Object.hasOwn(DOCUMENTED_VALUES, propertyPath)
    ? DOCUMENTED_VALUES[propertyPath as DocumentedField]
    : undefined;
}

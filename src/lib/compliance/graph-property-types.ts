// The documented Microsoft Graph type of every plain property the snapshot
// projection keeps (projection.ts: the item keys, the compound check fields,
// the engine's Graph property signals and the Conditional Access fields), by
// normalized resource type and property path. Type names are the ones in the
// Graph beta metadata: Edm primitives, Collection(...) and enum type names.
// Generated from the resource schemas of the msgraph skill
// (api-docs-search --resource <type>, 23 October 2026) and checked against
// GET /beta/deviceManagement/deviceCompliancePolicies in the lab tenant
// (passwordMinutesOfInactivityBeforeLock 15 or null, the Booleans true or
// false). graph-property-types.test.ts fails when the projection keeps a
// property this table does not type, so a new detector adds its type here.

/**
 * A Graph type name: an Edm primitive, Collection(...) or an enum type, or
 * Untyped for a kept property Graph does not document.
 */
export type GraphTypeName = string;

export const GRAPH_PROPERTY_TYPES: Readonly<
  Record<string, Readonly<Record<string, GraphTypeName>>>
> = {
  androidcompliancepolicy: {
    osMinimumVersion: "String",
    passwordMinutesOfInactivityBeforeLock: "Int32",
    passwordRequired: "Boolean",
    securityBlockJailbrokenDevices: "Boolean",
    securityRequireSafetyNetAttestationBasicIntegrity: "Boolean",
    storageRequireEncryption: "Boolean",
  },
  androiddeviceownercompliancepolicy: {
    osMinimumVersion: "String",
    passwordMinutesOfInactivityBeforeLock: "Int32",
    passwordRequired: "Boolean",
    securityBlockJailbrokenDevices: "Boolean",
    securityRequireSafetyNetAttestationBasicIntegrity: "Boolean",
    storageRequireEncryption: "Boolean",
  },
  androidgeneraldeviceconfiguration: {
    passwordRequired: "Boolean",
    storageRequireDeviceEncryption: "Boolean",
  },
  androidmanagedappprotection: {
    allowedOutboundDataTransferDestinations: "managedAppDataTransferLevel",
  },
  androidworkprofilecompliancepolicy: {
    osMinimumVersion: "String",
    passwordMinutesOfInactivityBeforeLock: "Int32",
    passwordRequired: "Boolean",
    securityBlockJailbrokenDevices: "Boolean",
    securityRequireSafetyNetAttestationBasicIntegrity: "Boolean",
    storageRequireEncryption: "Boolean",
  },
  androidworkprofilegeneraldeviceconfiguration: {
    workProfileBlockPersonalAppInstallsFromUnknownSources: "Boolean",
  },
  aospdeviceownerdeviceconfiguration: {
    appsBlockInstallFromUnknownSources: "Boolean",
  },
  ioscompliancepolicy: {
    osMinimumVersion: "String",
    passcodeMinutesOfInactivityBeforeScreenTimeout: "Int32",
    passcodeRequired: "Boolean",
    securityBlockJailbrokenDevices: "Boolean",
  },
  iosgeneraldeviceconfiguration: {
    passcodeRequired: "Boolean",
  },
  iosmanagedappprotection: {
    allowedOutboundDataTransferDestinations: "managedAppDataTransferLevel",
  },
  macoscompliancepolicy: {
    firewallEnabled: "Boolean",
    osMinimumVersion: "String",
    passwordMinutesOfInactivityBeforeLock: "Int32",
    passwordRequired: "Boolean",
    storageRequireEncryption: "Boolean",
    systemIntegrityProtectionEnabled: "Boolean",
  },
  macosendpointprotectionconfiguration: {
    fileVaultEnabled: "Boolean",
    firewallEnabled: "Boolean",
    gatekeeperAllowedAppSource: "macOSGatekeeperAppSources",
  },
  macosgeneraldeviceconfiguration: {
    passwordRequired: "Boolean",
  },
  windows10compliancepolicy: {
    activeFirewallRequired: "Boolean",
    antivirusRequired: "Boolean",
    bitLockerEnabled: "Boolean",
    codeIntegrityEnabled: "Boolean",
    defenderEnabled: "Boolean",
    memoryIntegrityEnabled: "Boolean",
    osMinimumVersion: "String",
    passwordMinutesOfInactivityBeforeLock: "Int32",
    passwordRequired: "Boolean",
    rtpEnabled: "Boolean",
    secureBootEnabled: "Boolean",
    storageRequireEncryption: "Boolean",
    virtualizationBasedSecurityEnabled: "Boolean",
  },
  windows10endpointprotectionconfiguration: {
    appLockerApplicationControl: "appLockerApplicationControlType",
    bitLockerEncryptDevice: "Boolean",
    defenderAdobeReaderLaunchChildProcess: "defenderProtectionType",
    defenderAllowBehaviorMonitoring: "Boolean",
    defenderAllowIntrusionPreventionSystem: "Boolean",
    defenderOfficeAppsExecutableContentCreationOrLaunchType:
      "defenderAttackSurfaceType",
    defenderOfficeAppsLaunchChildProcessType: "defenderAttackSurfaceType",
    defenderOfficeAppsOtherProcessInjectionType: "defenderAttackSurfaceType",
    defenderOfficeMacroCodeAllowWin32ImportsType: "defenderAttackSurfaceType",
    defenderPreventCredentialStealingType: "defenderProtectionType",
    defenderScanType: "defenderScanType",
    defenderScheduledScanDay: "weeklySchedule",
    defenderScheduledScanTime: "TimeOfDay",
    deviceGuardEnableVirtualizationBasedSecurity: "Boolean",
    deviceGuardLocalSystemAuthorityCredentialGuardSettings:
      "deviceGuardLocalSystemAuthorityCredentialGuardType",
    "firewallProfileDomain.firewallEnabled": "stateManagementSetting",
    "firewallProfilePrivate.firewallEnabled": "stateManagementSetting",
    "firewallProfilePublic.firewallEnabled": "stateManagementSetting",
  },
  windows10generalconfiguration: {
    cortanaBlocked: "Boolean",
    defenderRequireBehaviorMonitoring: "Boolean",
    defenderRequireNetworkInspectionSystem: "Boolean",
    defenderRequireRealTimeMonitoring: "Boolean",
    defenderScanType: "defenderScanType",
    defenderScheduledScanTime: "TimeOfDay",
    defenderSystemScanSchedule: "weeklySchedule",
    diagnosticsDataSubmissionMode: "diagnosticDataSubmissionMode",
    microsoftAccountBlocked: "Boolean",
    passwordRequired: "Boolean",
  },
  windowsupdateforbusinessconfiguration: {
    automaticUpdateMode: "automaticUpdateMode",
    deadlineForQualityUpdatesInDays: "Int32",
    deadlineGracePeriodInDays: "Int32",
    qualityUpdatesDeferralPeriodInDays: "Int32",
    qualityUpdatesPaused: "Boolean",
  },
  // Conditional Access, by the paths the projection keeps
  // (conditionalAccessPolicy and the complex types below it).
  conditionalaccesspolicy: {
    state: "conditionalAccessPolicyState",
    // Kept while Graph returns them, which it does not document: times is
    // deprecated, agents and includeAgentActions are not in the reference
    // (the lab tenant returns null and an empty list). Their type is
    // unknown, so only null and an empty list are read; any other value is
    // unreadable (graph-rows.ts documentedPropertyValue).
    "conditions.times": "Untyped",
    "conditions.agents": "Untyped",
    "conditions.applications.includeAgentActions": "Untyped",
    "conditions.userRiskLevels": "Collection(riskLevel)",
    "conditions.signInRiskLevels": "Collection(riskLevel)",
    "conditions.servicePrincipalRiskLevels": "Collection(riskLevel)",
    "conditions.insiderRiskLevels": "conditionalAccessInsiderRiskLevels",
    "conditions.agentIdRiskLevels": "conditionalAccessAgentIdRiskLevels",
    "conditions.clientAppTypes": "Collection(conditionalAccessClientApp)",
    ...Object.fromEntries(
      ["include", "exclude"].flatMap((mode) => [
        ...["Users", "Groups", "Roles"].map((target) => [
          `conditions.users.${mode}${target}`,
          "Collection(String)",
        ]),
        [`conditions.applications.${mode}Applications`, "Collection(String)"],
        [
          `conditions.platforms.${mode}Platforms`,
          "Collection(conditionalAccessDevicePlatform)",
        ],
        [`conditions.locations.${mode}Locations`, "Collection(String)"],
        [`conditions.deviceStates.${mode}States`, "Collection(String)"],
        [`conditions.devices.${mode}Devices`, "Collection(String)"],
        [`conditions.devices.${mode}DeviceStates`, "Collection(String)"],
        [
          `conditions.clientApplications.${mode}ServicePrincipals`,
          "Collection(String)",
        ],
        [
          `conditions.clientApplications.${mode}AgentIdServicePrincipals`,
          "Collection(String)",
        ],
        [
          `conditions.users.${mode}GuestsOrExternalUsers.guestOrExternalUserTypes`,
          "conditionalAccessGuestOrExternalUserTypes",
        ],
        [
          `conditions.users.${mode}GuestsOrExternalUsers.externalTenants.@odata.type`,
          "conditionalAccessExternalTenants",
        ],
        [
          `conditions.users.${mode}GuestsOrExternalUsers.externalTenants.membershipKind`,
          "conditionalAccessExternalTenantsMembershipKind",
        ],
        [
          `conditions.users.${mode}GuestsOrExternalUsers.externalTenants.members`,
          "Collection(String)",
        ],
      ]),
    ),
    "conditions.applications.includeUserActions": "Collection(String)",
    "conditions.applications.includeAuthenticationContextClassReferences":
      "Collection(String)",
    ...Object.fromEntries(
      [
        "applications.applicationFilter",
        "devices.deviceFilter",
        "clientApplications.servicePrincipalFilter",
        "clientApplications.agentIdServicePrincipalFilter",
      ].flatMap((filter) => [
        [`conditions.${filter}.mode`, "filterMode"],
        [`conditions.${filter}.rule`, "String"],
      ]),
    ),
    "conditions.authenticationFlows.transferMethods":
      "conditionalAccessTransferMethods",
    "grantControls.operator": "String",
    "grantControls.builtInControls":
      "Collection(conditionalAccessGrantControl)",
    "grantControls.customAuthenticationFactors": "Collection(String)",
    "grantControls.termsOfUse": "Collection(String)",
    "grantControls.authenticationStrength.id": "String",
    "grantControls.authenticationStrength.displayName": "String",
    "grantControls.authenticationStrength.policyType":
      "authenticationStrengthPolicyType",
    "grantControls.authenticationStrength.requirementsSatisfied":
      "authenticationStrengthRequirements",
    "grantControls.authenticationStrength.allowedCombinations":
      "Collection(authenticationMethodModes)",
  },
};

// Item keys the projection keeps for every family, with the type of every
// resource that has them: deviceManagementScript, deviceShellScript,
// deviceHealthScript and deviceComplianceScript (fileName, runAsAccount,
// runAs32Bit, enforceSignatureCheck, executionFrequency, retryCount,
// blockExecutionNotifications), deviceManagementIntent (templateId) and
// deviceEnrollmentConfiguration (priority). The collector sets policyId and
// platformType as text.
export const ITEM_PROPERTY_TYPES: Readonly<Record<string, GraphTypeName>> = {
  policyId: "String",
  templateId: "String",
  platformType: "String",
  priority: "Int32",
  fileName: "String",
  runAsAccount: "runAsAccountType",
  runAs32Bit: "Boolean",
  enforceSignatureCheck: "Boolean",
  executionFrequency: "Duration",
  retryCount: "Int32",
  blockExecutionNotifications: "Boolean",
};

// The resource type of families whose items Graph returns without
// @odata.type (Conditional Access policies, lab tenant).
export const FAMILY_RESOURCE_TYPES: Readonly<Record<string, string>> = {
  conditionalAccessPolicies: "conditionalaccesspolicy",
};

// The documented item types of the families Graph lists from a polymorphic
// collection, which returns the @odata.type of every item: every concrete
// (not abstract) subtype of the collection's resource type in the Graph
// beta $metadata (23 October 2026). Every type the lab tenant returns is
// one of them (deviceConfigurations, deviceCompliancePolicies and
// deviceEnrollmentConfigurations, 23 October 2026). Windows update rings
// are the deviceConfigurations Graph filters by
// isof('microsoft.graph.windowsUpdateForBusinessConfiguration'), which has
// no subtype. The type selects which fields are kept and how they are
// read, so an item of another type is incomplete (snapshot projection).

// Every concrete subtype of deviceConfiguration.
const DEVICE_CONFIGURATION_TYPES = [
  "androidCustomConfiguration",
  "androidDeviceOwnerDerivedCredentialAuthenticationConfiguration",
  "androidDeviceOwnerEnterpriseWiFiConfiguration",
  "androidDeviceOwnerGeneralDeviceConfiguration",
  "androidDeviceOwnerImportedPFXCertificateProfile",
  "androidDeviceOwnerPkcsCertificateProfile",
  "androidDeviceOwnerScepCertificateProfile",
  "androidDeviceOwnerTrustedRootCertificate",
  "androidDeviceOwnerVpnConfiguration",
  "androidDeviceOwnerWiFiConfiguration",
  "androidEasEmailProfileConfiguration",
  "androidEnterpriseWiFiConfiguration",
  "androidForWorkCustomConfiguration",
  "androidForWorkEnterpriseWiFiConfiguration",
  "androidForWorkGeneralDeviceConfiguration",
  "androidForWorkGmailEasConfiguration",
  "androidForWorkImportedPFXCertificateProfile",
  "androidForWorkNineWorkEasConfiguration",
  "androidForWorkPkcsCertificateProfile",
  "androidForWorkScepCertificateProfile",
  "androidForWorkTrustedRootCertificate",
  "androidForWorkVpnConfiguration",
  "androidForWorkWiFiConfiguration",
  "androidGeneralDeviceConfiguration",
  "androidImportedPFXCertificateProfile",
  "androidOmaCpConfiguration",
  "androidPkcsCertificateProfile",
  "androidScepCertificateProfile",
  "androidTrustedRootCertificate",
  "androidVpnConfiguration",
  "androidWiFiConfiguration",
  "androidWorkProfileCustomConfiguration",
  "androidWorkProfileEnterpriseWiFiConfiguration",
  "androidWorkProfileGeneralDeviceConfiguration",
  "androidWorkProfileGmailEasConfiguration",
  "androidWorkProfileNineWorkEasConfiguration",
  "androidWorkProfilePkcsCertificateProfile",
  "androidWorkProfileScepCertificateProfile",
  "androidWorkProfileTrustedRootCertificate",
  "androidWorkProfileVpnConfiguration",
  "androidWorkProfileWiFiConfiguration",
  "aospDeviceOwnerDeviceConfiguration",
  "aospDeviceOwnerEnterpriseWiFiConfiguration",
  "aospDeviceOwnerPkcsCertificateProfile",
  "aospDeviceOwnerScepCertificateProfile",
  "aospDeviceOwnerTrustedRootCertificate",
  "aospDeviceOwnerWiFiConfiguration",
  "editionUpgradeConfiguration",
  "iosCustomConfiguration",
  "iosDerivedCredentialAuthenticationConfiguration",
  "iosDeviceFeaturesConfiguration",
  "iosEasEmailProfileConfiguration",
  "iosEduDeviceConfiguration",
  "iosEducationDeviceConfiguration",
  "iosEnterpriseWiFiConfiguration",
  "iosExpeditedCheckinConfiguration",
  "iosGeneralDeviceConfiguration",
  "iosImportedPFXCertificateProfile",
  "iosPkcsCertificateProfile",
  "iosScepCertificateProfile",
  "iosTrustedRootCertificate",
  "iosUpdateConfiguration",
  "iosVpnConfiguration",
  "iosWiFiConfiguration",
  "iosWiredNetworkConfiguration",
  "iosikEv2VpnConfiguration",
  "macOSCustomAppConfiguration",
  "macOSCustomConfiguration",
  "macOSDeviceFeaturesConfiguration",
  "macOSEndpointProtectionConfiguration",
  "macOSEnterpriseWiFiConfiguration",
  "macOSExtensionsConfiguration",
  "macOSGeneralDeviceConfiguration",
  "macOSImportedPFXCertificateProfile",
  "macOSPkcsCertificateProfile",
  "macOSScepCertificateProfile",
  "macOSSoftwareUpdateConfiguration",
  "macOSTrustedRootCertificate",
  "macOSVpnConfiguration",
  "macOSWiFiConfiguration",
  "macOSWiredNetworkConfiguration",
  "sharedPCConfiguration",
  "unsupportedDeviceConfiguration",
  "windows10CustomConfiguration",
  "windows10DeviceFirmwareConfigurationInterface",
  "windows10EasEmailProfileConfiguration",
  "windows10EndpointProtectionConfiguration",
  "windows10EnterpriseModernAppManagementConfiguration",
  "windows10GeneralConfiguration",
  "windows10ImportedPFXCertificateProfile",
  "windows10NetworkBoundaryConfiguration",
  "windows10PFXImportCertificateProfile",
  "windows10PkcsCertificateProfile",
  "windows10SecureAssessmentConfiguration",
  "windows10TeamGeneralConfiguration",
  "windows10VpnConfiguration",
  "windows81GeneralConfiguration",
  "windows81SCEPCertificateProfile",
  "windows81TrustedRootCertificate",
  "windows81VpnConfiguration",
  "windows81WifiImportConfiguration",
  "windowsDefenderAdvancedThreatProtectionConfiguration",
  "windowsDeliveryOptimizationConfiguration",
  "windowsDomainJoinConfiguration",
  "windowsHealthMonitoringConfiguration",
  "windowsIdentityProtectionConfiguration",
  "windowsKioskConfiguration",
  "windowsPhone81CustomConfiguration",
  "windowsPhone81GeneralConfiguration",
  "windowsPhone81ImportedPFXCertificateProfile",
  "windowsPhone81SCEPCertificateProfile",
  "windowsPhone81TrustedRootCertificate",
  "windowsPhone81VpnConfiguration",
  "windowsPhoneEASEmailProfileConfiguration",
  "windowsUpdateForBusinessConfiguration",
  "windowsWifiConfiguration",
  "windowsWifiEnterpriseEAPConfiguration",
  "windowsWiredNetworkConfiguration",
  "windowsZtdnsConfiguration",
];

// Every concrete subtype of deviceCompliancePolicy.
const COMPLIANCE_POLICY_TYPES = [
  "androidCompliancePolicy",
  "androidDeviceOwnerCompliancePolicy",
  "androidForWorkCompliancePolicy",
  "androidWorkProfileCompliancePolicy",
  "aospDeviceOwnerCompliancePolicy",
  "defaultDeviceCompliancePolicy",
  "iosCompliancePolicy",
  "macOSCompliancePolicy",
  "windows10CompliancePolicy",
  "windows10MobileCompliancePolicy",
  "windows81CompliancePolicy",
  "windowsPhone81CompliancePolicy",
];

// Every concrete subtype of deviceEnrollmentConfiguration.
const ENROLLMENT_CONFIGURATION_TYPES = [
  "deviceComanagementAuthorityConfiguration",
  "deviceEnrollmentLimitConfiguration",
  "deviceEnrollmentNotificationConfiguration",
  "deviceEnrollmentPlatformRestrictionConfiguration",
  "deviceEnrollmentPlatformRestrictionsConfiguration",
  "deviceEnrollmentWindowsHelloForBusinessConfiguration",
  "windows10EnrollmentCompletionPageConfiguration",
  "windowsRestoreDeviceEnrollmentConfiguration",
];

const lower = (types: readonly string[]): ReadonlySet<string> =>
  new Set(types.map((type) => type.toLowerCase()));

/** The documented item types of each typed family, normalized (lower case). */
export const FAMILY_ITEM_TYPES: Readonly<Record<string, ReadonlySet<string>>> =
  {
    deviceConfigurations: lower(DEVICE_CONFIGURATION_TYPES),
    compliancePolicies: lower(COMPLIANCE_POLICY_TYPES),
    windowsUpdatePolicies: lower(["windowsUpdateForBusinessConfiguration"]),
    enrollmentConfigurations: lower(ENROLLMENT_CONFIGURATION_TYPES),
  };

import { LEGACY_SIGNALS } from "./legacy-signals";
import { ADDITIONAL_CAPABILITIES } from "./additional-capabilities";
import type { ComplianceCapability } from "./types";

// Every signal asserts a concrete Intune setting with the value that actually
// enforces the capability. A setting that is present but set to a
// non-enforcing value is recorded as counter-evidence via disabledWhen.
// Settings not listed here are never counted, in either direction.

const CORE_CAPABILITIES: readonly ComplianceCapability[] = [
  {
    id: "windows-disk-encryption",
    platform: "windows",
    name: "Disk encryption (BitLocker)",
    description:
      "Windows devices are required to encrypt local storage with BitLocker.",
    signals: [
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "device_vendor_msft_bitlocker_requiredeviceencryption",
        enforcedWhen: {
          kind: "equals",
          value: "device_vendor_msft_bitlocker_requiredeviceencryption_1",
        },
        disabledWhen: {
          kind: "equals",
          value: "device_vendor_msft_bitlocker_requiredeviceencryption_0",
        },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10EndpointProtectionConfiguration"],
        propertyPath: "bitLockerEncryptDevice",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10CompliancePolicy"],
        propertyPath: "bitLockerEnabled",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10CompliancePolicy"],
        propertyPath: "storageRequireEncryption",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "windows-realtime-antimalware",
    platform: "windows",
    name: "Real-time antimalware (Microsoft Defender)",
    description:
      "Microsoft Defender real-time protection is required on Windows devices.",
    signals: [
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "device_vendor_msft_policy_config_defender_allowrealtimemonitoring",
        enforcedWhen: {
          kind: "equals",
          value:
            "device_vendor_msft_policy_config_defender_allowrealtimemonitoring_1",
        },
        disabledWhen: {
          kind: "equals",
          value:
            "device_vendor_msft_policy_config_defender_allowrealtimemonitoring_0",
        },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10GeneralConfiguration"],
        propertyPath: "defenderRequireRealTimeMonitoring",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10CompliancePolicy"],
        propertyPath: "rtpEnabled",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "windows-firewall",
    platform: "windows",
    name: "Host firewall (Windows Firewall)",
    requiredGroups: ["domain", "private", "public"],
    description:
      "The Windows Firewall is required to be active on managed devices.",
    signals: [
      // Firewall CSP choice options in the settings catalog use true/false suffixes.
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "vendor_msft_firewall_mdmstore_domainprofile_enablefirewall",
        requirementGroup: "domain",
        enforcedWhen: {
          kind: "equals",
          value:
            "vendor_msft_firewall_mdmstore_domainprofile_enablefirewall_true",
        },
        disabledWhen: {
          kind: "equals",
          value:
            "vendor_msft_firewall_mdmstore_domainprofile_enablefirewall_false",
        },
      },
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "vendor_msft_firewall_mdmstore_privateprofile_enablefirewall",
        requirementGroup: "private",
        enforcedWhen: {
          kind: "equals",
          value:
            "vendor_msft_firewall_mdmstore_privateprofile_enablefirewall_true",
        },
        disabledWhen: {
          kind: "equals",
          value:
            "vendor_msft_firewall_mdmstore_privateprofile_enablefirewall_false",
        },
      },
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "vendor_msft_firewall_mdmstore_publicprofile_enablefirewall",
        requirementGroup: "public",
        enforcedWhen: {
          kind: "equals",
          value:
            "vendor_msft_firewall_mdmstore_publicprofile_enablefirewall_true",
        },
        disabledWhen: {
          kind: "equals",
          value:
            "vendor_msft_firewall_mdmstore_publicprofile_enablefirewall_false",
        },
      },
      // windowsFirewallNetworkProfile.firewallEnabled: "allowed" turns the firewall
      // on, "blocked" forces it off, "notConfigured" leaves the device default.
      {
        source: "graphProperty",
        odataTypes: ["windows10EndpointProtectionConfiguration"],
        propertyPath: "firewallProfileDomain.firewallEnabled",
        requirementGroup: "domain",
        enforcedWhen: { kind: "equals", value: "allowed" },
        disabledWhen: { kind: "equals", value: "blocked" },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10EndpointProtectionConfiguration"],
        propertyPath: "firewallProfilePrivate.firewallEnabled",
        requirementGroup: "private",
        enforcedWhen: { kind: "equals", value: "allowed" },
        disabledWhen: { kind: "equals", value: "blocked" },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10EndpointProtectionConfiguration"],
        propertyPath: "firewallProfilePublic.firewallEnabled",
        requirementGroup: "public",
        enforcedWhen: { kind: "equals", value: "allowed" },
        disabledWhen: { kind: "equals", value: "blocked" },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10CompliancePolicy"],
        propertyPath: "activeFirewallRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "windows-password-required",
    platform: "windows",
    name: "Password required (Windows)",
    description: "Windows devices require a password or PIN to unlock.",
    signals: [
      // DeviceLock CSP inverts the value: DevicePasswordEnabled 0 = required,
      // 1 = not required.
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "device_vendor_msft_policy_config_devicelock_devicepasswordenabled",
        enforcedWhen: {
          kind: "equals",
          value:
            "device_vendor_msft_policy_config_devicelock_devicepasswordenabled_0",
        },
        disabledWhen: {
          kind: "equals",
          value:
            "device_vendor_msft_policy_config_devicelock_devicepasswordenabled_1",
        },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10GeneralConfiguration"],
        propertyPath: "passwordRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["windows10CompliancePolicy"],
        propertyPath: "passwordRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "windows-automatic-updates",
    platform: "windows",
    name: "Automatic updates (Windows Update)",
    description:
      "Windows updates install automatically without requiring user opt-in.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["windowsUpdateForBusinessConfiguration"],
        propertyPath: "automaticUpdateMode",
        enforcedWhen: {
          kind: "oneOf",
          values: [
            "autoInstallAtMaintenanceTime",
            "autoInstallAndRebootAtMaintenanceTime",
            "autoInstallAndRebootAtScheduledTime",
            "autoInstallAndRebootWithoutEndUserControl",
          ],
        },
      },
      // Update CSP AllowAutoUpdate: 1-4 auto-install, 0 only notifies, 5 disables.
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "device_vendor_msft_policy_config_update_allowautoupdate",
        enforcedWhen: {
          kind: "oneOf",
          values: [
            "device_vendor_msft_policy_config_update_allowautoupdate_1",
            "device_vendor_msft_policy_config_update_allowautoupdate_2",
            "device_vendor_msft_policy_config_update_allowautoupdate_3",
            "device_vendor_msft_policy_config_update_allowautoupdate_4",
          ],
        },
        disabledWhen: {
          kind: "equals",
          value: "device_vendor_msft_policy_config_update_allowautoupdate_5",
        },
      },
    ],
  },
  {
    id: "windows-secure-boot",
    platform: "windows",
    name: "Secure Boot required",
    description: "Windows devices must report Secure Boot as enabled.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["windows10CompliancePolicy"],
        propertyPath: "secureBootEnabled",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "windows-code-integrity",
    platform: "windows",
    name: "Code integrity required",
    description: "Windows devices must report code integrity as enabled.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["windows10CompliancePolicy"],
        propertyPath: "codeIntegrityEnabled",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "windows-telemetry-minimized",
    platform: "windows",
    name: "Diagnostic data minimized (Windows)",
    description:
      "Windows diagnostic data submission is restricted to the security level (telemetry level 0).",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["windows10GeneralConfiguration"],
        propertyPath: "diagnosticsDataSubmissionMode",
        enforcedWhen: { kind: "equals", value: "none" },
        disabledWhen: { kind: "oneOf", values: ["basic", "enhanced", "full"] },
      },
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "device_vendor_msft_policy_config_system_allowtelemetry",
        enforcedWhen: {
          kind: "equals",
          value: "device_vendor_msft_policy_config_system_allowtelemetry_0",
        },
        disabledWhen: {
          kind: "oneOf",
          values: [
            "device_vendor_msft_policy_config_system_allowtelemetry_1",
            "device_vendor_msft_policy_config_system_allowtelemetry_2",
            "device_vendor_msft_policy_config_system_allowtelemetry_3",
          ],
        },
      },
    ],
  },
  {
    id: "windows-cortana-disabled",
    platform: "windows",
    name: "Cortana disabled",
    description: "The Cortana voice assistant is blocked on Windows devices.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["windows10GeneralConfiguration"],
        propertyPath: "cortanaBlocked",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "device_vendor_msft_policy_config_experience_allowcortana",
        enforcedWhen: {
          kind: "equals",
          value: "device_vendor_msft_policy_config_experience_allowcortana_0",
        },
        disabledWhen: {
          kind: "equals",
          value: "device_vendor_msft_policy_config_experience_allowcortana_1",
        },
      },
    ],
  },
  {
    id: "windows-microsoft-account-blocked",
    platform: "windows",
    name: "Microsoft accounts blocked",
    description:
      "Sign-in with consumer Microsoft accounts is blocked on Windows devices.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["windows10GeneralConfiguration"],
        propertyPath: "microsoftAccountBlocked",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "windows-minimum-os-version",
    platform: "windows",
    name: "Minimum OS version (Windows)",
    description:
      "A minimum Windows version is required for devices to be compliant.",
    caveat: {
      en: "A minimum version is configured; whether it is current is not assessed.",
      de: "Eine Mindestversion ist konfiguriert; ob sie aktuell ist, wird nicht bewertet.",
    },
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["windows10CompliancePolicy"],
        propertyPath: "osMinimumVersion",
        enforcedWhen: { kind: "nonEmptyString" },
      },
    ],
  },
  {
    id: "macos-disk-encryption",
    platform: "macos",
    name: "Disk encryption (FileVault)",
    description:
      "macOS devices are required to encrypt storage with FileVault.",
    signals: [
      // FileVault choice options resolve to On = _0, Off = _1 (verified via
      // the configurationSettings definition metadata).
      {
        source: "settingsCatalog",
        settingDefinitionId: "com.apple.mcx.filevault2_enable",
        enforcedWhen: {
          kind: "equals",
          value: "com.apple.mcx.filevault2_enable_0",
        },
        disabledWhen: {
          kind: "equals",
          value: "com.apple.mcx.filevault2_enable_1",
        },
      },
      {
        source: "settingsCatalog",
        settingDefinitionId:
          "com.apple.mcx.filevault2_forceenableinsetupassistant",
        enforcedWhen: {
          kind: "equals",
          value: "com.apple.mcx.filevault2_forceenableinsetupassistant_true",
        },
      },
      {
        source: "graphProperty",
        odataTypes: ["macOSEndpointProtectionConfiguration"],
        propertyPath: "fileVaultEnabled",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["macOSCompliancePolicy"],
        propertyPath: "storageRequireEncryption",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "macos-firewall",
    platform: "macos",
    name: "Host firewall (macOS)",
    description: "The macOS application firewall is required to be active.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["macOSEndpointProtectionConfiguration"],
        propertyPath: "firewallEnabled",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["macOSCompliancePolicy"],
        propertyPath: "firewallEnabled",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "macos-password-required",
    platform: "macos",
    name: "Password required (macOS)",
    description: "macOS devices require a password to unlock.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["macOSGeneralDeviceConfiguration"],
        propertyPath: "passwordRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["macOSCompliancePolicy"],
        propertyPath: "passwordRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "macos-system-integrity",
    platform: "macos",
    name: "System Integrity Protection",
    description:
      "macOS devices must have System Integrity Protection enabled to be compliant.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["macOSCompliancePolicy"],
        propertyPath: "systemIntegrityProtectionEnabled",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "macos-gatekeeper",
    platform: "macos",
    name: "Gatekeeper app source restriction",
    description:
      "macOS Gatekeeper only allows apps from the App Store or identified developers.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["macOSEndpointProtectionConfiguration"],
        propertyPath: "gatekeeperAllowedAppSource",
        enforcedWhen: {
          kind: "oneOf",
          values: ["macAppStore", "macAppStoreAndIdentifiedDevelopers"],
        },
        disabledWhen: { kind: "equals", value: "anywhere" },
      },
    ],
  },
  {
    id: "macos-minimum-os-version",
    platform: "macos",
    name: "Minimum OS version (macOS)",
    description:
      "A minimum macOS version is required for devices to be compliant.",
    caveat: {
      en: "A minimum version is configured; whether it is current is not assessed.",
      de: "Eine Mindestversion ist konfiguriert; ob sie aktuell ist, wird nicht bewertet.",
    },
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["macOSCompliancePolicy"],
        propertyPath: "osMinimumVersion",
        enforcedWhen: { kind: "nonEmptyString" },
      },
    ],
  },
  {
    id: "ios-passcode-required",
    platform: "ios",
    name: "Passcode required (iOS/iPadOS)",
    description: "iOS and iPadOS devices require a passcode to unlock.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["iosGeneralDeviceConfiguration"],
        propertyPath: "passcodeRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["iosCompliancePolicy"],
        propertyPath: "passcodeRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "ios-jailbreak-block",
    platform: "ios",
    name: "Jailbreak compliance requirement",
    description: "Jailbroken iOS devices are marked noncompliant.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["iosCompliancePolicy"],
        propertyPath: "securityBlockJailbrokenDevices",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "ios-minimum-os-version",
    platform: "ios",
    name: "Minimum OS version (iOS/iPadOS)",
    description:
      "A minimum iOS/iPadOS version is required for devices to be compliant.",
    caveat: {
      en: "A minimum version is configured; whether it is current is not assessed.",
      de: "Eine Mindestversion ist konfiguriert; ob sie aktuell ist, wird nicht bewertet.",
    },
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["iosCompliancePolicy"],
        propertyPath: "osMinimumVersion",
        enforcedWhen: { kind: "nonEmptyString" },
      },
    ],
  },
  {
    id: "android-storage-encryption",
    platform: "android",
    name: "Storage encryption (Android)",
    description: "Android devices are required to encrypt device storage.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["androidGeneralDeviceConfiguration"],
        propertyPath: "storageRequireDeviceEncryption",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: [
          "androidCompliancePolicy",
          "androidWorkProfileCompliancePolicy",
          "androidDeviceOwnerCompliancePolicy",
        ],
        propertyPath: "storageRequireEncryption",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "android-password-required",
    platform: "android",
    name: "Password required (Android)",
    description: "Android devices require a password or PIN to unlock.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: ["androidGeneralDeviceConfiguration"],
        propertyPath: "passwordRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: [
          "androidCompliancePolicy",
          "androidWorkProfileCompliancePolicy",
          "androidDeviceOwnerCompliancePolicy",
        ],
        propertyPath: "passwordRequired",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "android-device-integrity",
    platform: "android",
    name: "Device integrity (Android)",
    description:
      "Android compliance policy requires an unrooted device or basic integrity attestation.",
    signals: [
      {
        source: "graphProperty",
        odataTypes: [
          "androidCompliancePolicy",
          "androidWorkProfileCompliancePolicy",
          "androidDeviceOwnerCompliancePolicy",
        ],
        propertyPath: "securityBlockJailbrokenDevices",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: [
          "androidCompliancePolicy",
          "androidWorkProfileCompliancePolicy",
          "androidDeviceOwnerCompliancePolicy",
        ],
        propertyPath: "securityRequireSafetyNetAttestationBasicIntegrity",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "android-app-source-restriction",
    platform: "android",
    name: "App installation from unknown sources blocked (Android)",
    description:
      "Android devices are prevented from installing apps from unknown sources.",
    signals: [
      // Verified against Graph beta docs: this property lives on the AOSP
      // device-owner type, not androidGeneralDeviceConfiguration.
      {
        source: "graphProperty",
        odataTypes: ["aospDeviceOwnerDeviceConfiguration"],
        propertyPath: "appsBlockInstallFromUnknownSources",
        enforcedWhen: { kind: "equals", value: true },
      },
      {
        source: "graphProperty",
        odataTypes: ["androidWorkProfileGeneralDeviceConfiguration"],
        propertyPath: "workProfileBlockPersonalAppInstallsFromUnknownSources",
        enforcedWhen: { kind: "equals", value: true },
      },
    ],
  },
  {
    id: "android-minimum-os-version",
    platform: "android",
    name: "Minimum OS version (Android)",
    description:
      "A minimum Android version is required for devices to be compliant.",
    caveat: {
      en: "A minimum version is configured; whether it is current is not assessed.",
      de: "Eine Mindestversion ist konfiguriert; ob sie aktuell ist, wird nicht bewertet.",
    },
    signals: [
      {
        source: "graphProperty",
        odataTypes: [
          "androidCompliancePolicy",
          "androidWorkProfileCompliancePolicy",
          "androidDeviceOwnerCompliancePolicy",
        ],
        propertyPath: "osMinimumVersion",
        enforcedWhen: { kind: "nonEmptyString" },
      },
    ],
  },
  ...ADDITIONAL_CAPABILITIES,
];

export const COMPLIANCE_CAPABILITIES: readonly ComplianceCapability[] =
  CORE_CAPABILITIES.map((capability) => ({
    ...capability,
    signals: [...capability.signals, ...(LEGACY_SIGNALS[capability.id] ?? [])],
  }));

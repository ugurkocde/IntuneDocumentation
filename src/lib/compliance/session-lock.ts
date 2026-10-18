import additionalVerified from "./additional-verified-settings.json";
import type {
  ComplianceCapability,
  GraphPropertySignal,
  SettingsCatalogSignal,
} from "./types";

// Screen lock after inactivity. Any explicitly configured positive limit is
// the observation; the engine invents no maximum, because the acceptable
// period is organisation-defined. Zero means "no timeout" and is
// counter-evidence. A lock is not a logoff, so HIPAA automatic logoff stays
// unevaluated. Identifiers verified through Graph beta on 18 October 2026 and
// recorded in additional-verified-settings.json.

function verified(id: string): string {
  if (!additionalVerified.catalog.some((row) => row.id === id))
    throw new Error(`Unverified setting definition: ${id}`);
  return id;
}

const PASSWORD_ENABLED = verified(
  "device_vendor_msft_policy_config_devicelock_devicepasswordenabled",
);
// DeviceLock CSP: option value 0 ("Enabled") turns the device lock on.
const PASSWORD_ENABLED_ON = `${PASSWORD_ENABLED}_0`;

const positive = { kind: "atLeast", value: 1 } as const;
const zero = { kind: "equals", value: 0 } as const;

const catalogLimit = (
  id: string,
  prerequisite?: string,
): SettingsCatalogSignal => ({
  source: "settingsCatalog",
  settingDefinitionId: verified(id),
  enforcedWhen: positive,
  disabledWhen: zero,
  ...(prerequisite
    ? {
        prerequisites: [
          { settingDefinitionId: PASSWORD_ENABLED, values: [prerequisite] },
        ],
      }
    : {}),
});

const property = (
  odataTypes: string[],
  propertyPath: string,
): GraphPropertySignal => ({
  source: "graphProperty",
  odataTypes,
  propertyPath,
  enforcedWhen: positive,
  disabledWhen: zero,
});

const caveat = {
  en: "A configured inactivity limit locks the screen; it does not sign the user out or end the session. Whether the limit meets the organisation's required period is not assessed.",
  de: "Ein konfiguriertes Inaktivitätslimit sperrt den Bildschirm; es meldet den Benutzer nicht ab und beendet die Sitzung nicht. Ob das Limit dem vorgeschriebenen Zeitraum der Organisation entspricht, wird nicht bewertet.",
};

const complianceDocs = (type: string) =>
  `https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfig-${type.toLowerCase()}?view=graph-rest-beta`;

export const SESSION_LOCK_CAPABILITIES: readonly ComplianceCapability[] = [
  {
    id: "windows-inactivity-lock",
    platform: "windows",
    name: "Screen lock after inactivity (Windows)",
    description:
      "A positive inactivity limit locks Windows devices: the DeviceLock maximum inactivity time (minutes, with the device lock enabled), the interactive logon machine inactivity limit (seconds) or the compliance requirement for minutes of inactivity before a password is required.",
    caveat,
    documentationUrl:
      "https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-devicelock#maxinactivitytimedevicelock",
    signals: [
      catalogLimit(
        "device_vendor_msft_policy_config_devicelock_maxinactivitytimedevicelock",
        PASSWORD_ENABLED_ON,
      ),
      catalogLimit(
        "device_vendor_msft_policy_config_localpoliciessecurityoptions_interactivelogon_machineinactivitylimit_v2",
      ),
      property(
        ["windows10CompliancePolicy"],
        "passwordMinutesOfInactivityBeforeLock",
      ),
    ],
  },
  {
    id: "macos-inactivity-lock",
    platform: "macos",
    name: "Screen lock after inactivity (macOS)",
    description:
      "A macOS compliance policy requires a password after a positive number of minutes of inactivity.",
    caveat,
    documentationUrl: complianceDocs("macOSCompliancePolicy"),
    signals: [
      property(
        ["macOSCompliancePolicy"],
        "passwordMinutesOfInactivityBeforeLock",
      ),
    ],
  },
  {
    id: "ios-inactivity-lock",
    platform: "ios",
    name: "Screen lock after inactivity (iOS/iPadOS)",
    description:
      "An iOS compliance policy sets a positive number of minutes of inactivity before the screen times out. The separate grace period before the passcode is required is not this check.",
    caveat,
    documentationUrl: complianceDocs("iosCompliancePolicy"),
    signals: [
      property(
        ["iosCompliancePolicy"],
        "passcodeMinutesOfInactivityBeforeScreenTimeout",
      ),
    ],
  },
  {
    id: "android-inactivity-lock",
    platform: "android",
    name: "Screen lock after inactivity (Android)",
    description:
      "An Android compliance policy requires a password after a positive number of minutes of inactivity.",
    caveat,
    documentationUrl: complianceDocs("androidCompliancePolicy"),
    signals: [
      property(
        [
          "androidCompliancePolicy",
          "androidWorkProfileCompliancePolicy",
          "androidDeviceOwnerCompliancePolicy",
        ],
        "passwordMinutesOfInactivityBeforeLock",
      ),
    ],
  },
];

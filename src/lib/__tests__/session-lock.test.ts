import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import {
  assessCapabilities,
  assessCompliance,
  HIPAA_OUTSIDE_INTUNE_SCOPE,
  HIPAA_SECURITY_RULE,
} from "../compliance";
import additionalVerified from "../compliance/additional-verified-settings.json";
import { SESSION_LOCK_CAPABILITIES } from "../compliance/session-lock";

const DEVICE_LOCK = "device_vendor_msft_policy_config_devicelock";
const PASSWORD_ENABLED = `${DEVICE_LOCK}_devicepasswordenabled`;
const MAX_INACTIVITY = `${DEVICE_LOCK}_maxinactivitytimedevicelock`;
const MACHINE_LIMIT =
  "device_vendor_msft_policy_config_localpoliciessecurityoptions_interactivelogon_machineinactivitylimit_v2";

const allDevices = [
  { target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } },
];

function data(partial: Partial<DetailedExportData> = {}): DetailedExportData {
  return {
    collectedAt: "2026-10-18T00:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    ...partial,
  };
}

const integer = (settingDefinitionId: string, value: number) => ({
  settingInstance: {
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
    settingDefinitionId,
    simpleSettingValue: {
      "@odata.type":
        "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
      value,
    },
  },
});

/** DeviceLock with the device lock enabled (option 0) and a child limit. */
function deviceLock(minutes: number, enabledOption = "_0") {
  return {
    id: "device-lock",
    name: "WIN - Device lock",
    assignments: allDevices,
    settings: [
      {
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          settingDefinitionId: PASSWORD_ENABLED,
          choiceSettingValue: {
            value: `${PASSWORD_ENABLED}${enabledOption}`,
            children: [integer(MAX_INACTIVITY, minutes).settingInstance],
          },
        },
      },
    ],
  };
}

function compliance(type: string, values: Record<string, unknown>) {
  return {
    id: `${type}-policy`,
    displayName: type,
    "@odata.type": `#microsoft.graph.${type}`,
    assignments: allDevices,
    ...values,
  };
}

function capability(exportData: DetailedExportData, id: string) {
  return assessCapabilities(exportData).find(
    (row) => row.capability.id === id,
  )!;
}

describe("screen lock after inactivity", () => {
  it("uses only identifiers recorded in the verified settings JSON with source and date", () => {
    for (const id of [PASSWORD_ENABLED, MAX_INACTIVITY, MACHINE_LIMIT]) {
      const row = additionalVerified.catalog.find((item) => item.id === id) as
        | { verifiedAt?: string; source?: string }
        | undefined;
      expect(row, id).toBeDefined();
      expect(row?.verifiedAt).toBe("2026-10-18");
      expect(row?.source).toContain("configurationSettings");
    }
    const ids = SESSION_LOCK_CAPABILITIES.flatMap((item) =>
      item.signals.flatMap((signal) =>
        signal.source === "settingsCatalog"
          ? [
              signal.settingDefinitionId,
              ...(signal.prerequisites ?? []).map(
                (row) => row.settingDefinitionId,
              ),
            ]
          : [],
      ),
    );
    for (const id of ids)
      expect(additionalVerified.catalog.some((row) => row.id === id)).toBe(
        true,
      );
  });

  it("accepts any explicitly configured positive limit, without a threshold", () => {
    for (const minutes of [1, 15, 999]) {
      const result = capability(
        data({ settingsCatalog: [deviceLock(minutes)] }),
        "windows-inactivity-lock",
      );
      expect(result.status).toBe("enforced");
      expect(result.checks).toEqual([
        expect.objectContaining({
          assessmentStatus: "checked",
          result: "matches",
          settingId: MAX_INACTIVITY,
          actualValue: String(minutes),
        }),
      ]);
    }
    const seconds = capability(
      data({
        settingsCatalog: [
          {
            id: "machine-limit",
            name: "WIN - Security options",
            assignments: allDevices,
            settings: [integer(MACHINE_LIMIT, 900)],
          },
        ],
      }),
      "windows-inactivity-lock",
    );
    expect(seconds.status).toBe("enforced");
  });

  it("reports zero as a different value and counter-evidence", () => {
    const result = capability(
      data({ settingsCatalog: [deviceLock(0)] }),
      "windows-inactivity-lock",
    );
    expect(result.status).toBe("disabledByPolicy");
    expect(result.checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
      actualValue: "0",
    });
    const ios = capability(
      data({
        compliancePolicies: [
          compliance("iosCompliancePolicy", {
            passcodeMinutesOfInactivityBeforeScreenTimeout: 0,
          }),
        ],
      }),
      "ios-inactivity-lock",
    );
    expect(ios.status).toBe("disabledByPolicy");
    expect(ios.checks[0]?.result).toBe("different");
  });

  it("does not read a limit whose device lock parent is disabled", () => {
    const result = capability(
      data({ settingsCatalog: [deviceLock(15, "_1")] }),
      "windows-inactivity-lock",
    );
    expect(result.status).toBe("noEvidence");
    expect(result.checks[0]).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
  });

  it("reports a missing limit only for a complete collection", () => {
    const missing = capability(data(), "macos-inactivity-lock");
    expect(missing.status).toBe("noEvidence");
    expect(missing.checks).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "missing",
      }),
    ]);
    // Not configured reads null on compliance templates and is no result.
    const unset = capability(
      data({
        compliancePolicies: [
          compliance("macOSCompliancePolicy", {
            passwordMinutesOfInactivityBeforeLock: null,
          }),
        ],
      }),
      "macos-inactivity-lock",
    );
    expect(unset.checks[0]?.result).toBe("missing");
    const unknown = capability(
      data({ collectedAt: undefined }),
      "macos-inactivity-lock",
    );
    expect(unknown.checks[0]?.assessmentStatus).toBe("unableToCheck");
  });

  it("reads compliance requirements as requirements, per platform", () => {
    const exportData = data({
      compliancePolicies: [
        compliance("macOSCompliancePolicy", {
          passwordMinutesOfInactivityBeforeLock: 5,
        }),
        compliance("androidWorkProfileCompliancePolicy", {
          passwordMinutesOfInactivityBeforeLock: 10,
        }),
        compliance("windows10CompliancePolicy", {
          passwordMinutesOfInactivityBeforeLock: 15,
        }),
        // The passcode grace period is not the screen lock timeout.
        compliance("iosCompliancePolicy", {
          passcodeMinutesOfInactivityBeforeLock: 5,
        }),
      ],
    });
    expect(capability(exportData, "macos-inactivity-lock").status).toBe(
      "requirementAssigned",
    );
    expect(capability(exportData, "android-inactivity-lock").status).toBe(
      "requirementAssigned",
    );
    expect(capability(exportData, "windows-inactivity-lock").status).toBe(
      "requirementAssigned",
    );
    expect(capability(exportData, "ios-inactivity-lock").status).toBe(
      "noEvidence",
    );
  });

  it("maps as supporting evidence and keeps HIPAA automatic logoff unevaluated", () => {
    const assessment = assessCompliance(
      data({ settingsCatalog: [deviceLock(15)] }),
    );
    const control = (frameworkId: string, controlId: string) =>
      assessment.frameworks
        .find((framework) => framework.framework.id === frameworkId)!
        .controls.find((item) => item.control.id === controlId);
    for (const [frameworkId, controlId] of [
      ["nist-800-53-r5", "AC-11"],
      ["nist-800-171-r2", "3.1.10"],
      ["nist-800-171-r3", "03.01.10"],
      ["iso-27001-2022", "8.1"],
      ["dora-2022-2554", "RTS 13(l)"],
    ] as const) {
      const row = control(frameworkId, controlId);
      expect(row?.enforcedCapabilityIds, frameworkId).toContain(
        "windows-inactivity-lock",
      );
      expect(row?.status, frameworkId).toBe("partialEvidence");
      expect(row?.unassessedAspects.join(" ")).toContain(
        "not sign the user out",
      );
    }
    for (const item of SESSION_LOCK_CAPABILITIES)
      expect(HIPAA_SECURITY_RULE.mappings[item.id]).toEqual([]);
    expect(
      HIPAA_OUTSIDE_INTUNE_SCOPE.find(
        (measure) => measure.id === "164.312(a)(2)(iii)",
      )?.notEvaluated,
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCompliance } from "../compliance";
import {
  buildManagementSummary,
  safeguardPolicies,
  safeguardState,
} from "../compliance/management/management-summary";
import { generateFixPack } from "../compliance/fix-pack";
import { MANAGEMENT_REPORT_STRINGS } from "../compliance/management/management-report-strings";
import type { CapabilityResult } from "../compliance/types";

// Graph returns null for an unset deadline or scan time and the enum default
// userDefined ("default value, no intent", Microsoft Learn) for an unset scan
// type, day or diagnostic data level. Both shapes were read live from the lab
// tenant (update rings and the device restriction profile "DR") on
// 21 October 2026. They are a definite "not configured", never unreadable.

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

/** The lab's Pilot Ring: automatic installation, no deadline configured. */
const pilotRing = {
  "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
  id: "ring-pilot",
  displayName: "Pilot Ring",
  automaticUpdateMode: "autoInstallAndRebootAtScheduledTime",
  qualityUpdatesDeferralPeriodInDays: 0,
  qualityUpdatesPaused: false,
  deadlineForQualityUpdatesInDays: null,
  deadlineGracePeriodInDays: null,
  assignments: assigned,
};

/** The lab's device restriction profile "DR", Defender and telemetry unset. */
const restrictions = {
  "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
  id: "dr",
  displayName: "DR",
  defenderScanType: "userDefined",
  defenderSystemScanSchedule: "userDefined",
  defenderScheduledScanTime: null,
  diagnosticsDataSubmissionMode: "userDefined",
  assignments: assigned,
};

function data(
  deviceConfigurations: Record<string, unknown>[],
): DetailedExportData {
  return {
    collectedAt: "2026-10-21T09:00:00Z",
    settingsCatalog: [],
    deviceConfigurations,
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
  };
}

function capability(exportData: DetailedExportData, id: string) {
  return assessCompliance(exportData).capabilities.find(
    (result) => result.capability.id === id,
  )!;
}

function policyChecks(result: CapabilityResult) {
  return result.checks.filter((check) => check.policyId);
}

describe("values Graph reports as not configured", () => {
  it("reads a null quality update deadline as no deadline configured", () => {
    const result = capability(
      data([pilotRing]),
      "windows-quality-update-deadline",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        policyName: "Pilot Ring",
        assessmentStatus: "checked",
        result: "different",
        reason: "No quality update deadline is configured in this update ring.",
      }),
    ]);
    expect(result.status).toBe("noEvidence");
  });

  it("reads a null grace period with a deadline as no grace period configured", () => {
    const result = capability(
      data([{ ...pilotRing, deadlineForQualityUpdatesInDays: 2 }]),
      "windows-quality-update-deadline",
    );
    expect(policyChecks(result)[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
      reason:
        "No grace period after the quality update deadline is configured in this update ring.",
    });
  });

  it("reads userDefined scan values as no scheduled scan configured", () => {
    const result = capability(
      data([restrictions]),
      "windows-periodic-antimalware-scan",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        policyName: "DR",
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
    expect(policyChecks(result)[0]?.reason).toContain(
      "No scheduled scan is configured in this policy",
    );
  });

  it("reads a null scan time with a schedule as no scan time configured", () => {
    const result = capability(
      data([
        {
          ...restrictions,
          defenderScanType: "quick",
          defenderSystemScanSchedule: "everyday",
        },
      ]),
      "windows-periodic-antimalware-scan",
    );
    expect(policyChecks(result)[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
      reason: "No scheduled scan time is configured in this policy.",
    });
  });

  it("explains a userDefined diagnostic data level in plain words", () => {
    const result = capability(
      data([restrictions]),
      "windows-telemetry-minimized",
    );
    expect(policyChecks(result)[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
      actualValue: '"userDefined"',
    });
    expect(policyChecks(result)[0]?.reason).toContain(
      "Not configured in this policy: userDefined is the default with no intent",
    );
  });

  it("keeps fields that Graph did not return unreadable", () => {
    const withoutDeadline: Partial<typeof pilotRing> = { ...pilotRing };
    delete withoutDeadline.deadlineForQualityUpdatesInDays;
    const result = capability(
      data([withoutDeadline]),
      "windows-quality-update-deadline",
    );
    expect(policyChecks(result)[0]).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
  });
});

describe("fix pack for a setting left not configured", () => {
  it("names the existing policy that leaves the setting not configured", () => {
    const collection = data([restrictions]);
    const pack = generateFixPack(assessCompliance(collection), { collection });
    const gap = pack.notGeneratable.find(
      (row) => row.capabilityId === "windows-telemetry-minimized",
    );
    expect(gap?.reason).toBe(
      "A policy already holds this setting with a different value or leaves it not configured. Change that policy instead of importing a second one.",
    );
  });
});

describe("security summary for values that could not be read", () => {
  // Graph did not return the deadline, so its value cannot be read.
  const unreadableRing: Partial<typeof pilotRing> = { ...pilotRing };
  delete unreadableRing.deadlineForQualityUpdatesInDays;

  it("lists the policy and counts the safeguard as could not be read", () => {
    const assessment = assessCompliance(data([unreadableRing]));
    const result = assessment.capabilities.find(
      (row) => row.capability.id === "windows-quality-update-deadline",
    )!;
    expect(result.status).toBe("noEvidence");
    expect(safeguardState(result)).toBe("dataMissing");
    expect(safeguardPolicies(result)).toEqual([
      { name: "Pilot Ring", assigned: true },
    ]);
    const summary = buildManagementSummary(assessment, "cyber-essentials-v3", {
      limit: 50,
    });
    expect(summary.metrics.dataGaps).toBeGreaterThanOrEqual(1);
    expect(
      summary.nextActions.map((action) => action.capabilityId),
    ).not.toContain("windows-quality-update-deadline");
  });

  it("keeps a definite not configured value a missing safeguard", () => {
    const assessment = assessCompliance(data([pilotRing]));
    const result = assessment.capabilities.find(
      (row) => row.capability.id === "windows-quality-update-deadline",
    )!;
    expect(safeguardState(result)).toBe("notConfigured");
    expect(
      buildManagementSummary(assessment, "cyber-essentials-v3", {
        limit: 50,
      }).nextActions.map((action) => action.capabilityId),
    ).toContain("windows-quality-update-deadline");
  });

  it("ignores unreadable values on an unassigned policy", () => {
    const assessment = assessCompliance(
      data([{ ...unreadableRing, assignments: [] }]),
    );
    const result = assessment.capabilities.find(
      (row) => row.capability.id === "windows-quality-update-deadline",
    )!;
    expect(safeguardState(result)).toBe("notConfigured");
  });
});

describe("safeguard headline wording", () => {
  it("counts safeguards set up in Intune and Entra", () => {
    expect(MANAGEMENT_REPORT_STRINGS.en.heroSentence(2, 13)).toBe(
      "2 of 13 technical safeguards are set up and switched on in Intune and Entra.",
    );
    expect(MANAGEMENT_REPORT_STRINGS.de.heroSentence(2, 13)).toBe(
      "2 von 13 technischen Schutzfunktionen sind in Intune und Entra eingerichtet und eingeschaltet.",
    );
    const guide = MANAGEMENT_REPORT_STRINGS.en.guideSections
      .flatMap((section) => section.bullets ?? [])
      .join(" ");
    expect(guide).toContain(
      "Safeguard: a security outcome that Intune or Entra can set, through Conditional Access, the authentication methods policy or security defaults",
    );
    expect(guide).not.toContain("Intune or Entra Conditional Access can set");
  });
});

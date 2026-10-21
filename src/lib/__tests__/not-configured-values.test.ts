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
import { generateComplianceReportPDF, translateCheckText } from "../compliance/report-pdf";
import { diffAssessments } from "../snapshots/diff";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { compactAssessment, type StoredAssessment } from "../snapshots/projection";

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

  it("uses the Windows default grace period of 2 days when a deadline has none", () => {
    // Policy CSP Update ConfigureDeadlineGracePeriod: default 2 days.
    const within = capability(
      data([{ ...pilotRing, deadlineForQualityUpdatesInDays: 2 }]),
      "windows-quality-update-deadline",
    );
    expect(within.status).toBe("enforced");
    expect(within.evidence[0]?.observedValue).toBe(
      "Quality update deferral 0d + deadline 2d + grace 2d (Windows default, no grace period configured) = 4d; paused: false",
    );
    const beyond = capability(
      data([{ ...pilotRing, deadlineForQualityUpdatesInDays: 13 }]),
      "windows-quality-update-deadline",
    );
    expect(beyond.status).toBe("noEvidence");
    expect(policyChecks(beyond)[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
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

  it("uses the Defender default scan time when a schedule has none", () => {
    // Policy CSP Defender ScheduleScanTime: default 120 minutes, 2:00 AM.
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
    expect(result.status).toBe("enforced");
    expect(result.evidence[0]?.observedValue).toBe(
      "quick; everyday; 02:00:00 (Defender default, no time configured)",
    );
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

describe("policies named for a safeguard left not configured", () => {
  it("names the update ring and the restriction profile instead of No policy found", () => {
    expect(
      safeguardPolicies(
        capability(data([pilotRing]), "windows-quality-update-deadline"),
      ),
    ).toEqual([{ name: "Pilot Ring", assigned: true }]);
    expect(
      safeguardPolicies(
        capability(data([restrictions]), "windows-periodic-antimalware-scan"),
      ),
    ).toEqual([{ name: "DR", assigned: true }]);
  });
});

describe("history for a value that could not be read", () => {
  const configured = {
    ...pilotRing,
    deadlineForQualityUpdatesInDays: 2,
    deadlineGracePeriodInDays: 0,
  };
  // Graph did not return the deadline in the second collection.
  const unreadable: Partial<typeof configured> = { ...configured };
  delete unreadable.deadlineForQualityUpdatesInDays;
  const stored = (ring: Record<string, unknown>) =>
    compactAssessment(assessCompliance(data([ring])));
  const deadlineCauses = (from: StoredAssessment, to: StoredAssessment) =>
    diffAssessments(from, to).frameworks.flatMap((framework) =>
      framework.changes.flatMap((change) =>
        change.causes
          .filter((cause) => cause.capabilityId === "windows-quality-update-deadline")
          .map((cause) => ({ change, cause })),
      ),
    );

  it("never reads an unreadable deadline on an assigned ring as evidence removed or added", () => {
    for (const [from, to, side] of [
      [configured, unreadable, "after"],
      [unreadable, configured, "before"],
    ] as const) {
      const found = deadlineCauses(stored(from), stored(to));
      expect(found.length).toBeGreaterThan(0);
      for (const { change, cause } of found) {
        expect(cause).toMatchObject({
          notCompared: true,
          evidenceAdded: [],
          evidenceRemoved: [],
        });
        expect(change.incomplete[side]).toBe(true);
      }
    }
  });

  it("still compares a ring that is not assigned", () => {
    const off = (ring: Record<string, unknown>) => ({ ...ring, assignments: [] });
    const assessment = stored(off(unreadable));
    const check = assessment.capabilities
      .find((item) => item.id === "windows-quality-update-deadline")!
      .checks.find((item) => item.policyId === "ring-pilot")!;
    expect(check).toMatchObject({
      assessmentStatus: "unableToCheck",
      assignment: "notAssigned",
    });
    for (const { cause } of deadlineCauses(stored(off(configured)), assessment))
      expect(cause.notCompared).toBe(false);
  });
});

describe("German report text for plain check values and not configured reasons", () => {
  it("translates method states, security defaults and not configured reasons", () => {
    expect(translateCheckText("Enabled for 1 target")).toBe("Aktiviert für 1 Ziel");
    expect(translateCheckText("Enabled for 3 targets; single-factor default mode")).toBe(
      "Aktiviert für 3 Ziele; Standardmodus Einzelfaktor",
    );
    expect(translateCheckText("Enabled, no users targeted")).toBe("Aktiviert, keine Benutzer als Ziel");
    expect(translateCheckText("Disabled")).toBe("Deaktiviert");
    expect(translateCheckText("Off")).toBe("Aus");
    expect(translateCheckText("Other text")).toBe("Other text");
  });

  it("prints the update ring and scan reasons in German in a German report", async () => {
    const text = extractPdfStreamText(
      await generateComplianceReportPDF(data([pilotRing, restrictions]), {
        frameworkId: "bsi-it-grundschutz",
      }),
    );
    expect(text).toContain("In diesem Updatering ist keine Frist");
    expect(text).not.toContain("No quality update deadline is configured");
    expect(text).not.toContain("No scheduled scan is configured");
  });
});

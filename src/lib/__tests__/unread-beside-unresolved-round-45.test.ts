import { describe, expect, it } from "vitest";
import { COMPLIANCE_CAPABILITIES } from "../compliance/capabilities";
import { assessCapabilities, assessCompliance } from "../compliance/engine";
import { generateFixPack } from "../compliance/fix-pack";
import {
  buildManagementSummary,
  safeguardState,
} from "../compliance/management/management-summary";
import type {
  CapabilityResult,
  ComplianceAssessment,
  ComplianceCapability,
} from "../compliance/types";
import type { DetailedExportData } from "../configuration-analyzer";

// Round 45 review finding 1. Names and ids are synthetic. A readable
// firewall profile applied to a group and removed from all devices has
// targeting that cannot be resolved; when a later device configuration
// collection page also failed, the capability is still assignmentUnknown,
// but its checks could not be made. Both causes are reported: the
// management summary counts it as partly unresolved, the fix pack advises
// a refresh and a review, and an alternative that depends on it is partly
// unresolved too.

const GROUP = "0f0e0d0c-0000-4000-8000-00000000004b";
const FRAMEWORK = "nis2-2022-2555";
const CAPABILITY = "windows-firewall";

const unresolvedAssignments = [
  {
    id: "synthetic-apply",
    intent: "apply",
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId: GROUP,
    },
  },
  {
    id: "synthetic-remove-all-devices",
    intent: "remove",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

const PAGE_FAILED = {
  policyId: "synthetic-device-configurations-page-2",
  policyName: "Synthetic device configurations page 2",
  policyType: "deviceConfigurations",
  familyKey: "deviceConfigurations",
  error: "Synthetic Graph failure on a later page.",
  statusCode: 503,
};

const exportData = (
  assignments: unknown,
  pageFailed: boolean,
): DetailedExportData =>
  ({
    collectedAt: "2026-10-24T09:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: [
      {
        id: "synthetic-firewall",
        displayName: "Synthetic firewall",
        "@odata.type":
          "#microsoft.graph.windows10EndpointProtectionConfiguration",
        firewallProfileDomain: { firewallEnabled: "allowed" },
        firewallProfilePrivate: { firewallEnabled: "allowed" },
        firewallProfilePublic: { firewallEnabled: "allowed" },
        ...(assignments === undefined ? {} : { assignments }),
      },
    ],
    administrativeTemplates: [],
    compliancePolicies: [],
    appProtectionPolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
    fetchErrors: pageFailed ? [PAGE_FAILED] : [],
  }) as DetailedExportData;

// Unresolved targeting and a failed collection page.
const both = assessCompliance(exportData(unresolvedAssignments, true));
// Controls: unresolved targeting alone, and assignments Graph did not
// return beside the failed page.
const unresolvedOnly = assessCompliance(
  exportData(unresolvedAssignments, false),
);
const incompleteOnly = assessCompliance(exportData(undefined, true));

const firewall = (assessment: ComplianceAssessment): CapabilityResult =>
  assessment.capabilities.find(
    (result) => result.capability.id === CAPABILITY,
  )!;

const REFRESH = /refresh/i;
const REVIEW = /review (their |the )?overlapping assignments/i;

const fixPackReason = (assessment: ComplianceAssessment) =>
  generateFixPack(assessment, {
    collection: exportData(unresolvedAssignments, false),
  }).notGeneratable.find((gap) => gap.capabilityId === CAPABILITY)?.reason;

describe("round 45 finding 1: unread data beside unresolved targeting", () => {
  it("reaches the reported state", () => {
    const result = firewall(both);
    expect(result.status).toBe("assignmentUnknown");
    expect(
      new Set(result.evidence.map((item) => item.assignment.uncertainty)),
    ).toEqual(new Set(["unresolved"]));
    expect(
      result.checks.some(
        (check) =>
          check.assessmentStatus === "unableToCheck" &&
          check.policyId === undefined,
      ),
    ).toBe(true);
    expect(firewall(unresolvedOnly).status).toBe("assignmentUnknown");
    expect(
      firewall(unresolvedOnly).checks.some(
        (check) => check.assessmentStatus === "unableToCheck",
      ),
    ).toBe(false);
    expect(firewall(incompleteOnly).status).toBe("assignmentUnknown");
  });

  it("names both causes in the engine limitations", () => {
    const limitations = firewall(both).limitations.join(" ");
    expect(limitations).toMatch(REVIEW);
    expect(limitations).toMatch(/collection is incomplete/);
    expect(limitations).toMatch(/Refresh the policies to retry collection/);
  });

  it("counts the capability as partly unresolved in the management summary", () => {
    expect(safeguardState(firewall(both))).toBe("dataMissing");
    const summary = buildManagementSummary(both, FRAMEWORK);
    expect(summary.targetingUnresolved).toBeUndefined();
    expect(summary.targetingPartlyUnresolved).toBe(1);
  });

  it("advises a refresh and a review in the fix pack", () => {
    const reason = fixPackReason(both);
    expect(reason).toMatch(REFRESH);
    expect(reason).toMatch(REVIEW);
    expect(reason).not.toMatch(/Assignment data could not be read/);
  });

  it("keeps unresolved targeting alone review-only", () => {
    expect(safeguardState(firewall(unresolvedOnly))).toBe(
      "targetingUnresolved",
    );
    const summary = buildManagementSummary(unresolvedOnly, FRAMEWORK);
    expect(summary.targetingUnresolved).toBe(1);
    expect(summary.targetingPartlyUnresolved).toBeUndefined();
    const reason = fixPackReason(unresolvedOnly);
    expect(reason).toMatch(REVIEW);
    expect(reason).not.toMatch(REFRESH);
  });

  it("treats a value Graph did not return beside unresolved targeting like a failed page", () => {
    // A second profile with the same assignments whose firewall properties
    // Graph did not return; no collection page failed.
    const data = exportData(unresolvedAssignments, false);
    const [profile] = data.deviceConfigurations as Array<
      Record<string, unknown>
    >;
    const omitted = { ...profile! };
    delete omitted.firewallProfileDomain;
    delete omitted.firewallProfilePrivate;
    delete omitted.firewallProfilePublic;
    const unread = assessCompliance({
      ...data,
      deviceConfigurations: [
        profile,
        {
          ...omitted,
          id: "synthetic-firewall-2",
          displayName: "Synthetic firewall 2",
        },
      ],
    } as DetailedExportData);
    const result = firewall(unread);
    expect(result.status).toBe("assignmentUnknown");
    expect(
      result.checks.some(
        (check) =>
          check.assessmentStatus === "unableToCheck" &&
          check.policyId === "synthetic-firewall-2",
      ),
    ).toBe(true);
    const limitations = result.limitations.join(" ");
    expect(limitations).toMatch(REVIEW);
    expect(limitations).toMatch(/could not be read or judged.*Refresh/);
    expect(safeguardState(result)).toBe("dataMissing");
    expect(
      buildManagementSummary(unread, FRAMEWORK).targetingPartlyUnresolved,
    ).toBe(1);
    const reason = fixPackReason(unread);
    expect(reason).toMatch(REFRESH);
    expect(reason).toMatch(REVIEW);
  });

  it("ignores an unreadable value on a policy that is not assigned", () => {
    // The second profile has no assignments, so it cannot take effect.
    const data = exportData(unresolvedAssignments, false);
    const [profile] = data.deviceConfigurations as Array<
      Record<string, unknown>
    >;
    const omitted = { ...profile! };
    delete omitted.firewallProfilePublic;
    const unassigned = assessCompliance({
      ...data,
      deviceConfigurations: [
        profile,
        {
          ...omitted,
          id: "synthetic-firewall-3",
          displayName: "Synthetic firewall 3",
          assignments: [],
        },
      ],
    } as DetailedExportData);
    const result = firewall(unassigned);
    expect(
      result.checks.some(
        (check) =>
          check.assessmentStatus === "unableToCheck" &&
          check.policyId === "synthetic-firewall-3",
      ),
    ).toBe(true);
    expect(safeguardState(result)).toBe("targetingUnresolved");
    expect(result.limitations.join(" ")).not.toMatch(REFRESH);
    expect(fixPackReason(unassigned)).not.toMatch(REFRESH);
  });

  it("keeps data that could not be read alone refresh-only", () => {
    expect(safeguardState(firewall(incompleteOnly))).toBe("dataMissing");
    const summary = buildManagementSummary(incompleteOnly, FRAMEWORK);
    expect(summary.targetingUnresolved).toBeUndefined();
    expect(summary.targetingPartlyUnresolved).toBeUndefined();
    const reason = fixPackReason(incompleteOnly);
    expect(reason).toMatch(REFRESH);
    expect(reason).not.toMatch(REVIEW);
  });

  describe("an alternative that depends on the capability", () => {
    // A synthetic tenant capability that names the firewall as its
    // alternative, read from collected security defaults that differ.
    const securityDefaults = COMPLIANCE_CAPABILITIES.find(
      (capability) => capability.id === "tenant-security-defaults-enabled",
    )!;
    const dependent: ComplianceCapability = {
      ...securityDefaults,
      id: "synthetic-dependent",
      name: "Synthetic dependent capability",
      alternativeTo: [CAPABILITY],
      exclusiveWithConditionalAccess: undefined,
    };
    const capabilities = [
      COMPLIANCE_CAPABILITIES.find(
        (capability) => capability.id === CAPABILITY,
      )!,
      dependent,
    ];
    const alternativeOf = (pageFailed: boolean) =>
      assessCapabilities(
        {
          ...exportData(unresolvedAssignments, pageFailed),
          tenantIdentityPolicies: {
            securityDefaults: { isEnabled: false },
            status: { securityDefaults: "collected" },
          },
        } as unknown as DetailedExportData,
        capabilities,
      ).find((result) => result.capability.id === dependent.id)!;

    it("is partly unresolved with a refresh and a review", () => {
      const result = alternativeOf(true);
      expect(result.alternative).toEqual({
        state: "unknown",
        capabilityIds: [CAPABILITY],
        targetingPartlyUnresolved: true,
      });
      expect(safeguardState(result)).toBe("dataMissing");
      const reason = result.limitations.at(-1)!;
      expect(reason).toMatch(/could not be read completely/);
      expect(reason).toMatch(REVIEW);
    });

    it("stays review-only when nothing else is unread", () => {
      const result = alternativeOf(false);
      expect(result.alternative).toEqual({
        state: "unknown",
        capabilityIds: [CAPABILITY],
        targetingUnresolved: true,
      });
      expect(safeguardState(result)).toBe("targetingUnresolved");
      expect(result.limitations.at(-1)).not.toMatch(REFRESH);
    });
  });
});

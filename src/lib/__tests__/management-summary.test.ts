import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCompliance } from "../compliance";
import {
  buildManagementSummary,
  computeMetrics,
  rankNextActions,
  scopeKeyOf,
} from "../compliance/management/management-summary";
import { PORTAL_AREAS } from "../compliance/management/portal-links";
import type {
  CapabilityResult,
  CapabilityStatus,
  ControlAssessment,
  ControlStatus,
  FrameworkAssessment,
} from "../compliance/types";

function disabledEvidence(
  state: "assigned" | "notAssigned",
): CapabilityResult["evidence"][number] {
  return {
    capabilityId: "deviation",
    policyId: `policy-${state}`,
    policyName: `Policy ${state}`,
    policyType: "Settings Catalog",
    source: "settingsCatalog",
    settingId: "synthetic_deviation",
    observedValue: "off",
    verdict: "disabled",
    kind: "configuration",
    assignment: {
      state,
      targets: [],
      exclusions: [],
      filters: [],
      coverage: "unverified",
    },
  };
}

function capability(
  id: string,
  status: CapabilityStatus,
  evidence: CapabilityResult["evidence"] = [],
): CapabilityResult {
  return {
    capability: {
      id,
      platform: "windows",
      name: `Capability ${id}`,
      description: "Synthetic test capability",
      signals: [
        {
          source: "settingsCatalog",
          settingDefinitionId: `synthetic_${id}`,
          enforcedWhen: { kind: "equals", value: "on" },
        },
      ],
    },
    status,
    evidence,
    limitations: [],
    checks: [],
  };
}

function control(
  id: string,
  status: ControlStatus,
  capabilityIds: string[],
): ControlAssessment {
  return {
    control: { id, title: `Control ${id}`, summary: "Synthetic control" },
    capabilityIds,
    enforcedCapabilityIds: [],
    status,
    unassessedAspects: [],
    excludedCapabilityIds: [],
  };
}

function framework(
  controls: ControlAssessment[],
  totalRequirements?: number,
): FrameworkAssessment {
  return {
    framework: {
      id: "synthetic",
      name: "Synthetic",
      version: "1",
      totalRequirements,
    },
    controls,
    summary: {
      totalControls: controls.length,
      withEvidence: 0,
      partial: 0,
      withoutEvidence: 0,
      notApplicable: 0,
      notAssessed: 0,
      conflicting: 0,
      applicableControls: 0,
    },
  };
}

function emptyExportData(): DetailedExportData {
  return {
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    appProtectionPolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
  };
}

function unassignedBitLockerPolicy() {
  return {
    id: "bitlocker-policy",
    name: "BitLocker baseline",
    configType: "Settings Catalog",
    platforms: "windows10",
    settings: [
      {
        id: "0",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          settingDefinitionId:
            "device_vendor_msft_bitlocker_requiredeviceencryption",
          choiceSettingValue: {
            value: "device_vendor_msft_bitlocker_requiredeviceencryption_1",
            children: [],
          },
        },
      },
    ],
    assignments: [],
  };
}

describe("computeMetrics", () => {
  it("floors coverage over assessable controls and ignores notApplicable and notAssessed", () => {
    const fa = framework([
      control("1", "evidenceFound", ["a"]),
      control("2", "partialEvidence", ["a"]),
      control("3", "noEvidence", ["b"]),
      control("4", "noEvidence", ["b"]),
      control("5", "noEvidence", ["b"]),
      control("6", "conflictingEvidence", ["c"]),
      control("7", "notApplicable", []),
      control("8", "notAssessed", ["d"]),
    ]);
    const metrics = computeMetrics(fa, [
      capability("a", "enforced"),
      capability("b", "noEvidence"),
      capability("c", "conflictingEvidence"),
      capability("d", "assignmentUnknown"),
    ]);
    expect(metrics.assessable).toBe(6);
    expect(metrics.withEvidence).toBe(2);
    // 2 / 6 = 33.33 percent, floored.
    expect(metrics.coveragePct).toBe(33);
    expect(metrics.withoutEvidence).toBe(3);
    expect(metrics.conflicting).toBe(1);
  });

  it("computes coverage in integers so exact percentages are not floored down", () => {
    const controls = Array.from({ length: 50 }, (_, index) =>
      control(
        String(index + 1),
        index < 29 ? "partialEvidence" : "noEvidence",
        ["a"],
      ),
    );
    // 29 / 50 * 100 is 57.99999999999999 in floating point.
    expect(
      computeMetrics(framework(controls), [capability("a", "enforced")])
        .coveragePct,
    ).toBe(58);
  });

  it("returns null coverage when nothing is assessable", () => {
    const fa = framework([
      control("1", "notApplicable", []),
      control("2", "notAssessed", ["a"]),
    ]);
    const metrics = computeMetrics(fa, [
      capability("a", "collectionIncomplete"),
    ]);
    expect(metrics.assessable).toBe(0);
    expect(metrics.coveragePct).toBeNull();
  });

  it("counts distinct mapped unassigned capabilities only", () => {
    const fa = framework([
      control("1", "noEvidence", ["a"]),
      control("2", "noEvidence", ["a"]),
    ]);
    const metrics = computeMetrics(fa, [
      capability("a", "configuredNotAssigned"),
      // Not referenced by any control of this framework.
      capability("unmapped", "configuredNotAssigned"),
    ]);
    expect(metrics.unassignedConfigs).toBe(1);
  });

  it("counts mapped assignmentUnknown and collectionIncomplete capabilities as data gaps", () => {
    const fa = framework([
      control("1", "notAssessed", ["a", "b"]),
      control("2", "noEvidence", ["c"]),
    ]);
    const metrics = computeMetrics(fa, [
      capability("a", "assignmentUnknown"),
      capability("b", "collectionIncomplete"),
      capability("c", "noEvidence"),
      capability("unmapped", "assignmentUnknown"),
    ]);
    expect(metrics.dataGaps).toBe(2);
  });

  it("derives outside Intune scope from published requirements and clamps at zero", () => {
    const controls = [
      control("1", "noEvidence", ["a"]),
      control("2", "noEvidence", ["a"]),
    ];
    const caps = [capability("a", "noEvidence")];
    expect(
      computeMetrics(framework(controls, 10), caps).outsideIntuneScope,
    ).toBe(8);
    expect(
      computeMetrics(framework(controls), caps).outsideIntuneScope,
    ).toBeNull();
    expect(
      computeMetrics(framework(controls, 10), caps, 1).outsideIntuneScope,
    ).toBe(0);
  });
});

describe("rankNextActions", () => {
  const fa = framework([
    control("1", "conflictingEvidence", ["conflict", "missing-wide"]),
    control("2", "noEvidence", ["missing-wide", "unassigned"]),
    control("3", "noEvidence", ["missing-wide", "missing-b"]),
    control("4", "partialEvidence", ["partial", "deviation", "missing-a"]),
    control("5", "evidenceFound", ["enforced"]),
    control("6", "notAssessed", ["unknown", "incomplete"]),
    control("7", "noEvidence", ["requirement", "not-applicable"]),
  ]);
  const capabilities = [
    capability("missing-a", "noEvidence"),
    capability("missing-b", "noEvidence"),
    capability("missing-wide", "noEvidence"),
    capability("unassigned", "configuredNotAssigned"),
    capability("partial", "partialConfiguration"),
    capability("deviation", "disabledByPolicy", [disabledEvidence("assigned")]),
    capability("conflict", "conflictingEvidence"),
    capability("enforced", "enforced"),
    capability("requirement", "requirementAssigned"),
    capability("not-applicable", "notApplicable"),
    capability("unknown", "assignmentUnknown"),
    capability("incomplete", "collectionIncomplete"),
    capability("unmapped", "conflictingEvidence"),
  ];

  it("puts gap-closing actions first, then tier, spreading picks across controls", () => {
    const actions = rankNextActions(fa, capabilities, 10);
    // Controls 1, 2 and 3 lack evidence, so their actions lead. missing-b
    // only repeats control 3, so the partial-evidence control 4 is reached
    // first; the rest follow in base order.
    expect(actions.map((action) => [action.capabilityId, action.tier])).toEqual(
      [
        ["conflict", "conflicting"],
        ["unassigned", "unassigned"],
        ["missing-wide", "missing"],
        ["deviation", "assignedDeviation"],
        ["missing-b", "missing"],
        ["partial", "partial"],
        ["missing-a", "missing"],
      ],
    );
    expect(actions.map((action) => action.rank)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(
      actions.find((a) => a.capabilityId === "missing-wide")?.controlIds,
    ).toEqual(["1", "2", "3"]);
  });

  it("treats a non-enforcing value in an unassigned policy as missing, not switched off", () => {
    const unassigned = capabilities.map((result) =>
      result.capability.id === "deviation"
        ? capability("deviation", "disabledByPolicy", [
            disabledEvidence("notAssigned"),
          ])
        : result,
    );
    const action = rankNextActions(fa, unassigned, 10).find(
      (item) => item.capabilityId === "deviation",
    );
    expect(action?.tier).toBe("missing");
  });

  it("excludes covered, not applicable, data gap and unmapped capabilities", () => {
    const ids = rankNextActions(fa, capabilities, 10).map(
      (a) => a.capabilityId,
    );
    for (const excluded of [
      "enforced",
      "requirement",
      "not-applicable",
      "unknown",
      "incomplete",
      "unmapped",
    ])
      expect(ids).not.toContain(excluded);
  });

  it("caps at five by default", () => {
    const actions = rankNextActions(fa, capabilities);
    expect(actions).toHaveLength(5);
    expect(actions.at(-1)?.capabilityId).toBe("missing-b");
  });

  it("is stable under any input order", () => {
    const expected = rankNextActions(fa, capabilities, 10);
    const reversed = framework([...fa.controls].reverse());
    for (let seed = 1; seed <= 20; seed++) {
      // Deterministic shuffle so failures are reproducible.
      const shuffled = [...capabilities].sort(
        (a, b) =>
          ((a.capability.id.length * 31 + seed * 17) % 13) -
          ((b.capability.id.length * 31 + seed * 17) % 13),
      );
      expect(rankNextActions(fa, shuffled, 10)).toEqual(expected);
      expect(rankNextActions(reversed, shuffled, 10)).toEqual(expected);
    }
  });

  it("links every action to an allowed admin center host", () => {
    for (const action of rankNextActions(fa, capabilities, 10)) {
      expect(action.url).toBe(PORTAL_AREAS[action.area].url);
      expect(["intune.microsoft.com", "entra.microsoft.com"]).toContain(
        new URL(action.url).host,
      );
    }
  });
});

describe("scopeKeyOf", () => {
  it("ignores platform order and applies the engine defaults", () => {
    expect(scopeKeyOf({ platforms: ["macos", "windows"] })).toBe(
      scopeKeyOf({
        platforms: ["windows", "macos"],
        essentialEightMaturityLevel: 1,
      }),
    );
    expect(scopeKeyOf({})).toBe(JSON.stringify([null, 1, null]));
    expect(scopeKeyOf({ defStanRiskLevel: 2 })).not.toBe(scopeKeyOf({}));
  });
});

describe("buildManagementSummary", () => {
  it("summarizes a real engine assessment", () => {
    const data = emptyExportData();
    data.settingsCatalog = [unassignedBitLockerPolicy()];
    const assessment = assessCompliance(data);
    const summary = buildManagementSummary(assessment, "iso-27001-2022", {
      outsideScope: [
        { id: "x", title: { en: "Synthetic", de: "Synthetisch" } },
      ],
    });
    const iso = assessment.frameworks.find(
      (item) => item.framework.id === "iso-27001-2022",
    )!;

    expect(summary.frameworkName).toBe(iso.framework.name);
    expect(summary.rulesetVersion).toBe(assessment.provenance.rulesetVersion);
    expect(summary.generatedAt).toBe(assessment.generatedAt);
    expect(summary.scopeKey).toBe(scopeKeyOf(assessment.scope));
    expect(Object.keys(summary.controls)).toEqual(
      iso.controls.map((item) => item.control.id),
    );
    expect(summary.metrics.unassignedConfigs).toBe(1);
    expect(summary.metrics.coveragePct).toBe(0);
    expect(summary.outsideScope).toHaveLength(1);

    const bitLocker = summary.nextActions.find(
      (action) => action.capabilityId === "windows-disk-encryption",
    );
    expect(bitLocker).toMatchObject({
      tier: "unassigned",
      area: "diskEncryption",
    });
    expect(bitLocker?.controlIds.length).toBeGreaterThan(0);
    expect(summary.nextActions[0]?.capabilityId).toBe(
      "windows-disk-encryption",
    );
    expect(summary.nextActions.length).toBeLessThanOrEqual(5);
  });

  it("keeps unmapped capabilities out of a framework's counts", () => {
    const data = emptyExportData();
    data.settingsCatalog = [unassignedBitLockerPolicy()];
    const assessment = assessCompliance(data);
    const cyberEssentials = assessment.frameworks.find(
      (item) => item.framework.id === "cyber-essentials-v3",
    )!;
    // Disk encryption is not mapped to Cyber Essentials.
    expect(
      cyberEssentials.controls.some((item) =>
        item.capabilityIds.includes("windows-disk-encryption"),
      ),
    ).toBe(false);
    const summary = buildManagementSummary(assessment, "cyber-essentials-v3");
    expect(summary.metrics.unassignedConfigs).toBe(0);
    expect(
      summary.nextActions.some(
        (a) => a.capabilityId === "windows-disk-encryption",
      ),
    ).toBe(false);
  });

  it("throws for a framework that is not in the assessment", () => {
    const assessment = assessCompliance(emptyExportData());
    expect(() =>
      buildManagementSummary(assessment, "missing-framework"),
    ).toThrow(/missing-framework/);
  });
});

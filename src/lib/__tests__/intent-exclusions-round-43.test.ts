import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_INCOMPLETE_TEXT,
  TARGETING_UNRESOLVED_TEXT,
  assignmentDetails,
  resolveAssignments,
  summarizeAssignments,
} from "../compliance/assignments";
import { tenantSettings } from "../benchmarks/tenant-settings";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import type { ConfigurationSectionData } from "../configuration-sections";
import { assessCompliance } from "../compliance/engine";
import { parseAssignments } from "../configuration-parser";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import { GroupResolver } from "../group-resolver";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { extractZipEntry } from "./helpers/zip";

// Round 43 review findings. Names and ids are synthetic.
// 1. An app exclusion applies only within the intent it carries (Graph
//    returns each one as a mobileAppAssignment with its intent), before
//    intent conflicts are resolved. Other exclusions, those of
//    configuration profiles among them, apply to every assignment.
// 2. An unknown state keeps its reason: a complete list whose targeting
//    cannot be resolved is not said to be incompletely collected.

const GROUP_A = "0f0e0d0c-0000-4000-8000-00000000000a";
const GROUP_B = "0f0e0d0c-0000-4000-8000-00000000000b";

const group = (groupId: string, intent?: string) => ({
  id: `assignment-${groupId}-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId },
});
// The shape the lab tenant returns: an exclusion row with its own intent.
const exclusion = (groupId: string, intent?: string) => ({
  id: `exclusion-${groupId}-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: {
    "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget",
    deviceAndAppManagementAssignmentFilterId: null,
    deviceAndAppManagementAssignmentFilterType: "none",
    groupId,
  },
});
const allUsers = (intent?: string) => ({
  id: `all-users-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: {
    "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget",
  },
});
const allDevices = (intent?: string) => ({
  id: `all-devices-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
});

const state = (assignments: unknown[]) =>
  summarizeAssignments(assignments).state;

const exportData = (
  parts: Partial<DetailedExportData> = {},
): DetailedExportData =>
  ({
    collectedAt: "2026-10-23T09:00:00Z",
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
    fetchErrors: [],
    ...parts,
  }) as DetailedExportData;

describe("round 43 finding 1: app exclusions apply within their intent", () => {
  it("keeps a Required inclusion beside an exclusion under Uninstall", () => {
    // The reported scenario.
    const assignments = [
      group(GROUP_A, "required"),
      allUsers("uninstall"),
      exclusion(GROUP_A, "uninstall"),
    ];
    expect(state(assignments)).toBe("assigned");
    expect(resolveAssignments(assignments).effective).toEqual([
      { type: "groupassignmenttarget", id: GROUP_A },
    ]);
    expect(
      state([group(GROUP_A, "required"), exclusion(GROUP_A, "uninstall")]),
    ).toBe("assigned");
  });

  it("keeps a Required inclusion beside an exclusion under Available", () => {
    for (const intent of ["available", "availableWithoutEnrollment"])
      expect(
        state([
          group(GROUP_A, "required"),
          group(GROUP_B, intent),
          exclusion(GROUP_A, intent),
        ]),
      ).toBe("assigned");
    expect(
      resolveAssignments([
        group(GROUP_A, "required"),
        exclusion(GROUP_A, "available"),
      ]).effective,
    ).toEqual([{ type: "groupassignmenttarget", id: GROUP_A }]);
  });

  it("cancels the Required inclusion with an exclusion under Required", () => {
    expect(
      state([group(GROUP_A, "required"), exclusion(GROUP_A, "required")]),
    ).toBe("notAssigned");
    expect(
      state([
        group(GROUP_A, "required"),
        exclusion(GROUP_A.toUpperCase(), "required"),
      ]),
    ).toBe("notAssigned");
    // The Available inclusion of the group stays.
    expect(
      resolveAssignments([
        group(GROUP_A, "required"),
        group(GROUP_A, "available"),
        exclusion(GROUP_A, "required"),
      ]).effective,
    ).toEqual([{ type: "groupassignmenttarget", id: GROUP_A }]);
  });

  it("resolves mixed intents with all users after the exclusions", () => {
    // Required to all users and the group, the group excluded under
    // Required: all users stay.
    expect(
      resolveAssignments([
        allUsers("required"),
        group(GROUP_A, "required"),
        exclusion(GROUP_A, "required"),
      ]).effective,
    ).toEqual([{ type: "alllicensedusersassignmenttarget" }]);
    // Available to all users, Required to the group excluded under
    // Available: both stay.
    expect(
      resolveAssignments([
        allUsers("available"),
        group(GROUP_A, "required"),
        exclusion(GROUP_A, "available"),
      ]).effective,
    ).toEqual([
      { type: "alllicensedusersassignmenttarget" },
      { type: "groupassignmenttarget", id: GROUP_A },
    ]);
    // Uninstall for all users: a Required group stays, an Available one
    // is unresolved, whatever is excluded under Uninstall or Required.
    expect(
      state([
        group(GROUP_A, "required"),
        group(GROUP_B, "available"),
        allUsers("uninstall"),
        exclusion(GROUP_A, "uninstall"),
      ]),
    ).toBe("unknown");
    expect(
      state([
        group(GROUP_A, "required"),
        allDevices("uninstall"),
        exclusion(GROUP_B, "required"),
      ]),
    ).toBe("assigned");
  });

  it("lets an exclusion under Uninstall cancel the uninstall of its group", () => {
    // Available and Uninstall for the group: Uninstall wins, unless the
    // group is excluded from the Uninstall assignment.
    expect(
      state([group(GROUP_A, "available"), group(GROUP_A, "uninstall")]),
    ).toBe("notAssigned");
    expect(
      state([
        group(GROUP_A, "available"),
        group(GROUP_A, "uninstall"),
        exclusion(GROUP_A, "uninstall"),
      ]),
    ).toBe("assigned");
    // An exclusion under Required leaves the uninstall in place.
    expect(
      state([
        group(GROUP_A, "available"),
        group(GROUP_A, "uninstall"),
        exclusion(GROUP_A, "required"),
      ]),
    ).toBe("notAssigned");
  });

  it("keeps configuration exclusions for every assignment of the profile", () => {
    for (const intent of ["apply", undefined])
      expect(state([group(GROUP_A, intent), exclusion(GROUP_A, intent)])).toBe(
        "notAssigned",
      );
    // An exclusion of a profile, with or without an intent, cancels an
    // apply inclusion of the group.
    expect(state([group(GROUP_A, "apply"), exclusion(GROUP_A)])).toBe(
      "notAssigned",
    );
    expect(state([group(GROUP_A), exclusion(GROUP_A, "apply")])).toBe(
      "notAssigned",
    );
    expect(state([group(GROUP_A, "apply"), exclusion(GROUP_A, "remove")])).toBe(
      "notAssigned",
    );
    // An app exclusion without an intent applies to every intent.
    expect(state([group(GROUP_A, "required"), exclusion(GROUP_A)])).toBe(
      "notAssigned",
    );
  });

  it("reads app exclusions by intent in the analyzer", () => {
    const app = {
      id: "synthetic-app",
      displayName: "Synthetic app",
      registryKey: "mobileApps",
      collectionStatus: { assignments: "complete" },
      assignments: [
        group(GROUP_A, "required"),
        allUsers("uninstall"),
        exclusion(GROUP_A, "uninstall"),
      ],
    };
    const section = {
      key: "mobileApps",
      familyKey: "applications",
      label: "Mobile apps",
      selectionPrefix: "additional-mobileApps",
      items: [app],
    } as unknown as ConfigurationSectionData;
    const result = analyzeConfigurations(exportData({ sections: [section] }));
    expect(result).toMatchObject({
      assignedConfigs: 1,
      unassignedConfigs: 0,
      unknownAssignmentConfigs: 0,
    });
    expect(result.topGroups).toEqual([[GROUP_A, 1]]);
  });

  it("keeps the engine and the benchmark holders on the shared rule", () => {
    const firewall = (assignments: unknown[]) => ({
      id: "synthetic-firewall",
      displayName: "Synthetic firewall",
      "@odata.type":
        "#microsoft.graph.windows10EndpointProtectionConfiguration",
      firewallProfileDomain: { firewallEnabled: "allowed" },
      firewallProfilePrivate: { firewallEnabled: "allowed" },
      firewallProfilePublic: { firewallEnabled: "allowed" },
      assignments,
    });
    const status = (assignments: unknown[]) =>
      assessCompliance(
        exportData({ deviceConfigurations: [firewall(assignments)] }),
      ).capabilities.find(
        (result) => result.capability.id === "windows-firewall",
      )?.status;
    expect(status([group(GROUP_A, "apply"), exclusion(GROUP_A, "apply")])).toBe(
      "configuredNotAssigned",
    );
    const holder = (assignments: unknown[]) =>
      tenantSettings({
        settingsCatalog: [
          {
            id: "synthetic-catalog",
            name: "Synthetic catalog",
            platforms: "windows10",
            technologies: "mdm",
            settings: [],
            assignments,
            collectionStatus: { settings: "complete", assignments: "complete" },
          },
        ],
      } as never).policies[0]?.assignment;
    expect(holder([group(GROUP_A), exclusion(GROUP_A)])).toBe("notAssigned");
  });
});

describe("round 43 finding 2: why an assignment state is unknown", () => {
  it("says targeting could not be resolved for a complete list with a conflict", () => {
    const summary = summarizeAssignments([
      group(GROUP_A, "available"),
      allUsers("uninstall"),
    ]);
    expect(summary).toMatchObject({
      state: "unknown",
      uncertainty: "unresolved",
    });
    expect(assignmentDetails(summary)).toContain(TARGETING_UNRESOLVED_TEXT);
    expect(assignmentDetails(summary)).not.toContain(
      ASSIGNMENT_INCOMPLETE_TEXT,
    );
    expect(
      summarizeAssignments([group(GROUP_A, "apply"), allDevices("remove")])
        .uncertainty,
    ).toBe("unresolved");
  });

  it("says collection was incomplete for missing, unreadable or incomplete assignments", () => {
    for (const summary of [
      summarizeAssignments(undefined),
      summarizeAssignments({ value: [] }),
      summarizeAssignments([group(GROUP_A, "Remove")]),
      summarizeAssignments([group(GROUP_A, "required")], undefined, true),
      // Incomplete wins over a conflict.
      summarizeAssignments(
        [group(GROUP_A, "available"), allUsers("uninstall")],
        undefined,
        true,
      ),
    ]) {
      expect(summary).toMatchObject({
        state: "unknown",
        uncertainty: "incomplete",
      });
      expect(assignmentDetails(summary)).toContain(ASSIGNMENT_INCOMPLETE_TEXT);
      expect(assignmentDetails(summary)).not.toContain(
        TARGETING_UNRESOLVED_TEXT,
      );
    }
  });

  it("keeps the incomplete text for a summary stored without a reason", () => {
    expect(
      assignmentDetails({
        state: "unknown",
        targets: [],
        exclusions: [],
        filters: [],
        coverage: "unverified",
      }),
    ).toEqual([ASSIGNMENT_INCOMPLETE_TEXT]);
  });

  it("drops the reason on Conditional Access evidence whose state is known", () => {
    // Only an enabled policy is evidence; its missing assignments list
    // must not leave the incomplete reason behind.
    const evidence = (state: string) =>
      assessCompliance(
        exportData({
          conditionalAccessPolicies: [
            {
              id: "synthetic-ca",
              displayName: "Synthetic Conditional Access",
              "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
              state,
              grantControls: { operator: "AND", builtInControls: ["mfa"] },
              conditions: {
                users: { includeUsers: ["All"] },
                applications: { includeApplications: ["All"] },
              },
            },
          ],
        }),
      ).capabilities.flatMap((result) =>
        result.evidence.filter((item) => item.policyId === "synthetic-ca"),
      )[0]?.assignment;
    expect(evidence("enabled")).toMatchObject({ state: "assigned" });
    expect(evidence("enabled")).not.toHaveProperty("uncertainty");
  });

  it("records no reason for a known state", () => {
    expect(
      summarizeAssignments([group(GROUP_A, "required")]),
    ).not.toHaveProperty("uncertainty");
    expect(summarizeAssignments([])).not.toHaveProperty("uncertainty");
  });
});

describe("round 43 follow up: exclusion order, available intents and scope tags", () => {
  it("applies an exclusion listed before its inclusion", () => {
    expect(
      state([exclusion(GROUP_A, "required"), group(GROUP_A, "required")]),
    ).toBe("notAssigned");
    expect(
      state([
        exclusion(GROUP_A, "uninstall"),
        allUsers("uninstall"),
        group(GROUP_A, "required"),
      ]),
    ).toBe("assigned");
  });

  it("cancels an available inclusion with an exclusion of the same intent only", () => {
    for (const intent of ["available", "availableWithoutEnrollment"])
      expect(state([group(GROUP_A, intent), exclusion(GROUP_A, intent)])).toBe(
        "notAssigned",
      );
    // The two available intents do not cancel each other.
    expect(
      state([
        group(GROUP_A, "available"),
        exclusion(GROUP_A, "availableWithoutEnrollment"),
      ]),
    ).toBe("assigned");
    expect(
      state([
        group(GROUP_A, "availableWithoutEnrollment"),
        exclusion(GROUP_A, "available"),
      ]),
    ).toBe("assigned");
  });

  it("cancels a scope tag inclusion of the group within the exclusion's intent", () => {
    const scopeTag = (intent: string) => ({
      id: `scope-${intent}`,
      intent,
      target: {
        "@odata.type": "#microsoft.graph.scopeTagGroupAssignmentTarget",
        entraObjectId: GROUP_A,
        targetType: "user",
      },
    });
    expect(state([scopeTag("required"), exclusion(GROUP_A, "required")])).toBe(
      "notAssigned",
    );
    expect(state([scopeTag("required"), exclusion(GROUP_A, "uninstall")])).toBe(
      "assigned",
    );
    expect(state([scopeTag("apply"), exclusion(GROUP_A)])).toBe("notAssigned");
  });

  it("resolves an available group excluded from an uninstall of all users or all devices", () => {
    for (const broad of [allUsers("uninstall"), allDevices("uninstall")]) {
      // Members of the group are excluded from the uninstall, so only the
      // available intent applies to them.
      const resolved = resolveAssignments([
        group(GROUP_A, "available"),
        broad,
        exclusion(GROUP_A, "uninstall"),
      ]);
      expect(resolved.state).toBe("assigned");
      expect(resolved.effective).toEqual([
        { type: "groupassignmenttarget", id: GROUP_A },
      ]);
      // A group not excluded from the uninstall stays unresolved.
      expect(
        state([
          group(GROUP_A, "available"),
          group(GROUP_B, "available"),
          broad,
          exclusion(GROUP_A, "uninstall"),
        ]),
      ).toBe("unknown");
      // An exclusion under another intent does not lift the uninstall.
      expect(
        state([
          group(GROUP_A, "available"),
          broad,
          exclusion(GROUP_A, "required"),
        ]),
      ).toBe("unknown");
    }
  });
});

describe("round 43 follow up: exclusions name their intent", () => {
  const NAME = "Synthetic pilot group";

  it("labels intent scoped exclusions in the summary", () => {
    const summary = summarizeAssignments(
      [
        group(GROUP_A, "required"),
        exclusion(GROUP_A, "uninstall"),
        exclusion(GROUP_B, "apply"),
        exclusion(GROUP_B),
      ],
      new Map([[GROUP_A, NAME]]),
    );
    expect(assignmentDetails(summary)).toEqual([
      `Group: ${NAME}`,
      `Excluded: Group: ${NAME} (uninstall)`,
      `Excluded: Group: ${GROUP_B}`,
      `Excluded: Group: ${GROUP_B}`,
    ]);
  });

  it("labels them in the documentation and the group resolver", async () => {
    expect(
      parseAssignments([
        exclusion(GROUP_A, "availableWithoutEnrollment"),
        exclusion(GROUP_B, "apply"),
      ]),
    ).toBe(
      `Excluded: ${GROUP_A} (availableWithoutEnrollment), Excluded: ${GROUP_B}`,
    );
    // Group names come from a stub, not Graph.
    const resolver = new GroupResolver("synthetic");
    Object.assign(resolver, {
      getGroupNames: async (ids: string[]) =>
        new Map(ids.filter((id) => id === GROUP_A).map((id) => [id, NAME])),
    });
    expect(
      await resolver.resolveAssignments([
        exclusion(GROUP_A, "required"),
        exclusion(GROUP_B),
      ]),
    ).toEqual([`Excluded: ${NAME} (required)`, `Excluded: ${GROUP_B}`]);
  });

  it.each(["PDF", "Word"])(
    "puts the group name in place of the id in the %s documentation",
    async (format) => {
      const data = exportData({
        deviceConfigurations: [
          {
            id: "synthetic-profile",
            displayName: "Synthetic profile",
            "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
            assignments: [
              group(GROUP_B, "apply"),
              exclusion(GROUP_A, "uninstall"),
            ],
          },
        ],
        groupNames: new Map([[GROUP_A, NAME]]),
        includeComplianceEvidence: false,
      } as Partial<DetailedExportData>);
      const result =
        format === "PDF"
          ? await generateDetailedPDF(data)
          : await generateDetailedDOCX(data);
      // PDF text strings escape parentheses.
      const text =
        format === "PDF"
          ? extractPdfStreamText(result.buffer).replace(/\\([()])/g, "$1")
          : extractZipEntry(result.buffer, "word/document.xml");
      expect(text).toContain(`Excluded: ${NAME} (uninstall)`);
      expect(text).not.toContain(GROUP_A);
    },
  );
});

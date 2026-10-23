import { describe, expect, it } from "vitest";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import {
  assignable,
  assignmentsIncomplete,
  itemFetchErrors,
} from "../compliance/assignments";
import { collectConfigurations } from "../compliance/coverage";
import { assignmentGroupIds } from "../compliance/graph-rows";
import { generateComplianceReportPDF } from "../compliance/report-pdf";
import {
  parseAssignments,
  UNREADABLE_ASSIGNMENT,
} from "../configuration-parser";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import type { ConfigurationSectionData } from "../configuration-sections";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { extractZipEntry } from "./helpers/zip";

// Every reader of an item's assignments matches its collection errors and
// reads its targets the same way (compliance/assignments.ts and
// compliance/graph-rows.ts). Synthetic data only.

const allDevices = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

const assignmentError = (policyId: string, familyKey: string) => ({
  policyId,
  policyName: "Synthetic policy",
  policyType: familyKey,
  familyKey,
  endpoint: `/deviceManagement/synthetic('${policyId}')/assignments`,
  error: "Synthetic assignment failure",
});

function exportData(
  parts: Partial<DetailedExportData> = {},
): DetailedExportData {
  return {
    collectedAt: "2026-10-21T09:00:00Z",
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
  };
}

const catalogPolicy = (id: string) => ({
  id,
  name: `Synthetic catalog ${id}`,
  displayName: `Synthetic catalog ${id}`,
  platforms: "windows10",
  technologies: "mdm",
  settings: [],
  assignments: allDevices,
  collectionStatus: { assignments: "complete", settings: "complete" },
});

describe("parseAssignments reads targets by their documented type", () => {
  const one = (target: Record<string, unknown>) =>
    parseAssignments([{ id: "assignment-1", target }], "complete");

  it("labels every documented target type", () => {
    expect(
      one({
        "@odata.type": "#microsoft.graph.organizationalUnitAssignmentTarget",
        organizationalUnitId: "synthetic-ou-1",
      }),
    ).toBe("Organizational unit: synthetic-ou-1");
    expect(
      one({
        "@odata.type": "#microsoft.graph.scopeTagGroupAssignmentTarget",
        entraObjectId: "synthetic-group-1",
        targetType: "device",
      }),
    ).toBe("Devices in Group: synthetic-group-1");
    expect(
      one({
        "@odata.type": "#microsoft.graph.scopeTagGroupAssignmentTarget",
        entraObjectId: "synthetic-group-1",
        targetType: "user",
      }),
    ).toBe("Users in Group: synthetic-group-1");
    expect(
      one({
        "@odata.type":
          "#microsoft.graph.configurationManagerCollectionAssignmentTarget",
        collectionId: "SMS00001",
      }),
    ).toBe("CM Collection: SMS00001");
    expect(
      one({
        "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget",
        groupId: "synthetic-group-2",
      }),
    ).toBe("Excluded: synthetic-group-2");
  });

  it.each([
    [
      "an undocumented type",
      { "@odata.type": "#microsoft.graph.allUsersAssignmentTarget" },
    ],
    [
      "a type that only ends like a group target",
      {
        "@odata.type": "#microsoft.graph.syntheticGroupAssignmentTarget",
        groupId: "synthetic-group-1",
      },
    ],
    ["a target without its type", { groupId: "synthetic-group-1" }],
    [
      "a scope tag target without its target type",
      {
        "@odata.type": "#microsoft.graph.scopeTagGroupAssignmentTarget",
        entraObjectId: "synthetic-group-1",
      },
    ],
    [
      "a filter type Graph does not document",
      {
        "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
        deviceAndAppManagementAssignmentFilterId: "synthetic-filter",
        deviceAndAppManagementAssignmentFilterType: "synthetic",
      },
    ],
  ])("marks %s unreadable, never a label", (_label, target) => {
    expect(one(target)).toBe(UNREADABLE_ASSIGNMENT);
  });

  it("shows a filter only when it applies", () => {
    expect(
      one({
        "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
        deviceAndAppManagementAssignmentFilterId: "synthetic-filter",
        deviceAndAppManagementAssignmentFilterType: "include",
      }),
    ).toBe("All Devices [Filter (Include): synthetic-filter]");
    expect(
      one({
        "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
        deviceAndAppManagementAssignmentFilterId: null,
        deviceAndAppManagementAssignmentFilterType: "none",
      }),
    ).toBe("All Devices");
  });
});

describe("group ids for name lookup", () => {
  it("reads scope tag groups and ignores assignments that are not a list", () => {
    expect(
      assignmentGroupIds({
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.scopeTagGroupAssignmentTarget",
              entraObjectId: "synthetic-group-1",
              targetType: "user",
            },
          },
          {
            target: {
              "@odata.type": "#microsoft.graph.groupAssignmentTarget",
              groupId: "synthetic-group-2",
            },
          },
          { target: { groupId: "" } },
          null,
        ],
      }),
    ).toEqual(["synthetic-group-1", "synthetic-group-2"]);
    for (const assignments of [{ groupId: "synthetic" }, "synthetic", 1])
      expect(assignmentGroupIds({ assignments })).toEqual([]);
  });
});

describe("collection errors matched by item and family", () => {
  it("matches an error to its policy id and family only", () => {
    const errors = [
      assignmentError("synthetic-1", "settingsCatalog"),
      assignmentError("synthetic-1", "deviceConfigurations"),
      { ...assignmentError("synthetic-1", "settingsCatalog"), familyKey: "" },
      assignmentError("synthetic-2", "settingsCatalog"),
    ];
    expect(
      itemFetchErrors(errors, { id: "synthetic-1" }, "settingsCatalog"),
    ).toEqual([errors[0], errors[2]]);
  });

  it("reads a policy unknown in the analyzer when its assignment request failed", () => {
    const failed = catalogPolicy("synthetic-1");
    const other = catalogPolicy("synthetic-2");
    const analytics = analyzeConfigurations(
      exportData({
        settingsCatalog: [failed, other],
        fetchErrors: [
          assignmentError("synthetic-1", "settingsCatalog"),
          // Another family's error with the same id is not this policy's.
          assignmentError("synthetic-2", "deviceConfigurations"),
        ],
      }),
    );
    expect(analytics).toMatchObject({
      assignedConfigs: 1,
      unknownAssignmentConfigs: 1,
    });
  });

  it("does not count a policy as assigned in the compliance report when its assignment request failed", async () => {
    const assignedCell = async (data: DetailedExportData) => {
      const text = extractPdfStreamText(
        await generateComplianceReportPDF(data, {
          frameworkId: "nist-800-53-r5",
        }),
      );
      // The items and assigned cells that follow the family cell.
      return /\(Settings Catalog policies\) Tj[\s\S]*?\((\d+)\) Tj[\s\S]*?\((\d+)\) Tj/
        .exec(text)
        ?.slice(1);
    };
    const policy = catalogPolicy("synthetic-1");
    expect(
      await assignedCell(exportData({ settingsCatalog: [policy] })),
    ).toEqual(["1", "1"]);
    expect(
      await assignedCell(
        exportData({
          settingsCatalog: [policy],
          fetchErrors: [assignmentError("synthetic-1", "settingsCatalog")],
        }),
      ),
    ).toEqual(["1", "0"]);
  });

  it.each(["PDF", "Word"])(
    "says the assignments are unavailable in the %s documentation when their request failed",
    async (format) => {
      const data = exportData({
        settingsCatalog: [catalogPolicy("synthetic-1")],
        fetchErrors: [assignmentError("synthetic-1", "settingsCatalog")],
        includeComplianceEvidence: false,
      });
      const result =
        format === "PDF"
          ? await generateDetailedPDF(data)
          : await generateDetailedDOCX(data);
      const text =
        format === "PDF"
          ? extractPdfStreamText(result.buffer)
          : extractZipEntry(result.buffer, "word/document.xml");
      expect(text).toContain("collection incomplete");
    },
  );
});

describe("resource types without an assignment relationship", () => {
  // Notification message templates have no assignments child collection
  // in the policy registry; their collection status records other parts.
  const template = {
    id: "synthetic-template",
    displayName: "Synthetic notification template",
    registryKey: "notificationMessageTemplates",
    collectionStatus: { localizedNotificationMessages: "complete" },
  };
  const section = {
    key: "notificationMessageTemplates",
    familyKey: "specialistPolicies",
    label: "Notification templates",
    selectionPrefix: "additional-notificationMessageTemplates",
    items: [template],
  } as unknown as ConfigurationSectionData;

  it("never reads their assignments as incomplete", () => {
    expect(assignable(template)).toBe(false);
    expect(assignmentsIncomplete(template)).toBe(false);
    expect(assignmentsIncomplete({ ...template, hasFetchError: true })).toBe(
      false,
    );
    const [collected] = collectConfigurations(
      exportData({ sections: [section] }),
    );
    expect(collected?.collectionStatus).toEqual(template.collectionStatus);
    expect(
      analyzeConfigurations(exportData({ sections: [section] })),
    ).toMatchObject({ unknownAssignmentConfigs: 0 });
  });

  it.each(["PDF", "Word"])(
    "says assignments do not apply in the %s documentation",
    async (format) => {
      const data = exportData({
        sections: [section],
        includeComplianceEvidence: false,
      });
      const result =
        format === "PDF"
          ? await generateDetailedPDF(data)
          : await generateDetailedDOCX(data);
      const text =
        format === "PDF"
          ? extractPdfStreamText(result.buffer)
          : extractZipEntry(result.buffer, "word/document.xml");
      expect(text).toContain("Not applicable");
      expect(text).not.toContain("collection incomplete");
    },
  );

  it("keeps a Conditional Access policy out of the assignment relationship", () => {
    expect(
      assignable({ id: "synthetic-ca" }, "conditionalAccessPolicies"),
    ).toBe(false);
    expect(assignable({ id: "synthetic-policy" }, "settingsCatalog")).toBe(
      true,
    );
  });
});

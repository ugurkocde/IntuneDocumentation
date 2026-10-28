import { describe, expect, it } from "vitest";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import {
  buildGlanceModel,
  formatDocumentDate,
  summaryNotes,
} from "../documentation-glance";

const ALL_DEVICES = {
  target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
};

const EMPTY: DetailedExportData = {
  settingsCatalog: [],
  deviceConfigurations: [],
  administrativeTemplates: [],
  compliancePolicies: [],
  securityBaselines: [],
  scripts: { windows: [], macOS: [] },
};

function glanceOf(data: DetailedExportData) {
  const analytics = analyzeConfigurations(data);
  return { analytics, glance: buildGlanceModel(data, analytics) };
}

describe("buildGlanceModel", () => {
  it("matches analyzeConfigurations for the Contoso demo tenant", () => {
    const { analytics, glance } = glanceOf(CONTOSO_TENANT);
    expect(glance.configurations).toBe(analytics.totalConfigs);
    expect(glance.assigned).toBe(analytics.assignedConfigs);
    expect(glance.notAssigned).toBe(analytics.unassignedConfigs);
    expect(glance.assignmentUnknown).toBe(analytics.unknownAssignmentConfigs);
    expect(glance.assignmentApplicable).toBe(
      analytics.assignmentApplicableConfigs,
    );
    expect(glance.assignedShare).toBe(
      analytics.assignedConfigs / analytics.assignmentApplicableConfigs,
    );
    expect(glance.policyTypes).toBe(
      analytics.inventory.filter((row) => row.total > 0).length,
    );
    const sum = (pick: (family: (typeof glance.families)[number]) => number) =>
      glance.families.reduce((total, family) => total + pick(family), 0);
    expect(sum((family) => family.configurations)).toBe(analytics.totalConfigs);
    expect(sum((family) => family.assigned)).toBe(analytics.assignedConfigs);
    expect(sum((family) => family.notAssigned)).toBe(
      analytics.unassignedConfigs,
    );
    expect(sum((family) => family.assignmentUnknown)).toBe(
      analytics.unknownAssignmentConfigs,
    );
    expect(sum((family) => family.policyTypes)).toBe(glance.policyTypes);
    expect(glance.families.every((family) => family.configurations > 0)).toBe(
      true,
    );
    expect(glance.collection).toEqual({
      issues: [],
      partial: 0,
      unavailable: 0,
      skippedFamilies: [],
      hasWarnings: false,
    });
  });

  it("groups both script inventories into one family without sections", () => {
    const { glance } = glanceOf({
      ...EMPTY,
      scripts: {
        windows: [{ id: "w1", assignments: [ALL_DEVICES] }],
        macOS: [{ id: "m1", assignments: [] }],
      },
      settingsCatalog: [{ id: "c1", assignments: [ALL_DEVICES] }],
    });
    expect(glance.families).toEqual([
      {
        familyKey: "settingsCatalog",
        label: "Settings Catalog Policies",
        configurations: 1,
        policyTypes: 1,
        assigned: 1,
        notAssigned: 0,
        assignmentUnknown: 0,
      },
      {
        familyKey: "scripts",
        label: "Scripts",
        configurations: 2,
        policyTypes: 2,
        assigned: 1,
        notAssigned: 1,
        assignmentUnknown: 0,
      },
    ]);
    expect(glance.policyTypes).toBe(3);
  });

  it("follows section families, document order and unknown assignments", () => {
    const data: DetailedExportData = {
      ...EMPTY,
      sections: [
        {
          key: "mobileApps",
          familyKey: "applications",
          label: "Mobile apps",
          selectionPrefix: "additional-mobileApps",
          items: [{ id: "app-1", assignments: [] }],
        },
        {
          key: "windowsScripts",
          familyKey: "scripts",
          label: "Windows PowerShell scripts",
          selectionPrefix: "script-win",
          items: [
            {
              id: "s1",
              assignments: [],
              collectionStatus: { assignments: "incomplete" },
            },
          ],
        },
        {
          key: "settingsCatalog",
          familyKey: "settingsCatalog",
          label: "Settings Catalog",
          selectionPrefix: "catalog",
          items: [{ id: "c1", assignments: [ALL_DEVICES] }],
        },
        {
          key: "deviceManagementSettings",
          familyKey: "tenantAndService",
          label: "Intune tenant settings",
          selectionPrefix: "additional-deviceManagementSettings",
          items: [{}],
        },
      ],
    };
    const { analytics, glance } = glanceOf(data);
    expect(glance.families.map((family) => family.familyKey)).toEqual([
      "settingsCatalog",
      "scripts",
      "applications",
      "tenantAndService",
    ]);
    expect(glance.families.map((family) => family.label)).toEqual([
      "Settings Catalog Policies",
      "Scripts",
      "Applications",
      "Tenant & service",
    ]);
    expect(glance.configurations).toBe(4);
    expect(glance.assigned).toBe(analytics.assignedConfigs);
    expect(glance.assigned).toBe(1);
    expect(glance.notAssigned).toBe(1);
    expect(glance.assignmentUnknown).toBe(1);
    // The tenant settings singleton has no assignment relationship.
    expect(glance.assignmentApplicable).toBe(3);
    expect(glance.assignedShare).toBeCloseTo(1 / 3);
  });

  it("has no assigned share when nothing is assignable", () => {
    expect(glanceOf(EMPTY).glance.assignedShare).toBeNull();
    const { glance } = glanceOf({
      ...EMPTY,
      conditionalAccessPolicies: [
        {
          id: "ca-1",
          "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
        },
      ],
    });
    expect(glance.configurations).toBe(1);
    expect(glance.assignmentApplicable).toBe(0);
    expect(glance.assignedShare).toBeNull();
  });

  it("has no assigned share when every assignment is unknown", () => {
    const unknown = (id: string) => ({
      id,
      assignments: [],
      collectionStatus: { assignments: "incomplete" as const },
    });
    const { glance } = glanceOf({
      ...EMPTY,
      settingsCatalog: [unknown("a"), unknown("b")],
    });
    expect(glance.assignmentUnknown).toBe(2);
    expect(glance.assignmentApplicable).toBe(2);
    expect(glance.assignedShare).toBeNull();
  });

  it("formats document dates in one style", () => {
    expect(formatDocumentDate("2026-10-08T09:05:00Z", true)).toBe(
      "8 Oct 2026 \u00b7 09:05",
    );
    expect(formatDocumentDate(new Date("2026-12-31T23:00:00Z"), true)).toBe(
      "31 Dec 2026 \u00b7 23:00",
    );
    expect(formatDocumentDate("not a date", true)).toBeUndefined();
    expect(formatDocumentDate(undefined, true)).toBeUndefined();
  });

  it("writes the summary notes with singular and plural counts", () => {
    const notes = (stale: number, notApplicable: number) =>
      summaryNotes({
        ...analyzeConfigurations(EMPTY),
        staleConfigs: stale,
        assignmentNotApplicableConfigs: notApplicable,
      });
    expect(notes(0, 0)).toEqual([]);
    expect(notes(1, 1)).toEqual([
      "Assignment not applicable: 1 configuration; excluded from the assigned share.",
      "Not modified in 90 days or more: 1 configuration.",
    ]);
    expect(notes(3, 0)).toEqual([
      "Not modified in 90 days or more: 3 configurations.",
    ]);
  });

  it("separates partial and unavailable collection and lists each once", () => {
    const { glance } = glanceOf({
      ...EMPTY,
      collectionSkippedFamilies: ["conditionalAccessPolicies"],
      fetchErrors: [
        {
          policyId: "settingsCatalog",
          policyName: "Settings Catalog",
          policyType: "Settings Catalog",
          error: "Paging stopped",
          partial: true,
        },
        {
          policyId: "vppTokens",
          policyName: "VPP tokens",
          policyType: "connectors",
          error: "Forbidden",
        },
      ],
      sections: [
        {
          key: "vppTokens",
          familyKey: "connectors",
          label: "VPP tokens",
          selectionPrefix: "additional-vppTokens",
          items: [],
          error: { message: "Forbidden" },
        },
        {
          key: "roleDefinitions",
          familyKey: "assignmentAndRbac",
          label: "Role definitions",
          selectionPrefix: "additional-roleDefinitions",
          items: [{ id: "r1" }],
          error: { message: "Paging stopped", partial: true },
        },
      ],
    });
    expect(glance.collection).toEqual({
      issues: [
        { label: "Settings Catalog: Settings Catalog", partial: true },
        { label: "connectors: VPP tokens", partial: false },
        { label: "Role definitions", partial: true },
      ],
      partial: 2,
      unavailable: 1,
      skippedFamilies: ["conditionalAccessPolicies"],
      hasWarnings: true,
    });
  });

  it("records skipped families as a warning on their own", () => {
    const { glance } = glanceOf({
      ...EMPTY,
      collectionSkippedFamilies: ["conditionalAccessPolicies"],
    });
    expect(glance.collection.hasWarnings).toBe(true);
    expect(glance.collection.issues).toEqual([]);
  });
});

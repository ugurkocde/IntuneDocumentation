import { afterEach, describe, expect, it, vi } from "vitest";
import { labCollectionSections } from "./__fixtures__/lab-collection";
import { ASSIGNMENT_UNREADABLE, NOT_ASSIGNED, assignmentText } from "../shared/assignment-text";

const sections = labCollectionSections();

// The digest the collector redacts with, as set by collectAll.
const digest = vi.hoisted(() => ({
  current: null as unknown,
  duringCollection: [] as unknown[],
}));

vi.mock("../../../../src/lib/intune-policy-registry", async (original) => ({
  ...(await original<object>()),
  setRedactionDigest: (value: unknown) => {
    digest.current = value;
  },
}));

vi.mock("../../../../src/lib/intune-detailed-client", () => ({
  DetailedIntuneService: class {
    async getAllDetailedConfigurations() {
      digest.duringCollection.push(digest.current);
      return {
        collectedAt: "2026-10-08T12:00:00.000Z",
        sections,
        fetchErrors: [
          {
            policyId: "depOnboardingSettings",
            policyName: "Apple ADE tokens",
            policyType: "enrollmentAndProvisioning",
            familyKey: "enrollmentAndProvisioning",
            error: "Partial",
          },
          // Synthetic: read only by the assignment summary test below.
          {
            policyId: "assignments-error",
            policyName: "Synthetic assignments-error",
            policyType: "deviceConfigurations",
            familyKey: "deviceConfigurations",
            endpoint: "/deviceManagement/deviceConfigurations/assignments-error/assignments",
            error: "Synthetic failure",
          },
        ],
        permissionErrors: [],
        // The web app's own total, which the desktop app must not change.
        summary: { totalConfigurations: 818, byType: {} },
      };
    }
  },
}));

vi.mock("../../../../src/lib/pdf-page-estimate", () => ({
  estimatePdfPageCount: () => ({ pages: 10, isLarge: false }),
}));

const { clearCollection, collectAll, getSectionItems } = await import("./collect");

afterEach(clearCollection);

describe("collectAll summary", () => {
  it("adds the breakdown and display families without changing the total", async () => {
    const summary = await collectAll(async () => "token", () => undefined, { owner: "owner" });
    expect(summary.totalConfigurations).toBe(818);
    expect(summary.breakdown).toEqual({
      policies: 224,
      apps: 537,
      appsAssigned: 67,
      rbac: 45,
      microsoftDefaults: 23,
      microsoftDefaultsInRbac: 11,
    });
    expect(summary.sectionCounts.reduce((sum, section) => sum + section.count, 0)).toBe(818);
    expect(summary.sectionCounts.find((section) => section.key === "depOnboardingSettings")?.familyKey).toBe(
      "connectors",
    );
    expect(summary.fetchErrors[0]?.familyKey).toBe("connectors");
  });

  it("labels items with their display family and Microsoft default flag", async () => {
    await collectAll(async () => "token", () => undefined, { owner: "owner" });
    const catalog = getSectionItems("settingsCatalog", "owner");
    expect(catalog.items).toHaveLength(126);
    expect(catalog.items.filter((item) => item.familyKey === "endpointSecurityPolicies")).toHaveLength(28);
    const roles = getSectionItems("roleDefinitions", "owner");
    expect(roles.items.filter((item) => item.microsoftDefault)).toHaveLength(10);
    expect(getSectionItems("depOnboardingSettings", "owner").familyKey).toBe("connectors");
  });
});

describe("collectAll redaction digests", () => {
  it("keeps digests of redacted values only while history is on", async () => {
    digest.duringCollection = [];
    await collectAll(async () => "token", () => undefined, { owner: "owner" });
    await collectAll(async () => "token", () => undefined, { owner: "owner", keepDigests: false });
    await collectAll(async () => "token", () => undefined, { owner: "owner", keepDigests: true });
    expect(digest.duringCollection[0]).toBeNull();
    expect(digest.duringCollection[1]).toBeNull();
    expect(typeof digest.duringCollection[2]).toBe("function");
    // Nothing else, such as an export, digests afterwards.
    expect(digest.current).toBeNull();
  });
});

// Round 29: the policy list reads targets by the documented target types
// (src/lib/compliance/graph-rows.ts), as the engine and history do.
describe("assignment summary of listed policies", () => {
  const assignment = (target: Record<string, unknown>) => ({ id: "assignment-1", target });
  const policy = (id: string, assignments: unknown, collectionStatus?: Record<string, string>) => ({
    id,
    displayName: `Synthetic ${id}`,
    "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
    assignments,
    ...(collectionStatus ? { collectionStatus } : {}),
  });
  const items = [
    policy("collection", [
      assignment({
        "@odata.type": "#microsoft.graph.configurationManagerCollectionAssignmentTarget",
        collectionId: "SMS00001",
      }),
    ]),
    policy("unit", [
      assignment({
        "@odata.type": "#microsoft.graph.organizationalUnitAssignmentTarget",
        organizationalUnitId: "synthetic-ou-1",
      }),
    ]),
    policy("group-without-id", [assignment({ "@odata.type": "#microsoft.graph.groupAssignmentTarget" })]),
    policy("undocumented", [assignment({ "@odata.type": "#microsoft.graph.allUsersAssignmentTarget" })]),
    policy("lookalike", [
      assignment({ "@odata.type": "#microsoft.graph.syntheticAllDevicesAssignmentTarget" }),
    ]),
    policy("incomplete", [], { assignments: "incomplete" }),
    policy("status-without-assignments", [], { settings: "complete" }),
    { ...policy("fetch-failed", []), hasFetchError: true },
    policy("assignments-error", []),
    policy("unassigned", []),
    policy("unassigned-complete", [], { assignments: "complete" }),
    // Assignments Graph returned as no list, or a value that is not one,
    // may hold any assignment, whatever the status says.
    policy("assignments-object", {}, { assignments: "complete" }),
    policy("assignments-null", null, { assignments: "complete" }),
    policy("assignments-string", "synthetic", { assignments: "complete" }),
    policy("assignments-number", 1, { assignments: "complete" }),
    policy("assignments-omitted", undefined, { assignments: "complete" }),
    policy("excluded-only", [
      assignment({ "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: "synthetic-group-1" }),
    ]),
    // A registry type with assignments whose assignments were not collected
    // has no list; a type without an assignment relationship has none.
    {
      id: "registry-assignments-failed",
      displayName: "Synthetic terms",
      registryKey: "termsAndConditions",
      collectionStatus: { assignments: "incomplete" },
    },
    {
      id: "registry-unassignable",
      displayName: "Synthetic notification template",
      registryKey: "notificationMessageTemplates",
      collectionStatus: { localizedNotificationMessages: "complete" },
    },
    policy("scope-tag-group", [
      assignment({
        "@odata.type": "#microsoft.graph.scopeTagGroupAssignmentTarget",
        entraObjectId: "synthetic-group-1",
        targetType: "user",
      }),
    ]),
  ];
  const synthetic = {
    key: "deviceConfigurations",
    familyKey: "deviceConfigurations",
    label: "Synthetic configurations",
    selectionPrefix: "deviceConfigurations",
    items,
  };

  it("reads documented targets and leaves unreadable ones unknown, never not assigned", async () => {
    const index = sections.findIndex((section: { key: string }) => section.key === "deviceConfigurations");
    const original = sections[index];
    sections[index] = synthetic as never;
    try {
      await collectAll(async () => "token", () => undefined, { owner: "owner" });
      const byId = new Map(getSectionItems("deviceConfigurations", "owner").items.map((item) => [item.id, item]));
      expect(byId.get("collection")).toMatchObject({ assignmentUnknown: false, assignedToCollections: 1 });
      expect(byId.get("unit")).toMatchObject({ assignmentUnknown: false, assignedToOrganizationalUnits: 1 });
      expect(byId.get("scope-tag-group")).toMatchObject({ assignmentUnknown: false, assignmentCount: 1 });
      for (const id of [
        "group-without-id",
        "undocumented",
        "lookalike",
        "incomplete",
        "status-without-assignments",
        "fetch-failed",
        "assignments-error",
      ])
        expect(byId.get(id), id).toMatchObject({
          assignmentUnknown: true,
          assignedToAllUsers: false,
          assignedToAllDevices: false,
        });
      for (const id of ["unassigned", "unassigned-complete", "excluded-only"])
        expect(byId.get(id), id).toMatchObject({ assignmentUnknown: false, assignmentCount: 0 });
      for (const id of [
        "assignments-object",
        "assignments-null",
        "assignments-string",
        "assignments-number",
        "assignments-omitted",
      ]) {
        expect(byId.get(id), id).toMatchObject({ assignmentUnknown: true, assignmentCount: 0 });
        expect(assignmentText(byId.get(id)!), id).toBe(ASSIGNMENT_UNREADABLE);
      }
      expect(assignmentText(byId.get("unassigned-complete")!)).toBe(NOT_ASSIGNED);
      expect(byId.get("registry-assignments-failed")).toMatchObject({ assignmentUnknown: true, assignmentCount: 0 });
      expect(byId.get("registry-unassignable")).toMatchObject({ assignmentUnknown: false, assignmentCount: null });
    } finally {
      sections[index] = original!;
    }
  });

  it("keeps Conditional Access without an assignment line, never unknown", async () => {
    sections.push({
      key: "conditionalAccessPolicies",
      familyKey: "conditionalAccessPolicies",
      label: "Synthetic Conditional Access",
      items: [{ id: "synthetic-ca", displayName: "Synthetic Conditional Access policy", state: "enabled" }],
    } as never);
    try {
      await collectAll(async () => "token", () => undefined, { owner: "owner" });
      const [item] = getSectionItems("conditionalAccessPolicies", "owner").items;
      expect(item).toMatchObject({ assignmentUnknown: false, assignmentCount: null });
      expect(assignmentText(item!)).toBeNull();
    } finally {
      sections.pop();
    }
  });
});

import { describe, expect, it, vi } from "vitest";

const requested = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock("../group-resolver", () => ({
  GroupResolver: class {
    async getGroupNames(ids: string[]) {
      requested.ids = ids;
      return new Map(ids.map((id) => [id, `Synthetic ${id}`]));
    }
    getWarnings() {
      return [];
    }
  },
}));

// Device counts are not part of this test; their failure is caught.
vi.mock("../graph-client", () => ({
  createGraphClient: () => {
    throw new Error("Synthetic: no Graph in tests");
  },
}));

const { resolveExportData } = await import("../client-export-resolver");

const target = (fields: Record<string, unknown>) => ({ target: fields });

describe("group names to resolve for an export", () => {
  it("include the group a scope tag targets by its Entra object id, skipping empty ids", async () => {
    const resolved = await resolveExportData(
      {
        sections: [
          {
            key: "roleScopeTags",
            familyKey: "assignmentAndRbac",
            label: "Scope tags",
            selectionPrefix: "roleScopeTags",
            items: [
              {
                id: "1",
                displayName: "Synthetic tag",
                assignments: [
                  target({
                    "@odata.type":
                      "#microsoft.graph.scopeTagGroupAssignmentTarget",
                    entraObjectId: "synthetic-group-1",
                    targetType: "device",
                  }),
                  target({
                    "@odata.type":
                      "#microsoft.graph.scopeTagGroupAssignmentTarget",
                    entraObjectId: "",
                    targetType: "user",
                  }),
                  target({
                    "@odata.type": "#microsoft.graph.groupAssignmentTarget",
                    groupId: "synthetic-group-2",
                  }),
                ],
              },
            ],
          },
        ],
      } as never,
      "synthetic-token",
    );
    expect(requested.ids.sort()).toEqual([
      "synthetic-group-1",
      "synthetic-group-2",
    ]);
    expect(resolved.groupNames.get("synthetic-group-1")).toBe(
      "Synthetic synthetic-group-1",
    );
  });

  it("skip assignments that are not a list instead of failing the export", async () => {
    requested.ids = [];
    const resolved = await resolveExportData(
      {
        sections: [
          {
            key: "deviceConfigurations",
            familyKey: "deviceConfigurations",
            label: "Device configurations",
            selectionPrefix: "deviceConfigurations",
            items: [
              {
                id: "synthetic-1",
                displayName: "Synthetic object assignments",
                assignments: { groupId: "synthetic-group-1" },
              },
              {
                id: "synthetic-2",
                displayName: "Synthetic text assignments",
                assignments: "synthetic-group-2",
              },
            ],
          },
        ],
      } as never,
      "synthetic-token",
    );
    expect(requested.ids).toEqual([]);
    expect(resolved.groupNames.size).toBe(0);
  });
});

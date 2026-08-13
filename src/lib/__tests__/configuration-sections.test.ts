import { describe, expect, it } from "vitest";
import {
  getItemLabel,
  getSelectionId,
  getStableItemId,
} from "../configuration-sections";
import { mapWithConcurrency } from "../intune-policy-registry";
import { analyzeConfigurations } from "../configuration-analyzer";

describe("normalized configuration sections", () => {
  const singletonSection = {
    key: "deviceManagementSettings",
    label: "Intune tenant settings",
    selectionPrefix: "additional-deviceManagementSettings",
  };

  it("creates stable IDs and labels for nameless singleton resources", () => {
    expect(getStableItemId(singletonSection, {})).toBe(
      "singleton-deviceManagementSettings",
    );
    expect(getItemLabel(singletonSection, {})).toBe("Intune tenant settings");
    expect(getSelectionId(singletonSection, {})).toBe(
      "additional-deviceManagementSettings-singleton-deviceManagementSettings",
    );
    expect(getStableItemId(singletonSection, {}, 2)).toBe(
      "singleton-deviceManagementSettings-2",
    );
    expect(getSelectionId(singletonSection, {}, 2)).toBe(
      "additional-deviceManagementSettings-singleton-deviceManagementSettings-2",
    );
  });

  it("preserves input order under bounded concurrency", async () => {
    const result = await mapWithConcurrency([3, 1, 2], 2, async (value) => {
      await Promise.resolve();
      return value * 2;
    });
    expect(result).toEqual([6, 2, 4]);
  });

  it("keeps executive-summary inventory aligned with normalized sections", () => {
    const analytics = analyzeConfigurations({
      sections: [
        {
          key: "settingsCatalog",
          familyKey: "settingsCatalog",
          label: "Settings Catalog",
          selectionPrefix: "catalog",
          items: [{ id: "policy-1", assignments: [{ id: "assignment-1" }] }],
        },
        {
          key: "mobileApps",
          familyKey: "applications",
          label: "Mobile apps",
          selectionPrefix: "additional-mobileApps",
          items: [{ id: "app-1", assignments: [] }],
        },
      ],
      settingsCatalog: [],
      deviceConfigurations: [],
      administrativeTemplates: [],
      compliancePolicies: [],
      securityBaselines: [],
      scripts: { windows: [], macOS: [] },
    });

    expect(analytics.totalConfigs).toBe(2);
    expect(analytics.inventory).toEqual([
      {
        key: "settingsCatalog",
        label: "Settings Catalog",
        total: 1,
        assigned: 1,
      },
      { key: "mobileApps", label: "Mobile apps", total: 1, assigned: 0 },
    ]);
  });
});

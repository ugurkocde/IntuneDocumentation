import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigurationSectionData } from "../../../../src/lib/configuration-sections";

// Runs the search through the real collect.ts display metadata, as the
// collect:searchSettings handler does, so hits carry the family the sidebar
// shows the item under.

const catalogSetting = (id: string, value: string) => ({
  id: "0",
  settingInstance: {
    "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
    settingDefinitionId: id,
    simpleSettingValue: { value },
  },
});

const catalogPolicy = (id: string, name: string, templateFamily: string) => ({
  id,
  name,
  platforms: "windows10",
  templateReference: { templateId: "", templateFamily },
  settings: [catalogSetting("device_vendor_msft_policy_config_sharedmarker", `${name} marker`)],
  assignments: [],
});

const sections: ConfigurationSectionData[] = [
  {
    key: "settingsCatalog",
    familyKey: "settingsCatalog",
    label: "Settings Catalog",
    selectionPrefix: "catalog",
    items: [
      catalogPolicy("plain", "Plain catalog policy", "none"),
      catalogPolicy("firewall", "Firewall endpoint policy", "endpointSecurityFirewall"),
      catalogPolicy("baseline", "Windows security baseline", "baseline"),
    ],
  },
  {
    key: "depOnboardingSettings",
    familyKey: "enrollmentAndProvisioning",
    label: "Apple ADE tokens",
    selectionPrefix: "additional-dep",
    items: [{ id: "dep-1", tokenName: "Contoso ADE sharedmarker token", appleIdentifier: "ade@contoso.com" }],
  },
];

vi.mock("../../../../src/lib/intune-detailed-client", () => ({
  DetailedIntuneService: class {
    async getAllDetailedConfigurations() {
      return {
        collectedAt: "2026-10-08T12:00:00.000Z",
        sections,
        fetchErrors: [],
        permissionErrors: [],
        summary: { totalConfigurations: 4, byType: {} },
      };
    }
  },
}));

vi.mock("../../../../src/lib/pdf-page-estimate", () => ({
  estimatePdfPageCount: () => ({ pages: 1, isLarge: false }),
}));

const { clearCollection, collectAll, getLastCollection, getSectionItems } = await import("./collect");
const { searchSettingsIndex, settingsIndexFor } = await import("./search-index");

afterEach(clearCollection);

async function search(query: string, families?: string[]) {
  const summary = await collectAll(async () => "token", () => undefined, { owner: "owner" });
  const collection = getLastCollection()!;
  const index = settingsIndexFor(collection, (section) => getSectionItems(section.key, "owner"));
  return { summary, result: searchSettingsIndex(index, { query, families }) };
}

describe("settings search display families", () => {
  it("labels each hit with the family the item is displayed under", async () => {
    const { summary, result } = await search("sharedmarker");
    const families = Object.fromEntries(result.hits.map((hit) => [hit.policyName, hit.familyKey]));
    expect(families).toEqual({
      "Plain catalog policy": "settingsCatalog",
      "Firewall endpoint policy": "endpointSecurityPolicies",
      "Windows security baseline": "securityBaselinePolicies",
      "Apple ADE tokens": "connectors",
    });
    // The same families the sidebar counts, so a click opens a view that
    // lists the item.
    const shown = new Set(
      summary.sectionCounts.flatMap((section) =>
        section.families?.length ? section.families.map((family) => family.familyKey) : [section.familyKey],
      ),
    );
    for (const hit of result.hits) expect(shown.has(hit.familyKey)).toBe(true);
  });

  it("filters by the displayed family", async () => {
    const { result } = await search("sharedmarker", ["endpointSecurityPolicies"]);
    expect(result.hits.map((hit) => hit.policyName)).toEqual(["Firewall endpoint policy"]);
    expect(result.families.map((facet) => facet.value).sort()).toEqual([
      "connectors",
      "endpointSecurityPolicies",
      "securityBaselinePolicies",
      "settingsCatalog",
    ]);
  });
});

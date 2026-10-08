import { describe, expect, it } from "vitest";
import type { ConfigurationSectionData } from "../../../../src/lib/configuration-sections";
import { CONTOSO_TENANT } from "../../../../src/lib/compliance/demo/contoso-tenant";
import type { SectionItemSummary } from "../shared/ipc-types";
import {
  buildSettingsIndex,
  platformLabels,
  searchSettingsIndex,
  settingsIndexFor,
} from "./search-index";

// Stands in for getSectionItems, which needs the collection main holds.
function summarize(section: ConfigurationSectionData) {
  const items: SectionItemSummary[] = section.items.map((item: Record<string, unknown>, index) => {
    const assignments = Array.isArray(item.assignments) ? item.assignments : [];
    return {
      id: String(item.id ?? `${section.key}-${index}`),
      displayName: String(item.displayName ?? item.name ?? section.label),
      odataType: typeof item["@odata.type"] === "string" ? item["@odata.type"] : null,
      description: null,
      platforms: typeof item.platforms === "string" ? item.platforms : null,
      technologies: null,
      lastModifiedDateTime: null,
      assignmentCount: assignments.length,
      assignedToAllUsers: false,
      assignedToAllDevices: false,
      hasFetchError: false,
      // Endpoint security policies move to their own display family.
      ...(item.templateFamily === "endpointSecurityFirewall" ? { familyKey: "endpointSecurityPolicies" } : {}),
    };
  });
  return { familyKey: section.familyKey, label: `${section.key} label`, items };
}

function section(
  key: string,
  familyKey: string,
  items: unknown[] | undefined,
): ConfigurationSectionData {
  return { key, familyKey, label: key, selectionPrefix: key, items: items ?? [] };
}

const contosoSections = [
  section("settingsCatalog", "settingsCatalog", CONTOSO_TENANT.settingsCatalog),
  section("deviceConfigurations", "deviceConfigurations", CONTOSO_TENANT.deviceConfigurations),
  section("compliancePolicies", "compliancePolicies", CONTOSO_TENANT.compliancePolicies),
  section("windowsUpdatePolicies", "windowsUpdatePolicies", CONTOSO_TENANT.windowsUpdatePolicies),
  section("conditionalAccessPolicies", "conditionalAccessPolicies", CONTOSO_TENANT.conditionalAccessPolicies),
];

const firewallSettings = {
  settings: [
    {
      settingInstance: {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
        settingDefinitionId: "vendor_msft_firewall_mdmstore_firewallrules_{firewallrulename}_name",
        simpleSettingValue: { value: "Allow RDP" },
      },
    },
  ],
};

describe("settings search index", () => {
  const index = buildSettingsIndex(contosoSections, summarize);

  it("requires every word to match, in any field", () => {
    const result = searchSettingsIndex(index, { query: "encryption bitlocker" });
    expect(result.total).toBeGreaterThan(0);
    for (const hit of result.hits) {
      const text = [hit.name, hit.value, hit.definitionId, hit.path.join(" "), hit.policyName]
        .join(" ")
        .toLowerCase();
      expect(text).toContain("encryption");
      expect(text).toContain("bitlocker");
    }
    expect(searchSettingsIndex(index, { query: "bitlocker zzznomatch" }).total).toBe(0);
  });

  it("is case insensitive and ranks exact setting names first", () => {
    const result = searchSettingsIndex(index, { query: "PASSWORD MINIMUM LENGTH" });
    expect(result.total).toBeGreaterThan(1);
    expect(result.hits[0]?.name.toLowerCase()).toBe("password minimum length");
  });

  it("finds settings by technical id", () => {
    const result = searchSettingsIndex(index, {
      query: "device_vendor_msft_bitlocker_requiredeviceencryption",
    });
    expect(result.hits[0]).toMatchObject({
      name: "Require Device Encryption",
      definitionId: "device_vendor_msft_bitlocker_requiredeviceencryption",
      policyName: "WIN - Baseline - BitLocker",
      familyKey: "settingsCatalog",
      platforms: ["Windows"],
    });
  });

  it("matches the policy name and reports policy metadata", () => {
    const result = searchSettingsIndex(index, { query: "update ring pilot automatic" });
    expect(result.hits[0]).toMatchObject({
      policyName: "WIN - Update ring Pilot",
      sectionKey: "windowsUpdatePolicies",
      name: "Automatic Update Mode",
    });
  });

  it("caps the hits and reports the total", () => {
    const result = searchSettingsIndex(index, { query: "e", limit: 5 });
    expect(result.hits).toHaveLength(5);
    expect(result.total).toBeGreaterThan(5);
    expect(searchSettingsIndex(index, { query: "e" }).hits.length).toBeLessThanOrEqual(200);
  });

  it("filters by family and platform and counts facets of the query alone", () => {
    const all = searchSettingsIndex(index, { query: "password" });
    const compliance = searchSettingsIndex(index, {
      query: "password",
      families: ["compliancePolicies"],
    });
    expect(compliance.total).toBeLessThan(all.total);
    expect(compliance.hits.every((hit) => hit.familyKey === "compliancePolicies")).toBe(true);
    expect(compliance.families).toEqual(all.families);

    const mac = searchSettingsIndex(index, { query: "password", platforms: ["macOS"] });
    expect(mac.total).toBeGreaterThan(0);
    expect(mac.hits.every((hit) => hit.platforms.includes("macOS"))).toBe(true);
  });

  it("returns nothing for an empty query", () => {
    const result = searchSettingsIndex(index, { query: "   " });
    expect(result).toMatchObject({ total: 0, hits: [] });
    expect(result.indexedSettings).toBeGreaterThan(100);
  });

  it("builds once per collection and rebuilds for a new one", () => {
    const first = { sections: contosoSections };
    const built = settingsIndexFor(first, summarize);
    expect(settingsIndexFor(first, summarize)).toBe(built);

    const next = { sections: [section("compliancePolicies", "compliancePolicies", CONTOSO_TENANT.compliancePolicies)] };
    const rebuilt = settingsIndexFor(next, summarize);
    expect(rebuilt).not.toBe(built);
    expect(searchSettingsIndex(rebuilt, { query: "bitlocker encryption device require" }).total).toBe(0);
  });

  it("takes families and labels from the display metadata", () => {
    const moved = buildSettingsIndex(
      [
        section("settingsCatalog", "settingsCatalog", [
          { id: "fw", name: "Firewall policy", templateFamily: "endpointSecurityFirewall", ...firewallSettings },
          { id: "plain", name: "Plain policy", ...firewallSettings },
        ]),
      ],
      summarize,
    );
    const result = searchSettingsIndex(moved, { query: "allow rdp" });
    expect(result.hits.map((hit) => [hit.policyName, hit.familyKey, hit.sectionLabel])).toEqual([
      ["Firewall policy", "endpointSecurityPolicies", "settingsCatalog label"],
      ["Plain policy", "settingsCatalog", "settingsCatalog label"],
    ]);
    expect(
      searchSettingsIndex(moved, { query: "allow rdp", families: ["endpointSecurityPolicies"] }).total,
    ).toBe(1);
  });

  it("derives platforms from the platform field or the resource type", () => {
    expect(platformLabels("windows10", null)).toEqual(["Windows"]);
    expect(platformLabels(null, "#microsoft.graph.iosCompliancePolicy")).toEqual(["iOS"]);
    expect(platformLabels(null, "#microsoft.graph.macOSGeneralDeviceConfiguration")).toEqual(["macOS"]);
    expect(platformLabels(null, "#microsoft.graph.conditionalAccessPolicy")).toEqual([]);
  });
});

// 850 Settings Catalog policies with nested choices and repeated groups, as
// a large tenant can hold.
function syntheticCollection() {
  const items = Array.from({ length: 850 }, (_, policyIndex) => ({
    id: `policy-${policyIndex}`,
    name: `Policy ${policyIndex} ${policyIndex % 3 === 0 ? "Firewall" : "Defender"}`,
    platforms: policyIndex % 4 === 0 ? "macOS" : "windows10",
    assignments: [],
    settings: Array.from({ length: 30 }, (_, settingIndex) => {
      const id = `device_vendor_msft_policy_config_area${settingIndex}_setting${policyIndex}`;
      return {
        id: String(settingIndex),
        settingInstance: {
          "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          settingDefinitionId: id,
          choiceSettingValue: {
            value: `${id}_1`,
            children: [
              { settingDefinitionId: `${id}_child_a`, simpleSettingValue: { value: `value ${settingIndex}` } },
              {
                settingDefinitionId: `${id}_child_group`,
                groupSettingCollectionValue: [1, 2].map((entry) => ({
                  children: [
                    { settingDefinitionId: `${id}_child_group_name`, simpleSettingValue: { value: `rule ${entry}` } },
                  ],
                })),
              },
            ],
          },
        },
        settingDefinitions: [
          {
            id,
            displayName: `Area ${settingIndex} setting`,
            options: [{ itemId: `${id}_1`, name: "on", displayName: "Enabled" }],
          },
          { id: `${id}_child_a`, displayName: "Child value" },
        ],
      };
    }),
  }));
  return { sections: [section("settingsCatalog", "settingsCatalog", items)] };
}

describe("settings search performance", () => {
  it("answers queries well under 300 ms on a large collection", () => {
    const collection = syntheticCollection();
    const started = performance.now();
    const index = settingsIndexFor(collection, summarize);
    const buildMs = performance.now() - started;
    expect(index.rows.length).toBeGreaterThan(100_000);

    const queries = ["area 12 setting", "rule", "firewall enabled", "device_vendor_msft_policy_config_area3", "zzz", "e"];
    let slowest = 0;
    for (const query of queries) {
      const queryStarted = performance.now();
      const result = searchSettingsIndex(index, { query });
      slowest = Math.max(slowest, performance.now() - queryStarted);
      expect(result.hits.length).toBeLessThanOrEqual(200);
    }
    console.info(
      `settings index: ${index.rows.length} rows built in ${Math.round(buildMs)} ms, slowest query ${Math.round(slowest)} ms`,
    );
    expect(slowest).toBeLessThan(300);
  });
});

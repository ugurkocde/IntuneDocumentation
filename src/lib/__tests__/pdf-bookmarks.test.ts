import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { generateComplianceReportPDF } from "../compliance/report-pdf";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import {
  estimatePdfPageCount,
  LARGE_PDF_PAGE_THRESHOLD,
} from "../pdf-page-estimate";
import { defenderForEndpointPolicyFixture } from "./fixtures/intune-beta";
import { readPdfOutline } from "./helpers/pdf-outline";

function createExportData(): DetailedExportData {
  return {
    settingsCatalog: [structuredClone(defenderForEndpointPolicyFixture)],
    deviceConfigurations: [
      {
        id: "device-restrictions",
        displayName: "Device restrictions (Pilot) Überprüfung",
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
        passwordRequired: true,
        assignments: [],
      },
    ],
    administrativeTemplates: [],
    compliancePolicies: [
      {
        id: "windows-compliance",
        displayName: "Windows compliance baseline",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        bitLockerEnabled: true,
        assignments: [],
      },
    ],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
  };
}

function pageCount(bytes: Uint8Array): number {
  return (
    Buffer.from(bytes)
      .toString("latin1")
      .match(/\/Type \/Page\b(?!s)/g) ?? []
  ).length;
}

function catalogPolicies(count: number, settingsPerPolicy: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `catalog-${index}`,
    name: `Catalog policy ${index}`,
    platforms: "windows10",
    assignments: [],
    settings: Array.from({ length: settingsPerPolicy }, (_, setting) => ({
      id: `${setting}`,
      settingInstance: {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
        settingDefinitionId: `device_vendor_msft_policy_config_example_setting_${setting}`,
        simpleSettingValue: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
          value: `value ${setting}`,
        },
      },
    })),
  }));
}

describe("detailed PDF bookmarks", () => {
  it("adds a bookmark per section with its policies nested beneath it", async () => {
    const result = await generateDetailedPDF(createExportData());
    const { hasOutlinesCatalogEntry, outline, linkPages } = readPdfOutline(
      result.buffer,
    );

    expect(hasOutlinesCatalogEntry).toBe(true);
    expect(outline.map((node) => node.title)).toEqual([
      "Tenant Overview",
      "Compliance Evidence Preview",
      "Settings Catalog Policies",
      "Device Configurations",
      "Compliance Policies",
    ]);
    expect(
      outline.map((node) => node.children.map((child) => child.title)),
    ).toEqual([
      [],
      [],
      ["Endpoint antivirus policy"],
      ["Device restrictions (Pilot) Überprüfung"],
      ["Windows compliance baseline"],
    ]);

    // Sections open on increasing pages and each policy sits within its section.
    const sectionPages = outline.map((node) => node.page ?? 0);
    expect(sectionPages.every((page) => page > 2)).toBe(true);
    expect([...sectionPages].sort((a, b) => a - b)).toEqual(sectionPages);
    for (const node of outline) {
      for (const child of node.children) {
        expect(child.page).toBeGreaterThanOrEqual(node.page ?? 0);
      }
    }

    // The rendered contents rows link to the same pages as the bookmarks.
    expect(linkPages).toEqual(sectionPages);
  });

  it("keeps the bookmarks when the table of contents page is disabled", async () => {
    const data = createExportData();
    data.branding = {
      documentSettings: { includeTableOfContents: false, format: "detailed" },
    };
    const { outline, linkPages } = readPdfOutline(
      (await generateDetailedPDF(data)).buffer,
    );

    expect(outline.map((node) => node.title)).toContain(
      "Settings Catalog Policies",
    );
    expect(linkPages).toEqual([]);
  });
});

describe("compliance report PDF bookmarks", () => {
  it("groups NIST 800-53 controls by family beneath their section", async () => {
    const report = await generateComplianceReportPDF(createExportData(), {
      frameworkId: "nist-800-53-r5",
    });
    const { hasOutlinesCatalogEntry, outline, linkPages } =
      readPdfOutline(report);

    expect(hasOutlinesCatalogEntry).toBe(true);
    expect(outline.map((node) => node.title)).toEqual([
      "Summary",
      "Results Overview",
      "Data Basis and Scope",
      "Appendix A: Evidence Register",
      "Methodology",
    ]);

    const families = outline[2]?.children ?? [];
    expect(families.map((family) => family.title)).toEqual(
      expect.arrayContaining(["AC", "IA", "SC"]),
    );
    for (const family of families) {
      expect(family.children.length).toBeGreaterThan(0);
      expect(family.page).toBe(family.children[0]?.page);
      for (const control of family.children) {
        expect(control.title.startsWith(`${family.title}-`)).toBe(true);
      }
    }
    expect(
      families.flatMap((family) => family.children.map((c) => c.title)),
    ).toContain("SC-28 Protection of Information at Rest");

    // One contents link per section and per control, in contents order.
    const controls = families.flatMap((family) => family.children);
    expect(linkPages).toHaveLength(outline.length + controls.length);
  });

  it("does not add a family level that would only repeat the entries", async () => {
    for (const frameworkId of [
      "essential-eight",
      "cyber-essentials-v3",
      "iso-27001-2022",
    ] as const) {
      const { outline } = readPdfOutline(
        await generateComplianceReportPDF(createExportData(), { frameworkId }),
      );
      const controls = outline.flatMap((node) => node.children);

      expect(controls.length).toBeGreaterThan(0);
      expect(controls.every((control) => control.children.length === 0)).toBe(
        true,
      );
    }
  });
});

describe("estimatePdfPageCount", () => {
  it("counts policies and settings across every exported family", () => {
    const data = createExportData();
    data.settingsCatalog = catalogPolicies(3, 4);
    data.scripts.windows = [{ id: "script", displayName: "Script" }];
    data.sections = [
      {
        key: "additional-test",
        familyKey: "test",
        label: "Additional section",
        selectionPrefix: "additional-test",
        items: [{ id: "extra", displayName: "Extra", enabled: true }],
      },
    ];

    const estimate = estimatePdfPageCount(data);

    // 3 catalog policies, 2 property based policies, 1 script, 1 extra item
    expect(estimate.policies).toBe(7);
    // 12 catalog settings, passwordRequired, bitLockerEnabled and enabled
    expect(estimate.settings).toBe(15);
    expect(estimate.isLarge).toBe(false);
  });

  it("flags very large exports", () => {
    const data = createExportData();
    data.settingsCatalog = catalogPolicies(400, 30);

    const estimate = estimatePdfPageCount(data);

    expect(estimate.pages).toBeGreaterThanOrEqual(LARGE_PDF_PAGE_THRESHOLD);
    expect(estimate.isLarge).toBe(true);
  });

  it.each([
    [0, 0],
    [10, 40],
    [50, 20],
  ])(
    "stays within 20 percent of the generated page count for %i policies with %i settings",
    async (policies, settings) => {
      const data = createExportData();
      data.settingsCatalog = catalogPolicies(policies, settings);
      data.deviceConfigurations = [];
      data.compliancePolicies = [];

      const actual = pageCount((await generateDetailedPDF(data)).buffer);
      const estimate = estimatePdfPageCount(data).pages;

      expect(Math.abs(estimate - actual)).toBeLessThanOrEqual(
        Math.max(1, actual * 0.2),
      );
    },
  );

  it("accounts for wrapped setting descriptions", async () => {
    // Real settings catalog policies carry long definition descriptions; the
    // row count alone underestimated a real tenant by more than half.
    const description =
      "Configures how the device handles this setting when a user signs in. ".repeat(
        5,
      );
    const data = createExportData();
    data.deviceConfigurations = [];
    data.compliancePolicies = [];
    data.settingsCatalog = catalogPolicies(20, 15).map((policy) => ({
      ...policy,
      settings: policy.settings.map((setting) => ({
        ...setting,
        settingDefinitions: [
          {
            id: setting.settingInstance.settingDefinitionId,
            displayName: `Example setting ${setting.id}`,
            description,
          },
        ],
      })),
    }));

    const actual = pageCount((await generateDetailedPDF(data)).buffer);
    const estimate = estimatePdfPageCount(data).pages;

    expect(Math.abs(estimate - actual)).toBeLessThanOrEqual(actual * 0.2);
  });
});

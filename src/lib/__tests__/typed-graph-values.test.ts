import { describe, expect, it } from "vitest";
import type { ConfigurationSectionData } from "../configuration-sections";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCapabilities, assessCompliance } from "../compliance";
import type { ComplianceCapability } from "../compliance/types";
import { generateFixPack } from "../compliance/fix-pack";
import { inspectAppLocker } from "../compliance/applocker";
import {
  documentedValue,
  unidentifiedSources,
  unlistedSources,
} from "../compliance/graph-rows";
import { comparableItem, diffSnapshots } from "../snapshots/diff";
import {
  projectSnapshot,
  restoreCollection,
  type SnapshotProjection,
} from "../snapshots/projection";
import { projectionSettings } from "../snapshots/reference";
import { SETTINGS_UNAVAILABLE } from "../configuration-parser";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { extractZipEntry } from "./helpers/zip";

// Round 30: a value is read only with the documented type of the Graph
// record that holds it, and a setting list Graph did not return as a list is
// unknown, while a list it returned empty holds no setting. The shapes are
// the ones Graph beta returned in the lab tenant on 23 October 2026, with
// synthetic names.

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

const complete = { settings: "complete", assignments: "complete" };

const INACTIVITY =
  "device_vendor_msft_policy_config_localpoliciessecurityoptions_interactivelogon_machineinactivitylimit_v2";
const ENCRYPTION_URI = "./Device/Vendor/MSFT/BitLocker/RequireDeviceEncryption";

const integer = (value: unknown) => ({
  "@odata.type":
    "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
  value,
});

const simple = (definitionId: string, simpleSettingValue: unknown) => ({
  id: "0",
  settingInstance: {
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
    settingDefinitionId: definitionId,
    simpleSettingValue,
  },
});

function catalogPolicy(fields: Record<string, unknown>) {
  return {
    id: "catalog-1",
    name: "Synthetic catalog policy",
    platforms: "windows10",
    technologies: "mdm",
    assignments: assigned,
    collectionStatus: complete,
    ...fields,
  };
}

function section(key: string, items: unknown[]): ConfigurationSectionData {
  return {
    key,
    familyKey: key,
    label: key,
    selectionPrefix: key,
    items,
  } as ConfigurationSectionData;
}

const FAMILIES = [
  "settingsCatalog",
  "deviceConfigurations",
  "administrativeTemplates",
  "compliancePolicies",
  "securityBaselines",
  "windowsUpdatePolicies",
] as const;

function data(
  parts: Partial<Record<(typeof FAMILIES)[number], unknown[]>> = {},
): DetailedExportData {
  const items = (key: (typeof FAMILIES)[number]) => parts[key] ?? [];
  return {
    collectedAt: "2026-10-23T09:00:00Z",
    settingsCatalog: items("settingsCatalog"),
    deviceConfigurations: items("deviceConfigurations"),
    administrativeTemplates: items("administrativeTemplates"),
    compliancePolicies: items("compliancePolicies"),
    securityBaselines: items("securityBaselines"),
    windowsUpdatePolicies: items("windowsUpdatePolicies"),
    scripts: { windows: [], macOS: [] },
    conditionalAccessPolicies: [],
    sections: FAMILIES.map((key) => section(key, items(key))),
    fetchErrors: [],
  } as unknown as DetailedExportData;
}

function capability(exportData: DetailedExportData, id: string) {
  return assessCompliance(exportData).capabilities.find(
    (result) => result.capability.id === id,
  )!;
}

const policyChecks = (exportData: DetailedExportData, id: string) =>
  capability(exportData, id).checks.filter((check) => check.policyId);

/** Both Settings Catalog signals of the Windows inactivity lock are unknown. */
function expectEveryCatalogSignalUnknown(exportData: DetailedExportData) {
  const checks = policyChecks(exportData, "windows-inactivity-lock");
  expect(checks.map((check) => check.settingId).sort()).toEqual(
    [
      INACTIVITY,
      "device_vendor_msft_policy_config_devicelock_maxinactivitytimedevicelock",
    ].sort(),
  );
  expect(
    checks.every((check) => check.assessmentStatus === "unableToCheck"),
  ).toBe(true);
  expect(
    capability(exportData, "windows-inactivity-lock").checks,
  ).not.toContainEqual(expect.objectContaining({ result: "missing" }));
}

/** A capability of one legacy signal, enforced by `value`. */
function legacyRule(
  source: "administrativeTemplate" | "securityBaseline" | "omaUri",
  value: string | number | boolean,
  presentationId?: string,
): ComplianceCapability {
  return {
    id: "fixture",
    name: "Fixture",
    description: "Synthetic legacy signal",
    platform: "windows",
    signals: [
      {
        source,
        settingId: "synthetic-definition",
        ...(presentationId ? { presentationId } : {}),
        enforcedWhen: { kind: "equals", value },
      },
    ],
  };
}

const assessOne = (
  exportData: DetailedExportData,
  rule: ComplianceCapability,
) => assessCapabilities(exportData, [rule])[0]!;

describe("typed Graph values", () => {
  it("reads only values of the documented type of their record", () => {
    const type =
      "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue";
    expect(documentedValue(type, 900)).toBe(true);
    expect(documentedValue(type, -2147483648)).toBe(true);
    expect(documentedValue(type, 1.5)).toBe(false);
    expect(documentedValue(type, 3000000000)).toBe(false);
    expect(documentedValue(type, "900")).toBe(false);
    expect(documentedValue(undefined, 900)).toBe(false);
    expect(documentedValue("constructor", 900)).toBe(false);
    expect(
      documentedValue(
        "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
        "token",
      ),
    ).toBe(false);
    expect(documentedValue("#microsoft.graph.omaSettingBoolean", true)).toBe(
      true,
    );
    expect(documentedValue("#microsoft.graph.omaSettingBoolean", 1)).toBe(
      false,
    );
  });

  describe("Settings Catalog", () => {
    const inactivity = (value: unknown) =>
      data({
        settingsCatalog: [
          catalogPolicy({ settings: [simple(INACTIVITY, integer(value))] }),
        ],
      });

    it("keeps a valid integer readable", () => {
      expect(
        capability(inactivity(900), "windows-inactivity-lock").status,
      ).toBe("enforced");
      expect(capability(inactivity(0), "windows-inactivity-lock").status).toBe(
        "disabledByPolicy",
      );
    });

    it.each([
      ["a fraction", 1.5],
      ["an integer above Int32", 3000000000],
      ["an integer below Int32", -3000000000],
      ["a string", "900"],
      ["a boolean", true],
    ])(
      "reads %s declared as an integer as unable to check",
      (_label, value) => {
        const exportData = inactivity(value);
        expect(
          capability(exportData, "windows-inactivity-lock").status,
        ).not.toBe("enforced");
        expect(policyChecks(exportData, "windows-inactivity-lock")).toEqual([
          expect.objectContaining({
            assessmentStatus: "unableToCheck",
            result: null,
            settingId: INACTIVITY,
          }),
        ]);
      },
    );

    it("reads a value without its record type, or a secret, as unable to check", () => {
      for (const value of [
        { value: 900 },
        {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
          value: "900",
        },
      ]) {
        const exportData = data({
          settingsCatalog: [
            catalogPolicy({ settings: [simple(INACTIVITY, value)] }),
          ],
        });
        expect(
          capability(exportData, "windows-inactivity-lock").status,
        ).not.toBe("enforced");
        expect(policyChecks(exportData, "windows-inactivity-lock")).toEqual([
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        ]);
      }
    });

    it("reads a collection with one malformed entry as unable to check", () => {
      for (const collection of [
        [integer(900), integer(1.5)],
        { value: 900 },
        "900",
      ]) {
        const exportData = data({
          settingsCatalog: [
            catalogPolicy({
              settings: [
                {
                  id: "0",
                  settingInstance: {
                    "@odata.type":
                      "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
                    settingDefinitionId: INACTIVITY,
                    simpleSettingCollectionValue: collection,
                  },
                },
              ],
            }),
          ],
        });
        expect(
          capability(exportData, "windows-inactivity-lock").status,
        ).not.toBe("enforced");
        expect(policyChecks(exportData, "windows-inactivity-lock")).toEqual([
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        ]);
      }
    });

    it("reads an empty or non-string choice value as unable to check", () => {
      for (const value of ["", 1, null]) {
        const exportData = data({
          settingsCatalog: [
            catalogPolicy({
              settings: [
                {
                  id: "0",
                  settingInstance: {
                    "@odata.type":
                      "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                    settingDefinitionId: INACTIVITY,
                    choiceSettingCollectionValue: [{ value, children: [] }],
                  },
                },
              ],
            }),
          ],
        });
        expect(policyChecks(exportData, "windows-inactivity-lock")).toEqual([
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        ]);
      }
    });

    it("reads child lists that are no list as holding any setting", () => {
      const choice = (fields: Record<string, unknown>) =>
        catalogPolicy({
          settings: [
            {
              id: "0",
              settingInstance: {
                "@odata.type":
                  "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                settingDefinitionId: "synthetic_parent",
                ...fields,
              },
            },
          ],
        });
      for (const fields of [
        { choiceSettingValue: { value: "synthetic_parent_1", children: {} } },
        { choiceSettingCollectionValue: {} },
        { groupSettingValue: {} },
        { groupSettingValue: { children: "synthetic" } },
        { groupSettingCollectionValue: [{ children: {} }] },
      ]) {
        const exportData = data({ settingsCatalog: [choice(fields)] });
        expect(
          unidentifiedSources(
            { ...exportData.settingsCatalog[0] },
            "settingsCatalog",
          ),
        ).toEqual(new Set(["settingsCatalog"]));
        // Every Settings Catalog check of the policy is unknown, not missing.
        expectEveryCatalogSignalUnknown(exportData);
      }
      expect(
        unidentifiedSources(
          choice({
            choiceSettingValue: { value: "synthetic_parent_1", children: [] },
          }),
          "settingsCatalog",
        ).size,
      ).toBe(0);
    });
  });

  describe("custom OMA-URI rows", () => {
    const profile = (row: Record<string, unknown>) =>
      data({
        deviceConfigurations: [
          {
            "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
            id: "custom-1",
            displayName: "Synthetic custom profile",
            omaSettings: [{ omaUri: ENCRYPTION_URI, ...row }],
            assignments: assigned,
            collectionStatus: { assignments: "complete" },
          },
        ],
      });

    it("keeps a valid integer row readable", () => {
      expect(
        capability(
          profile({
            "@odata.type": "#microsoft.graph.omaSettingInteger",
            value: 1,
          }),
          "windows-disk-encryption",
        ).status,
      ).toBe("enforced");
    });

    it.each([
      ["a boolean row holding a number", "omaSettingBoolean", 1],
      ["an integer row holding a fraction", "omaSettingInteger", 1.5],
      ["an integer row out of range", "omaSettingInteger", 3000000000],
      ["a row without its type", undefined, 1],
    ])("reads %s as unable to check", (_label, type, value) => {
      const exportData = profile({
        ...(type ? { "@odata.type": `#microsoft.graph.${type}` } : {}),
        value,
      });
      expect(capability(exportData, "windows-disk-encryption").status).not.toBe(
        "enforced",
      );
      expect(policyChecks(exportData, "windows-disk-encryption")).toEqual([
        expect.objectContaining({ assessmentStatus: "unableToCheck" }),
      ]);
    });

    it("reads an AppLocker row whose value is not of its type as unreadable", () => {
      const types = { EXE: "Exe", DLL: "Dll", MSI: "Msi", Script: "Script" };
      const rows = (type: string) =>
        Object.entries(types).map(([path, kind]) => ({
          "@odata.type": `#microsoft.graph.${type}`,
          omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/group/${path}/Policy`,
          value: `<RuleCollection Type="${kind}" EnforcementMode="Enabled"><FilePathRule Id="rule" Name="Synthetic" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%PROGRAMFILES%\\*"/></Conditions></FilePathRule></RuleCollection>`,
        }));
      expect(
        inspectAppLocker({ omaSettings: rows("omaSettingString") }),
      ).toMatchObject({ complete: true, matches: true });
      expect(
        inspectAppLocker({ omaSettings: rows("omaSettingInteger") }),
      ).toMatchObject({ complete: false, matches: false });
    });
  });

  describe("intent settings", () => {
    const baseline = (settings: unknown, extra: Record<string, unknown> = {}) =>
      data({
        securityBaselines: [
          {
            id: "intent-1",
            displayName: "Synthetic intent",
            settings,
            categories: [],
            assignments: assigned,
            collectionStatus: {
              categories: "complete",
              settings: "complete",
              assignments: "complete",
            },
            ...extra,
          },
        ],
      });
    const row = (type: string, value: unknown) => ({
      "@odata.type": `#microsoft.graph.${type}`,
      id: "row-1",
      definitionId: "synthetic-definition",
      valueJson: JSON.stringify(value),
      value,
    });

    it("keeps a valid boolean instance readable", () => {
      expect(
        assessOne(
          baseline([row("deviceManagementBooleanSettingInstance", true)]),
          legacyRule("securityBaseline", true),
        ).status,
      ).toBe("enforced");
    });

    it("reads a value of another type than its instance as unable to check", () => {
      for (const setting of [
        row("deviceManagementIntegerSettingInstance", true),
        row("deviceManagementBooleanSettingInstance", "true"),
        row("deviceManagementComplexSettingInstance", true),
        {
          ...row("deviceManagementBooleanSettingInstance", true),
          "@odata.type": undefined,
        },
      ]) {
        const result = assessOne(
          baseline([setting]),
          legacyRule("securityBaseline", true),
        );
        expect(result.status).not.toBe("enforced");
        expect(result.checks).toEqual([
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        ]);
      }
    });

    it("reads settings that are no list as unknown and an empty list as checked", () => {
      for (const [settings, extra] of [
        [undefined, {}],
        [null, {}],
        [{}, {}],
        [[], { categories: {} }],
        [[], { categories: [{ id: "category", settings: {} }] }],
      ] as const) {
        const result = assessOne(
          baseline(settings, extra),
          legacyRule("securityBaseline", true),
        );
        expect(result.checks.map((check) => check.assessmentStatus)).toContain(
          "unableToCheck",
        );
        expect(result.checks.some((check) => check.result === "missing")).toBe(
          false,
        );
      }
      expect(
        assessOne(baseline([]), legacyRule("securityBaseline", true)).checks,
      ).toEqual([
        expect.objectContaining({
          assessmentStatus: "checked",
          result: "missing",
        }),
      ]);
    });
  });

  describe("administrative templates", () => {
    const template = (definitionValues: unknown) =>
      data({
        administrativeTemplates: [
          {
            id: "template-1",
            displayName: "Synthetic template",
            definitionValues,
            assignments: assigned,
            collectionStatus: complete,
          },
        ],
      });
    const presentation = (fields: Record<string, unknown>) => ({
      definition: { id: "synthetic-definition" },
      enabled: true,
      presentationValues: [
        { presentation: { id: "synthetic-presentation" }, ...fields },
      ],
    });

    it("keeps documented values readable", () => {
      expect(
        assessOne(
          template([
            { definition: { id: "synthetic-definition" }, enabled: true },
          ]),
          legacyRule("administrativeTemplate", true),
        ).status,
      ).toBe("enforced");
      expect(
        assessOne(
          template([
            presentation({
              "@odata.type":
                "#microsoft.graph.groupPolicyPresentationValueText",
              value: "4",
            }),
          ]),
          legacyRule("administrativeTemplate", "4", "synthetic-presentation"),
        ).status,
      ).toBe("enforced");
    });

    it("reads a row without a boolean enabled state as unable to check, not missing", () => {
      const result = assessOne(
        template([
          { definition: { id: "synthetic-definition" }, enabled: "true" },
        ]),
        legacyRule("administrativeTemplate", true),
      );
      expect(result.checks).toEqual([
        expect.objectContaining({ assessmentStatus: "unableToCheck" }),
      ]);
    });

    it("reads presentation values of another type, or no list, as unable to check", () => {
      for (const row of [
        presentation({
          "@odata.type": "#microsoft.graph.groupPolicyPresentationValueDecimal",
          value: "4",
        }),
        presentation({ value: "4" }),
        {
          definition: { id: "synthetic-definition" },
          enabled: true,
          presentationValues: {},
        },
      ]) {
        const result = assessOne(
          template([row]),
          legacyRule("administrativeTemplate", "4", "synthetic-presentation"),
        );
        expect(result.status).not.toBe("enforced");
        expect(result.checks).toEqual([
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        ]);
      }
    });

    it("reads definition values that are no list as unknown and an empty list as checked", () => {
      for (const definitionValues of [undefined, null, {}]) {
        expect(
          assessOne(
            template(definitionValues),
            legacyRule("administrativeTemplate", true),
          ).checks,
        ).toContainEqual(
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        );
      }
      expect(
        assessOne(template([]), legacyRule("administrativeTemplate", true))
          .checks,
      ).toEqual([
        expect.objectContaining({
          assessmentStatus: "checked",
          result: "missing",
        }),
      ]);
    });
  });

  it("reads update ring days outside Int32 as unable to check", () => {
    const ring = (deadline: number) =>
      data({
        windowsUpdatePolicies: [
          {
            "@odata.type":
              "#microsoft.graph.windowsUpdateForBusinessConfiguration",
            id: "ring-1",
            displayName: "Synthetic ring",
            automaticUpdateMode: "autoInstallAndRebootAtScheduledTime",
            qualityUpdatesDeferralPeriodInDays: 0,
            deadlineForQualityUpdatesInDays: deadline,
            deadlineGracePeriodInDays: 0,
            qualityUpdatesPaused: false,
            assignments: assigned,
            collectionStatus: { assignments: "complete" },
          },
        ],
      });
    const checks = (deadline: number) =>
      assessCompliance(ring(deadline))
        .capabilities.flatMap((result) => result.checks)
        .filter((check) => check.policyId === "ring-1");
    expect(checks(30)).toContainEqual(
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    );
    expect(checks(3000000000)).toContainEqual(
      expect.objectContaining({ assessmentStatus: "unableToCheck" }),
    );
    expect(checks(3000000000)).not.toContainEqual(
      expect.objectContaining({ result: "different" }),
    );
  });
});

describe("setting lists Graph did not return", () => {
  const unreadable = [undefined, null, {}, "settings"];

  it.each(unreadable)(
    "reads Settings Catalog settings %j as unknown, with no fix pack drafts",
    (settings) => {
      const exportData = data({
        settingsCatalog: [catalogPolicy({ settings })],
      });
      expect(
        unlistedSources(
          { ...exportData.settingsCatalog[0] },
          "settingsCatalog",
        ),
      ).toEqual(new Set(["settingsCatalog"]));
      expectEveryCatalogSignalUnknown(exportData);
      const assessment = assessCompliance(exportData);
      const pack = generateFixPack(assessment, {
        collection: exportData,
        frameworkId: "nist-800-53-r5",
      });
      expect(pack.policies).toEqual([]);
    },
  );

  it("keeps an empty Settings Catalog list readable: missing settings get drafts", () => {
    const exportData = data({
      settingsCatalog: [catalogPolicy({ settings: [] })],
    });
    expect(
      unidentifiedSources(
        { ...exportData.settingsCatalog[0] },
        "settingsCatalog",
      ).size,
    ).toBe(0);
    expect(
      capability(exportData, "windows-inactivity-lock").checks,
    ).toContainEqual(
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "missing",
      }),
    );
    const pack = generateFixPack(assessCompliance(exportData), {
      collection: exportData,
      frameworkId: "nist-800-53-r5",
    });
    expect(pack.policies.length).toBeGreaterThan(0);
  });

  describe("through the snapshot projection and history", () => {
    const project = (exportData: DetailedExportData): SnapshotProjection =>
      JSON.parse(
        JSON.stringify(
          projectSnapshot(exportData, assessCompliance(exportData), new Map()),
        ),
      );
    const stored = (settings: unknown) =>
      project(data({ settingsCatalog: [catalogPolicy({ settings })] }));
    const catalogSection = (projection: SnapshotProjection) =>
      projection.sections.find((row) => row.key === "settingsCatalog")!;

    it("keeps an empty settings list as one", () => {
      const item = catalogSection(stored([])).items[0]!;
      expect(item.data.settings).toEqual([]);
      expect(comparableItem(catalogSection(stored([])), item)).toBe(true);
      const restored = restoreCollection(stored([]));
      expect(
        capability(restored as DetailedExportData, "windows-inactivity-lock")
          .checks,
      ).toContainEqual(
        expect.objectContaining({
          assessmentStatus: "checked",
          result: "missing",
        }),
      );
    });

    it.each(unreadable)(
      "keeps settings %j unknown after restore",
      (settings) => {
        const projection = stored(settings);
        const item = catalogSection(projection).items[0]!;
        expect(comparableItem(catalogSection(projection), item)).toBe(false);
        const restored = restoreCollection(projection) as DetailedExportData;
        expect(
          capability(restored, "windows-inactivity-lock").checks.filter(
            (check) => check.result === "missing",
          ),
        ).toEqual([]);
        // History does not compare it with a readable snapshot.
        const diff = diffSnapshots(stored([]), projection);
        expect(diff.policies).toEqual([]);
        expect(diff.notComparedItems).toEqual([
          expect.objectContaining({ id: "catalog-1" }),
        ]);
      },
    );

    it("keeps malformed child lists and collection entries unknown after restore", () => {
      const instance = (fields: Record<string, unknown>) => [
        {
          id: "0",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
            settingDefinitionId: INACTIVITY,
            ...fields,
          },
        },
      ];
      for (const fields of [
        { choiceSettingValue: { value: "synthetic_1", children: {} } },
        { choiceSettingValue: "synthetic_1" },
        { choiceSettingCollectionValue: {} },
        { choiceSettingCollectionValue: ["synthetic_1"] },
        { groupSettingValue: {} },
        { groupSettingValue: { children: "synthetic" } },
        { groupSettingCollectionValue: {} },
        { groupSettingCollectionValue: ["synthetic"] },
      ]) {
        const projection = stored(instance(fields));
        const item = catalogSection(projection).items[0]!;
        expect(
          unidentifiedSources(item.data, "settingsCatalog"),
          JSON.stringify(fields),
        ).toEqual(new Set(["settingsCatalog"]));
      }
      for (const collection of [{ value: 900 }, [integer(900), "900"]]) {
        const projection = stored([
          {
            id: "0",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
              settingDefinitionId: INACTIVITY,
              simpleSettingCollectionValue: collection,
            },
          },
        ]);
        const restored = restoreCollection(projection) as DetailedExportData;
        expect(
          capability(restored, "windows-inactivity-lock").checks.filter(
            (check) => check.policyId,
          ),
        ).toEqual([
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        ]);
      }
    });

    it("keeps malformed intent categories and presentation values unknown", () => {
      const intents = project(
        data({
          securityBaselines: [
            {
              id: "intent-1",
              displayName: "Synthetic intent",
              settings: [],
              categories: {},
              assignments: assigned,
              collectionStatus: {
                settings: "complete",
                assignments: "complete",
              },
            },
          ],
        }),
      );
      const intent = intents.sections.find(
        (row) => row.key === "securityBaselines",
      )!;
      expect(
        unidentifiedSources(intent.items[0]!.data, "securityBaselines"),
      ).toEqual(new Set(["securityBaseline"]));
      const templates = project(
        data({
          administrativeTemplates: [
            {
              id: "template-1",
              displayName: "Synthetic template",
              definitionValues: [
                {
                  definition: { id: "synthetic-definition" },
                  enabled: true,
                  presentationValues: {},
                },
              ],
              assignments: assigned,
              collectionStatus: complete,
            },
          ],
        }),
      );
      const item = templates.sections.find(
        (row) => row.key === "administrativeTemplates",
      )!.items[0]!;
      expect(item.incomplete).toBe(true);
      expect(item.data.definitionValues).toEqual([
        expect.objectContaining({ presentationFetchError: true }),
      ]);
    });
  });
});

describe("round 30 review sweep", () => {
  const project = (exportData: DetailedExportData): SnapshotProjection =>
    JSON.parse(
      JSON.stringify(
        projectSnapshot(exportData, assessCompliance(exportData), new Map()),
      ),
    );
  const sectionOf = (projection: SnapshotProjection, key: string) =>
    projection.sections.find((row) => row.key === key)!;

  it("reads every documented value type and rejects other shapes", () => {
    const rows: Array<[string, unknown, boolean]> = [
      ["deviceManagementConfigurationStringSettingValue", "text", true],
      ["deviceManagementConfigurationStringSettingValue", 1, false],
      ["deviceManagementConfigurationReferenceSettingValue", "id", true],
      ["omaSettingString", "text", true],
      ["omaSettingFloatingPoint", 1.5, true],
      ["omaSettingFloatingPoint", Number.POSITIVE_INFINITY, false],
      ["omaSettingDateTime", "2026-10-23T09:00:00Z", true],
      ["omaSettingBase64", "U3ludGhldGlj", true],
      ["omaSettingStringXml", "PFN5bnRoZXRpYy8+", true],
      ["omaSettingStringXml", {}, false],
      ["deviceManagementStringSettingInstance", "text", true],
      ["groupPolicyPresentationValueDecimal", 4, true],
      ["groupPolicyPresentationValueDecimal", -4, false],
      ["groupPolicyPresentationValueDecimal", "4", false],
      ["groupPolicyPresentationValueLongDecimal", 2 ** 40, true],
      ["groupPolicyPresentationValueLongDecimal", 2 ** 60, false],
      ["groupPolicyPresentationValueBoolean", false, true],
      ["groupPolicyPresentationValueBoolean", "false", false],
      ["groupPolicyPresentationValueText", "4", true],
      ["groupPolicyPresentationValueList", "4", false],
    ];
    for (const [type, value, readable] of rows)
      expect(
        documentedValue(`#microsoft.graph.${type}`, value),
        `${type} ${JSON.stringify(value)}`,
      ).toBe(readable);
  });

  it("keeps custom OMA-URI rows Graph did not return unknown after restore", () => {
    const profile = (omaSettings: unknown) =>
      data({
        deviceConfigurations: [
          {
            "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
            id: "custom-1",
            displayName: "Synthetic custom profile",
            ...(omaSettings === undefined ? {} : { omaSettings }),
            assignments: assigned,
            collectionStatus: { assignments: "complete" },
          },
        ],
      });
    for (const omaSettings of [undefined, {}]) {
      const projection = project(profile(omaSettings));
      const section = sectionOf(projection, "deviceConfigurations");
      expect(comparableItem(section, section.items[0]!)).toBe(false);
      const restored = restoreCollection(projection) as DetailedExportData;
      for (const id of [
        "windows-disk-encryption",
        "windows-applocker-rule-collections",
      ])
        expect(
          capability(restored, id).checks.filter((check) => check.policyId),
          id,
        ).toEqual([
          expect.objectContaining({ assessmentStatus: "unableToCheck" }),
        ]);
    }
    const empty = sectionOf(project(profile([])), "deviceConfigurations");
    expect(comparableItem(empty, empty.items[0]!)).toBe(true);
  });

  it("keeps definition values Graph did not return unknown after restore", () => {
    const template = (definitionValues: unknown) =>
      data({
        administrativeTemplates: [
          {
            id: "template-1",
            displayName: "Synthetic template",
            ...(definitionValues === undefined ? {} : { definitionValues }),
            assignments: assigned,
            collectionStatus: complete,
          },
        ],
      });
    for (const definitionValues of [undefined, {}]) {
      const projection = project(template(definitionValues));
      const section = sectionOf(projection, "administrativeTemplates");
      expect(comparableItem(section, section.items[0]!)).toBe(false);
      expect(
        assessOne(
          restoreCollection(projection) as DetailedExportData,
          legacyRule("administrativeTemplate", true),
        ).checks,
      ).toEqual([
        expect.objectContaining({ assessmentStatus: "unableToCheck" }),
      ]);
    }
  });

  it("does not compare a family holding a policy whose settings Graph did not return", () => {
    const projection = project(
      data({ settingsCatalog: [catalogPolicy({ settings: {} })] }),
    );
    expect(projectionSettings(projection).notCompared).toContainEqual(
      expect.objectContaining({ key: "settingsCatalog" }),
    );
    expect(
      projectionSettings(
        project(data({ settingsCatalog: [catalogPolicy({ settings: [] })] })),
      ).families,
    ).toContainEqual(expect.objectContaining({ key: "settingsCatalog" }));
  });

  it("reads intent categories that are no record as unknown, raw and restored", () => {
    const baseline = data({
      securityBaselines: [
        {
          id: "intent-1",
          displayName: "Synthetic intent",
          settings: [],
          categories: [null, "synthetic"],
          assignments: assigned,
          collectionStatus: { settings: "complete", assignments: "complete" },
        },
      ],
    });
    const rule = legacyRule("securityBaseline", true);
    expect(assessOne(baseline, rule).checks).toEqual([
      expect.objectContaining({ assessmentStatus: "unableToCheck" }),
    ]);
    const restored = restoreCollection(project(baseline)) as DetailedExportData;
    expect(assessOne(restored, rule).checks).toEqual([
      expect.objectContaining({ assessmentStatus: "unableToCheck" }),
    ]);
  });

  it("reads presentation values with an entry that is no record as unknown, raw and restored", () => {
    const template = data({
      administrativeTemplates: [
        {
          id: "template-1",
          displayName: "Synthetic template",
          definitionValues: [
            {
              definition: { id: "synthetic-definition" },
              enabled: true,
              presentationValues: [
                null,
                {
                  "@odata.type":
                    "#microsoft.graph.groupPolicyPresentationValueText",
                  presentation: { id: "synthetic-presentation" },
                  value: "4",
                },
              ],
            },
          ],
          assignments: assigned,
          collectionStatus: complete,
        },
      ],
    });
    const rule = legacyRule(
      "administrativeTemplate",
      "4",
      "synthetic-presentation",
    );
    expect(assessOne(template, rule).status).not.toBe("enforced");
    const projection = project(template);
    expect(
      sectionOf(projection, "administrativeTemplates").items[0]!.incomplete,
    ).toBe(true);
    expect(
      assessOne(restoreCollection(projection) as DetailedExportData, rule)
        .status,
    ).not.toBe("enforced");
  });

  it("keeps an intent value that is no primitive unreadable after restore", () => {
    const baseline = data({
      securityBaselines: [
        {
          id: "intent-1",
          displayName: "Synthetic intent",
          settings: [
            {
              "@odata.type":
                "#microsoft.graph.deviceManagementBooleanSettingInstance",
              id: "row-1",
              definitionId: "synthetic-definition",
              valueJson: "true",
              value: { value: true },
            },
          ],
          categories: [],
          assignments: assigned,
          collectionStatus: { settings: "complete", assignments: "complete" },
        },
      ],
    });
    const rule = legacyRule("securityBaseline", true);
    expect(assessOne(baseline, rule).status).not.toBe("enforced");
    expect(
      assessOne(
        restoreCollection(project(baseline)) as DetailedExportData,
        rule,
      ).status,
    ).not.toBe("enforced");
  });

  it("keeps an assignment filter type that is no primitive unreadable after restore", () => {
    const exportData = data({
      settingsCatalog: [
        catalogPolicy({
          settings: [simple(INACTIVITY, integer(900))],
          assignments: [
            {
              id: "assignment-1",
              target: {
                "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
                deviceAndAppManagementAssignmentFilterType: { mode: "include" },
              },
            },
          ],
        }),
      ],
    });
    expect(capability(exportData, "windows-inactivity-lock").status).toBe(
      "assignmentUnknown",
    );
    const projection = project(exportData);
    const section = sectionOf(projection, "settingsCatalog");
    expect(comparableItem(section, section.items[0]!)).toBe(false);
    expect(
      capability(
        restoreCollection(projection) as DetailedExportData,
        "windows-inactivity-lock",
      ).status,
    ).toBe("assignmentUnknown");
  });

  it.each(["PDF", "Word"])(
    "says settings Graph did not return are unavailable in the %s documentation",
    async (format) => {
      const render = async (settings: unknown) => {
        const exportData = {
          ...data({ settingsCatalog: [catalogPolicy({ settings })] }),
          includeComplianceEvidence: false,
        } as DetailedExportData;
        const result =
          format === "PDF"
            ? await generateDetailedPDF(exportData)
            : await generateDetailedDOCX(exportData);
        return format === "PDF"
          ? extractPdfStreamText(result.buffer)
          : extractZipEntry(result.buffer, "word/document.xml");
      };
      for (const settings of [{}, "settings"])
        expect(await render(settings)).toContain(SETTINGS_UNAVAILABLE);
      const empty = await render([]);
      expect(empty).not.toContain(SETTINGS_UNAVAILABLE);
      expect(empty).toContain("No settings configured");
    },
  );
});

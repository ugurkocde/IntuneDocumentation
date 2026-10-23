import { describe, expect, it } from "vitest";
import type { ConfigurationSectionData } from "../configuration-sections";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCompliance } from "../compliance";
import {
  unreadableCatalogValue,
  unreadableIntentValue,
  unreadableOmaValue,
  unreadablePresentationValue,
  unreadableSources,
  unreadableTemplateValue,
} from "../compliance/graph-rows";
import {
  extractSettingValue,
  parseAdministrativeTemplate,
  parseDeviceConfiguration,
  parseSecurityBaseline,
  UNREADABLE_VALUE,
} from "../configuration-parser";
import { flattenItemSettings } from "../settings-flatten";
import { diffSnapshots } from "../snapshots/diff";
import {
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import {
  compareSettings,
  projectionSettings,
  type SettingComparison,
} from "../snapshots/reference";

// Round 31: Compare and History read a setting value only as the engine
// does (compliance/graph-rows.ts). A value Graph omitted, or returned
// without its documented type, as a fraction or outside its range, is
// unknown: Compare reports it as not comparable and History lists the
// policy as not compared, never as missing, removed, different, changed or
// matching. The shapes are the ones Graph beta returned in the lab tenant on
// 23 October 2026, with synthetic names.

const OMIT = Symbol("omit");
const UNTYPED = Symbol("untyped");
type Value = number | typeof OMIT | typeof UNTYPED;

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];
const complete = { settings: "complete", assignments: "complete" };

// A typed record holding value: OMIT leaves the value out, UNTYPED the type.
function typed(type: string, value: Value, field = "value") {
  return {
    ...(value === UNTYPED ? {} : { "@odata.type": type }),
    ...(value === OMIT ? {} : { [field]: value === UNTYPED ? 900 : value }),
  };
}

const CATALOG_INTEGER =
  "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue";
const TIMEOUT = "device_vendor_msft_policy_config_synthetic_timeout";
const PARENT = "device_vendor_msft_synthetic_parent";

const instance = (type: string, fields: Record<string, unknown>) => ({
  "@odata.type": `#microsoft.graph.deviceManagementConfiguration${type}`,
  ...fields,
});

interface Source {
  name: string;
  section: string;
  // An item holding the setting with this value, or none when null.
  item: (value: Value | null) => Record<string, unknown>;
  // Out of range for the documented type of the value.
  outOfRange: number;
}

const catalogItem = (settings: unknown[]) => ({
  id: "catalog-1",
  name: "Synthetic catalog policy",
  platforms: "windows10",
  technologies: "mdm",
  assignments: assigned,
  collectionStatus: complete,
  settings,
});

const SOURCES: Source[] = [
  {
    name: "a Settings Catalog setting",
    section: "settingsCatalog",
    item: (value) =>
      catalogItem(
        value === null
          ? []
          : [
              {
                id: "0",
                settingInstance: instance("SimpleSettingInstance", {
                  settingDefinitionId: TIMEOUT,
                  simpleSettingValue: typed(CATALOG_INTEGER, value),
                }),
              },
            ],
      ),
    outOfRange: 3000000000,
  },
  {
    name: "a Settings Catalog child setting",
    section: "settingsCatalog",
    item: (value) =>
      catalogItem([
        {
          id: "0",
          settingInstance: instance("ChoiceSettingInstance", {
            settingDefinitionId: PARENT,
            choiceSettingValue: {
              value: `${PARENT}_1`,
              children:
                value === null
                  ? []
                  : [
                      instance("SimpleSettingInstance", {
                        settingDefinitionId: TIMEOUT,
                        simpleSettingValue: typed(CATALOG_INTEGER, value),
                      }),
                    ],
            },
          }),
        },
      ]),
    outOfRange: -2147483649,
  },
  {
    name: "a Settings Catalog value collection",
    section: "settingsCatalog",
    item: (value) =>
      catalogItem(
        value === null
          ? []
          : [
              {
                id: "0",
                settingInstance: instance("SimpleSettingCollectionInstance", {
                  settingDefinitionId: TIMEOUT,
                  simpleSettingCollectionValue: [typed(CATALOG_INTEGER, value)],
                }),
              },
            ],
      ),
    outOfRange: 3000000000,
  },
  {
    name: "a custom OMA-URI row",
    section: "deviceConfigurations",
    item: (value) => ({
      "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      id: "custom-1",
      displayName: "Synthetic custom profile",
      assignments: assigned,
      omaSettings:
        value === null
          ? []
          : [
              {
                displayName: "Synthetic timeout",
                omaUri: "./Device/Vendor/MSFT/Synthetic/Timeout",
                isEncrypted: false,
                ...typed("#microsoft.graph.omaSettingInteger", value),
              },
            ],
    }),
    outOfRange: 3000000000,
  },
  {
    name: "an intent setting",
    section: "securityBaselines",
    item: (value) => ({
      id: "intent-1",
      displayName: "Synthetic intent",
      assignments: assigned,
      collectionStatus: complete,
      settings:
        value === null
          ? []
          : [
              {
                id: "setting-1",
                definitionId: "deviceConfiguration--synthetic_timeout",
                ...(typeof value === "number"
                  ? { valueJson: JSON.stringify(value) }
                  : {}),
                ...typed(
                  "#microsoft.graph.deviceManagementIntegerSettingInstance",
                  value,
                ),
              },
            ],
    }),
    outOfRange: 3000000000,
  },
  {
    name: "an administrative template value",
    section: "administrativeTemplates",
    item: (value) => ({
      id: "template-1",
      displayName: "Synthetic template",
      assignments: assigned,
      collectionStatus: complete,
      definitionValues:
        value === null
          ? []
          : [
              {
                id: "value-1",
                enabled: true,
                definition: {
                  id: "synthetic-definition",
                  displayName: "Synthetic timeout",
                  categoryPath: "\\Synthetic",
                },
                presentationValues: [
                  {
                    ...typed(
                      "#microsoft.graph.groupPolicyPresentationValueDecimal",
                      value,
                    ),
                    presentation: {
                      id: "synthetic-presentation",
                      label: "Timeout",
                    },
                  },
                ],
              },
            ],
    }),
    // Decimal presentation values are unsigned Int64.
    outOfRange: -1,
  },
];

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
];

function project(key: string, item: unknown): SnapshotProjection {
  const items = (family: string) => (family === key ? [item] : []);
  const exportData = {
    collectedAt: "2026-10-23T09:00:00Z",
    ...Object.fromEntries(FAMILIES.map((family) => [family, items(family)])),
    scripts: { windows: [], macOS: [] },
    conditionalAccessPolicies: [],
    sections: FAMILIES.map((family) => section(family, items(family))),
    fetchErrors: [],
  } as unknown as DetailedExportData;
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(
        exportData,
        assessCompliance(exportData),
        new Map(),
        (digest) => `synthetic:${digest}`,
      ),
    ),
  );
}

// The statuses Compare reports for the setting, without its parent.
function compared(
  source: Source,
  reference: Value | null,
  current: Value | null,
): SettingComparison[] {
  const result = compareSettings(
    projectionSettings(project(source.section, source.item(reference))),
    projectionSettings(project(source.section, source.item(current))),
  );
  expect(result.notCompared.map((family) => family.family)).not.toContain(
    source.section,
  );
  return result.groups
    .filter((group) => group.family === source.section)
    .flatMap((group) => group.rows)
    .filter((row) => row.setting !== PARENT)
    .map((row) => row.status);
}

function history(source: Source, from: Value | null, to: Value | null) {
  return diffSnapshots(
    project(source.section, source.item(from)),
    project(source.section, source.item(to)),
  );
}

describe.each(SOURCES)("$name", (source) => {
  const unreadable: Array<[string, Value]> = [
    ["an omitted value", OMIT],
    ["a value without its type", UNTYPED],
    ["a fractional integer", 1.5],
    ["an integer out of range", source.outOfRange],
  ];

  describe.each(unreadable)("with %s", (_, value) => {
    it("is not comparable in Compare", () => {
      // Never missing or different against a readable value.
      expect(compared(source, 900, value)).toEqual(["notComparable"]);
      expect(compared(source, value, 900)).toEqual(["notComparable"]);
      // Never matching against the same unreadable value.
      expect(compared(source, value, value)).toEqual(["notComparable"]);
      // Never missing or extra against a side without the setting.
      expect(compared(source, value, null)).toEqual(["notComparable"]);
      expect(compared(source, null, value)).toEqual(["notComparable"]);
    });

    it("is not compared in History", () => {
      for (const [from, to] of [
        [900, value],
        [value, 900],
        [value, value],
      ] as const) {
        const diff = history(source, from, to);
        expect(diff.policies).toEqual([]);
        expect(diff.totals.settingChanges).toBe(0);
        expect(diff.notComparedItems).toHaveLength(1);
      }
    });
  });

  it("keeps valid typed values definite", () => {
    expect(compared(source, 900, 900)).toEqual(["matching"]);
    expect(compared(source, 900, 600)).toEqual(["different"]);
    expect(compared(source, null, 900)).toEqual(["extra"]);
    expect(compared(source, 900, null)).toEqual(["missing"]);
    expect(compared(source, null, null)).toEqual([]);

    const same = history(source, 900, 900);
    expect(same.policies).toEqual([]);
    expect(same.notComparedItems).toEqual([]);
    const changes = (from: Value | null, to: Value | null) => {
      const diff = history(source, from, to);
      expect(diff.notComparedItems).toEqual([]);
      return diff.policies.flatMap((policy) =>
        policy.settings.map((row) => row.change),
      );
    };
    expect(changes(900, 600)).toEqual(["changed"]);
    expect(changes(null, 900)).toEqual(["added"]);
    expect(changes(900, null)).toEqual(["removed"]);
    expect(changes(null, null)).toEqual([]);
  });
});

describe("Settings Catalog lists", () => {
  const collection = (values: unknown) =>
    catalogItem([
      {
        id: "0",
        settingInstance: instance("SimpleSettingCollectionInstance", {
          settingDefinitionId: TIMEOUT,
          simpleSettingCollectionValue: values,
        }),
      },
    ]);
  const projected = (values: unknown) =>
    project("settingsCatalog", collection(values));

  it("keeps a valid empty value collection comparable", () => {
    const empty = projected([]);
    const item = empty.sections.find((row) => row.key === "settingsCatalog")!
      .items[0]!;
    expect(unreadableSources(item.data, "settingsCatalog").size).toBe(0);
    const diff = diffSnapshots(projected([typed(CATALOG_INTEGER, 900)]), empty);
    expect(diff.notComparedItems).toEqual([]);
    expect(
      diff.policies.flatMap((policy) =>
        policy.settings.map((row) => row.change),
      ),
    ).toEqual(["removed"]);
  });

  it("reads a collection entry that is no record as unreadable", () => {
    const diff = diffSnapshots(
      projected([typed(CATALOG_INTEGER, 900)]),
      projected([typed(CATALOG_INTEGER, 900), "900"]),
    );
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems).toHaveLength(1);
  });

  it("reads a choice without an option id as unreadable", () => {
    const choice = (value: unknown) =>
      project(
        "settingsCatalog",
        catalogItem([
          {
            id: "0",
            settingInstance: instance("ChoiceSettingInstance", {
              settingDefinitionId: TIMEOUT,
              choiceSettingValue: { value, children: [] },
            }),
          },
        ]),
      );
    const settings = (projection: SnapshotProjection) =>
      projectionSettings(projection);
    for (const value of [undefined, "", 1]) {
      const result = compareSettings(
        settings(choice(`${TIMEOUT}_1`)),
        settings(choice(value)),
      );
      expect(result.totals).toMatchObject({
        notComparable: 1,
        different: 0,
        missing: 0,
      });
    }
  });
});

describe("values that are not stored stay as before", () => {
  it("does not read secret, redacted or not configured values as unreadable", () => {
    const secret = catalogItem([
      {
        id: "0",
        settingInstance: instance("SimpleSettingInstance", {
          settingDefinitionId: "com.apple.synthetic_password",
          simpleSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
            valueState: "encryptedValueToken",
          },
        }),
      },
      {
        id: "1",
        settingInstance: instance("SimpleSettingInstance", {
          settingDefinitionId: TIMEOUT,
          simpleSettingValue: typed(CATALOG_INTEGER, 900),
        }),
      },
    ]);
    expect(unreadableSources(secret, "settingsCatalog").size).toBe(0);
    expect(
      unreadableSources(
        {
          settings: [
            {
              "@odata.type":
                "#microsoft.graph.deviceManagementIntegerSettingInstance",
              definitionId: "deviceConfiguration--synthetic_unset",
              valueJson: "null",
              value: null,
            },
            {
              "@odata.type":
                "#microsoft.graph.deviceManagementCollectionSettingInstance",
              definitionId: "deviceConfiguration--synthetic_list",
              valueJson: '["synthetic"]',
            },
            {
              "@odata.type":
                "#microsoft.graph.deviceManagementStringSettingInstance",
              definitionId: "deviceConfiguration--synthetic_password",
              value: "[Redacted]",
            },
          ],
        },
        "securityBaselines",
      ).size,
    ).toBe(0);
  });

  it("keeps custom OMA-URI strings the projection drops out of the comparison", () => {
    const profile = (value: string) => ({
      "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      id: "custom-1",
      displayName: "Synthetic custom profile",
      assignments: assigned,
      omaSettings: [
        {
          "@odata.type": "#microsoft.graph.omaSettingString",
          displayName: "Synthetic text",
          omaUri: "./Device/Vendor/MSFT/Synthetic/Text",
          isEncrypted: false,
          value,
        },
      ],
    });
    const projection = project("deviceConfigurations", profile("synthetic"));
    const item = projection.sections.find(
      (row) => row.key === "deviceConfigurations",
    )!.items[0]!;
    expect(item.data.omaSettings).toEqual([
      expect.not.objectContaining({ value: expect.anything() }),
    ]);
    expect(unreadableSources(item.data, "deviceConfigurations").size).toBe(0);
    const diff = diffSnapshots(
      projection,
      project("deviceConfigurations", profile("synthetic")),
    );
    expect(diff.notComparedItems).toEqual([]);
    expect(diff.policies).toEqual([]);
  });

  it("keeps an omitted or malformed custom OMA-URI value as null", () => {
    for (const value of [OMIT, UNTYPED, 1.5] as const) {
      const item = project(
        "deviceConfigurations",
        SOURCES[3]!.item(value),
      ).sections.find((row) => row.key === "deviceConfigurations")!.items[0]!;
      expect(item.data.omaSettings).toEqual([
        expect.objectContaining({ value: null }),
      ]);
    }
  });
});

describe("documentation and search show unreadable values as unreadable", () => {
  it("never shows them as not configured or as the malformed value", () => {
    for (const value of [OMIT, UNTYPED, 1.5, 3000000000] as const) {
      const catalog = SOURCES[0]!.item(value);
      const [setting] = catalog.settings as any[];
      expect(extractSettingValue(setting).value).toBe(UNREADABLE_VALUE);
      expect(flattenItemSettings("settingsCatalog", catalog)).toEqual([
        expect.objectContaining({
          value: UNREADABLE_VALUE,
          unreadable: true,
        }),
      ]);

      const intent = SOURCES[4]!.item(value);
      expect(
        parseSecurityBaseline([], intent.settings as any[])[0]!.settings,
      ).toEqual([expect.objectContaining({ value: UNREADABLE_VALUE })]);

      const custom = SOURCES[3]!.item(value);
      expect(
        parseDeviceConfiguration(custom).flatMap((category) =>
          category.settings.map((row) => row.value),
        ),
      ).toEqual([`Synthetic timeout: ${UNREADABLE_VALUE}`]);
    }
    for (const value of [OMIT, UNTYPED, 1.5, -1] as const) {
      const template = SOURCES[5]!.item(value);
      expect(
        parseAdministrativeTemplate(template.definitionValues as any[])[0]!
          .value,
      ).toBe(`Timeout: ${UNREADABLE_VALUE}`);
    }
  });

  it("keeps valid values as they were", () => {
    const [setting] = SOURCES[0]!.item(900).settings as any[];
    expect(extractSettingValue(setting).value).toBe("900");
    expect(
      parseSecurityBaseline([], SOURCES[4]!.item(900).settings as any[])[0]!
        .settings,
    ).toEqual([expect.objectContaining({ value: "900" })]);
    expect(
      parseDeviceConfiguration(SOURCES[3]!.item(900)).flatMap((category) =>
        category.settings.map((row) => row.value),
      ),
    ).toEqual(["Synthetic timeout: 900"]);
    expect(
      parseAdministrativeTemplate(
        SOURCES[5]!.item(900).definitionValues as any[],
      )[0]!.value,
    ).toBe("Timeout: 900");
  });
});

describe("documented value shapes", () => {
  const simpleValue = (type: string, value: unknown) =>
    instance("SimpleSettingInstance", {
      settingDefinitionId: TIMEOUT,
      simpleSettingValue: {
        "@odata.type": `#microsoft.graph.deviceManagementConfiguration${type}`,
        value,
      },
    });

  it("reads Settings Catalog values by their documented type", () => {
    expect(unreadableCatalogValue(simpleValue("StringSettingValue", ""))).toBe(
      false,
    );
    expect(
      unreadableCatalogValue(simpleValue("ReferenceSettingValue", "ref")),
    ).toBe(false);
    expect(unreadableCatalogValue(simpleValue("StringSettingValue", 5))).toBe(
      true,
    );
    expect(
      unreadableCatalogValue(simpleValue("ReferenceSettingValue", true)),
    ).toBe(true);
    const choices = (entries: unknown[]) =>
      instance("ChoiceSettingCollectionInstance", {
        settingDefinitionId: TIMEOUT,
        choiceSettingCollectionValue: entries,
      });
    expect(
      unreadableCatalogValue(
        choices([{ value: `${TIMEOUT}_1`, children: [] }]),
      ),
    ).toBe(false);
    expect(
      unreadableCatalogValue(
        choices([{ value: `${TIMEOUT}_1`, children: [] }, { children: [] }]),
      ),
    ).toBe(true);
  });

  it("reads Settings Catalog instance types documented without a value as readable", () => {
    // deviceManagementConfigurationSettingGroupInstance and
    // ...SettingGroupCollectionInstance have no value property (Graph beta).
    for (const type of [
      "SettingGroupInstance",
      "SettingGroupCollectionInstance",
    ]) {
      const valueless = instance(type, { settingDefinitionId: TIMEOUT });
      expect(unreadableCatalogValue(valueless)).toBe(false);
      const item = catalogItem([{ id: "0", settingInstance: valueless }]);
      const diff = diffSnapshots(
        project("settingsCatalog", item),
        project("settingsCatalog", item),
      );
      expect(diff.notComparedItems).toEqual([]);
    }
    // An instance of another type without a value stays unreadable.
    expect(
      unreadableCatalogValue(
        instance("SimpleSettingInstance", { settingDefinitionId: TIMEOUT }),
      ),
    ).toBe(true);
  });

  it("reads intent settings by their documented type", () => {
    const row = (type: string, fields: Record<string, unknown>) => ({
      "@odata.type": `#microsoft.graph.deviceManagement${type}SettingInstance`,
      definitionId: "deviceConfiguration--synthetic",
      ...fields,
    });
    const readable = [
      row("Boolean", { value: false, valueJson: "false" }),
      row("Boolean", { valueJson: "true" }),
      row("String", { value: "", valueJson: '""' }),
      row("String", { value: null, valueJson: "null" }),
      row("Collection", { valueJson: '["synthetic"]' }),
      row("Complex", { valueJson: '[{"synthetic":1}]' }),
      row("AbstractComplex", { valueJson: "null" }),
    ];
    const unreadable = [
      row("Boolean", { value: "true", valueJson: '"true"' }),
      row("Boolean", { value: null, valueJson: "true" }),
      row("String", { value: 5, valueJson: "5" }),
      row("String", { valueJson: "not json" }),
      row("Collection", { valueJson: "not json" }),
      row("Complex", {}),
    ];
    for (const entry of readable)
      expect(unreadableIntentValue(entry), JSON.stringify(entry)).toBe(false);
    for (const entry of unreadable)
      expect(unreadableIntentValue(entry), JSON.stringify(entry)).toBe(true);
  });

  it("reads presentation values by their documented type", () => {
    const value = (type: string, fields: Record<string, unknown>) => ({
      "@odata.type": `#microsoft.graph.groupPolicyPresentationValue${type}`,
      presentation: { id: "synthetic-presentation", label: "Synthetic" },
      ...fields,
    });
    const readable = [
      value("Boolean", { value: false }),
      value("Text", { value: "" }),
      value("Text", { value: "[Redacted]" }),
      value("MultiText", { values: [] }),
      value("MultiText", { values: ["one", "two"] }),
      value("List", { values: [{ name: "Site", value: "example" }] }),
      value("List", { values: ["[Redacted]"] }),
      value("Decimal", { value: 3000000000 }),
      value("LongDecimal", { value: 0 }),
    ];
    // The lab tenant holds no template with presentation values, so a null
    // value was not observed; it is not a value of the documented type.
    const unreadable = [
      value("Boolean", { value: "true" }),
      value("Text", { value: null }),
      value("Text", {}),
      value("MultiText", { values: "one" }),
      value("MultiText", { values: [1] }),
      value("List", { values: null }),
      value("List", { values: ["Site"] }),
      value("Decimal", { value: -1 }),
      { value: "untyped" },
    ];
    for (const entry of readable)
      expect(unreadablePresentationValue(entry), JSON.stringify(entry)).toBe(
        false,
      );
    for (const entry of unreadable)
      expect(unreadablePresentationValue(entry), JSON.stringify(entry)).toBe(
        true,
      );
  });

  it("reads a template state that is no boolean as unreadable", () => {
    const template = (enabled: unknown) => ({
      ...SOURCES[5]!.item(900),
      definitionValues: [
        {
          id: "value-1",
          enabled,
          definition: { id: "synthetic-definition", displayName: "Synthetic" },
          presentationValues: [],
        },
      ],
    });
    expect(unreadableTemplateValue(template(true).definitionValues[0])).toBe(
      false,
    );
    for (const enabled of ["true", null, undefined]) {
      expect(
        unreadableTemplateValue(template(enabled).definitionValues[0]),
      ).toBe(true);
      const result = compareSettings(
        projectionSettings(project("administrativeTemplates", template(true))),
        projectionSettings(
          project("administrativeTemplates", template(enabled)),
        ),
      );
      expect(result.totals).toMatchObject({
        notComparable: 1,
        different: 0,
        missing: 0,
        matching: 0,
      });
      const diff = diffSnapshots(
        project("administrativeTemplates", template(true)),
        project("administrativeTemplates", template(enabled)),
      );
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
  });

  it("keeps encrypted and redacted custom OMA-URI values readable, and null unreadable", () => {
    const row = (fields: Record<string, unknown>) => ({
      "@odata.type": "#microsoft.graph.omaSettingString",
      omaUri: "./Device/Vendor/MSFT/Synthetic/Text",
      isEncrypted: false,
      ...fields,
    });
    expect(unreadableOmaValue(row({ isEncrypted: true }))).toBe(false);
    expect(unreadableOmaValue(row({ isEncrypted: true, value: 5 }))).toBe(
      false,
    );
    expect(unreadableOmaValue(row({ value: "[Redacted]" }))).toBe(false);
    expect(unreadableOmaValue(row({}))).toBe(false);
    expect(unreadableOmaValue(row({ value: null }))).toBe(true);
    expect(unreadableOmaValue(row({ value: 5 }))).toBe(true);
    const profile = (fields: Record<string, unknown>) => ({
      ...SOURCES[3]!.item(null),
      omaSettings: [{ displayName: "Synthetic text", ...row(fields) }],
    });
    for (const fields of [
      { isEncrypted: true, value: "secret" },
      { value: "[Redacted]" },
    ]) {
      const diff = diffSnapshots(
        project("deviceConfigurations", profile(fields)),
        project("deviceConfigurations", profile(fields)),
      );
      expect(diff.notComparedItems).toEqual([]);
    }
  });
});

describe("administrative template lists", () => {
  const template = (values: unknown[]) => ({
    ...SOURCES[5]!.item(900),
    definitionValues: [
      {
        id: "value-1",
        enabled: true,
        definition: {
          id: "synthetic-definition",
          displayName: "Synthetic sites",
          categoryPath: "\\Synthetic",
        },
        presentationValues: [
          {
            "@odata.type": "#microsoft.graph.groupPolicyPresentationValueList",
            values,
            presentation: { id: "synthetic-list", label: "Sites" },
          },
        ],
      },
    ],
  });
  const sites = (value: string) => [{ name: "Site", value }];
  const projected = (value: string) =>
    project("administrativeTemplates", template(sites(value)));

  it("keeps the pairs out of the snapshot and compares them by fingerprint", () => {
    const item = projected("one.example").sections.find(
      (row) => row.key === "administrativeTemplates",
    )!.items[0]!;
    expect(JSON.stringify(item.data)).not.toContain("one.example");
    expect(Object.keys(item.fingerprints ?? {})).toEqual([
      "value:synthetic-definition/synthetic-list#0",
    ]);
    const changed = diffSnapshots(
      projected("one.example"),
      projected("two.example"),
    );
    expect(changed.notComparedItems).toEqual([]);
    expect(changed.policies.flatMap((policy) => policy.settings)).toEqual([
      expect.objectContaining({
        name: "Synthetic sites: Sites",
        change: "changed",
        valueNotStored: true,
      }),
    ]);
    const same = diffSnapshots(
      projected("one.example"),
      projected("one.example"),
    );
    expect(same.policies).toEqual([]);
    expect(same.notComparedItems).toEqual([]);
  });

  it("never reads a changed or unchanged list as matching or different in Compare", () => {
    for (const other of ["one.example", "two.example"]) {
      const result = compareSettings(
        projectionSettings(projected("one.example")),
        projectionSettings(projected(other)),
      );
      expect(result.totals).toMatchObject({
        notComparable: 1,
        matching: 0,
        different: 0,
      });
    }
  });
});

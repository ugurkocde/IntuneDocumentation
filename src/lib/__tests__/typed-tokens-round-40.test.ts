import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sha256 } from "../compliance/manifest";
import type { ComplianceAssessment } from "../compliance/types";
import type { ConfigurationSectionData } from "../configuration-sections";
import {
  sanitizeGraphData,
  setRedactionDigest,
} from "../intune-policy-registry";
import { flattenItemSettings } from "../settings-flatten";
import { diffSnapshots } from "../snapshots/diff";
import {
  contentDigest,
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import {
  compareSettings,
  createReference,
  parseReference,
  projectionSettings,
  referenceSettings,
  serializeReference,
  type ReferenceFile,
  type ReferenceSetting,
} from "../snapshots/reference";

// Round 40 review finding: a value's documented Graph type is part of what
// Compare and History compare. Custom OMA-URI rows, Settings Catalog simple
// values, intent setting instances and administrative template
// presentation values are typed records (Graph beta $metadata and the
// msgraph skill schemas: omaSettingInteger value Int32, omaSettingString
// value String, deviceManagementConfigurationIntegerSettingValue value
// Int32, deviceManagementIntegerSettingInstance value Int32,
// groupPolicyPresentationValueDecimal and ...LongDecimal value Int64,
// checked 23 October 2026). A value whose type changed reads the same text
// on both sides, so it must still read different and changed, while equal
// values of one type stay equal. Names, ids and values are synthetic.

const ASSESSMENT = {
  provenance: { rulesetVersion: "synthetic" },
  generatedAt: "2026-10-23T09:00:00Z",
  scope: {},
  capabilities: [],
  frameworks: [],
} as unknown as ComplianceAssessment;

interface Family {
  key: string;
  familyKey: string;
}

function project(at: Family, item: unknown): SnapshotProjection {
  const section = {
    key: at.key,
    familyKey: at.familyKey,
    label: at.key,
    selectionPrefix: at.key,
    items: [item],
  } as ConfigurationSectionData;
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(
        { collectedAt: "2026-10-23T09:00:00Z", sections: [section] },
        ASSESSMENT,
        new Map(),
        (digest) => `synthetic:${digest}`,
      ),
    ),
  );
}

const statusOf = (
  at: Family,
  setting: string,
  reference: unknown,
  current: unknown,
) =>
  compareSettings(
    projectionSettings(project(at, reference)),
    projectionSettings(project(at, current)),
  )
    .groups.flatMap((group) => group.rows)
    .find((row) => row.setting === setting)?.status;

const changes = (at: Family, from: unknown, to: unknown) =>
  diffSnapshots(project(at, from), project(at, to)).policies.flatMap((policy) =>
    policy.settings.map((row) => [row.definitionId ?? row.name, row.change]),
  );

// The id History names a setting by: the Compare setting id without the
// category path of an administrative template value.
const rowId = (setting: string) => setting.split(" / ").at(-1)!;

// The value text an item's setting shows, as the documentation reads it.
const shown = (at: Family, item: unknown, setting: string) =>
  flattenItemSettings(at.key, item).find(
    (row) => (row.definitionId ?? row.name) === rowId(setting),
  )?.value;

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

// --- Families -----------------------------------------------------------------

const DEVICE: Family = {
  key: "deviceConfigurations",
  familyKey: "deviceConfigurations",
};
// A URI the compliance engine reads, so its text value is stored.
const READ_URI =
  "./Device/Vendor/MSFT/Policy/Config/Defender/AllowRealtimeMonitoring";
const custom = (type: string, value: unknown, uri = READ_URI) => ({
  "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
  id: "device-oma",
  displayName: "Synthetic custom profile",
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
  omaSettings: [
    {
      "@odata.type": `#microsoft.graph.${type}`,
      displayName: "Synthetic value",
      omaUri: uri,
      isEncrypted: false,
      value,
    },
  ],
});

const CATALOG: Family = {
  key: "settingsCatalog",
  familyKey: "settingsCatalog",
};
const SIMPLE =
  "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance";
const SIMPLE_COLLECTION =
  "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance";
const CHOICE =
  "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance";
const GROUP_COLLECTION =
  "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance";
const catalogValue = (name: string) =>
  `#microsoft.graph.deviceManagementConfiguration${name}SettingValue`;
const catalog = (...instances: unknown[]) => ({
  id: "catalog-1",
  name: "Synthetic catalog policy",
  platforms: "windows10",
  technologies: "mdm",
  assignments: assigned,
  collectionStatus: { settings: "complete", assignments: "complete" },
  settings: instances.map((settingInstance, index) => ({
    id: String(index),
    settingInstance,
  })),
});
const simple = (type: string, value: unknown, id = "synthetic_value") => ({
  "@odata.type": SIMPLE,
  settingDefinitionId: id,
  simpleSettingValue: { "@odata.type": catalogValue(type), value },
});
const simpleList = (entries: Array<[string, unknown]>) => ({
  "@odata.type": SIMPLE_COLLECTION,
  settingDefinitionId: "synthetic_list",
  simpleSettingCollectionValue: entries.map(([type, value]) => ({
    "@odata.type": catalogValue(type),
    value,
  })),
});

const INTENT: Family = {
  key: "securityBaselines",
  familyKey: "securityBaselines",
};
const intent = (type: string, value: unknown) => ({
  id: "intent-1",
  displayName: "Synthetic intent",
  templateId: "synthetic-template",
  assignments: assigned,
  collectionStatus: { settings: "complete", assignments: "complete" },
  settings: [
    {
      "@odata.type": `#microsoft.graph.deviceManagement${type}SettingInstance`,
      definitionId: "synthetic_intent",
      value,
      valueJson: JSON.stringify(value),
    },
  ],
});

const TEMPLATES: Family = {
  key: "administrativeTemplates",
  familyKey: "administrativeTemplates",
};
const TEMPLATE_DEFINITION = "synthetic-definition";
const template = (type: string, value: unknown) => ({
  id: "template-1",
  displayName: "Synthetic template",
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
  definitionValues: [
    {
      enabled: true,
      definition: {
        id: TEMPLATE_DEFINITION,
        displayName: "Synthetic policy",
        categoryPath: "\\Synthetic",
      },
      presentationValues: [
        {
          "@odata.type": `#microsoft.graph.groupPolicyPresentationValue${type}`,
          value,
          presentation: { id: "synthetic-presentation", label: "Synthetic" },
        },
      ],
    },
  ],
});

// Per family: values of two types that read the same text, values of one
// type in equivalent forms, and a different value of the same type.
const CASES: Array<{
  label: string;
  at: Family;
  setting: string;
  crossType: Array<[unknown, unknown]>;
  equal: Array<[unknown, unknown]>;
  different: Array<[unknown, unknown]>;
}> = [
  {
    label: "a custom OMA-URI value",
    at: DEVICE,
    setting: READ_URI,
    crossType: [
      [custom("omaSettingInteger", 1), custom("omaSettingString", "1")],
      [custom("omaSettingInteger", 1), custom("omaSettingFloatingPoint", 1)],
      [
        custom("omaSettingBoolean", true),
        custom("omaSettingString", "Enabled"),
      ],
      [
        custom("omaSettingString", "2026-10-23T10:00:00Z"),
        custom("omaSettingDateTime", "2026-10-23T10:00:00Z"),
      ],
      [
        custom("omaSettingString", "PFN5bnRoZXRpYy8+"),
        custom("omaSettingBase64", "PFN5bnRoZXRpYy8+"),
      ],
    ],
    equal: [
      [custom("omaSettingInteger", 1), custom("omaSettingInteger", 1)],
      [custom("omaSettingString", "1"), custom("omaSettingString", "1")],
      [
        custom("omaSettingFloatingPoint", 0.1),
        custom("omaSettingFloatingPoint", 0.10000000149011612),
      ],
    ],
    different: [
      [custom("omaSettingInteger", 1), custom("omaSettingInteger", 2)],
      [custom("omaSettingString", "1"), custom("omaSettingString", "2")],
    ],
  },
  {
    label: "a Settings Catalog simple value",
    at: CATALOG,
    setting: "synthetic_value",
    crossType: [
      [catalog(simple("Integer", 1)), catalog(simple("String", "1"))],
      [catalog(simple("Reference", "a")), catalog(simple("String", "a"))],
    ],
    equal: [
      [catalog(simple("Integer", 1)), catalog(simple("Integer", 1))],
      [catalog(simple("String", "1")), catalog(simple("String", "1"))],
    ],
    different: [[catalog(simple("Integer", 1)), catalog(simple("Integer", 2))]],
  },
  {
    label: "a Settings Catalog value collection",
    at: CATALOG,
    setting: "synthetic_list",
    crossType: [
      [
        catalog(simpleList([["Integer", 1]])),
        catalog(simpleList([["String", "1"]])),
      ],
      [
        catalog(
          simpleList([
            ["Integer", 1],
            ["String", "2"],
          ]),
        ),
        catalog(
          simpleList([
            ["String", "1"],
            ["Integer", 2],
          ]),
        ),
      ],
    ],
    equal: [
      [
        catalog(
          simpleList([
            ["Integer", 1],
            ["String", "2"],
          ]),
        ),
        catalog(
          simpleList([
            ["Integer", 1],
            ["String", "2"],
          ]),
        ),
      ],
    ],
    different: [
      [
        catalog(simpleList([["Integer", 1]])),
        catalog(simpleList([["Integer", 2]])),
      ],
    ],
  },
  {
    label: "an intent setting value",
    at: INTENT,
    setting: "synthetic_intent",
    crossType: [
      [intent("Integer", 1), intent("String", "1")],
      [intent("Boolean", true), intent("String", "Enabled")],
    ],
    equal: [
      [intent("Integer", 1), intent("Integer", 1)],
      [intent("Boolean", true), intent("Boolean", true)],
    ],
    different: [[intent("Integer", 1), intent("Integer", 2)]],
  },
  {
    label: "an administrative template presentation value",
    at: TEMPLATES,
    setting: `Synthetic / ${TEMPLATE_DEFINITION}`,
    crossType: [
      [template("Decimal", 1), template("LongDecimal", 1)],
      [template("Decimal", 1), template("Text", "1")],
    ],
    equal: [
      [template("Decimal", 1), template("Decimal", 1)],
      [template("LongDecimal", 1), template("LongDecimal", 1)],
    ],
    different: [[template("Decimal", 1), template("Decimal", 2)]],
  },
];

describe("round 40: a value whose type changed reads different and changed", () => {
  for (const { label, at, setting, crossType, equal, different } of CASES) {
    it(`tells ${label} of another type apart although both read alike`, () => {
      for (const [a, b] of crossType) {
        const text = shown(at, a, setting);
        expect(text, `${setting} shown`).toBeDefined();
        // Both read the same, so only the type tells them apart.
        expect(shown(at, b, setting)).toBe(text);
        for (const [from, to] of [
          [a, b],
          [b, a],
        ]) {
          expect(statusOf(at, setting, from, to), `${text}`).toBe("different");
          expect(changes(at, from, to), `${text}`).toEqual([
            [rowId(setting), "changed"],
          ]);
        }
      }
    });

    it(`keeps equal values of ${label} of one type equal`, () => {
      for (const [a, b] of equal) {
        expect(statusOf(at, setting, a, b)).toBe("matching");
        expect(changes(at, a, b)).toEqual([]);
      }
    });

    it(`still reports a different value of ${label} of one type`, () => {
      for (const [a, b] of different) {
        expect(statusOf(at, setting, a, b)).toBe("different");
        expect(changes(at, a, b)).toEqual([[rowId(setting), "changed"]]);
      }
    });
  }

  it("shows the values as Graph returned them", () => {
    const [row] = compareSettings(
      projectionSettings(project(DEVICE, custom("omaSettingInteger", 1))),
      projectionSettings(project(DEVICE, custom("omaSettingString", "1"))),
    )
      .groups.flatMap((group) => group.rows)
      .filter((entry) => entry.setting === READ_URI);
    expect(row!.expected.map((entry) => entry.value)).toEqual(["1"]);
    expect(row!.actual.map((entry) => entry.value)).toEqual(["1"]);
    const diff = diffSnapshots(
      project(DEVICE, custom("omaSettingInteger", 1)),
      project(DEVICE, custom("omaSettingString", "1")),
    );
    expect(diff.policies[0]!.settings).toEqual([
      expect.objectContaining({ before: "1", after: "1", change: "changed" }),
    ]);
  });
});

// --- History fingerprints -----------------------------------------------------

describe("round 40: fingerprints of custom OMA-URI values that are not stored hold their type", () => {
  // A URI no reader reads, so its text value is not stored.
  const DROPPED_URI = "./Device/Vendor/MSFT/Policy/Config/Synthetic/Value";
  const dropped = (type: string, value: unknown) =>
    custom(type, value, DROPPED_URI);

  it("reads a type change of a value that is not stored as changed", () => {
    for (const [a, b] of [
      [
        dropped("omaSettingString", "PFN5bnRoZXRpYy8+"),
        dropped("omaSettingBase64", "PFN5bnRoZXRpYy8+"),
      ],
      [
        dropped("omaSettingString", "PFN5bnRoZXRpYy8+"),
        dropped("omaSettingStringXml", "PFN5bnRoZXRpYy8+"),
      ],
      [
        dropped("omaSettingString", "2026-10-23T10:00:00Z"),
        dropped("omaSettingDateTime", "2026-10-23T10:00:00Z"),
      ],
    ])
      for (const [from, to] of [
        [a, b],
        [b, a],
      ])
        expect(changes(DEVICE, from, to)).toEqual([[DROPPED_URI, "changed"]]);
  });

  it("keeps equal values that are not stored equal, and a String value's fingerprint as before", () => {
    for (const type of ["omaSettingString", "omaSettingBase64"])
      expect(
        changes(
          DEVICE,
          dropped(type, "PFN5bnRoZXRpYy8+"),
          dropped(type, "PFN5bnRoZXRpYy8+"),
        ),
      ).toEqual([]);
    expect(
      changes(
        DEVICE,
        dropped("omaSettingString", "a"),
        dropped("omaSettingString", "b"),
      ),
    ).toEqual([[DROPPED_URI, "changed"]]);
    // Snapshots saved before keep comparing: a String value is
    // fingerprinted from the digest of its text, as they were.
    const item = project(DEVICE, dropped("omaSettingString", "a")).sections[0]!
      .items[0]!;
    expect(item.fingerprints).toEqual({
      [`value:${DROPPED_URI}#0`]: `synthetic:${contentDigest("a")}`,
    });
  });

  describe("values the collector redacted", () => {
    beforeAll(() => setRedactionDigest(contentDigest));
    afterAll(() => setRedactionDigest(null));
    const SECRET_URI = "./Device/Vendor/MSFT/Synthetic/Password";
    const redacted = (type: string, value: unknown) =>
      sanitizeGraphData(custom(type, value, SECRET_URI));

    it("reads a type change of a redacted value as changed and an equal one as unchanged", () => {
      expect(
        changes(
          DEVICE,
          redacted("omaSettingInteger", 1234),
          redacted("omaSettingString", "1234"),
        ),
      ).toEqual([[SECRET_URI, "changed"]]);
      for (const [type, value] of [
        ["omaSettingInteger", 1234],
        ["omaSettingString", "1234"],
      ] as const)
        expect(
          changes(DEVICE, redacted(type, value), redacted(type, value)),
        ).toEqual([]);
    });
  });
});

// --- Reference files saved before tokens held the type -----------------------

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");

// The file with each setting edited, saved again with its checksum.
async function resaved(
  file: ReferenceFile,
  edit: (setting: ReferenceSetting) => ReferenceSetting,
): Promise<string> {
  const body: Partial<ReferenceFile> = {
    ...file,
    settings: file.settings.map((setting) => edit({ ...setting })),
  };
  delete body.checksum;
  return serializeReference({
    ...(body as ReferenceFile),
    checksum: { algorithm: "sha-256", value: await sha256(body) },
  });
}

// A reference file as builds before this one wrote it, from the file this
// build writes: edit changes each setting, and the group digests are
// rewritten consistently, as their content then differed.
async function earlierFile(
  at: Family,
  item: unknown,
  edit: (setting: ReferenceSetting) => ReferenceSetting,
): Promise<ReferenceFile> {
  const file = await createReference(project(at, item), {
    createdAt: "2026-10-23T09:00:00Z",
    sourceLabel: "Synthetic tenant",
  });
  const parsed = await parseReference(
    await resaved(file, (setting) => {
      const next = edit(setting);
      if (next.group) next.group = digest(`earlier:${next.group}`);
      return next;
    }),
  );
  expect(parsed.ok).toBe(true);
  return (parsed as { ok: true; file: ReferenceFile }).file;
}

// Typed values had no token before, unless they were lists or
// administrative template values.
const untyped = (setting: ReferenceSetting) => {
  delete setting.typed;
  delete setting.token;
  return setting;
};

const statusAgainst = (
  file: ReferenceFile,
  at: Family,
  current: unknown,
  setting: string,
) =>
  compareSettings(
    referenceSettings(file),
    projectionSettings(project(at, current)),
  )
    .groups.flatMap((group) => group.rows)
    .find((row) => row.setting === setting)?.status;

describe("round 40: reference files saved before tokens held the type", () => {
  it("never reads a value of a possibly other type as matching", async () => {
    for (const [at, setting, before, sameText, otherText] of [
      [
        DEVICE,
        READ_URI,
        custom("omaSettingInteger", 1),
        [custom("omaSettingInteger", 1), custom("omaSettingString", "1")],
        custom("omaSettingInteger", 2),
      ],
      [
        CATALOG,
        "synthetic_value",
        catalog(simple("Integer", 1)),
        [catalog(simple("Integer", 1)), catalog(simple("String", "1"))],
        catalog(simple("Integer", 2)),
      ],
      [
        INTENT,
        "synthetic_intent",
        intent("Integer", 1),
        [intent("Integer", 1), intent("String", "1")],
        intent("Integer", 2),
      ],
    ] as const) {
      const file = await earlierFile(at, before, untyped);
      for (const current of sameText)
        expect(statusAgainst(file, at, current, setting), setting).toBe(
          "notComparable",
        );
      expect(statusAgainst(file, at, otherText, setting), setting).toBe(
        "different",
      );
    }
  });

  it("reads an administrative template value against its earlier token as not comparable, not different", async () => {
    // The token as builds before this one took it: presentation values
    // without their type.
    const earlier = digest(
      JSON.stringify([
        true,
        [JSON.stringify(["synthetic-presentation", 1, null])],
      ]),
    );
    const file = await earlierFile(
      TEMPLATES,
      template("Decimal", 1),
      (setting) => {
        delete setting.typed;
        setting.token = earlier;
        return setting;
      },
    );
    const setting = `Synthetic / ${TEMPLATE_DEFINITION}`;
    for (const current of [template("Decimal", 1), template("LongDecimal", 1)])
      expect(statusAgainst(file, TEMPLATES, current, setting)).toBe(
        "notComparable",
      );
    expect(
      statusAgainst(file, TEMPLATES, template("Decimal", 2), setting),
    ).toBe("different");
  });

  it("reads the other settings of a group instance holding a typed value as not comparable, never different", async () => {
    const rule = (action: string, port: unknown) => ({
      children: [
        {
          "@odata.type": CHOICE,
          settingDefinitionId: "synthetic_rule_action",
          choiceSettingValue: {
            value: `synthetic_rule_action_${action}`,
            children: [],
          },
        },
        simple("Integer", port, "synthetic_rule_port"),
      ],
    });
    const rules = (...entries: unknown[]) =>
      catalog({
        "@odata.type": GROUP_COLLECTION,
        settingDefinitionId: "synthetic_rule",
        groupSettingCollectionValue: entries,
      });
    const policy = rules(rule("allow", 80), rule("block", 443));
    const file = await earlierFile(CATALOG, policy, (setting) =>
      setting.setting === "synthetic_rule_port" ? untyped(setting) : setting,
    );
    for (const setting of ["synthetic_rule_action", "synthetic_rule_port"])
      expect(statusAgainst(file, CATALOG, policy, setting), setting).toBe(
        "notComparable",
      );
    // Files this build writes compare as before.
    const current = projectionSettings(project(CATALOG, policy));
    const rows = compareSettings(current, current).groups.flatMap(
      (group) => group.rows,
    );
    expect(rows.map((row) => row.status)).toEqual(rows.map(() => "matching"));
  });

  it("refuses a type mark without a token", async () => {
    const file = await createReference(
      project(DEVICE, custom("omaSettingInteger", 1)),
      { createdAt: "2026-10-23T09:00:00Z", sourceLabel: "Synthetic tenant" },
    );
    expect(
      file.settings.find((setting) => setting.setting === READ_URI),
    ).toMatchObject({
      typed: true,
      token: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    for (const edit of [
      (setting: ReferenceSetting) => {
        delete setting.token;
        return setting;
      },
      (setting: ReferenceSetting) => ({
        ...setting,
        typed: false as unknown as true,
      }),
      (setting: ReferenceSetting) => {
        delete setting.value;
        delete setting.token;
        return { ...setting, redacted: true as const };
      },
    ]) {
      const text = await resaved(file, (setting) =>
        setting.setting === READ_URI ? edit(setting) : setting,
      );
      expect((await parseReference(text)).ok).toBe(false);
    }
  });
});

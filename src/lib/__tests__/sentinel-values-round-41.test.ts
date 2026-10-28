import { describe, expect, it } from "vitest";
import type { ComplianceAssessment } from "../compliance/types";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import {
  ASSIGNMENTS_NOT_APPLICABLE,
  extractAppConfigurationSettings,
  extractSettingValue,
  parseComplianceRules,
  parseDeviceConfiguration,
  parseDocumentableProperties,
  parseSecurityBaseline,
  SETTINGS_UNAVAILABLE,
  UNREADABLE_VALUE,
} from "../configuration-parser";
import type { ConfigurationSectionData } from "../configuration-sections";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import type { ConfigurationSetting } from "../intune-detailed-client";
import {
  redactedDigests,
  sanitizeGraphData,
  setRedactionDigest,
} from "../intune-policy-registry";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { flattenItemSettings } from "../settings-flatten";
import { diffSnapshots } from "../snapshots/diff";
import {
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import { compareSettings, projectionSettings } from "../snapshots/reference";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { extractZipEntry } from "./helpers/zip";

// Round 41 review findings. Names, ids and values are synthetic.
// 1. Whether a setting is listed is decided from the value Graph returned,
//    never from its display text: a valid text value that reads like one of
//    the placeholders the documentation shows ("Not configured", "Value
//    could not be read" and so on) is a setting like any other, in Compare,
//    History, the documentation and the desktop search.
// 2. The members of a JSON object are unordered, so a complex value in
//    another key order is the same value in Compare and History.
// 3. A group a policy both includes and excludes is not counted among the
//    assigned groups.

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

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

// Text values that read like the placeholders the documentation shows.
const SENTINELS = [
  "Not configured",
  UNREADABLE_VALUE,
  "Setting without its identifier",
  "Setting below the depth limit",
  SETTINGS_UNAVAILABLE,
  ASSIGNMENTS_NOT_APPLICABLE,
  "Not applicable",
  "[Not returned by Graph]",
];

// --- Families -----------------------------------------------------------------

const CATALOG: Family = {
  key: "settingsCatalog",
  familyKey: "settingsCatalog",
};
const SIMPLE =
  "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance";
const CHOICE =
  "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance";
const STRING_VALUE =
  "#microsoft.graph.deviceManagementConfigurationStringSettingValue";
const TEXT_ID = "synthetic_text";
const textInstance = (value: string, id = TEXT_ID) => ({
  "@odata.type": SIMPLE,
  settingDefinitionId: id,
  simpleSettingValue: { "@odata.type": STRING_VALUE, value },
});
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
// A choice whose child is a text value.
const CHOICE_ID = "synthetic_choice";
const CHILD_ID = "synthetic_choice_text";
const choiceWithChild = (value: string) => ({
  "@odata.type": CHOICE,
  settingDefinitionId: CHOICE_ID,
  choiceSettingValue: {
    value: `${CHOICE_ID}_1`,
    children: [textInstance(value, CHILD_ID)],
  },
});

const INTENT: Family = {
  key: "securityBaselines",
  familyKey: "securityBaselines",
};
const INTENT_ID = "synthetic_intent";
const intentWith = (setting: Record<string, unknown>) => ({
  id: "intent-1",
  displayName: "Synthetic intent",
  templateId: "synthetic-template",
  assignments: assigned,
  collectionStatus: { settings: "complete", assignments: "complete" },
  settings: [{ definitionId: INTENT_ID, ...setting }],
});
const intentText = (value: string) =>
  intentWith({
    "@odata.type": "#microsoft.graph.deviceManagementStringSettingInstance",
    value,
    valueJson: JSON.stringify(value),
  });
// A complex intent value holds its value only as JSON text.
const intentComplex = (valueJson: string) =>
  intentWith({
    "@odata.type": "#microsoft.graph.deviceManagementComplexSettingInstance",
    valueJson,
  });

const DEVICE: Family = {
  key: "deviceConfigurations",
  familyKey: "deviceConfigurations",
};
// A URI the compliance engine reads, so its text value is stored.
const READ_URI =
  "./Device/Vendor/MSFT/Policy/Config/Defender/AllowRealtimeMonitoring";
const omaText = (value: string) => ({
  "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
  id: "device-oma",
  displayName: "Synthetic custom profile",
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
  omaSettings: [
    {
      "@odata.type": "#microsoft.graph.omaSettingString",
      displayName: "Synthetic value",
      omaUri: READ_URI,
      isEncrypted: false,
      value,
    },
  ],
});

const COMPLIANCE: Family = {
  key: "compliancePolicies",
  familyKey: "compliancePolicies",
};
// osMinimumVersion is a String (Graph beta windows10CompliancePolicy).
const complianceText = (osMinimumVersion: string) => ({
  "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
  id: "compliance-1",
  displayName: "Synthetic compliance policy",
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
  osMinimumVersion,
});

// Per family: the item holding a text value, and the Compare and History id
// of the setting.
const FAMILIES: Array<{
  label: string;
  at: Family;
  setting: string;
  item: (value: string) => unknown;
  // Another setting of the item, so removing the value leaves the item.
  without: unknown;
}> = [
  {
    label: "a Settings Catalog text value",
    at: CATALOG,
    setting: TEXT_ID,
    item: (value) => catalog(textInstance(value), textInstance("x", "other")),
    without: catalog(textInstance("x", "other")),
  },
  {
    label: "an intent text value",
    at: INTENT,
    setting: INTENT_ID,
    item: intentText,
    without: { ...intentText("x"), settings: [] },
  },
  {
    label: "a custom OMA-URI text value",
    at: DEVICE,
    setting: READ_URI,
    item: omaText,
    without: { ...omaText("x"), omaSettings: [] },
  },
  {
    label: "a compliance text property",
    at: COMPLIANCE,
    setting: "osMinimumVersion",
    item: complianceText,
    // Graph returns null for a property that is not configured.
    without: { ...complianceText("x"), osMinimumVersion: null },
  },
];

describe("round 41: a text value that reads like a placeholder is a setting", () => {
  for (const { label, at, setting, item, without } of FAMILIES) {
    it(`lists ${label} that reads like a placeholder`, () => {
      for (const text of SENTINELS) {
        const rows = flattenItemSettings(at.key, item(text)).filter(
          (row) => row.definitionId === setting,
        );
        expect(rows, text).toHaveLength(1);
        expect(rows[0]!.value).toBe(text);
        expect(rows[0]!.unreadable).toBeUndefined();
      }
    });

    it(`reads a removed or changed ${label} that reads like a placeholder as a difference`, () => {
      for (const text of SENTINELS) {
        expect(statusOf(at, setting, item(text), without), text).toBe(
          "missing",
        );
        expect(statusOf(at, setting, without, item(text)), text).toBe("extra");
        expect(changes(at, item(text), without), text).toEqual([
          [setting, "removed"],
        ]);
        expect(statusOf(at, setting, item(text), item("Hello")), text).toBe(
          "different",
        );
        expect(changes(at, item(text), item("Hello")), text).toEqual([
          [setting, "changed"],
        ]);
        expect(statusOf(at, setting, item(text), item(text)), text).toBe(
          "matching",
        );
        expect(changes(at, item(text), item(text)), text).toEqual([]);
      }
    });

    it(`still reads a real change of ${label} as one`, () => {
      expect(statusOf(at, setting, item("One"), item("Two"))).toBe("different");
      expect(changes(at, item("One"), item("Two"))).toEqual([
        [setting, "changed"],
      ]);
    });
  }

  it("lists a Settings Catalog child text value that reads like a placeholder", () => {
    const policy = catalog(choiceWithChild("Not configured"));
    const child = flattenItemSettings(CATALOG.key, policy).find(
      (row) => row.definitionId === CHILD_ID,
    );
    expect(child?.value).toBe("Not configured");
    const [setting] = policy.settings as unknown as ConfigurationSetting[];
    const extracted = extractSettingValue(setting!);
    expect(extracted.nestedSettings).toEqual([
      expect.objectContaining({
        name: `  ${CHILD_ID}`,
        value: "Not configured",
      }),
    ]);
    expect(
      statusOf(CATALOG, CHILD_ID, policy, catalog(choiceWithChild("Hello"))),
    ).toBe("different");
    expect(changes(CATALOG, policy, catalog(choiceWithChild("Hello")))).toEqual(
      [[CHILD_ID, "changed"]],
    );
  });

  it("lists a choice whose option is named like a placeholder", () => {
    const setting = {
      id: "0",
      settingInstance: {
        "@odata.type": CHOICE,
        settingDefinitionId: CHOICE_ID,
        choiceSettingValue: { value: `${CHOICE_ID}_0`, children: [] },
      },
      settingDefinitions: [
        {
          id: CHOICE_ID,
          displayName: "Synthetic choice",
          options: [
            { itemId: `${CHOICE_ID}_0`, displayName: "Not configured" },
          ],
        },
      ],
    };
    const extracted = extractSettingValue(
      setting as unknown as ConfigurationSetting,
    );
    expect(extracted).toMatchObject({
      value: "Not configured",
      configured: true,
    });
    expect(
      flattenItemSettings(CATALOG.key, { settings: [setting] }).map((row) => [
        row.definitionId,
        row.value,
        row.token,
      ]),
    ).toEqual([[CHOICE_ID, "Not configured", `${CHOICE_ID}_0`]]);
  });

  it("keeps settings without a value out, as before", () => {
    // Empty value collections, and no instance at all, hold no setting.
    const unset = [
      {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
        settingDefinitionId: TEXT_ID,
        simpleSettingCollectionValue: [],
      },
      {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationChoiceSettingCollectionInstance",
        settingDefinitionId: CHOICE_ID,
        choiceSettingCollectionValue: [],
      },
      undefined,
    ];
    for (const settingInstance of unset)
      expect(
        extractSettingValue({ id: "0", settingInstance } as never).configured,
      ).toBe(false);
    expect(parseDocumentableProperties({ a: null, b: [], c: [null] })).toEqual(
      [],
    );
    expect(parseComplianceRules({ a: [], b: { value: null } })).toEqual([]);
    expect(parseDeviceConfiguration({ a: [], omaSettings: [] })).toEqual([]);
    expect(
      extractAppConfigurationSettings({
        settings: [{ appConfigKey: "k", appConfigKeyValue: null }],
      }),
    ).toEqual([]);
    expect(
      parseSecurityBaseline(
        [],
        [
          {
            "@odata.type":
              "#microsoft.graph.deviceManagementStringSettingInstance",
            definitionId: INTENT_ID,
            value: null,
            valueJson: "null",
          },
        ],
      )[0]!.settings,
    ).toEqual([]);
  });

  it("lists text that reads like a placeholder in every documentation layout", () => {
    for (const text of SENTINELS) {
      expect(parseDocumentableProperties({ customText: text })).toEqual([
        { name: "Custom Text", value: text },
      ]);
      expect(parseDocumentableProperties({ outer: { inner: [text] } })).toEqual(
        [{ name: "Outer › Inner", value: text }],
      );
      expect(
        parseComplianceRules({ osMinimumVersion: text }).map((rule) => [
          rule.rule,
          rule.value,
        ]),
      ).toEqual([["Os Minimum Version", text]]);
      expect(
        parseDeviceConfiguration({ customText: text }).flatMap((category) =>
          category.settings.map((setting) => [setting.name, setting.value]),
        ),
      ).toEqual([["Custom Text", text]]);
      expect(
        extractAppConfigurationSettings({
          settings: [
            { appConfigKey: "synthetic_key", appConfigKeyValue: text },
          ],
        }).map((setting: { value: string }) => setting.value),
      ).toEqual([text]);
      expect(
        parseSecurityBaseline(
          [],
          [
            {
              "@odata.type":
                "#microsoft.graph.deviceManagementStringSettingInstance",
              definitionId: INTENT_ID,
              value: text,
              valueJson: JSON.stringify(text),
            },
          ],
        )[0]!.settings.map((setting) => setting.value),
      ).toEqual([text]);
    }
  });

  it("lists a custom OMA-URI row whose text reads like a placeholder in the documentation", () => {
    const shown = parseDeviceConfiguration(omaText("Not configured"));
    expect(
      shown.flatMap((category) =>
        category.settings.filter((setting) => setting.name === "Oma Settings"),
      ),
    ).toEqual([
      expect.objectContaining({ value: "Synthetic value: Not configured" }),
    ]);
  });

  it.each(["PDF", "Word"])(
    "shows text that reads like a placeholder in the %s documentation",
    async (format) => {
      const policy = catalog(
        textInstance("Not configured", "synthetic_banner"),
        choiceWithChild("Not configured"),
      );
      const appConfiguration = {
        id: "app-config-1",
        displayName: "Synthetic app configuration",
        "@odata.type": "#microsoft.graph.iosMobileAppConfiguration",
        assignments: assigned,
        collectionStatus: { assignments: "complete" },
        settings: [
          {
            appConfigKey: "synthetic_designer_key",
            appConfigKeyType: "stringType",
            appConfigKeyValue: "Not configured",
          },
        ],
        payloadJson: JSON.stringify({
          synthetic_payload_key: "Not configured",
        }),
      };
      const exportData = {
        collectedAt: "2026-10-23T09:00:00Z",
        settingsCatalog: [policy],
        deviceConfigurations: [],
        administrativeTemplates: [],
        compliancePolicies: [],
        appProtectionPolicies: [],
        securityBaselines: [],
        scripts: { windows: [], macOS: [] },
        appConfigurations: [appConfiguration],
        windowsUpdatePolicies: [],
        enrollmentConfigurations: [],
        conditionalAccessPolicies: [],
        fetchErrors: [],
        includeComplianceEvidence: false,
      } as unknown as DetailedExportData;
      const result =
        format === "PDF"
          ? await generateDetailedPDF(exportData)
          : await generateDetailedDOCX(exportData);
      const text =
        format === "PDF"
          ? extractPdfStreamText(result.buffer)
          : extractZipEntry(result.buffer, "word/document.xml");
      for (const name of [
        "synthetic_banner",
        CHILD_ID,
        "synthetic_designer_key",
        "synthetic_payload_key",
      ])
        expect(text, name).toContain(name);
    },
  );
});

describe("round 41: a field Graph did not return stays not comparable", () => {
  it("reads an omitted top level field as not comparable", () => {
    const omitted = complianceText("x") as Record<string, unknown>;
    delete omitted.osMinimumVersion;
    expect(
      statusOf(COMPLIANCE, "osMinimumVersion", complianceText("10.0"), omitted),
    ).toBe("notComparable");
    expect(
      statusOf(COMPLIANCE, "osMinimumVersion", omitted, complianceText("10.0")),
    ).toBe("notComparable");
  });

  it("reads an omitted field under an object valued parent as not comparable", () => {
    const CA: Family = {
      key: "conditionalAccessPolicies",
      familyKey: "conditionalAccessPolicies",
    };
    const policy = (strength: Record<string, unknown>) => ({
      id: "ca-1",
      displayName: "Synthetic CA policy",
      state: "enabled",
      conditions: {
        users: {
          includeUsers: ["All"],
          excludeUsers: [],
          includeGroups: [],
          excludeGroups: [],
          includeRoles: [],
          excludeRoles: [],
        },
        applications: { includeApplications: ["All"], excludeApplications: [] },
      },
      grantControls: {
        operator: "OR",
        builtInControls: [],
        customAuthenticationFactors: [],
        termsOfUse: [],
        authenticationStrength: {
          id: "00000000-0000-4000-8000-0000000000aa",
          policyType: "custom",
          allowedCombinations: ["password,sms"],
          ...strength,
        },
      },
    });
    const setting =
      "Grant Controls / Authentication Strength / Requirements Satisfied";
    const full = policy({ requirementsSatisfied: "mfa" });
    const omitted = policy({});
    expect(statusOf(CA, setting, full, full)).toBe("matching");
    expect(statusOf(CA, setting, full, omitted)).toBe("notComparable");
    expect(statusOf(CA, setting, omitted, full)).toBe("notComparable");
  });
});

describe("round 41: a complex value in another key order is the same value", () => {
  const same = '{"a":1,"b":{"c":true,"d":"x"}}';
  const reordered = '{"b":{"d":"x","c":true},"a":1}';

  it("compares an intent complex value regardless of its key order", () => {
    expect(
      statusOf(
        INTENT,
        INTENT_ID,
        intentComplex(same),
        intentComplex(reordered),
      ),
    ).toBe("matching");
    expect(
      changes(INTENT, intentComplex(same), intentComplex(reordered)),
    ).toEqual([]);
    const [a] = flattenItemSettings(INTENT.key, intentComplex(same));
    const [b] = flattenItemSettings(INTENT.key, intentComplex(reordered));
    expect(a!.token).toBe(b!.token);
  });

  it("still reads a complex value that differs as different", () => {
    for (const other of [
      '{"a":1,"b":{"c":false,"d":"x"}}',
      '{"a":"1","b":{"c":true,"d":"x"}}',
      '{"a":1,"b":{"c":true,"d":"x"},"e":null}',
      '{"a":1}',
    ]) {
      expect(
        statusOf(INTENT, INTENT_ID, intentComplex(same), intentComplex(other)),
        other,
      ).toBe("different");
      expect(
        changes(INTENT, intentComplex(same), intentComplex(other)),
        other,
      ).toEqual([[INTENT_ID, "changed"]]);
    }
  });

  it("keeps the order of a list inside a complex value", () => {
    const list = intentComplex('{"a":["x","y"]}');
    const swapped = intentComplex('{"a":["y","x"]}');
    expect(statusOf(INTENT, INTENT_ID, list, swapped)).toBe("different");
    expect(changes(INTENT, list, swapped)).toEqual([[INTENT_ID, "changed"]]);
  });

  it("keeps the record type in the token", () => {
    const [complex] = flattenItemSettings(
      INTENT.key,
      intentComplex('{"b":2,"a":1}'),
    );
    expect(JSON.parse(complex!.token!)).toEqual([
      "devicemanagementcomplexsettinginstance",
      { a: 1, b: 2 },
    ]);
  });

  it("compares administrative template list values regardless of their key order", () => {
    const template = (values: unknown[]) => ({
      id: "template-1",
      displayName: "Synthetic template",
      definitionValues: [
        {
          enabled: true,
          definition: { id: "synthetic-definition", displayName: "Synthetic" },
          presentationValues: [
            {
              "@odata.type":
                "#microsoft.graph.groupPolicyPresentationValueList",
              values,
              presentation: { id: "synthetic-presentation", label: "List" },
            },
          ],
        },
      ],
    });
    const token = (values: unknown[]) =>
      flattenItemSettings("administrativeTemplates", template(values))[0]!
        .token;
    expect(token([{ name: "n", value: "v" }])).toBe(
      token([{ value: "v", name: "n" }]),
    );
    expect(token([{ name: "n", value: "v" }])).not.toBe(
      token([{ name: "n", value: "w" }]),
    );
  });

  it("fingerprints a redacted record regardless of its key order", () => {
    setRedactionDigest((content) => `digest:${content}`);
    try {
      const digestOf = (largeIcon: Record<string, unknown>) =>
        new Map(
          redactedDigests(
            sanitizeGraphData({ id: "app-1", largeIcon }) as Record<
              string,
              unknown
            >,
          ),
        ).get("largeIcon");
      const a = digestOf({ type: "image/png", value: "c3ludGhldGlj" });
      expect(a).toBeDefined();
      expect(digestOf({ value: "c3ludGhldGlj", type: "image/png" })).toBe(a);
      expect(digestOf({ type: "image/png", value: "b3RoZXI=" })).not.toBe(a);
    } finally {
      setRedactionDigest(null);
    }
  });
});

describe("round 41: a group the policy also excludes is not an assigned group", () => {
  const include = (groupId: string) => ({
    id: `include-${groupId}`,
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId,
    },
  });
  const exclude = (groupId: string) => ({
    id: `exclude-${groupId}`,
    target: {
      "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget",
      groupId,
    },
  });
  const policy = (id: string, assignments: unknown[]) => ({
    ...catalog(textInstance("x")),
    id,
    assignments,
  });
  const analytics = (...policies: unknown[]) =>
    analyzeConfigurations({
      collectedAt: "2026-10-23T09:00:00Z",
      settingsCatalog: policies,
      deviceConfigurations: [],
      administrativeTemplates: [],
      compliancePolicies: [],
      appProtectionPolicies: [],
      securityBaselines: [],
      scripts: { windows: [], macOS: [] },
      appConfigurations: [],
      windowsUpdatePolicies: [],
      enrollmentConfigurations: [],
      conditionalAccessPolicies: [],
      fetchErrors: [],
    } as unknown as DetailedExportData);
  const groupA = "00000000-0000-4000-8000-00000000000a";
  const groupB = "00000000-0000-4000-8000-00000000000b";

  it("leaves out a group the same policy excludes", () => {
    const result = analytics(
      policy("p1", [include(groupA), exclude(groupA), include(groupB)]),
    );
    expect(result.topGroups).toEqual([[groupB, 1]]);
    expect(result.uniqueGroupsCount).toBe(1);
  });

  it("matches the excluded group id case insensitively", () => {
    const result = analytics(
      policy("p1", [
        include(groupA),
        exclude(groupA.toUpperCase()),
        include(groupB),
      ]),
    );
    expect(result.topGroups).toEqual([[groupB, 1]]);
  });

  it("applies an exclusion to its own policy only", () => {
    const result = analytics(
      policy("p1", [include(groupA), exclude(groupA), include(groupB)]),
      policy("p2", [include(groupA)]),
    );
    expect(result.topGroups).toEqual(
      expect.arrayContaining([
        [groupA, 1],
        [groupB, 1],
      ]),
    );
    expect(result.uniqueGroupsCount).toBe(2);
  });

  it("counts a group once however its id is cased", () => {
    const result = analytics(
      policy("p1", [include(groupA)]),
      policy("p2", [include(groupA.toUpperCase()), include(groupB)]),
    );
    expect(result.topGroups).toEqual([
      [groupA, 2],
      [groupB, 1],
    ]);
    expect(result.uniqueGroupsCount).toBe(2);
  });

  it("still counts groups without exclusions", () => {
    const result = analytics(
      policy("p1", [include(groupA), include(groupB), exclude("other")]),
      policy("p2", [include(groupA)]),
    );
    expect(result.topGroups).toEqual([
      [groupA, 2],
      [groupB, 1],
    ]);
    expect(result.uniqueGroupsCount).toBe(2);
  });
});

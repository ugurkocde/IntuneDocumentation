import { describe, expect, it } from "vitest";
import {
  unreadableOmaValue,
  unreadablePresentationValue,
  unreadableSimpleValue,
} from "../compliance/graph-rows";
import type { ComplianceAssessment } from "../compliance/types";
import type { ConfigurationSectionData } from "../configuration-sections";
import {
  isRedactedValue,
  REDACTED_VALUE,
  sanitizeGraphData,
  setRedactionDigest,
} from "../intune-policy-registry";
import { flattenItemSettings } from "../settings-flatten";
import {
  contentDigest,
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import { compareSettings, projectionSettings } from "../snapshots/reference";

// Round 44 review finding 1. Names, ids and values are synthetic.
// Whether a value is redacted is decided by where it came from: the
// collector replacing a value with its marker, the projection keeping a
// value as one, or a secret setting value type. Text that holds the marker
// among other words, such as a logon message that reads "Replace [Redacted]
// with your alias", is a value like any other and is compared.

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

// The item as the collector hands it over: sanitized, with digests of the
// values it redacted.
function collected(item: unknown): unknown {
  setRedactionDigest(contentDigest);
  try {
    return sanitizeGraphData(item);
  } finally {
    setRedactionDigest(null);
  }
}

const statusOf = (
  at: Family,
  setting: string,
  reference: unknown,
  current: unknown,
) =>
  compareSettings(
    projectionSettings(project(at, collected(reference))),
    projectionSettings(project(at, collected(current))),
  )
    .groups.flatMap((group) => group.rows)
    .find((row) => row.setting === setting)?.status;

const referenceRow = (at: Family, setting: string, item: unknown) =>
  projectionSettings(project(at, collected(item))).settings.find(
    (row) => row.setting === setting,
  );

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

const ALIAS = "Replace [Redacted] with your alias";
const NAME = "Replace [Redacted] with your name";

// --- Families -----------------------------------------------------------------

const CATALOG: Family = {
  key: "settingsCatalog",
  familyKey: "settingsCatalog",
};
const SIMPLE =
  "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance";
const STRING_VALUE =
  "#microsoft.graph.deviceManagementConfigurationStringSettingValue";
const SECRET_VALUE =
  "#microsoft.graph.deviceManagementConfigurationSecretSettingValue";
const MESSAGE_ID = "synthetic_logon_messagetext";
const textInstance = (value: string, id = MESSAGE_ID, type = STRING_VALUE) => ({
  "@odata.type": SIMPLE,
  settingDefinitionId: id,
  simpleSettingValue: { "@odata.type": type, value },
});
const catalog = (...instances: unknown[]) => ({
  id: "catalog-1",
  name: "Synthetic logon policy",
  platforms: "windows10",
  technologies: "mdm",
  assignments: assigned,
  collectionStatus: { settings: "complete", assignments: "complete" },
  settings: instances.map((settingInstance, index) => ({
    id: String(index),
    settingInstance,
  })),
});

const INTENT: Family = {
  key: "securityBaselines",
  familyKey: "securityBaselines",
};
const INTENT_ID = "synthetic_intent_message";
const intentText = (value: string) => ({
  id: "intent-1",
  displayName: "Synthetic intent",
  templateId: "synthetic-template",
  assignments: assigned,
  collectionStatus: { settings: "complete", assignments: "complete" },
  settings: [
    {
      "@odata.type": "#microsoft.graph.deviceManagementStringSettingInstance",
      definitionId: INTENT_ID,
      value,
      valueJson: JSON.stringify(value),
    },
  ],
});

const DEVICE: Family = {
  key: "deviceConfigurations",
  familyKey: "deviceConfigurations",
};
// A URI the compliance engine reads, so its text value is stored.
const READ_URI =
  "./Device/Vendor/MSFT/Policy/Config/Defender/AllowRealtimeMonitoring";
const custom = (...omaSettings: unknown[]) => ({
  "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
  id: "device-oma",
  displayName: "Synthetic custom profile",
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
  omaSettings,
});
const omaText = (value: string) =>
  custom({
    "@odata.type": "#microsoft.graph.omaSettingString",
    displayName: "Synthetic value",
    omaUri: READ_URI,
    isEncrypted: false,
    value,
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

const TEMPLATE: Family = {
  key: "administrativeTemplates",
  familyKey: "administrativeTemplates",
};
const template = (presentationValue: Record<string, unknown>) => ({
  id: "template-1",
  displayName: "Synthetic template",
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
  definitionValues: [
    {
      id: "value-1",
      enabled: true,
      definition: {
        id: "synthetic-definition",
        displayName: "Synthetic banner",
        categoryPath: "\\Synthetic",
      },
      presentationValues: [presentationValue],
    },
  ],
});
const templateText = (value: string, label = "Banner text") =>
  template({
    "@odata.type": "#microsoft.graph.groupPolicyPresentationValueText",
    value,
    presentation: { id: "presentation-text", label },
  });
const templateLines = (values: string[]) =>
  template({
    "@odata.type": "#microsoft.graph.groupPolicyPresentationValueMultiText",
    values,
    presentation: { id: "presentation-lines", label: "Banner lines" },
  });
const TEMPLATE_SETTING = "Synthetic / synthetic-definition";

const FAMILIES: Array<{
  label: string;
  at: Family;
  setting: string;
  item: (value: string) => unknown;
}> = [
  {
    label: "a Settings Catalog text value",
    at: CATALOG,
    setting: MESSAGE_ID,
    item: (value) => catalog(textInstance(value)),
  },
  {
    label: "an intent text value",
    at: INTENT,
    setting: INTENT_ID,
    item: intentText,
  },
  {
    label: "a custom OMA-URI text value",
    at: DEVICE,
    setting: READ_URI,
    item: omaText,
  },
  {
    label: "a compliance text property",
    at: COMPLIANCE,
    setting: "osMinimumVersion",
    item: complianceText,
  },
  {
    label: "an administrative template text value",
    at: TEMPLATE,
    setting: TEMPLATE_SETTING,
    item: (value) => templateText(value),
  },
  {
    label: "an administrative template line",
    at: TEMPLATE,
    setting: TEMPLATE_SETTING,
    item: (value) => templateLines(["Line one", value]),
  },
];

describe("round 44: text holding the redaction marker is a value", () => {
  for (const { label, at, setting, item } of FAMILIES) {
    it(`compares ${label} that holds the marker among other words`, () => {
      const row = referenceRow(at, setting, item(ALIAS));
      expect(row?.redacted).toBeUndefined();
      expect(row?.value).toContain(ALIAS);
      expect(statusOf(at, setting, item(ALIAS), item(ALIAS))).toBe("matching");
      expect(statusOf(at, setting, item(ALIAS), item(NAME))).toBe("different");
    });

    it(`still compares ${label} without the marker`, () => {
      expect(statusOf(at, setting, item("Hello"), item("Hello"))).toBe(
        "matching",
      );
      expect(statusOf(at, setting, item("Hello"), item("Bye"))).toBe(
        "different",
      );
    });
  }

  it("does not flag the flattened rows of such text as redacted", () => {
    const rows = [
      ...flattenItemSettings(CATALOG.key, catalog(textInstance(ALIAS))),
      ...flattenItemSettings(INTENT.key, intentText(ALIAS)),
      ...flattenItemSettings(DEVICE.key, omaText(ALIAS)),
      ...flattenItemSettings(COMPLIANCE.key, complianceText(ALIAS)),
      ...flattenItemSettings(TEMPLATE.key, templateText(ALIAS)),
      ...flattenItemSettings("deviceConfigurations", {
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
        lockScreenMessage: ALIAS,
        nested: { message: ALIAS, lines: ["One", REDACTED_VALUE] },
      }),
    ].filter((row) => row.value.includes(ALIAS) || row.value.includes("One"));
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const row of rows) expect(row.redacted, row.name).toBeUndefined();
  });

  it("reads a list holding the marker among other lines as readable", () => {
    expect(isRedactedValue(["Line one", REDACTED_VALUE])).toBe(false);
    expect(
      unreadablePresentationValue({
        "@odata.type": "#microsoft.graph.groupPolicyPresentationValueMultiText",
        values: [1, REDACTED_VALUE],
      }),
    ).toBe(true);
  });
});

describe("round 44: values the collector or projection redacted stay not comparable", () => {
  it("reads the collector's markers only in the form it writes them", () => {
    expect(isRedactedValue(REDACTED_VALUE)).toBe(true);
    expect(isRedactedValue([REDACTED_VALUE])).toBe(true);
    expect(isRedactedValue(ALIAS)).toBe(false);
    expect(isRedactedValue([REDACTED_VALUE, REDACTED_VALUE])).toBe(false);
    expect(isRedactedValue([])).toBe(false);
    expect(isRedactedValue(null)).toBe(false);
  });

  it("keeps a Settings Catalog value the collector redacted not comparable", () => {
    const secret = (value: string) =>
      catalog(textInstance(value, "synthetic_wifi_password"));
    expect(
      (collected(secret("Synthetic-1")) as any).settings[0].settingInstance
        .simpleSettingValue.value,
    ).toBe(REDACTED_VALUE);
    expect(
      referenceRow(CATALOG, "synthetic_wifi_password", secret("Synthetic-1")),
    ).toMatchObject({ redacted: true });
    expect(
      referenceRow(CATALOG, "synthetic_wifi_password", secret("Synthetic-1"))
        ?.value,
    ).toBeUndefined();
    for (const [from, to] of [
      ["Synthetic-1", "Synthetic-1"],
      ["Synthetic-1", "Synthetic-2"],
    ])
      expect(
        statusOf(
          CATALOG,
          "synthetic_wifi_password",
          secret(from!),
          secret(to!),
        ),
      ).toBe("notComparable");
    const [row] = flattenItemSettings(CATALOG.key, collected(secret("x")));
    expect(row).toMatchObject({ value: REDACTED_VALUE, redacted: true });
  });

  it("keeps a secret setting value not comparable", () => {
    const secret = (value: string) =>
      catalog(textInstance(value, "synthetic_shared_value", SECRET_VALUE));
    expect(
      referenceRow(CATALOG, "synthetic_shared_value", secret("Synthetic-1")),
    ).toMatchObject({ redacted: true });
    expect(
      statusOf(
        CATALOG,
        "synthetic_shared_value",
        secret("Synthetic-1"),
        secret("Synthetic-2"),
      ),
    ).toBe("notComparable");
    expect(
      unreadableSimpleValue({ "@odata.type": SECRET_VALUE, value: ALIAS }),
    ).toBe(false);
  });

  it("keeps a custom OMA-URI value the collector redacted not comparable", () => {
    const secret = (value: string) =>
      custom({
        "@odata.type": "#microsoft.graph.omaSettingString",
        displayName: "Synthetic value",
        omaUri: `${READ_URI}/password`,
        isEncrypted: false,
        value,
      });
    expect(
      unreadableOmaValue({
        "@odata.type": "#microsoft.graph.omaSettingInteger",
        value: REDACTED_VALUE,
      }),
    ).toBe(false);
    expect(
      statusOf(DEVICE, `${READ_URI}/password`, secret("a"), secret("b")),
    ).toBe("notComparable");
    const [row] = flattenItemSettings(DEVICE.key, collected(secret("x")));
    expect(row).toMatchObject({ value: REDACTED_VALUE, redacted: true });
  });

  it("keeps an encrypted custom OMA-URI value not comparable", () => {
    const encrypted = (value: string) =>
      custom({
        "@odata.type": "#microsoft.graph.omaSettingString",
        displayName: "Synthetic encrypted",
        omaUri: READ_URI,
        isEncrypted: true,
        value,
      });
    expect(referenceRow(DEVICE, READ_URI, encrypted("a"))).toMatchObject({
      redacted: true,
    });
    expect(statusOf(DEVICE, READ_URI, encrypted("a"), encrypted("b"))).toBe(
      "notComparable",
    );
  });

  it("keeps an administrative template value the collector redacted not comparable", () => {
    const secret = (value: string) => templateText(value, "Proxy password");
    expect(referenceRow(TEMPLATE, TEMPLATE_SETTING, secret("a"))).toMatchObject(
      { redacted: true },
    );
    expect(statusOf(TEMPLATE, TEMPLATE_SETTING, secret("a"), secret("b"))).toBe(
      "notComparable",
    );
  });

  it("keeps the pairs of a list the projection redacted not comparable", () => {
    const list = (value: string) =>
      template({
        "@odata.type": "#microsoft.graph.groupPolicyPresentationValueList",
        values: [{ name: "site", value }],
        presentation: { id: "presentation-list", label: "Sites" },
      });
    expect(referenceRow(TEMPLATE, TEMPLATE_SETTING, list("1"))).toMatchObject({
      redacted: true,
    });
    expect(statusOf(TEMPLATE, TEMPLATE_SETTING, list("1"), list("2"))).toBe(
      "notComparable",
    );
  });

  it("flags a property the collector redacted, nested or not, in the flattened rows", () => {
    const rows = flattenItemSettings(
      "deviceConfigurations",
      collected({
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
        preSharedKey: "Synthetic-1",
        wifi: { ssid: "Synthetic", preSharedKey: "Synthetic-2" },
      }),
    );
    const key = rows.find((row) => row.definitionId === "preSharedKey");
    expect(key).toMatchObject({ value: REDACTED_VALUE, redacted: true });
    const wifi = rows.find((row) => row.definitionId === "wifi");
    expect(wifi?.redacted).toBe(true);
    expect(wifi?.value).toContain(REDACTED_VALUE);
    expect(wifi?.value).toContain("Synthetic");
    expect(
      flattenItemSettings(
        "settingsCatalog",
        collected({ settingInstance: textInstance("x"), password: "y" }),
      ).find((row) => row.definitionId === "password"),
    ).toMatchObject({ value: REDACTED_VALUE, redacted: true });
  });
});

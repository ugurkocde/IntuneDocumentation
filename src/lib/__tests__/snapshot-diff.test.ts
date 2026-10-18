import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { labCollectionSections } from "../../../apps/desktop/src/main/__fixtures__/lab-collection";
import type { DetailedExportData } from "~/lib/configuration-analyzer";
import type { ConfigurationSectionData } from "~/lib/configuration-sections";
import { CONTOSO_TENANT } from "~/lib/compliance/demo/contoso-tenant";
import { assessCompliance } from "~/lib/compliance/engine";
import {
  capControlChanges,
  capSnapshotDiff,
  definitionLabels,
  diffAssessments,
  labelControlChanges,
  diffSnapshots,
  type PolicyChange,
} from "~/lib/snapshots/diff";
import {
  projectSnapshot,
  type SnapshotProjection,
  type StoredAssessment,
} from "~/lib/snapshots/projection";

type Item = Record<string, any>;

function section(key: string, items: unknown[], familyKey = key, label = key) {
  return {
    key,
    familyKey,
    label,
    selectionPrefix: key,
    items,
  } as ConfigurationSectionData;
}

function collection(
  sections: ConfigurationSectionData[],
  extra: Partial<DetailedExportData> = {},
): DetailedExportData {
  return {
    collectedAt: "2026-10-18T10:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    sections,
    fetchErrors: [],
    ...extra,
  };
}

function contoso(): DetailedExportData {
  const data = structuredClone({ ...CONTOSO_TENANT, groupNames: undefined });
  return collection(
    [
      section(
        "settingsCatalog",
        data.settingsCatalog,
        "settingsCatalog",
        "Settings Catalog",
      ),
      section("deviceConfigurations", data.deviceConfigurations),
      section("compliancePolicies", data.compliancePolicies),
      section("appProtectionPolicies", data.appProtectionPolicies ?? []),
      section("windowsUpdatePolicies", data.windowsUpdatePolicies ?? []),
      section(
        "conditionalAccessPolicies",
        data.conditionalAccessPolicies ?? [],
      ),
    ],
    { collectedAt: data.collectedAt },
  );
}

function lab(): DetailedExportData {
  return collection(
    structuredClone(labCollectionSections()).map((entry) =>
      section(entry.key, entry.items, entry.familyKey, entry.label),
    ),
  );
}

const groupNames = new Map(
  [...(CONTOSO_TENANT.groupNames ?? new Map())].map(([id, name]) => [id, name]),
);

// Keyed like the store's fingerprints.
const fingerprint = (digest: string) =>
  createHmac("sha256", "test key").update(digest).digest("hex").slice(0, 32);

function snap(data: DetailedExportData): SnapshotProjection {
  // Through JSON, as the store keeps it.
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(data, assessCompliance(data), groupNames, fingerprint),
    ),
  );
}

function items(data: DetailedExportData, key: string): Item[] {
  return data.sections!.find((entry) => entry.key === key)!.items as Item[];
}

function policy(changes: PolicyChange[], name: string): PolicyChange {
  const found = changes.find((change) => change.displayName === name);
  if (!found) throw new Error(`No change for ${name}`);
  return found;
}

function findInstance(node: unknown, id: string): Item | undefined {
  if (!node || typeof node !== "object") return undefined;
  if ((node as Item).settingDefinitionId === id) return node as Item;
  for (const value of Object.values(node as Item)) {
    const found = findInstance(value, id);
    if (found) return found;
  }
  return undefined;
}

describe("diffSnapshots", () => {
  it("finds nothing between two snapshots of an unchanged lab tenant", () => {
    const diff = diffSnapshots(snap(lab()), snap(lab()));
    expect(diff.policies).toEqual([]);
    expect(diff.notCompared).toEqual([]);
    expect(diff.totals).toMatchObject({ added: 0, removed: 0, changed: 0 });
  });

  it("matches lab items by id, also when names repeat", () => {
    const before = lab();
    const after = lab();
    // The five Microsoft default enrollment configurations share one name.
    const enrollment = items(after, "enrollmentConfigurations");
    enrollment[1]!.priority = 7;
    items(after, "mobileApps").splice(3, 1);
    items(after, "settingsCatalog").push({
      id: "catalog-new",
      name: "New policy",
    });
    items(after, "roleScopeTags")[4]!.displayName = "Renamed tag";
    const diff = diffSnapshots(snap(before), snap(after));
    expect(diff.totals).toMatchObject({
      added: 1,
      removed: 1,
      renamed: 1,
      changed: 1,
    });
    const priority = diff.policies.find(
      (change) => change.id === enrollment[1]!.id,
    )!;
    expect(priority.kind).toBe("changed");
    expect(priority.settings).toEqual([
      expect.objectContaining({
        definitionId: "priority",
        before: "0",
        after: "7",
      }),
    ]);
    expect(
      diff.policies.find((change) => change.kind === "removed"),
    ).toMatchObject({
      sectionKey: "mobileApps",
      id: "app-3",
    });
    expect(
      diff.policies.find((change) => change.kind === "added"),
    ).toMatchObject({
      sectionKey: "settingsCatalog",
      displayName: "New policy",
    });
  });

  it("reports a setting value change with readable names", () => {
    const before = contoso();
    const after = contoso();
    const bitlocker = items(after, "settingsCatalog").find(
      (item) => item.name === "WIN - Baseline - BitLocker",
    )!;
    const id = "device_vendor_msft_bitlocker_requiredeviceencryption";
    findInstance(bitlocker.settings, id)!.choiceSettingValue.value = `${id}_0`;
    const diff = diffSnapshots(snap(before), snap(after));
    const change = policy(diff.policies, "WIN - Baseline - BitLocker");
    expect(change.kind).toBe("changed");
    expect(change.settings).toEqual([
      expect.objectContaining({
        definitionId: id,
        name: "Require Device Encryption",
        change: "changed",
        before: "Enabled",
      }),
    ]);
    expect(change.settings[0]!.after).not.toBe("Enabled");
  });

  it("ignores volatile fields", () => {
    const before = contoso();
    const after = contoso();
    for (const item of items(after, "settingsCatalog")) {
      item.lastModifiedDateTime = "2026-10-18T09:00:00Z";
      item.settingCount = 99;
    }
    for (const item of items(after, "deviceConfigurations")) item.version = 42;
    expect(diffSnapshots(snap(before), snap(after)).policies).toEqual([]);
  });

  it("treats a recreated policy as removed plus added", () => {
    const before = contoso();
    const after = contoso();
    items(after, "compliancePolicies")[0]!.id = "recreated-id";
    const diff = diffSnapshots(snap(before), snap(after));
    const name = items(after, "compliancePolicies")[0]!.displayName;
    expect(
      diff.policies
        .filter((change) => change.displayName === name)
        .map((change) => change.kind)
        .sort(),
    ).toEqual(["added", "removed"]);
  });

  it("reports renames without settings changes", () => {
    const before = contoso();
    const after = contoso();
    const item = items(after, "deviceConfigurations")[0]!;
    const old = item.displayName;
    item.displayName = "WIN - Renamed";
    const change = policy(
      diffSnapshots(snap(before), snap(after)).policies,
      "WIN - Renamed",
    );
    expect(change).toMatchObject({
      kind: "changed",
      previousName: old,
      settings: [],
      assignments: [],
    });
  });

  it("reports assignment changes with group names and filters", () => {
    const before = contoso();
    const after = contoso();
    const item = items(after, "settingsCatalog")[0]!;
    const [first, ...rest] = item.assignments;
    item.assignments = [
      ...rest,
      {
        target: {
          "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
          deviceAndAppManagementAssignmentFilterId: "filter-1",
          deviceAndAppManagementAssignmentFilterType: "include",
        },
      },
    ];
    const change = policy(
      diffSnapshots(snap(before), snap(after)).policies,
      item.name,
    );
    expect(change.assignments).toEqual([
      { change: "added", label: "All devices, filter include filter-1" },
      {
        change: "removed",
        label: `Group ${groupNames.get(first.target.groupId)}`,
      },
    ]);
  });

  it("keeps repeated settings apart by occurrence", () => {
    const rule = (name: string) => ({
      settingDefinitionId: "fw_rule_name",
      "@odata.type":
        "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
      simpleSettingValue: { value: name },
    });
    const firewall = (names: string[]) => ({
      id: "fw-1",
      name: "Firewall rules",
      settings: [
        {
          settingInstance: {
            settingDefinitionId: "fw_rules",
            groupSettingCollectionValue: names.map((name) => ({
              children: [rule(name)],
            })),
          },
        },
      ],
    });
    const diff = diffSnapshots(
      snap(collection([section("settingsCatalog", [firewall(["A", "B"])])])),
      snap(
        collection([section("settingsCatalog", [firewall(["A", "C", "D"])])]),
      ),
    );
    const settings = diff.policies[0]!.settings;
    expect(settings.map((row) => [row.change, row.before, row.after])).toEqual([
      ["changed", "B", "C"],
      ["added", null, "D"],
    ]);
  });

  it("does not compare failed, skipped or missing families", () => {
    const before = contoso();
    const after = contoso();
    items(after, "settingsCatalog").splice(0);
    after.fetchErrors = [
      {
        policyId: "N/A",
        policyName: "Settings Catalog",
        policyType: "Settings Catalog",
        familyKey: "settingsCatalog",
        error: "Service unavailable",
      },
    ];
    after.collectionSkippedFamilies = ["conditionalAccessPolicies"];
    after.sections = after.sections!.filter(
      (entry) => entry.key !== "appProtectionPolicies",
    );
    const diff = diffSnapshots(snap(before), snap(after));
    expect(diff.policies).toEqual([]);
    expect(diff.notCompared).toEqual([
      {
        sectionKey: "settingsCatalog",
        label: "Settings Catalog",
        reason: "failed",
        side: "to",
      },
      {
        sectionKey: "conditionalAccessPolicies",
        label: "conditionalAccessPolicies",
        reason: "skipped",
        side: "to",
      },
      {
        sectionKey: "appProtectionPolicies",
        label: "appProtectionPolicies",
        reason: "missing",
        side: "to",
      },
    ]);
    expect(diff.totals.notComparedFamilies).toBe(3);
  });

  it("lists incomplete policies as not compared", () => {
    const before = contoso();
    const after = contoso();
    const item = items(after, "deviceConfigurations")[0]!;
    item.hasFetchError = true;
    item.displayName = "Changed name";
    const diff = diffSnapshots(snap(before), snap(after));
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems).toEqual([
      expect.objectContaining({
        sectionKey: "deviceConfigurations",
        displayName: "Changed name",
      }),
    ]);
  });

  it("reports script content changes without the content", () => {
    const script = (content: string) =>
      collection([
        section(
          "windowsScripts",
          [{ id: "s1", displayName: "Script", scriptContent: content }],
          "scripts",
        ),
      ]);
    const diff = diffSnapshots(
      snap(script("Write-Host 1")),
      snap(script("Write-Host 2")),
    );
    expect(diff.policies[0]!.settings).toEqual([
      expect.objectContaining({
        name: "Script content",
        change: "changed",
        before: null,
        after: null,
        notStored: true,
      }),
    ]);
    expect(JSON.stringify(diff)).not.toContain("Write-Host");
  });

  it("reports a rotated secret or dropped OMA-URI value without the value", () => {
    const secrets = (key: string, token: string) =>
      collection([
        section("settingsCatalog", [
          {
            id: "wifi",
            name: "Wi-Fi",
            settings: [
              {
                id: "0",
                settingInstance: {
                  "@odata.type":
                    "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                  settingDefinitionId: "vendor_msft_wifi_presharedkey",
                  simpleSettingValue: {
                    "@odata.type":
                      "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
                    value: key,
                  },
                },
                settingDefinitions: [
                  { id: "vendor_msft_wifi_presharedkey", displayName: "Pre-shared key" },
                ],
              },
            ],
          },
        ]),
        section("deviceConfigurations", [
          {
            id: "custom",
            "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
            displayName: "Custom",
            omaSettings: [
              {
                "@odata.type": "#microsoft.graph.omaSettingString",
                omaUri: "./Vendor/MSFT/Custom/Token",
                displayName: "Token",
                value: token,
              },
            ],
          },
        ]),
      ]);
    const same = diffSnapshots(
      snap(secrets("key-1", "token-1")),
      snap(secrets("key-1", "token-1")),
    );
    expect(same.policies).toEqual([]);
    const diff = diffSnapshots(
      snap(secrets("key-1", "token-1")),
      snap(secrets("key-2", "token-2")),
    );
    expect(diff.policies.flatMap((policy) => policy.settings)).toEqual([
      expect.objectContaining({
        name: "Pre-shared key",
        definitionId: "vendor_msft_wifi_presharedkey",
        change: "changed",
        before: null,
        after: null,
        notStored: true,
        valueNotStored: true,
      }),
      expect.objectContaining({
        name: "Token",
        definitionId: "./Vendor/MSFT/Custom/Token",
        change: "changed",
        before: null,
        after: null,
        notStored: true,
        valueNotStored: true,
      }),
    ]);
    const text = JSON.stringify(diff);
    for (const secret of ["key-1", "key-2", "token-1", "token-2"])
      expect(text).not.toContain(secret);
  });

  it("caps rows and values but keeps the totals", () => {
    const many = (value: string) =>
      collection([
        section(
          "settingsCatalog",
          Array.from({ length: 5 }, (_, index) => ({
            id: `p${index}`,
            name: `Policy ${index}`,
            settings: Array.from({ length: 4 }, (_, row) => ({
              settingInstance: {
                settingDefinitionId: `setting_${row}`,
                simpleSettingValue: { value: `${value}${"x".repeat(50)}` },
              },
            })),
          })),
        ),
      ]);
    const diff = diffSnapshots(snap(many("a")), snap(many("b")));
    const capped = capSnapshotDiff(diff, {
      maxPolicies: 2,
      maxSettingsPerPolicy: 3,
      maxAssignmentsPerPolicy: 1,
      maxValueLength: 10,
      maxNotComparedItems: 1,
      maxIdentityChanges: 1,
    });
    expect(capped.totals).toEqual(diff.totals);
    expect(capped.totals.settingChanges).toBe(20);
    expect(capped.policies).toHaveLength(2);
    expect(capped.policies[0]!.settings).toHaveLength(3);
    expect(capped.policies[0]!.settingsTotal).toBe(4);
    expect(capped.policies[0]!.settings[0]!.after).toBe("bxxxxxxxxx...");
  });
});

function stored(overrides: Partial<StoredAssessment> = {}): StoredAssessment {
  return { ...snap(contoso()).assessment, ...overrides };
}

describe("diffAssessments", () => {
  it("finds no changes between identical assessments", () => {
    const diff = diffAssessments(stored(), stored());
    expect(diff.rulesetChanged).toBe(false);
    expect(
      diff.frameworks.every((framework) => framework.changes.length === 0),
    ).toBe(true);
  });

  it("explains control status changes with capability evidence", () => {
    const before = contoso();
    const after = contoso();
    // Without any Settings Catalog policy several controls lose evidence.
    items(after, "settingsCatalog").splice(0);
    const diff = diffAssessments(
      snap(before).assessment,
      snap(after).assessment,
    );
    const changes = diff.frameworks.flatMap((framework) => framework.changes);
    expect(changes.length).toBeGreaterThan(0);
    const change = changes.find((entry) =>
      entry.causes.some((cause) =>
        cause.evidenceRemoved.some(
          (ref) => ref.policyName === "WIN - Browser - Edge and IE hardening",
        ),
      ),
    );
    expect(change).toBeDefined();
    expect(change!.before).not.toBe(change!.after);
    expect(change!.mappingChanged).toBe(false);
    const cause = change!.causes.find((entry) => entry.evidenceRemoved.length)!;
    expect(cause.before).not.toBe(cause.after);
  });

  it("flags a ruleset change and a changed control mapping", () => {
    const before = stored();
    const after = structuredClone(stored({ rulesetVersion: "2099.1.1" }));
    const framework = after.frameworks[0]!;
    const control = framework.controls.find(
      (entry) => entry.capabilityIds.length > 0,
    )!;
    control.capabilityIds = [];
    control.status =
      control.status === "notAssessed" ? "noEvidence" : "notAssessed";
    const diff = diffAssessments(before, after);
    expect(diff).toMatchObject({
      rulesetChanged: true,
      fromRuleset: before.rulesetVersion,
      toRuleset: "2099.1.1",
    });
    const change = diff.frameworks[0]!.changes.find(
      (entry) => entry.controlId === control.id,
    )!;
    expect(change.mappingChanged).toBe(true);
    expect(change.causes).toEqual([]);
  });

  it("reports controls mapped on one side only", () => {
    const before = stored();
    const after = structuredClone(stored());
    const removed = after.frameworks[0]!.controls.pop()!;
    const diff = diffAssessments(before, after);
    expect(diff.frameworks[0]!.changes).toEqual([
      expect.objectContaining({
        controlId: removed.id,
        before: removed.status,
        after: null,
      }),
    ]);
  });

  it("keeps several checks and evidence entries of one setting apart", () => {
    const check = (actualValue: string, result: "matches" | "different" = "different") => ({
      settingId: "firewall_rule_action",
      policyId: "policy-1",
      policyName: "Firewall",
      assessmentStatus: "checked" as const,
      result,
      actualValue,
    });
    const evidence = {
      policyId: "policy-1",
      policyName: "Firewall",
      settingId: "firewall_rule_action",
      observedValue: "block",
      verdict: "enforced" as const,
      assignment: "assigned" as const,
    };
    const assessment = (
      status: "evidenceFound" | "partialEvidence",
      checks: ReturnType<typeof check>[],
      evidenceCount: number,
    ): StoredAssessment => ({
      rulesetVersion: "2026.10.4",
      generatedAt: "2026-10-18T10:00:00Z",
      scope: {},
      capabilities: [
        {
          id: "cap-1",
          name: "Firewall rules",
          platform: "windows",
          status: status === "evidenceFound" ? "enforced" : "partialConfiguration",
          evidence: Array.from({ length: evidenceCount }, () => ({ ...evidence })),
          checks,
        },
      ] as StoredAssessment["capabilities"],
      frameworks: [
        {
          id: "fw",
          name: "Framework",
          version: "1",
          summary: {} as StoredAssessment["frameworks"][number]["summary"],
          controls: [{ id: "c1", title: "Control", status, capabilityIds: ["cap-1"] }],
        },
      ] as StoredAssessment["frameworks"],
    });
    // Reordered checks and the same evidence: nothing changed.
    const same = diffAssessments(
      assessment("evidenceFound", [check("allow"), check("block")], 2),
      assessment("partialEvidence", [check("block"), check("allow")], 2),
    );
    expect(same.frameworks[0]!.changes[0]!.causes[0]).toMatchObject({
      evidenceAdded: [],
      evidenceRemoved: [],
      checksChanged: [],
    });
    // One of two checks changed, and one of two identical evidence entries went.
    const diff = diffAssessments(
      assessment("evidenceFound", [check("allow"), check("block")], 2),
      assessment("partialEvidence", [check("allow"), check("audit")], 1),
    );
    const cause = diff.frameworks[0]!.changes[0]!.causes[0]!;
    expect(cause.checksChanged).toEqual([
      expect.objectContaining({ beforeValue: "block", afterValue: "audit" }),
    ]);
    expect(cause.evidenceRemoved).toHaveLength(1);
    expect(cause.evidenceAdded).toEqual([]);
  });

  it("caps causes and values", () => {
    const before = contoso();
    const after = contoso();
    items(after, "settingsCatalog").splice(0);
    const changes = diffAssessments(
      snap(before).assessment,
      snap(after).assessment,
    ).frameworks.flatMap((framework) => framework.changes);
    const capped = capControlChanges(changes, {
      maxControls: 1,
      maxCauses: 1,
      maxRowsPerCause: 1,
      maxValueLength: 5,
    });
    expect(capped).toHaveLength(1);
    expect(capped[0]!.causes.length).toBeLessThanOrEqual(1);
    for (const cause of capped[0]!.causes)
      for (const ref of cause.evidenceRemoved)
        expect(ref.observedValue.length).toBeLessThanOrEqual(8);
  });
});

describe("readable names for control evidence", () => {
  const BITLOCKER = "device_vendor_msft_bitlocker_requiredeviceencryption";

  function withDefinitions(): DetailedExportData {
    const data = contoso();
    const policy = items(data, "settingsCatalog").find((item) =>
      JSON.stringify(item).includes(BITLOCKER),
    )!;
    for (const setting of policy.settings as Item[]) {
      if (setting.settingInstance?.settingDefinitionId !== BITLOCKER) continue;
      setting.settingDefinitions = [
        {
          id: BITLOCKER,
          displayName: "Require Device Encryption (stored)",
          options: [
            { itemId: `${BITLOCKER}_0`, displayName: "Disabled (stored)" },
            { itemId: `${BITLOCKER}_1`, name: "Enabled (stored)" },
          ],
        },
      ];
    }
    return data;
  }

  it("collects setting and option names from the stored definitions", () => {
    const labels = definitionLabels(snap(withDefinitions()));
    expect(labels.settings.get(BITLOCKER)).toBe("Require Device Encryption (stored)");
    expect(labels.options.get(`${BITLOCKER}_1`)).toBe("Enabled (stored)");
  });

  it("labels evidence lines of control changes and keeps the raw values", () => {
    const ref = (settingId: string, observedValue: string) => ({
      policyName: "WIN - Baseline - BitLocker",
      settingId,
      observedValue,
      verdict: "enforced" as const,
      assignment: "assigned" as const,
    });
    const changes = [
      {
        controlId: "SC-28",
        title: "Protection of information at rest",
        before: "noEvidence" as const,
        after: "evidenceFound" as const,
        mappingChanged: false,
        causes: [
          {
            capabilityId: "windows-disk-encryption",
            name: "BitLocker",
            before: "noEvidence" as const,
            after: "enforced" as const,
            evidenceAdded: [ref(BITLOCKER, `${BITLOCKER}_1`), ref("unknown_setting", "unknown_setting_1")],
            evidenceRemoved: [ref(BITLOCKER, `${BITLOCKER}_0`)],
            checksChanged: [],
          },
        ],
      },
    ];
    const labelled = labelControlChanges(changes, definitionLabels(snap(withDefinitions())));
    const cause = labelled[0]!.causes[0]!;
    expect(cause.evidenceAdded[0]).toMatchObject({
      settingName: "Require Device Encryption (stored)",
      valueLabel: "Enabled (stored)",
      observedValue: `${BITLOCKER}_1`,
    });
    expect(cause.evidenceRemoved[0]).toMatchObject({ valueLabel: "Disabled (stored)" });
    const refs = [...cause.evidenceAdded, ...cause.evidenceRemoved];
    // Unknown ids stay unlabelled.
    expect(refs.some((entry) => entry.settingId !== BITLOCKER && entry.valueLabel)).toBe(false);
  });
});


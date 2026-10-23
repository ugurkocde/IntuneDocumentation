import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "~/lib/configuration-analyzer";
import type { ConfigurationSectionData } from "~/lib/configuration-sections";
import { CONTOSO_TENANT } from "~/lib/compliance/demo/contoso-tenant";
import { assessCompliance } from "~/lib/compliance/engine";
import { sha256 } from "~/lib/compliance/manifest";
import {
  projectSnapshot,
  type SnapshotProjection,
} from "~/lib/snapshots/projection";
import {
  capComparison,
  compareSettings,
  createReference,
  encodeReference,
  GENERAL_PLATFORM,
  parseReference,
  platformOf,
  projectionSettings,
  REFERENCE_MAX_BYTES,
  REFERENCE_MAX_VALUE,
  REFERENCE_SCHEMA,
  REFERENCE_TOO_LARGE,
  referenceFileName,
  referenceSettings,
  serializeReference,
  type ReferenceFile,
  type SettingSet,
} from "~/lib/snapshots/reference";

type Item = Record<string, any>;

function section(key: string, items: unknown[], label = key): ConfigurationSectionData {
  return { key, familyKey: key, label, selectionPrefix: key, items } as ConfigurationSectionData;
}

function collection(sections: ConfigurationSectionData[], extra: Partial<DetailedExportData> = {}): DetailedExportData {
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

function contoso(edit?: (data: DetailedExportData) => void): DetailedExportData {
  const data = structuredClone({ ...CONTOSO_TENANT, groupNames: undefined }) as DetailedExportData;
  edit?.(data);
  return collection(
    [
      section("settingsCatalog", data.settingsCatalog, "Settings Catalog"),
      section("deviceConfigurations", data.deviceConfigurations, "Device configurations"),
      section("compliancePolicies", data.compliancePolicies, "Compliance policies"),
      section("conditionalAccessPolicies", data.conditionalAccessPolicies ?? [], "Conditional Access"),
    ],
    { collectedAt: data.collectedAt },
  );
}

function snap(data: DetailedExportData): SnapshotProjection {
  return JSON.parse(JSON.stringify(projectSnapshot(data, assessCompliance(data), new Map())));
}

async function reference(data = contoso()): Promise<ReferenceFile> {
  return createReference(snap(data), { createdAt: "2026-10-18T10:00:00.000Z", sourceLabel: "11111111..." });
}

async function resign(file: Record<string, unknown>): Promise<string> {
  const body = { ...file };
  delete body.checksum;
  return JSON.stringify({ ...body, checksum: { algorithm: "sha-256", value: await sha256(body) } });
}

const SECRET_CATALOG = {
  id: "secret-policy",
  name: "WIN - Wi-Fi with secrets",
  platforms: "windows10",
  settings: [
    {
      id: "0",
      settingInstance: {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
        settingDefinitionId: "device_vendor_msft_wifi_profile_presharedkey",
        simpleSettingValue: {
          "@odata.type": "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
          value: "CanaryPreSharedKey-1",
          valueState: "notEncrypted",
        },
      },
    },
    {
      id: "1",
      settingInstance: {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
        settingDefinitionId: "device_vendor_msft_wifi_profile_ssid",
        simpleSettingValue: {
          "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
          value: "CONTOSO-CORP",
        },
      },
    },
  ],
};

const SECRET_OMA = {
  id: "oma-policy",
  displayName: "WIN - Custom VPN",
  "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
  omaSettings: [
    {
      "@odata.type": "#microsoft.graph.omaSettingString",
      displayName: "VPN shared secret",
      omaUri: "./Vendor/MSFT/VPNv2/Corp/Custom",
      value: "CanaryOmaSecret-2",
    },
  ],
};

const SCRIPT = {
  id: "script-1",
  displayName: "Install agent",
  fileName: "install.ps1",
  scriptContent: "Write-Host CanaryScriptBody-3",
};

function withSecrets(data: DetailedExportData): DetailedExportData {
  return collection([
    ...data.sections!,
    section("windowsScripts", [SCRIPT], "Windows scripts"),
    section("customProfiles", [SECRET_OMA], "Custom profiles"),
    section("secretCatalog", [SECRET_CATALOG], "Secret catalog"),
  ]);
}

describe("reference file", () => {
  it("round trips through strict parsing", async () => {
    const file = await reference();
    expect(file.schema).toBe(REFERENCE_SCHEMA);
    expect(file.source).toEqual({ label: "11111111..." });
    expect(file.settings.length).toBeGreaterThan(50);
    const parsed = await parseReference(serializeReference(file));
    expect(parsed).toEqual({ ok: true, file });
    // A byte order mark from an editor is accepted.
    expect((await parseReference(`﻿${serializeReference(file)}`)).ok).toBe(true);
  });

  it("keeps a settings only projection: no assignments, ids or tenant data", async () => {
    const file = await reference();
    const text = serializeReference(file);
    for (const entry of file.settings) {
      expect(Object.keys(entry).every((key) => ["platform", "family", "setting", "name", "path", "value", "sha256", "token", "redacted", "group", "policy"].includes(key))).toBe(true);
    }
    expect(text).not.toContain("assignments");
    expect(text).not.toContain("groupId");
    const ids = CONTOSO_TENANT.settingsCatalog.map((policy: Item) => policy.id as string);
    for (const id of ids) expect(text).not.toContain(`"${id}"`);
  });

  it("never contains secrets or script bodies and marks redacted values", async () => {
    const file = await reference(withSecrets(contoso()));
    const text = serializeReference(file);
    for (const canary of ["CanaryPreSharedKey-1", "CanaryOmaSecret-2", "CanaryScriptBody-3"]) {
      expect(text).not.toContain(canary);
    }
    const psk = file.settings.find((entry) => entry.setting === "device_vendor_msft_wifi_profile_presharedkey");
    expect(psk).toMatchObject({ redacted: true, policy: "WIN - Wi-Fi with secrets" });
    expect(psk).not.toHaveProperty("value");
    expect(file.settings.find((entry) => entry.setting === "device_vendor_msft_wifi_profile_ssid")).toMatchObject({
      value: "CONTOSO-CORP",
      platform: "Windows",
    });
    // A sanitized collection already carries the redaction marker.
    const sanitized = await reference(
      collection([section("cat", [{ ...SECRET_CATALOG, settings: [{ ...SECRET_CATALOG.settings[1], settingInstance: { ...SECRET_CATALOG.settings[1]!.settingInstance, simpleSettingValue: { value: "[Redacted]" } } }] }])]),
    );
    expect(sanitized.settings[0]).toMatchObject({ redacted: true });
  });

  it("rejects unknown keys at every level", async () => {
    const file = (await reference()) as unknown as Record<string, any>;
    const top = { ...file, extra: true };
    expect(await parseReference(await resign(top))).toEqual({ ok: false, reason: "schema" });
    const nested = { ...file, settings: [{ ...file.settings[0], assignments: [] }, ...file.settings.slice(1)] };
    expect(await parseReference(await resign(nested))).toEqual({ ok: false, reason: "schema" });
    const source = { ...file, source: { label: "x", tenantId: "11111111-2222-3333-4444-555555555555" } };
    expect(await parseReference(await resign(source))).toEqual({ ok: false, reason: "schema" });
  });

  it("rejects a bad checksum", async () => {
    const file = await reference();
    const text = serializeReference(file).replace('"rulesetVersion":"', '"rulesetVersion":"9');
    expect(await parseReference(text)).toEqual({ ok: false, reason: "checksum" });
    const tampered = { ...file, settings: file.settings.slice(1) };
    expect(await parseReference(JSON.stringify(tampered))).toEqual({ ok: false, reason: "checksum" });
  });

  it("rejects a wrong schema, malformed values and other JSON", async () => {
    const file = (await reference()) as unknown as Record<string, any>;
    for (const variant of [
      { ...file, schema: "intunedoc.reference/2" },
      { ...file, schema: "intunedoc.baseline/1" },
      { ...file, createdAt: "yesterday" },
      { ...file, settings: [{ ...file.settings[0], redacted: true }] },
      { ...file, settings: [{ ...file.settings[0], sha256: "abc" }] },
      { ...file, settings: [{ ...file.settings[0], value: 1 }] },
      { ...file, families: [{ key: "", label: "x" }] },
    ]) {
      expect(await parseReference(await resign(variant))).toEqual({ ok: false, reason: "schema" });
    }
    expect(await parseReference("not json")).toEqual({ ok: false, reason: "schema" });
    expect(await parseReference("[]")).toEqual({ ok: false, reason: "schema" });
  });

  it("rejects fields that contradict each other", async () => {
    const file = (await reference()) as unknown as Record<string, any>;
    const family = file.families[0];
    const plain = file.settings.find((setting: Item) => typeof setting.value === "string")!;
    const index = file.settings.indexOf(plain);
    const withSetting = (setting: Item) => file.settings.map((entry: Item, at: number) => (at === index ? setting : entry));
    for (const variant of [
      // In both lists, or twice in one.
      { ...file, notCompared: [...file.notCompared, family] },
      { ...file, families: [...file.families, family] },
      // A setting of a family that is not compared.
      { ...file, families: file.families.filter((entry: Item) => entry.key !== plain.family), notCompared: [...file.notCompared, file.families.find((entry: Item) => entry.key === plain.family)] },
      // A digest on a value that was not shortened, and a long value without one.
      { ...file, settings: withSetting({ ...plain, sha256: "a".repeat(64) }) },
      { ...file, settings: withSetting({ ...plain, value: "x".repeat(REFERENCE_MAX_VALUE + 1) }) },
      // A group digest outside a group.
      { ...file, settings: withSetting({ ...plain, path: undefined, group: "a".repeat(64) }) },
    ]) {
      expect(await parseReference(await resign(variant))).toEqual({ ok: false, reason: "schema" });
    }
    expect((await parseReference(await resign(file))).ok).toBe(true);
  });

  it("refuses to export a file that would be too large to load again", async () => {
    const file = await reference();
    const size = new TextEncoder().encode(serializeReference(file)).length;
    expect(encodeReference(file, size)).toHaveLength(size);
    expect(() => encodeReference(file, size - 1)).toThrow(REFERENCE_TOO_LARGE);
    // The default is the limit parseReference accepts.
    expect(encodeReference(file).length).toBeLessThanOrEqual(REFERENCE_MAX_BYTES);
  });

  it("rejects an oversized file before parsing it", async () => {
    expect(await parseReference(" ".repeat(REFERENCE_MAX_BYTES + 1))).toEqual({ ok: false, reason: "size" });
    // Multi byte characters count as bytes, not characters.
    expect(await parseReference("é".repeat(REFERENCE_MAX_BYTES / 2 + 1))).toEqual({ ok: false, reason: "size" });
  });

  it("names the file by date", () => {
    expect(referenceFileName(new Date(2026, 9, 8))).toBe("intunedoc-reference-2026-10-08.json");
  });

  it("shortens long values and keeps a digest of the full value", async () => {
    const long = "x".repeat(REFERENCE_MAX_VALUE * 3);
    const policy = {
      ...SECRET_CATALOG,
      settings: [{ ...SECRET_CATALOG.settings[1], settingInstance: { ...SECRET_CATALOG.settings[1]!.settingInstance, simpleSettingValue: { "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue", value: long } } }],
    };
    const file = await reference(collection([section("cat", [policy])]));
    expect(file.settings[0]!.value!.length).toBeLessThanOrEqual(REFERENCE_MAX_VALUE + 3);
    expect(file.settings[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await parseReference(serializeReference(file))).ok).toBe(true);
    const other = structuredClone(policy);
    other.settings[0]!.settingInstance.simpleSettingValue.value = `${long}y`;
    const result = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(collection([section("cat", [other])]))),
    );
    expect(result.totals).toMatchObject({ different: 1, matching: 0 });
    const same = compareSettings(referenceSettings(file), projectionSettings(snap(collection([section("cat", [policy])]))));
    expect(same.totals).toMatchObject({ different: 0, matching: 1 });
  });
});

describe("settings inside repeated groups", () => {
  const RULES = "vendor_msft_firewall_mdmstore_firewallrules_{firewallrulename}";
  const simple = (id: string, value: string) => ({
    "@odata.type": "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
    settingDefinitionId: id,
    simpleSettingValue: {
      "@odata.type": "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
      value,
    },
  });
  const choice = (id: string, value: string) => ({
    "@odata.type": "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
    settingDefinitionId: id,
    choiceSettingValue: { value, children: [] },
  });
  type Rule = [string, "allow" | "block"];
  // One firewall policy per rule list, the first named as before.
  const firewall = (...policies: Rule[][]) =>
    collection([
      section(
        "settingsCatalog",
        policies.map((rules, index) => ({
          id: index ? `firewall-${index}` : "firewall",
          name: index ? `WIN - Firewall rules ${index}` : "WIN - Firewall rules",
          platforms: "windows10",
          settings: [
            {
              id: "0",
              settingInstance: {
                "@odata.type":
                  "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
                settingDefinitionId: RULES,
                groupSettingCollectionValue: rules.map(([name, action]) => ({
                  children: [
                    simple(`${RULES}_name`, name),
                    choice(`${RULES}_action_type`, `${RULES}_action_type_${action === "allow" ? 1 : 0}`),
                  ],
                })),
              },
            },
          ],
        })),
      ),
    ]);
  const rowsOf = (result: ReturnType<typeof compareSettings>) => result.groups.flatMap((group) => group.rows);

  it("treats swapped rule actions as a difference", async () => {
    const file = await reference(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]]));
    expect((await parseReference(serializeReference(file))).ok).toBe(true);
    const swapped = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(firewall([["Allow RDP", "block"], ["Block SMB", "allow"]]))),
    );
    expect(swapped.totals.different).toBeGreaterThan(0);
    const action = swapped.groups.flatMap((group) => group.rows).find((row) => row.setting === `${RULES}_action_type`);
    expect(action?.status).toBe("different");
  });

  it("marks only the changed value as different inside a changed rule", async () => {
    const file = await reference(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]]));
    const result = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(firewall([["Allow RDP", "block"], ["Block SMB", "block"]]))),
    );
    const rows = result.groups.flatMap((group) => group.rows);
    const action = rows.find((row) => row.setting === `${RULES}_action_type`);
    const name = rows.find((row) => row.setting === `${RULES}_name`);
    expect(action?.status).toBe("different");
    expect(name?.status).toBe("matching");
    expect(name?.instanceChanged).toBe(true);
    expect(result.totals.different).toBe(1);
  });

  it("keeps sibling names matching when two rules swap their actions", async () => {
    const file = await reference(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]]));
    const swapped = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(firewall([["Allow RDP", "block"], ["Block SMB", "allow"]]))),
    );
    const rows = swapped.groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.setting === `${RULES}_action_type`)?.status).toBe("different");
    const name = rows.find((row) => row.setting === `${RULES}_name`);
    expect(name?.status).toBe("matching");
    expect(name?.instanceChanged).toBe(true);
    expect(swapped.totals.different).toBe(1);
  });

  it("does not mark rules that only moved as changed", async () => {
    const file = await reference(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]]));
    const reordered = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(firewall([["Block SMB", "block"], ["Allow RDP", "allow"]]))),
    );
    expect(reordered.groups.flatMap((group) => group.rows).some((row) => row.instanceChanged)).toBe(false);
  });

  it("matches the same rules in another order", async () => {
    const file = await reference(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]]));
    const reordered = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(firewall([["Block SMB", "block"], ["Allow RDP", "allow"]]))),
    );
    expect(reordered.totals.different + reordered.totals.missing + reordered.totals.extra).toBe(0);
    expect(reordered.totals.matching).toBeGreaterThan(0);
  });

  it("treats an added rule as a difference when each of its values exists in other rules", async () => {
    const file = await reference(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]]));
    const added = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]], [["Allow RDP", "block"]]))),
    );
    const rows = rowsOf(added);
    expect(rows.find((row) => row.setting === `${RULES}_name`)?.status).toBe("different");
    expect(rows.find((row) => row.setting === `${RULES}_action_type`)?.status).toBe("different");
    expect(added.totals.matching).toBe(0);
  });

  it("treats a removed rule as a difference when each of its values exists in other rules", async () => {
    const file = await reference(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]], [["Allow RDP", "block"]]));
    const removed = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]]))),
    );
    const rows = rowsOf(removed);
    expect(rows.find((row) => row.setting === `${RULES}_name`)?.status).toBe("different");
    expect(rows.find((row) => row.setting === `${RULES}_action_type`)?.status).toBe("different");
    expect(removed.totals.matching).toBe(0);
  });

  it("matches a rule that another policy carries a second time, as for values", async () => {
    const file = await reference(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]]));
    const copied = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(firewall([["Allow RDP", "allow"], ["Block SMB", "block"]], [["Allow RDP", "allow"]]))),
    );
    expect(copied.totals).toMatchObject({ different: 0, missing: 0, extra: 0, notComparable: 0 });
    expect(rowsOf(copied).some((row) => row.instanceChanged)).toBe(false);
  });

  it("pairs ten thousand rules per side in bounded time", () => {
    const COUNT = 10_000;
    const rules = (flip: boolean): SettingSet => ({
      rulesetVersion: "test",
      families: [{ key: "settingsCatalog", label: "Settings Catalog" }],
      notCompared: [],
      settings: Array.from({ length: COUNT }, (_, index) => {
        const action = (index % 2 === 0) !== flip ? "allow" : "block";
        const path = [RULES, String(index)];
        const group = `${index}`.padStart(32, "0") + (action === "allow" ? "a" : "b").repeat(32);
        const base = { platform: "Windows", family: "settingsCatalog", path, group, policy: "WIN - Firewall rules" };
        return [
          { ...base, setting: `${RULES}_name`, name: "Name", value: `Rule ${index}` },
          { ...base, setting: `${RULES}_action_type`, name: "Action", value: action },
        ];
      }).flat(),
    });
    const started = performance.now();
    const same = compareSettings(rules(false), rules(false));
    // Every action flipped: no rule matches exactly, so all are paired.
    const flipped = compareSettings(rules(false), rules(true));
    const elapsed = performance.now() - started;
    expect(same.totals).toMatchObject({ different: 0, matching: 2 });
    const rows = rowsOf(flipped);
    expect(rows.find((row) => row.setting === `${RULES}_action_type`)?.status).toBe("different");
    const name = rows.find((row) => row.setting === `${RULES}_name`);
    expect(name?.status).toBe("matching");
    expect(name?.instanceChanged).toBe(true);
    // Pairing every instance with every other one takes minutes and
    // gigabytes; the bounded pairing takes well under a second.
    expect(elapsed).toBeLessThan(3000);
  }, 30_000);

  it("pairs many changed rules made of shared values approximately but sensibly", () => {
    // 1,500 distinct rules per side, each value shared by dozens of rules:
    // 37 names times 41 ports. Every action flips, so no rule matches
    // exactly and the 2.25 million candidate pairs exceed the full pairing
    // bound.
    const COUNT = 1500;
    const rules = (flip: boolean): SettingSet => ({
      rulesetVersion: "test",
      families: [{ key: "settingsCatalog", label: "Settings Catalog" }],
      notCompared: [],
      settings: Array.from({ length: COUNT }, (_, index) => {
        const name = `Rule ${index % 37}`;
        const port = String(1000 + (Math.floor(index / 37) % 41));
        const action = (index % 2 === 0) !== flip ? "allow" : "block";
        const path = [RULES, String(index)];
        const group = `${name}|${port}|${action}`;
        const base = { platform: "Windows", family: "settingsCatalog", path, group, policy: "WIN - Firewall rules" };
        return [
          { ...base, setting: `${RULES}_name`, name: "Name", value: name },
          { ...base, setting: `${RULES}_port`, name: "Port", value: port },
          { ...base, setting: `${RULES}_action_type`, name: "Action", value: action },
        ];
      }).flat(),
    });
    const started = performance.now();
    const same = compareSettings(rules(false), rules(false));
    const flipped = compareSettings(rules(false), rules(true));
    const elapsed = performance.now() - started;
    expect(same.totals).toMatchObject({ different: 0, missing: 0, extra: 0, matching: 3 });
    // Only the action changed: each rule still finds its counterpart among
    // the few candidates sharing its rarest values, so names and ports stay
    // matching as parts of changed rules, never missing or extra.
    expect(flipped.totals).toEqual({ different: 1, missing: 0, extra: 0, notComparable: 0, matching: 2 });
    const rows = rowsOf(flipped);
    expect(rows.find((row) => row.setting === `${RULES}_action_type`)?.status).toBe("different");
    for (const setting of [`${RULES}_name`, `${RULES}_port`])
      expect(rows.find((row) => row.setting === setting)).toMatchObject({ status: "matching", instanceChanged: true });
    expect(elapsed).toBeLessThan(3000);
  }, 30_000);

  it("reads ten thousand rules of one policy in bounded time", () => {
    const projection = snap(firewall(Array.from({ length: 10_000 }, (_, index): Rule => [`Rule ${index}`, "allow"])));
    const started = performance.now();
    const settings = projectionSettings(projection).settings;
    const elapsed = performance.now() - started;
    expect(settings.filter((setting) => setting.group)).toHaveLength(20_000);
    expect(new Set(settings.map((setting) => setting.group)).size).toBe(10_000);
    // Scanning every path for each rule took seconds.
    expect(elapsed).toBeLessThan(1500);
  }, 30_000);
});

describe("platformOf", () => {
  it("reads the platforms value, then the type name", () => {
    expect(platformOf({ platforms: "windows10" })).toBe("Windows");
    expect(platformOf({ platforms: "macOS" })).toBe("macOS");
    expect(platformOf({ "@odata.type": "#microsoft.graph.iosCompliancePolicy" })).toBe("iOS");
    expect(platformOf({ "@odata.type": "#microsoft.graph.androidWorkProfileGeneralDeviceConfiguration" })).toBe("Android");
    expect(platformOf({ "@odata.type": "#microsoft.graph.conditionalAccessPolicy" })).toBe(GENERAL_PLATFORM);
    expect(platformOf({ platforms: "none" })).toBe(GENERAL_PLATFORM);
  });
});

describe("compareSettings", () => {
  it("finds nothing between a tenant and its own reference", async () => {
    const file = await reference();
    const result = compareSettings(referenceSettings(file), projectionSettings(snap(contoso())));
    // Only settings kept without their value, such as Conditional Access
    // targets named by object id, are not comparable.
    const withoutValue = new Set(
      file.settings.filter((entry) => entry.redacted).map((entry) => `${entry.platform}|${entry.family}|${entry.setting}`),
    );
    expect(result.totals).toMatchObject({ different: 0, missing: 0, extra: 0, notComparable: withoutValue.size });
    expect(result.totals.matching + withoutValue.size).toBe(
      new Set(file.settings.map((entry) => `${entry.platform}|${entry.family}|${entry.setting}`)).size,
    );
    expect(result.notCompared).toEqual([]);
    expect(result.rulesetChanged).toBe(false);
  });

  it("reports missing, different and extra settings grouped by platform and family", async () => {
    const file = await reference();
    const current = contoso((data) => {
      // One compliance policy gone, one setting changed, one policy added.
      data.compliancePolicies = data.compliancePolicies.slice(1);
      const device = data.deviceConfigurations[0] as Item;
      device.passwordRequired = !device.passwordRequired;
      data.deviceConfigurations.push({
        ...structuredClone(device),
        id: "new-device",
        displayName: "WIN - Extra",
        bitLockerEncryptDevice: true,
      });
    });
    const result = compareSettings(referenceSettings(file), projectionSettings(snap(current)));
    expect(result.totals.missing).toBeGreaterThan(0);
    expect(result.totals.different).toBeGreaterThan(0);
    const password = result.groups
      .filter((group) => group.family === "deviceConfigurations" && group.platform === "Windows")
      .flatMap((group) => group.rows)
      .find((row) => row.setting === "passwordRequired");
    expect(password?.status).toBe("different");
    expect(password?.expected.length).toBe(1);
    expect(password?.actual.length).toBe(2);
    for (const group of result.groups) {
      expect(group.platform).toBeTruthy();
      expect(group.familyLabel).not.toBe("");
      const statuses = group.rows.map((row) => row.status);
      // Differences first, matching last.
      expect(!statuses.includes("matching") || statuses.lastIndexOf("different") < statuses.indexOf("matching")).toBe(true);
      expect(group.rowsTotal).toBe(group.rows.length);
    }
    const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
    expect(result.groups.reduce((total, group) => total + sum(group.counts), 0)).toBe(sum(result.totals));
  });

  it("does not compare assignments", async () => {
    const file = await reference();
    const current = contoso((data) => {
      for (const policy of data.settingsCatalog as Item[]) policy.assignments = [];
    });
    expect(compareSettings(referenceSettings(file), projectionSettings(snap(current))).totals).toMatchObject({
      different: 0,
      missing: 0,
      extra: 0,
    });
  });

  it("shows redacted values as not comparable, never as matching", async () => {
    const file = await reference(withSecrets(contoso()));
    const changed = structuredClone(SECRET_CATALOG);
    changed.settings[0]!.settingInstance.simpleSettingValue.value = "AnotherKey";
    const current = collection([
      ...contoso().sections!,
      section("windowsScripts", [SCRIPT], "Windows scripts"),
      section("customProfiles", [SECRET_OMA], "Custom profiles"),
      section("secretCatalog", [changed], "Secret catalog"),
    ]);
    const result = compareSettings(referenceSettings(file), projectionSettings(snap(current)));
    const psk = result.groups.flatMap((group) => group.rows).find((row) => row.setting === "device_vendor_msft_wifi_profile_presharedkey");
    expect(psk).toMatchObject({ status: "notComparable" });
    expect(psk!.expected[0]!.value).toBeNull();
    expect(psk!.actual[0]!.value).toBeNull();
    const oma = result.groups.flatMap((group) => group.rows).find((row) => row.setting === "./Vendor/MSFT/VPNv2/Corp/Custom");
    expect(oma).toMatchObject({ status: "notComparable", name: "VPN shared secret" });
  });

  it("shows a redacted setting on one side only as not comparable, not as missing or extra", async () => {
    const withoutKey = structuredClone(SECRET_CATALOG);
    withoutKey.settings = withoutKey.settings.slice(1);
    const sides = (secret: object) =>
      collection([...contoso().sections!, section("secretCatalog", [secret], "Secret catalog")]);
    const psk = (from: object, to: object) =>
      compareSettings(projectionSettings(snap(sides(from))), projectionSettings(snap(sides(to))))
        .groups.flatMap((group) => group.rows)
        .find((row) => row.setting === "device_vendor_msft_wifi_profile_presharedkey");
    // Only in the reference.
    expect(psk(SECRET_CATALOG, withoutKey)).toMatchObject({ status: "notComparable", actual: [] });
    // Only in the current tenant.
    expect(psk(withoutKey, SECRET_CATALOG)).toMatchObject({ status: "notComparable", expected: [] });
  });

  it("lists families incomplete on either side as not compared instead of missing", async () => {
    const file = await reference();
    const failed = contoso();
    failed.fetchErrors = [
      { policyId: "N/A", policyName: "", policyType: "", familyKey: "compliancePolicies", error: "403" },
    ];
    const current = projectionSettings(snap(failed));
    const result = compareSettings(referenceSettings(file), current);
    expect(result.notCompared).toEqual([
      { family: "compliancePolicies", label: "Compliance policies", side: "current" },
    ]);
    expect(result.groups.some((group) => group.family === "compliancePolicies")).toBe(false);
    expect(result.totals.missing).toBe(0);
    // And the other way round: the reference was made from a partial collection.
    const partial: SettingSet = { ...referenceSettings(file), families: file.families.filter((family) => family.key !== "settingsCatalog"), notCompared: [{ key: "settingsCatalog", label: "Settings Catalog" }] };
    const reverse = compareSettings(partial, projectionSettings(snap(contoso())));
    expect(reverse.notCompared).toEqual([{ family: "settingsCatalog", label: "Settings Catalog", side: "reference" }]);
    expect(reverse.totals.extra).toBe(0);
  });

  it("keeps a reference made from a partial collection free of the failed family", async () => {
    const failed = contoso();
    failed.fetchErrors = [
      { policyId: "N/A", policyName: "", policyType: "", familyKey: "settingsCatalog", error: "500" },
    ];
    const file = await reference(failed);
    expect(file.notCompared).toEqual([{ key: "settingsCatalog", label: "Settings Catalog" }]);
    expect(file.settings.some((entry) => entry.family === "settingsCatalog")).toBe(false);
  });

  it("notes a ruleset change", async () => {
    const file = await reference();
    const result = compareSettings({ ...referenceSettings(file), rulesetVersion: "2020.1.1" }, projectionSettings(snap(contoso())));
    expect(result.rulesetChanged).toBe(true);
  });

  it("caps rows per group and overall, keeping the counts", async () => {
    const file = await reference();
    const result = compareSettings(referenceSettings(file), projectionSettings(snap(contoso())));
    const capped = capComparison(result, { maxRowsPerGroup: 2, maxRows: 5, maxValuesPerRow: 1, maxValueLength: 3 });
    expect(capped.groups.reduce((sum, group) => sum + group.rows.length, 0)).toBe(5);
    expect(capped.groups.every((group) => group.rows.length <= 2)).toBe(true);
    expect(capped.totals).toEqual(result.totals);
    expect(capped.groups.map((group) => group.rowsTotal)).toEqual(result.groups.map((group) => group.rowsTotal));
    for (const row of capped.groups.flatMap((group) => group.rows)) {
      expect(row.expected.length).toBeLessThanOrEqual(1);
      for (const value of row.expected) expect(value.value === null || value.value.length <= 6).toBe(true);
    }
  });

  it("leaves Conditional Access object ids out of a reference", async () => {
    const data = contoso((tenant) => {
      const policy = (tenant.conditionalAccessPolicies as Item[])[0]!;
      policy.conditions.users.includeGroups = ["0b6f1f5e-1111-2222-3333-444455556666"];
      policy.conditions.users.excludeUsers = ["2b6f1f5e-1111-2222-3333-444455556666"];
    });
    const file = await reference(data);
    const text = serializeReference(file);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const ca = file.settings.filter((entry) => entry.family === "conditionalAccessPolicies");
    expect(ca.length).toBeGreaterThan(0);
    // Kept without its value, so it is not comparable rather than missing.
    expect(ca.find((entry) => entry.name === "Include Groups")).toMatchObject({ redacted: true });
    expect(ca.find((entry) => entry.name === "Include Groups")?.value).toBeUndefined();
    // Another tenant with other group ids compares equal on the rest.
    const other = contoso((tenant) => {
      const policy = (tenant.conditionalAccessPolicies as Item[])[0]!;
      policy.conditions.users.includeGroups = ["9b6f1f5e-1111-2222-3333-444455556666"];
    });
    const result = compareSettings(referenceSettings(file), projectionSettings(snap(other)));
    expect(result.totals).toMatchObject({ different: 0, missing: 0, extra: 0 });
  });

  it("never reads a Conditional Access target named by object id as missing", async () => {
    const targets = (includeUsers: string[]) =>
      contoso((tenant) => {
        (tenant.conditionalAccessPolicies as Item[])[0]!.conditions.users.includeUsers = includeUsers;
      });
    const file = await reference(targets(["All"]));
    const result = compareSettings(
      referenceSettings(file),
      projectionSettings(snap(targets(["0b6f1f5e-1111-2222-3333-444455556666"]))),
    );
    const row = result.groups.flatMap((group) => group.rows).find((entry) => entry.name === "Include Users");
    expect(row?.status).toBe("notComparable");
    expect(result.totals).toMatchObject({ missing: 0, extra: 0 });
  });
});

import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import type {
  CapabilityStatus,
  ComplianceAssessment,
  ComplianceCapability,
} from "../compliance";
import type { DetailedExportData } from "../configuration-analyzer";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import {
  buildFixPackZip,
  FIX_PACK_POLICY_PREFIX,
  FIX_PACK_WARNING,
  generateFixPack,
  type FixPackChoiceSettingInstance,
} from "../compliance/fix-pack";
import verified from "../compliance/verified-technical-settings.json";
import additionalVerified from "../compliance/additional-verified-settings.json";

const definitions = [...verified.catalog, ...additionalVerified.catalog];

function emptyCollection(): DetailedExportData {
  return {
    collectedAt: "2026-10-18T12:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    appProtectionPolicies: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
  };
}

const contoso = assessCompliance(CONTOSO_TENANT);
const empty = assessCompliance(emptyCollection());

function instances(
  rows: readonly FixPackChoiceSettingInstance[],
): FixPackChoiceSettingInstance[] {
  return rows.flatMap((row) => [
    row,
    ...instances(row.choiceSettingValue.children),
  ]);
}
const allInstances = (pack: ReturnType<typeof generateFixPack>) =>
  pack.policies.flatMap((policy) =>
    instances(policy.json.settings.map((row) => row.settingInstance)),
  );
const policyFor = (
  pack: ReturnType<typeof generateFixPack>,
  capabilityId: string,
) => pack.policies.find((row) => row.capabilityId === capabilityId);
const gapFor = (
  pack: ReturnType<typeof generateFixPack>,
  capabilityId: string,
) => pack.notGeneratable.find((row) => row.capabilityId === capabilityId);

describe("fix pack generator", () => {
  it("emits only verified setting definitions and option ids", () => {
    for (const assessment of [contoso, empty]) {
      const emitted = allInstances(generateFixPack(assessment));
      expect(emitted.length).toBeGreaterThan(0);
      for (const instance of emitted) {
        const definition = definitions.find(
          (row) => row.id === instance.settingDefinitionId,
        );
        expect(definition, instance.settingDefinitionId).toBeDefined();
        const option = definition!.options.find(
          (row) => row.id === instance.choiceSettingValue.value,
        );
        expect(option, instance.choiceSettingValue.value).toBeDefined();
        expect(option!.label).not.toMatch(/\bwith UEFI lock\b/i);
        for (const child of instance.choiceSettingValue.children)
          expect(option!.children).toContain(child.settingDefinitionId);
      }
    }
  });

  it("nests a child setting under its enabled parent option", () => {
    const policy = policyFor(
      generateFixPack(contoso),
      "windows-remote-credential-guard",
    )!;
    const parent =
      "device_vendor_msft_policy_config_admx_credssp_restrictedremoteadministration";
    expect(policy.json.settings).toHaveLength(1);
    expect(policy.json.settings[0]!.settingInstance).toEqual({
      "@odata.type":
        "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
      settingDefinitionId: parent,
      choiceSettingValue: {
        value: `${parent}_1`,
        children: [
          {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
            settingDefinitionId: `${parent}_restrictedremoteadministrationdrop`,
            choiceSettingValue: {
              value: `${parent}_restrictedremoteadministrationdrop_2`,
              children: [],
            },
          },
        ],
      },
    });
  });

  it("produces unassigned drafts with the lab-verified document shape", () => {
    const pack = generateFixPack(contoso);
    for (const policy of pack.policies) {
      expect(Object.keys(policy.json).sort()).toEqual([
        "description",
        "name",
        "platforms",
        "roleScopeTagIds",
        "settings",
        "technologies",
        "templateReference",
      ]);
      expect(JSON.stringify(policy.json)).not.toMatch(/assignment/i);
      expect(policy.json).toMatchObject({
        platforms: "windows10",
        technologies: "mdm",
        roleScopeTagIds: ["0"],
        templateReference: { templateId: "", templateFamily: "none" },
      });
      expect(policy.json.name).toMatch(
        new RegExp(`^${FIX_PACK_POLICY_PREFIX}.+ \\(draft, unassigned\\)$`),
      );
      expect(policy.json.description).toContain(FIX_PACK_WARNING);
      expect(policy.json.description).toContain(contoso.generatedAt);
      expect(policy.json.description).toContain(
        contoso.provenance.rulesetVersion,
      );
      expect(policy.json.description).toContain(
        `Capability: ${policy.capabilityId}.`,
      );
      for (const control of policy.controlIds)
        expect(policy.json.description).toContain(control);
      expect(policy.fileName).toMatch(/^\d{2}-[a-z0-9-]+\.json$/);
    }
  });

  it("generates only settings detected as missing on a complete collection", () => {
    const pack = generateFixPack(contoso);
    const generated = new Set(pack.policies.map((row) => row.capabilityId));
    for (const result of contoso.capabilities)
      if (generated.has(result.capability.id)) {
        expect(result.status).toBe("noEvidence");
        expect(result.evidence).toEqual([]);
        expect(
          result.checks.every(
            (check) =>
              check.assessmentStatus === "checked" &&
              check.result === "missing",
          ),
        ).toBe(true);
      }
    expect(gapFor(pack, "windows-firewall")?.reason).toBe(
      "Setting exists in an unassigned policy; assign that policy instead.",
    );
    // Contoso sets the macro notification setting to another value.
    expect(policyFor(pack, "windows-office-signed-macros")).toBeUndefined();
    expect(gapFor(pack, "windows-office-signed-macros")?.reason).toMatch(
      /different value/,
    );
    expect(gapFor(pack, "windows-telemetry-minimized")).toBeDefined();
  });

  it("generates nothing when collection completeness is unknown", () => {
    const snapshot = emptyCollection();
    delete snapshot.collectedAt;
    const pack = generateFixPack(assessCompliance(snapshot));
    expect(pack.policies).toEqual([]);
    expect(gapFor(pack, "windows-remote-credential-guard")?.reason).toMatch(
      /could not establish that the setting is missing/,
    );
  });

  it("lists signals that are not Settings Catalog choices", () => {
    const pack = generateFixPack(contoso);
    expect(gapFor(pack, "windows-secure-boot")?.reason).toMatch(
      /template or compliance policy property/,
    );
    expect(gapFor(pack, "windows-applocker-rule-collections")?.reason).toMatch(
      /policy check/,
    );
    expect(gapFor(pack, "windows-powershell-module-logging")?.reason).toMatch(
      /simple or list value/,
    );
    expect(gapFor(pack, "macos-firewall")?.reason).toMatch(
      /Windows Settings Catalog settings only/,
    );
    expect(pack.summary).toEqual({
      draftPolicies: pack.policies.length,
      notGeneratable: pack.notGeneratable.length,
    });
  });

  it("emits every required group together and avoids UEFI locks", () => {
    const pack = generateFixPack(empty);
    const logging = policyFor(pack, "windows-process-creation-logging")!;
    expect(
      logging.json.settings.map(
        (row) => row.settingInstance.settingDefinitionId,
      ),
    ).toEqual([
      "device_vendor_msft_policy_config_audit_detailedtracking_auditprocesscreation",
      "device_vendor_msft_policy_config_admx_auditsettings_includecmdline",
    ]);
    expect(
      policyFor(pack, "windows-credential-guard")!.json.settings[0]!
        .settingInstance.choiceSettingValue.value,
    ).toBe("device_vendor_msft_policy_config_deviceguard_lsacfgflags_2");
    expect(policyFor(pack, "windows-firewall")).toBeUndefined();
    expect(gapFor(pack, "windows-firewall")?.reason).toMatch(
      /Required setting groups domain, private, public/,
    );
  });

  it("prefers device scope and keeps values consistent across the pack", () => {
    const pack = generateFixPack(empty);
    const ids = policyFor(
      pack,
      "windows-powershell-scriptblock-logging",
    )!.json.settings.map((row) => row.settingInstance.settingDefinitionId);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^device_/);

    const values = new Map<string, string>();
    for (const instance of allInstances(pack)) {
      const previous = values.get(instance.settingDefinitionId);
      if (previous) expect(instance.choiceSettingValue.value).toBe(previous);
      values.set(
        instance.settingDefinitionId,
        instance.choiceSettingValue.value,
      );
    }
    // Disabling all macros wins over "signed macros only" for the same setting.
    expect(policyFor(pack, "windows-office-signed-macros")).toBeUndefined();
    expect(gapFor(pack, "windows-office-signed-macros")?.reason).toMatch(
      /windows-office-macros-disabled policy in this pack/,
    );
  });

  it("lists every non-missing state and silently skips settings in place", () => {
    const id = "windows-remote-credential-guard";
    const withStatus = (status: CapabilityStatus) => ({
      ...empty,
      capabilities: empty.capabilities.map((row) =>
        row.capability.id === id ? { ...row, status } : row,
      ),
    });
    const reasons: Partial<Record<CapabilityStatus, RegExp>> = {
      configuredNotAssigned: /^Setting exists in an unassigned policy/,
      partialConfiguration: /Complete that policy/,
      conflictingEvidence: /Resolve the conflict/,
      disabledByPolicy: /non-enforcing value/,
      assignmentUnknown: /Assignment data could not be read/,
      collectionIncomplete: /Policy collection was incomplete/,
    };
    for (const [status, reason] of Object.entries(reasons)) {
      const pack = generateFixPack(withStatus(status as CapabilityStatus));
      expect(policyFor(pack, id), status).toBeUndefined();
      expect(gapFor(pack, id)?.reason, status).toMatch(reason);
    }
    for (const status of [
      "enforced",
      "requirementAssigned",
      "notApplicable",
    ] as const) {
      const pack = generateFixPack(withStatus(status));
      expect(policyFor(pack, id), status).toBeUndefined();
      expect(gapFor(pack, id), status).toBeUndefined();
    }
  });

  it("needs every required group and a removable option", () => {
    const remote = empty.capabilities.find(
      (row) => row.capability.id === "windows-remote-credential-guard",
    )!;
    const lsa = "device_vendor_msft_policy_config_deviceguard_lsacfgflags";
    const capability = (
      signals: ComplianceCapability["signals"],
      requiredGroups?: string[],
    ): ComplianceAssessment => ({
      ...empty,
      frameworks: [],
      capabilities: [
        {
          ...remote,
          capability: {
            ...remote.capability,
            id: "test-capability",
            signals,
            requiredGroups,
          },
        },
      ],
    });
    const halfGroups = generateFixPack(
      capability(
        [
          { ...remote.capability.signals[0]!, requirementGroup: "catalog" },
          {
            source: "graphProperty",
            odataTypes: ["windows10CompliancePolicy"],
            propertyPath: "secureBootEnabled",
            enforcedWhen: { kind: "equals", value: true },
            requirementGroup: "template",
          },
        ],
        ["catalog", "template"],
      ),
    );
    expect(halfGroups.policies).toEqual([]);
    expect(halfGroups.notGeneratable[0]?.reason).toMatch(
      /^Required setting groups template cannot be generated/,
    );
    const locked = generateFixPack(
      capability([
        {
          source: "settingsCatalog",
          settingDefinitionId: lsa,
          enforcedWhen: { kind: "equals", value: `${lsa}_1` },
        },
      ]),
    );
    expect(locked.policies).toEqual([]);
    expect(locked.notGeneratable[0]?.reason).toMatch(/UEFI lock/);
  });

  it("filters by framework", () => {
    const pack = generateFixPack(empty, { frameworkId: "hipaa-security-rule" });
    expect(pack.policies.length).toBeGreaterThan(0);
    for (const policy of pack.policies) {
      expect(policy.controlIds.length).toBeGreaterThan(0);
      for (const id of policy.controlIds)
        expect(id.startsWith("hipaa-security-rule:")).toBe(true);
    }
  });

  it("is deterministic and packs README plus one JSON per policy", async () => {
    expect(generateFixPack(contoso)).toEqual(generateFixPack(contoso));
    const pack = generateFixPack(contoso);
    const bytes = await buildFixPackZip(pack, contoso);
    expect(await buildFixPackZip(generateFixPack(contoso), contoso)).toEqual(
      bytes,
    );
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files).sort()).toEqual(
      ["README.txt", ...pack.policies.map((row) => row.fileName)].sort(),
    );
    for (const policy of pack.policies)
      expect(
        JSON.parse(await zip.file(policy.fileName)!.async("string")),
      ).toEqual(policy.json);
    const readme = await zip.file("README.txt")!.async("string");
    expect(readme).toContain("Devices > Manage devices > Configuration");
    expect(readme).toContain("Create > Import policy");
    expect(readme).toContain("unassigned");
    expect(readme).toContain("do not import blindly");
    expect(readme).toContain(
      `Summary: ${pack.summary.draftPolicies} draft policies, ${pack.summary.notGeneratable} not generatable.`,
    );
    for (const row of pack.notGeneratable) expect(readme).toContain(row.reason);
    expect(readme).not.toMatch(/[\u2013\u2014]| - /);
  });
});

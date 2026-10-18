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
  FIX_PACK_DESCRIPTION_MAX,
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
const EMPTY = emptyCollection();
const empty = assessCompliance(EMPTY);

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
    for (const [assessment, collection] of [
      [contoso, CONTOSO_TENANT],
      [empty, EMPTY],
    ] as const) {
      const emitted = allInstances(generateFixPack(assessment, { collection }));
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
        const children = instance.choiceSettingValue.children.map(
          (child) => child.settingDefinitionId,
        );
        // Never a parent option with children: [] when its definition lists
        // children: every listed child is sent, and nothing else.
        expect(children.sort(), instance.settingDefinitionId).toEqual(
          [...option!.children].sort(),
        );
      }
    }
  });

  it("nests a child setting under its enabled parent option", () => {
    const policy = policyFor(
      generateFixPack(contoso, { collection: CONTOSO_TENANT }),
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
    const pack = generateFixPack(contoso, { collection: CONTOSO_TENANT });
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
    const pack = generateFixPack(contoso, { collection: CONTOSO_TENANT });
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
    const pack = generateFixPack(assessCompliance(snapshot), {
      collection: snapshot,
    });
    expect(pack.policies).toEqual([]);
    expect(gapFor(pack, "windows-remote-credential-guard")?.reason).toMatch(
      /could not establish that the setting is missing/,
    );
  });

  it("lists signals that are not Settings Catalog choices", () => {
    const pack = generateFixPack(contoso, { collection: CONTOSO_TENANT });
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
    const pack = generateFixPack(empty, { collection: EMPTY });
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

  it("keeps values consistent across the pack", () => {
    const pack = generateFixPack(empty, { collection: EMPTY });
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
      const pack = generateFixPack(withStatus(status as CapabilityStatus), {
        collection: EMPTY,
      });
      expect(policyFor(pack, id), status).toBeUndefined();
      expect(gapFor(pack, id)?.reason, status).toMatch(reason);
    }
    for (const status of [
      "enforced",
      "requirementAssigned",
      "notApplicable",
    ] as const) {
      const pack = generateFixPack(withStatus(status), { collection: EMPTY });
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
      { collection: EMPTY },
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
      { collection: EMPTY },
    );
    expect(locked.policies).toEqual([]);
    expect(locked.notGeneratable[0]?.reason).toMatch(/UEFI lock/);
  });

  it("filters by framework", () => {
    const pack = generateFixPack(empty, {
      frameworkId: "hipaa-security-rule",
      collection: EMPTY,
    });
    expect(pack.policies.length).toBeGreaterThan(0);
    for (const policy of pack.policies) {
      expect(policy.controlIds.length).toBeGreaterThan(0);
      for (const id of policy.controlIds)
        expect(id.startsWith("hipaa-security-rule:")).toBe(true);
    }
  });

  it("is deterministic and packs README plus one JSON per policy", async () => {
    expect(generateFixPack(contoso, { collection: CONTOSO_TENANT })).toEqual(
      generateFixPack(contoso, { collection: CONTOSO_TENANT }),
    );
    const pack = generateFixPack(contoso, { collection: CONTOSO_TENANT });
    const bytes = await buildFixPackZip(pack, contoso);
    expect(
      await buildFixPackZip(
        generateFixPack(contoso, { collection: CONTOSO_TENANT }),
        contoso,
      ),
    ).toEqual(bytes);
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

  it("lists options whose dependent settings have no verified value", () => {
    const pack = generateFixPack(empty, { collection: EMPTY });
    for (const id of [
      "windows-powershell-scriptblock-logging",
      "windows-powershell-transcription",
      "windows-password-required",
      "windows-laps-management",
      "windows-credential-theft-protection",
      "windows-office-macro-win32-block",
      "windows-office-child-process-block",
      "windows-office-executable-block",
      "windows-office-injection-block",
      "windows-adobe-child-process-block",
    ]) {
      expect(policyFor(pack, id), id).toBeUndefined();
      expect(gapFor(pack, id)?.reason, id).toMatch(
        /needs \d+ dependent settings? with no verified value in this build/,
      );
    }
    // The device scope variant replaces the user scope one before the check,
    // so the reason is given once.
    expect(
      gapFor(pack, "windows-powershell-scriptblock-logging")?.reason.match(
        /dependent/g,
      ),
    ).toHaveLength(1);
    // An alternative with complete children still gets a draft.
    const ie = policyFor(pack, "windows-ie-disabled")!;
    expect(
      ie.json.settings.map((row) => row.settingInstance.settingDefinitionId),
    ).toEqual([
      "device_vendor_msft_policy_config_internetexplorer_disableinternetexplorerapp",
    ]);
    expect(ie.notes.join(" ")).toMatch(/1 dependent setting/);
  });

  it("does not generate a setting that a collected policy configures differently", () => {
    const parent =
      "device_vendor_msft_policy_config_admx_credssp_restrictedremoteadministration";
    const collection = emptyCollection();
    collection.settingsCatalog = [
      {
        id: "policy-1",
        name: "Remote admin =cmd",
        platforms: "windows10",
        technologies: "mdm",
        settings: [
          {
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
              settingDefinitionId: parent,
              choiceSettingValue: { value: `${parent}_0`, children: [] },
            },
          },
        ],
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
            },
          },
        ],
      },
    ] as unknown as DetailedExportData["settingsCatalog"];
    const assessment = assessCompliance(collection);
    const id = "windows-remote-credential-guard";
    // The child under a disabled parent leaves no check in the assessment.
    const result = assessment.capabilities.find(
      (row) => row.capability.id === id,
    )!;
    expect(result.status).toBe("noEvidence");
    expect(result.checks.every((check) => check.result === "missing")).toBe(
      true,
    );
    // Without the collection the deliberate choice is invisible, so the
    // collection is required.
    expect(() => generateFixPack(assessment, undefined as never)).toThrow(
      "needs the collection",
    );
    expect(() => generateFixPack(assessment, {} as never)).toThrow(
      "needs the collection",
    );
    const pack = generateFixPack(assessment, { collection });
    expect(policyFor(pack, id)).toBeUndefined();
    expect(gapFor(pack, id)?.reason).toBe(
      'The policy "Remote admin =cmd" sets Restrict delegation of credentials to remote servers to "Disabled", so the setting is deliberately configured differently. Change that policy instead of importing a draft.',
    );
    // Other capabilities are unaffected.
    expect(policyFor(pack, "windows-lsa-protection")).toBeDefined();
  });

  it("leaves out umbrella capabilities covered by their components", () => {
    const pack = generateFixPack(empty, { collection: EMPTY });
    for (const [umbrella, components] of [
      [
        "windows-office-macro-settings-managed",
        "windows-office-macros-disabled, windows-office-internet-macros-blocked",
      ],
      [
        "windows-browser-security-settings-managed",
        "windows-browser-java-blocked, windows-browser-intrusive-ads-blocked",
      ],
    ] as const) {
      expect(policyFor(pack, umbrella), umbrella).toBeUndefined();
      expect(gapFor(pack, umbrella)?.reason).toBe(
        `Every setting of this capability is already in the drafts for ${components} in this pack, so it gets no separate draft.`,
      );
    }
    const roots = pack.policies.flatMap((policy) =>
      policy.json.settings.map(
        (row) => row.settingInstance.settingDefinitionId,
      ),
    );
    expect(new Set(roots).size).toBe(roots.length);
    expect(pack.policies.map((row) => row.fileName.slice(0, 3))).toEqual(
      pack.policies.map((_, index) => `${String(index + 1).padStart(2, "0")}-`),
    );
  });

  it("strips settings a smaller draft already holds", () => {
    const remote = empty.capabilities.find(
      (row) => row.capability.id === "windows-remote-credential-guard",
    )!;
    const v3 =
      "user_vendor_msft_policy_config_office16v8~policy~l_microsoftofficesystem~l_securitysettings~l_trustcenter241_l_onlytrustvbasignaturev3";
    const lsa =
      "device_vendor_msft_policy_config_localsecurityauthority_configurelsaprotectedprocess";
    const signal = (id: string, value: string) => ({
      source: "settingsCatalog" as const,
      settingDefinitionId: id,
      enforcedWhen: { kind: "equals" as const, value },
    });
    const result = (id: string, signals: ComplianceCapability["signals"]) => ({
      ...remote,
      capability: { ...remote.capability, id, signals },
    });
    const pack = generateFixPack(
      {
        ...empty,
        frameworks: [],
        capabilities: [
          result("umbrella", [signal(v3, `${v3}_1`), signal(lsa, `${lsa}_2`)]),
          result("component", [signal(v3, `${v3}_1`)]),
        ],
      },
      { collection: EMPTY },
    );
    expect(pack.policies.map((row) => row.capabilityId)).toEqual([
      "umbrella",
      "component",
    ]);
    const umbrella = policyFor(pack, "umbrella")!;
    expect(
      umbrella.json.settings.map(
        (row) => row.settingInstance.settingDefinitionId,
      ),
    ).toEqual([lsa]);
    expect(umbrella.notes).toEqual([
      "1 setting is left out because the draft for component in this pack already contains it.",
    ]);
  });

  it("keeps shared settings when stripping would orphan a parent option", () => {
    const remote = empty.capabilities.find(
      (row) => row.capability.id === "windows-remote-credential-guard",
    )!;
    const parent =
      "device_vendor_msft_policy_config_admx_credssp_restrictedremoteadministration";
    const result = (id: string, signals: ComplianceCapability["signals"]) => ({
      ...remote,
      capability: { ...remote.capability, id, signals },
    });
    const pack = generateFixPack(
      {
        ...empty,
        frameworks: [],
        capabilities: [
          result("umbrella", [
            {
              source: "settingsCatalog",
              settingDefinitionId: parent,
              enforcedWhen: { kind: "equals", value: `${parent}_1` },
            },
            ...remote.capability.signals,
          ]),
          result("component", remote.capability.signals),
        ],
      },
      { collection: EMPTY },
    );
    const umbrella = policyFor(pack, "umbrella")!;
    expect(umbrella.notes).toEqual([]);
    expect(
      umbrella.json.settings[0]!.settingInstance.choiceSettingValue.children,
    ).toHaveLength(1);
  });

  it("points Entra tenant settings to the Entra admin center", () => {
    const remote = empty.capabilities.find(
      (row) => row.capability.id === "windows-remote-credential-guard",
    )!;
    const pack = generateFixPack(
      {
        ...empty,
        frameworks: [],
        capabilities: [
          {
            ...remote,
            capability: {
              ...remote.capability,
              id: "tenant-test",
              platform: "tenant",
              signals: [
                {
                  source: "tenantPolicy",
                  policy: "securityDefaults",
                  check: "securityDefaultsEnabled",
                },
              ],
            },
          },
        ],
      },
      { collection: EMPTY },
    );
    expect(pack.policies).toEqual([]);
    expect(pack.notGeneratable[0]?.reason).toBe(
      "Entra setting, change it in the Entra admin center.",
    );
  });

  it("keeps every description within the length bound with the warning intact", () => {
    for (const [assessment, collection] of [
      [contoso, CONTOSO_TENANT],
      [empty, EMPTY],
    ] as const) {
      const pack = generateFixPack(assessment, { collection });
      expect(pack.policies.length).toBeGreaterThan(0);
      for (const policy of pack.policies) {
        const { description } = policy.json;
        expect(description.length).toBeLessThanOrEqual(
          FIX_PACK_DESCRIPTION_MAX,
        );
        expect(description.startsWith(FIX_PACK_WARNING)).toBe(true);
        // Shortened lists point to the README, which lists every control.
        const shown = description.split("Controls: ")[1]!;
        for (const id of policy.controlIds.slice(0, 1))
          expect(shown).toContain(id);
        if (!policy.controlIds.every((id) => shown.includes(`${id}`)))
          expect(shown).toMatch(/more in README\.txt\.$/);
      }
    }
    // Many mapped controls are shortened, never the warning.
    const id = "windows-remote-credential-guard";
    const [framework] = empty.frameworks;
    const many: ComplianceAssessment = {
      ...empty,
      frameworks: [
        {
          ...framework!,
          controls: Array.from({ length: 80 }, (_, index) => ({
            ...framework!.controls[0]!,
            control: {
              ...framework!.controls[0]!.control,
              id: `CTRL-${index}`,
            },
            capabilityIds: [id],
          })),
        },
      ],
    };
    const long = generateFixPack(many, { collection: EMPTY }).policies.find(
      (policy) => policy.capabilityId === id,
    )!;
    expect(long.controlIds).toHaveLength(80);
    expect(long.json.description.length).toBeLessThanOrEqual(
      FIX_PACK_DESCRIPTION_MAX,
    );
    expect(long.json.description.startsWith(FIX_PACK_WARNING)).toBe(true);
    expect(long.json.description).toMatch(/, and \d+ more in README\.txt\.$/);
  });

  it("does not list security defaults when Conditional Access is in use", () => {
    const collection: DetailedExportData = {
      ...emptyCollection(),
      tenantIdentityPolicies: {
        securityDefaults: { isEnabled: false },
        status: { securityDefaults: "collected" },
      },
      conditionalAccessPolicies: [
        {
          id: "ca-1",
          displayName: "Require MFA",
          state: "enabled",
          conditions: {
            users: { includeUsers: ["All"] },
            applications: { includeApplications: ["All"] },
          },
          grantControls: { operator: "AND", builtInControls: ["mfa"] },
        },
      ] as unknown as DetailedExportData["conditionalAccessPolicies"],
    };
    const assessment = assessCompliance(collection);
    const defaults = "tenant-security-defaults-enabled";
    expect(
      assessment.capabilities.find((row) => row.capability.id === defaults)
        ?.alternative?.state,
    ).toBe("inUse");
    const pack = generateFixPack(assessment, { collection });
    expect(policyFor(pack, defaults)).toBeUndefined();
    expect(gapFor(pack, defaults)).toBeUndefined();
  });
});

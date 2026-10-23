import { describe, expect, it } from "vitest";
import {
  assignmentDetails,
  summarizeAssignments,
} from "../compliance/assignments";
import { inspectAppLocker } from "../compliance/applocker";
import { assessCompliance } from "../compliance/engine";
import {
  documentedValue,
  unreadableAssignment,
  unreadableOmaValue,
} from "../compliance/graph-rows";
import type { ComplianceAssessment } from "../compliance/types";
import { tenantSettings } from "../benchmarks/tenant-settings";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import {
  parseAssignments,
  parseDeviceConfiguration,
} from "../configuration-parser";
import type { ConfigurationSectionData } from "../configuration-sections";
import { GroupResolver } from "../group-resolver";
import { flattenItemSettings } from "../settings-flatten";
import { diffIdentity, diffSnapshots } from "../snapshots/diff";
import { identityRows } from "../snapshots/identity";
import {
  projectSnapshot,
  type SnapshotProjection,
  type SnapshotTenantIdentityPolicies,
} from "../snapshots/projection";
import { compareSettings, projectionSettings } from "../snapshots/reference";

// Round 42 review findings. Names, ids and values are synthetic.
// 1. Only assignments with an applying intent make a policy assigned: a
//    deviceConfigAssignmentIntent remove or an app uninstall targets nobody,
//    in the engine, the analyzer, the benchmark holders and the
//    documentation.
// 2. Exclusions and removals are applied wherever targets are counted (the
//    desktop list is tested in apps/desktop).
// 3. An omaSettingStringXml value is Edm.Binary holding UTF-8 XML, so the
//    AppLocker inspection and the documentation read it decoded.
// 4. Identity values Graph matches ignoring case compare in their
//    documented spelling, in History and Compare; so do Conditional Access
//    ids and keywords.
// 5. Assignment target and filter ids compare ignoring case in History.

const GROUP_A = "0f0e0d0c-0000-4000-8000-00000000000a";
const GROUP_B = "0f0e0d0c-0000-4000-8000-00000000000b";
const FILTER = "0f0e0d0c-0000-4000-8000-0000000000ff";

const group = (groupId: string, intent?: string, extra = {}) => ({
  id: `assignment-${groupId}-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: {
    "@odata.type": "#microsoft.graph.groupAssignmentTarget",
    groupId,
    ...extra,
  },
});
const exclusion = (groupId: string, intent?: string) => ({
  id: `exclusion-${groupId}`,
  ...(intent ? { intent } : {}),
  target: {
    "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget",
    groupId,
  },
});
const allDevices = (intent?: string) => ({
  id: `all-devices-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
});
const allUsers = (intent?: string) => ({
  id: `all-users-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: {
    "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget",
  },
});

const exportData = (
  parts: Partial<DetailedExportData> = {},
): DetailedExportData =>
  ({
    collectedAt: "2026-10-23T09:00:00Z",
    settingsCatalog: [],
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
    ...parts,
  }) as DetailedExportData;

// A Defender firewall profile whose three profiles are turned on.
const firewall = (assignments: unknown[]) => ({
  id: "synthetic-firewall",
  displayName: "Synthetic firewall",
  "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration",
  firewallProfileDomain: { firewallEnabled: "allowed" },
  firewallProfilePrivate: { firewallEnabled: "allowed" },
  firewallProfilePublic: { firewallEnabled: "allowed" },
  assignments,
});
const firewallStatus = (assignments: unknown[]) =>
  assessCompliance(
    exportData({ deviceConfigurations: [firewall(assignments)] }),
  ).capabilities.find((result) => result.capability.id === "windows-firewall")
    ?.status;

describe("round 42 finding 1: removal intents target nobody", () => {
  it("reads a profile with only remove assignments as not assigned", () => {
    for (const assignments of [
      [group(GROUP_A, "remove")],
      [allDevices("remove")],
      [allUsers("remove"), group(GROUP_B, "remove")],
    ]) {
      const summary = summarizeAssignments(assignments);
      expect(summary.state).toBe("notAssigned");
      expect(summary.targets).toEqual([]);
    }
    expect(summarizeAssignments([group(GROUP_A, "remove")]).removals).toEqual([
      `Remove: Group: ${GROUP_A}`,
    ]);
  });

  it("gives no enforced evidence for a Defender profile that is only removed", () => {
    expect(firewallStatus([group(GROUP_A, "remove")])).toBe(
      "configuredNotAssigned",
    );
    expect(firewallStatus([allDevices("remove")])).toBe(
      "configuredNotAssigned",
    );
  });

  it("still counts apply assignments and assignments without an intent", () => {
    expect(firewallStatus([group(GROUP_A, "apply")])).toBe("enforced");
    expect(firewallStatus([group(GROUP_A)])).toBe("enforced");
    expect(
      summarizeAssignments([group(GROUP_A, "apply"), group(GROUP_B, "remove")])
        .state,
    ).toBe("assigned");
  });

  it("reads a remove of the same target like an exclusion of it", () => {
    expect(
      summarizeAssignments([group(GROUP_A, "apply"), group(GROUP_A, "remove")])
        .state,
    ).toBe("notAssigned");
    expect(
      summarizeAssignments([
        group(GROUP_A, "apply"),
        group(GROUP_A.toUpperCase(), "remove"),
      ]).state,
    ).toBe("notAssigned");
    expect(
      summarizeAssignments([allDevices("apply"), allDevices("remove")]).state,
    ).toBe("notAssigned");
  });

  it("reads app intents as Intune resolves them", () => {
    // Uninstall only: the app is installed nowhere.
    expect(summarizeAssignments([group(GROUP_A, "uninstall")]).state).toBe(
      "notAssigned",
    );
    // Required wins over uninstall, uninstall over available.
    expect(
      summarizeAssignments([
        group(GROUP_A, "required"),
        group(GROUP_A, "uninstall"),
      ]).state,
    ).toBe("assigned");
    expect(
      summarizeAssignments([
        group(GROUP_A, "available"),
        group(GROUP_A, "uninstall"),
      ]).state,
    ).toBe("notAssigned");
    for (const intent of [
      "required",
      "available",
      "availableWithoutEnrollment",
    ])
      expect(summarizeAssignments([allUsers(intent)]).state).toBe("assigned");
  });

  it("keeps an undocumented intent unknown", () => {
    expect(unreadableAssignment(group(GROUP_A, "Remove"))).toBe(true);
    expect(summarizeAssignments([group(GROUP_A, "Remove")]).state).toBe(
      "unknown",
    );
  });

  it("lists removals apart from targets", () => {
    const summary = summarizeAssignments([
      group(GROUP_A, "apply"),
      group(GROUP_B, "remove"),
      group(GROUP_B, "uninstall", {
        deviceAndAppManagementAssignmentFilterId: FILTER,
        deviceAndAppManagementAssignmentFilterType: "include",
      }),
    ]);
    expect(summary.targets).toEqual([`Group: ${GROUP_A}`]);
    expect(assignmentDetails(summary)).toEqual([
      `Group: ${GROUP_A}`,
      `Remove: Group: ${GROUP_B}`,
      `Uninstall: Group: ${GROUP_B}`,
      `Filter include: ${FILTER} (Uninstall: Group: ${GROUP_B})`,
    ]);
  });

  it("leaves other targets unresolved beside a remove of all users or all devices", () => {
    for (const broad of [allDevices("remove"), allUsers("remove")]) {
      expect(summarizeAssignments([group(GROUP_A, "apply"), broad]).state).toBe(
        "unknown",
      );
      expect(firewallStatus([group(GROUP_A, "apply"), broad])).toBe(
        "assignmentUnknown",
      );
    }
    expect(
      summarizeAssignments([allUsers("apply"), allDevices("remove")]).state,
    ).toBe("unknown");
    // A remove of a group beside an apply of all devices stays assigned.
    expect(
      summarizeAssignments([allDevices("apply"), group(GROUP_A, "remove")])
        .state,
    ).toBe("assigned");
  });

  it("leaves available targets unresolved beside an uninstall of all users or all devices", () => {
    for (const broad of [allUsers("uninstall"), allDevices("uninstall")]) {
      for (const intent of ["available", "availableWithoutEnrollment"])
        expect(
          summarizeAssignments([group(GROUP_A, intent), broad]).state,
        ).toBe("unknown");
      // Required wins over uninstall.
      expect(
        summarizeAssignments([group(GROUP_A, "required"), broad]).state,
      ).toBe("assigned");
    }
  });

  it("removes only whom a scope tag removal names", () => {
    const scopeTag = (targetType: string, intent: string) => ({
      id: `scope-${targetType}-${intent}`,
      intent,
      target: {
        "@odata.type": "#microsoft.graph.scopeTagGroupAssignmentTarget",
        entraObjectId: GROUP_A,
        targetType,
      },
    });
    expect(
      summarizeAssignments([
        scopeTag("device", "apply"),
        scopeTag("user", "remove"),
      ]).state,
    ).toBe("assigned");
    expect(
      summarizeAssignments([
        scopeTag("user", "apply"),
        scopeTag("user", "remove"),
      ]).state,
    ).toBe("notAssigned");
    // An exclusion of the group still excludes both.
    expect(
      summarizeAssignments([scopeTag("device", "apply"), exclusion(GROUP_A)])
        .state,
    ).toBe("notAssigned");
  });

  it("counts unresolved policies as unknown in the analyzer", () => {
    const result = analyzeConfigurations(
      exportData({
        deviceConfigurations: [
          firewall([group(GROUP_A, "apply"), allDevices("remove")]),
        ],
      }),
    );
    expect(result.assignedConfigs).toBe(0);
    expect(result.unassignedConfigs).toBe(0);
    expect(result.topGroups).toEqual([]);
  });

  it("does not count removed groups in the analyzer", () => {
    const result = analyzeConfigurations(
      exportData({
        deviceConfigurations: [
          firewall([group(GROUP_A, "remove")]),
          {
            ...firewall([group(GROUP_A, "apply"), group(GROUP_B, "remove")]),
            id: "synthetic-firewall-2",
          },
        ],
      }),
    );
    expect(result.assignedConfigs).toBe(1);
    expect(result.unassignedConfigs).toBe(1);
    expect(result.topGroups).toEqual([[GROUP_A, 1]]);
  });

  it("does not count a removed policy as an assigned benchmark holder", () => {
    const policy = (assignments: unknown[]) => ({
      id: "synthetic-catalog",
      name: "Synthetic catalog",
      platforms: "windows10",
      technologies: "mdm",
      settings: [],
      assignments,
      collectionStatus: { settings: "complete", assignments: "complete" },
    });
    const read = (assignments: unknown[]) =>
      tenantSettings({
        settingsCatalog: [policy(assignments)],
      } as never).policies[0]?.assignment;
    expect(read([allDevices("remove")])).toBe("notAssigned");
    expect(read([allDevices("apply")])).toBe("assigned");
  });

  it("labels removals in the documentation and the group resolver", async () => {
    expect(
      parseAssignments([group(GROUP_A, "remove"), allUsers("uninstall")]),
    ).toBe(`Remove: Group: ${GROUP_A}, Uninstall: All Users`);
    expect(parseAssignments([group(GROUP_A, "apply")])).toBe(
      `Group: ${GROUP_A}`,
    );
    const resolver = new GroupResolver("synthetic");
    expect(
      await resolver.resolveAssignments([
        allDevices("remove"),
        allUsers("required"),
      ]),
    ).toEqual(["Remove: All Devices", "All Users"]);
  });
});

describe("round 42 finding 2: one rule for included and excluded groups", () => {
  it("reads a group both included and excluded, in any case, as not assigned", () => {
    expect(
      summarizeAssignments([group(GROUP_A), exclusion(GROUP_A.toUpperCase())])
        .state,
    ).toBe("notAssigned");
    // An exclusion applies whatever intent it carries.
    expect(
      summarizeAssignments([
        group(GROUP_A, "required"),
        exclusion(GROUP_A, "required"),
      ]).state,
    ).toBe("notAssigned");
  });
});

// --- AppLocker ---------------------------------------------------------------

const TYPES = { EXE: "Exe", DLL: "Dll", MSI: "Msi", Script: "Script" };
const ruleCollection = (type: string, mode = "Enabled") =>
  `<RuleCollection Type="${type}" EnforcementMode="${mode}"><FilePathRule Id="rule" Name="Synthetic folder" UserOrGroupSid="S-1-1-0" Action="Allow"><Conditions><FilePathCondition Path="%PROGRAMFILES%\\*"/></Conditions></FilePathRule></RuleCollection>`;
const base64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const base64url = (text: string) =>
  Buffer.from(text, "utf8").toString("base64url");
const XML_ROW = "#microsoft.graph.omaSettingStringXml";
const appLocker = (value: (type: string) => unknown, odataType = XML_ROW) => ({
  "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
  omaSettings: Object.entries(TYPES).map(([path, type]) => ({
    "@odata.type": odataType,
    omaUri: `./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/synthetic/${path}/Policy`,
    fileName: `${type}.xml`,
    value: value(type),
  })),
});

describe("round 42 finding 3: XML values are UTF-8 bytes in base64", () => {
  it("reads decoded AppLocker XML with enforced rules as enforced", () => {
    for (const encode of [base64, base64url])
      expect(
        inspectAppLocker(appLocker((type) => encode(ruleCollection(type)))),
      ).toMatchObject({ complete: true, matches: true });
  });

  it("still reads audit only rules as not enforced", () => {
    expect(
      inspectAppLocker(
        appLocker((type) => base64(ruleCollection(type, "AuditOnly"))),
      ),
    ).toMatchObject({ complete: true, matches: false });
  });

  it("reads a value that is not base64 of UTF-8 text as unreadable", () => {
    for (const value of [
      "not base64!",
      // Raw XML is no Edm.Binary text.
      ruleCollection("Exe"),
      // 0xFF is no UTF-8 byte.
      "/w==",
    ])
      expect(inspectAppLocker(appLocker(() => value))).toMatchObject({
        complete: false,
        matches: false,
      });
    expect(documentedValue(XML_ROW, "/w==")).toBe(false);
    expect(unreadableOmaValue({ "@odata.type": XML_ROW, value: "/w==" })).toBe(
      true,
    );
  });

  it("decodes UTF-16 XML that starts with a byte order mark", () => {
    const utf16 = (text: string, order: "le" | "be") => {
      const bytes = Buffer.from(`\ufeff${text}`, "utf16le");
      if (order === "be") bytes.swap16();
      return bytes.toString("base64");
    };
    for (const order of ["le", "be"] as const)
      expect(
        inspectAppLocker(
          appLocker((type) => utf16(ruleCollection(type), order)),
        ),
      ).toMatchObject({ complete: true, matches: true });
    // Without a mark the bytes are UTF-8, so UTF-16 text is unreadable.
    expect(
      inspectAppLocker(
        appLocker((type) =>
          Buffer.from(ruleCollection(type), "utf16le").toString("base64"),
        ),
      ),
    ).toMatchObject({ complete: false });
  });

  it("keeps the document type and entity checks on the decoded XML", () => {
    expect(
      inspectAppLocker(
        appLocker((type) =>
          base64(`<!DOCTYPE x [<!ENTITY e "e">]>${ruleCollection(type)}`),
        ),
      ),
    ).toMatchObject({ complete: false, matches: false });
  });

  it("keeps reading plain String rows as text", () => {
    expect(
      inspectAppLocker(
        appLocker(ruleCollection, "#microsoft.graph.omaSettingString"),
      ),
    ).toMatchObject({ complete: true, matches: true });
  });

  it("shows the XML text in the documentation and the setting rows", () => {
    const xml = "<Synthetic>value</Synthetic>";
    const config = {
      "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      omaSettings: [
        {
          "@odata.type": XML_ROW,
          displayName: "Synthetic XML",
          omaUri: "./Vendor/MSFT/Synthetic/Xml",
          value: base64(xml),
        },
      ],
    };
    const rows = flattenItemSettings("deviceConfigurations", config);
    expect(rows.find((row) => row.name === "Synthetic XML")?.value).toBe(xml);
    expect(JSON.stringify(parseDeviceConfiguration(config))).toContain(
      "<Synthetic>value</Synthetic>",
    );
  });
});

// --- History and Compare -----------------------------------------------------

const ASSESSMENT = {
  provenance: { rulesetVersion: "synthetic" },
  generatedAt: "2026-10-23T09:00:00Z",
  scope: {},
  capabilities: [],
  frameworks: [],
} as unknown as ComplianceAssessment;

function project(
  key: string,
  item: unknown,
  tenantIdentityPolicies?: SnapshotTenantIdentityPolicies,
): SnapshotProjection {
  const section = {
    key,
    familyKey: key,
    label: key,
    selectionPrefix: key,
    items: [item],
  } as ConfigurationSectionData;
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(
        {
          collectedAt: "2026-10-23T09:00:00Z",
          sections: [section],
          ...(tenantIdentityPolicies ? { tenantIdentityPolicies } : {}),
        } as never,
        ASSESSMENT,
        new Map(),
        (digest) => `synthetic:${digest}`,
      ),
    ),
  );
}

const profile = (assignments: unknown[]) => ({
  id: "synthetic-profile",
  displayName: "Synthetic profile",
  "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
  passwordRequired: true,
  assignments,
  collectionStatus: { assignments: "complete", settings: "complete" },
});
const assignmentChanges = (from: unknown[], to: unknown[]) =>
  diffSnapshots(
    project("deviceConfigurations", profile(from)),
    project("deviceConfigurations", profile(to)),
  ).policies.flatMap((policy) => policy.assignments);

describe("round 42 finding 5: ids compare ignoring case in History", () => {
  it("reads a group or filter id in another case as the same assignment", () => {
    const filtered = (groupId: string, filterId: string) =>
      group(groupId, "apply", {
        deviceAndAppManagementAssignmentFilterId: filterId,
        deviceAndAppManagementAssignmentFilterType: "include",
      });
    expect(
      assignmentChanges(
        [filtered(GROUP_A, FILTER)],
        [filtered(GROUP_A.toUpperCase(), FILTER.toUpperCase())],
      ),
    ).toEqual([]);
  });

  it("still reads another group as a change", () => {
    expect(
      assignmentChanges([group(GROUP_A, "apply")], [group(GROUP_B, "apply")]),
    ).toHaveLength(2);
  });

  it("reads an intent change from apply to remove as a change", () => {
    expect(
      assignmentChanges([group(GROUP_A, "apply")], [group(GROUP_A, "remove")]),
    ).toEqual([
      { change: "added", label: expect.stringContaining("remove:") },
      { change: "removed", label: expect.stringContaining("apply:") },
    ]);
  });
});

describe("round 42 finding 3: one XML value in any encoding in Compare and History", () => {
  const xml = ruleCollection("Exe");
  const encodings = {
    utf8: base64(xml),
    bom: base64(`\ufeff${xml}`),
    utf16: Buffer.from(`\ufeff${xml}`, "utf16le").toString("base64"),
  };
  const custom = (omaUri: string, value: string) => ({
    id: "synthetic-custom",
    displayName: "Synthetic custom",
    "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
    omaSettings: [
      { "@odata.type": XML_ROW, displayName: "Synthetic XML", omaUri, value },
    ],
    assignments: [allDevices("apply")],
    collectionStatus: { assignments: "complete", settings: "complete" },
  });
  const settingChanges = (omaUri: string, from: string, to: string) =>
    diffSnapshots(
      project("deviceConfigurations", custom(omaUri, from)),
      project("deviceConfigurations", custom(omaUri, to)),
    ).policies.flatMap((policy) => policy.settings);
  const compared = (omaUri: string, from: string, to: string) =>
    compareSettings(
      projectionSettings(project("deviceConfigurations", custom(omaUri, from))),
      projectionSettings(project("deviceConfigurations", custom(omaUri, to))),
    ).groups.flatMap((group) => group.rows.map((row) => row.status));
  // An AppLocker node, whose value the snapshot keeps, and another node,
  // whose value it keeps as a fingerprint.
  const uris = [
    "./Vendor/MSFT/AppLocker/ApplicationLaunchRestrictions/synthetic/EXE/Policy",
    "./Vendor/MSFT/Synthetic/Xml",
  ];

  it("reads the same XML with a byte order mark or in UTF-16 as no change", () => {
    for (const uri of uris)
      for (const other of [encodings.bom, encodings.utf16]) {
        expect(settingChanges(uri, encodings.utf8, other)).toEqual([]);
        expect(compared(uri, encodings.utf8, other)).not.toContain("different");
      }
  });

  it("still reads other XML as a change", () => {
    const other = base64(ruleCollection("Exe", "AuditOnly"));
    for (const uri of uris)
      expect(settingChanges(uri, encodings.utf8, other)).not.toEqual([]);
    expect(compared(uris[0]!, encodings.utf8, other)).toContain("different");
  });
});

const USER = "0f0e0d0c-0000-4000-8000-0000000000aa";

function identity(
  method: string,
  migration = "migrationComplete",
  includeId = "all_users",
): SnapshotTenantIdentityPolicies {
  return {
    status: {
      authenticationMethods: "collected",
      securityDefaults: "collected",
    },
    authenticationMethods: {
      policyMigrationState: migration,
      registrationEnforcement: {
        authenticationMethodsRegistrationCampaign: {
          snoozeDurationInDays: 1,
          enforceRegistrationAfterAllowedSnoozes: false,
          state: "enabled",
          excludeTargets: [{ id: USER, targetType: "user" }],
          includeTargets: [
            {
              id: includeId,
              targetType: "group",
              targetedAuthenticationMethod: method,
            },
          ],
        },
      },
      authenticationMethodConfigurations: [
        {
          "@odata.type":
            "#microsoft.graph.fido2AuthenticationMethodConfiguration",
          id: "Fido2",
          state: "enabled",
          includeTargets: [{ targetType: "group", id: includeId }],
          excludeTargets: [],
        },
      ],
    },
    securityDefaults: { isEnabled: false },
  } as unknown as SnapshotTenantIdentityPolicies;
}

const identityProjection = (value: SnapshotTenantIdentityPolicies) =>
  ({
    format: "intunedoc.snapshot/1",
    collectedAt: "2026-10-23T09:00:00Z",
    rulesetVersion: "synthetic",
    partial: false,
    collectionSkippedFamilies: [],
    fetchErrors: [],
    permissionErrors: [],
    sections: [],
    groupNames: {},
    tenantIdentityPolicies: value,
    assessment: {
      rulesetVersion: "synthetic",
      generatedAt: "2026-10-23T09:00:00Z",
      scope: {},
      capabilities: [],
      frameworks: [],
    },
  }) as unknown as SnapshotProjection;

const identityChanges = (
  from: SnapshotTenantIdentityPolicies,
  to: SnapshotTenantIdentityPolicies,
) =>
  diffIdentity(identityProjection(from), identityProjection(to)).changes.map(
    (change) => change.key,
  );
const identityStatus = (
  from: SnapshotTenantIdentityPolicies,
  to: SnapshotTenantIdentityPolicies,
  setting: string,
) =>
  compareSettings(
    projectionSettings(identityProjection(from)),
    projectionSettings(identityProjection(to)),
  )
    .identity.groups.flatMap((entry) => entry.rows)
    .find((row) => row.setting === setting)?.status;

describe("round 42 finding 4: identity values in their documented spelling", () => {
  it("reads FIDO2 and Fido2 as one campaign method in History and Compare", () => {
    expect(identityChanges(identity("FIDO2"), identity("Fido2"))).toEqual([]);
    expect(
      identityStatus(
        identity("FIDO2"),
        identity("Fido2"),
        "campaign:includeTargets",
      ),
    ).toBe("matching");
  });

  it("shows the method as Graph returned it", () => {
    const row = identityRows(identity("FIDO2")).find(
      (entry) => entry.setting === "campaign:includeTargets",
    );
    expect(row?.display).toBe("All users (FIDO2)");
  });

  it("still reads a real method change as a change", () => {
    expect(
      identityChanges(identity("Fido2"), identity("microsoftAuthenticator")),
    ).toHaveLength(1);
    expect(
      identityStatus(
        identity("Fido2"),
        identity("microsoftAuthenticator"),
        "campaign:includeTargets",
      ),
    ).toBe("different");
  });

  it("reads a migration state in another case as the same state", () => {
    const from = identity("Fido2", "migrationInProgress");
    const to = identity("Fido2", "MigrationInProgress");
    expect(identityChanges(from, to)).toEqual([]);
    expect(identityStatus(from, to, "policyMigrationState")).toBe("matching");
    expect(
      identityChanges(from, identity("Fido2", "migrationComplete")),
    ).toHaveLength(1);
  });

  it("reads all_users and object ids in another case as the same target", () => {
    expect(
      identityChanges(
        identity("Fido2", "migrationComplete", "all_users"),
        identity("Fido2", "migrationComplete", "ALL_USERS"),
      ),
    ).toEqual([]);
    expect(
      identityChanges(
        identity("Fido2", "migrationComplete", GROUP_A),
        identity("Fido2", "migrationComplete", GROUP_A.toUpperCase()),
      ),
    ).toEqual([]);
    expect(
      identityChanges(
        identity("Fido2", "migrationComplete", GROUP_A),
        identity("Fido2", "migrationComplete", GROUP_B),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("round 42 finding 4: Conditional Access ids and keywords", () => {
  const policy = (users: Record<string, unknown>) => ({
    id: "synthetic-ca",
    displayName: "Synthetic CA",
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    state: "enabled",
    conditions: {
      clientAppTypes: ["all"],
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
      },
      users: {
        includeUsers: [],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        ...users,
      },
    },
    grantControls: { operator: "OR", builtInControls: ["mfa"] },
  });
  const changes = (from: unknown, to: unknown) =>
    diffSnapshots(
      project("conditionalAccessPolicies", from),
      project("conditionalAccessPolicies", to),
    ).policies.flatMap((entry) => entry.settings.map((row) => row.change));
  const status = (from: unknown, to: unknown) =>
    compareSettings(
      projectionSettings(project("conditionalAccessPolicies", from)),
      projectionSettings(project("conditionalAccessPolicies", to)),
    )
      .groups.flatMap((entry) => entry.rows)
      .find((row) => row.setting === "Conditions / Users / Include Users")
      ?.status;

  it("reads a group id in another case as the same group in History", () => {
    expect(
      changes(
        policy({ includeGroups: [GROUP_A] }),
        policy({ includeGroups: [GROUP_A.toUpperCase()] }),
      ),
    ).toEqual([]);
    expect(
      changes(
        policy({ includeGroups: [GROUP_A] }),
        policy({ includeGroups: [GROUP_B] }),
      ),
    ).not.toEqual([]);
  });

  it("reads a documented keyword in another case as the keyword", () => {
    expect(
      changes(
        policy({ includeUsers: ["All"] }),
        policy({ includeUsers: ["all"] }),
      ),
    ).toEqual([]);
    expect(
      status(
        policy({ includeUsers: ["All"] }),
        policy({ includeUsers: ["all"] }),
      ),
    ).toBe("matching");
    expect(
      changes(
        policy({ includeUsers: ["All"] }),
        policy({ includeUsers: ["None"] }),
      ),
    ).not.toEqual([]);
  });
});

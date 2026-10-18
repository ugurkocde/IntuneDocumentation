import { describe, expect, it } from "vitest";
import {
  capSnapshotDiff,
  diffIdentity,
  diffSnapshots,
} from "~/lib/snapshots/diff";
import { identityCompleteness, identityRows } from "~/lib/snapshots/identity";
import type {
  SnapshotProjection,
  SnapshotTenantIdentityPolicies,
} from "~/lib/snapshots/projection";
import {
  compareSettings,
  createReference,
  IDENTITY_PLATFORM,
  parseReference,
  projectionSettings,
  referenceSettings,
  serializeReference,
} from "~/lib/snapshots/reference";
import { sha256 } from "~/lib/compliance/manifest";

const GROUP = "b46af1fd-84d5-485b-ba5b-86b7abe448ca";
const USER = "e8ef57e6-3eb3-4bbd-aada-467677f1df07";

type Edit = (identity: Record<string, any>) => void;

// Shapes as Graph beta returns them (lab tenant, 2026-10-18).
function identity(edit?: Edit): SnapshotTenantIdentityPolicies {
  const value: Record<string, any> = {
    status: {
      authenticationMethods: "collected",
      securityDefaults: "collected",
    },
    authenticationMethods: {
      policyMigrationState: "migrationComplete",
      registrationEnforcement: {
        authenticationMethodsRegistrationCampaign: {
          snoozeDurationInDays: 1,
          enforceRegistrationAfterAllowedSnoozes: false,
          state: "default",
          excludeTargets: [{ id: USER, targetType: "user" }],
          includeTargets: [
            {
              id: GROUP,
              targetType: "group",
              targetedAuthenticationMethod: "FIDO2",
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
          includeTargets: [{ targetType: "group", id: "all_users" }],
          excludeTargets: [],
        },
        {
          "@odata.type":
            "#microsoft.graph.smsAuthenticationMethodConfiguration",
          id: "Sms",
          state: "disabled",
          includeTargets: [{ targetType: "group", id: "all_users" }],
          excludeTargets: [],
        },
      ],
    },
    securityDefaults: { isEnabled: false },
  };
  edit?.(value);
  return value as SnapshotTenantIdentityPolicies;
}

function projection(
  tenantIdentityPolicies: SnapshotTenantIdentityPolicies | undefined,
  groupNames: Record<string, string> = {},
): SnapshotProjection {
  return {
    format: "intunedoc.snapshot/1",
    collectedAt: "2026-10-18T10:00:00Z",
    rulesetVersion: "2026.10.5",
    partial: false,
    collectionSkippedFamilies: [],
    fetchErrors: [],
    permissionErrors: [],
    sections: [],
    groupNames,
    ...(tenantIdentityPolicies ? { tenantIdentityPolicies } : {}),
    assessment: {
      rulesetVersion: "2026.10.5",
      generatedAt: "2026-10-18T10:00:00Z",
      scope: {} as SnapshotProjection["assessment"]["scope"],
      capabilities: [],
      frameworks: [],
    },
  };
}

const methods = (value: Record<string, any>) =>
  value.authenticationMethods.authenticationMethodConfigurations as Array<
    Record<string, any>
  >;
const campaign = (value: Record<string, any>) =>
  value.authenticationMethods.registrationEnforcement
    .authenticationMethodsRegistrationCampaign;

describe("identity policy history diff", () => {
  it("finds nothing between equal policies, also with reordered targets", () => {
    const reordered = identity((value) => {
      methods(value)[0]!.includeTargets = [
        { targetType: "group", id: GROUP },
        { targetType: "group", id: "all_users" },
      ];
    });
    const same = identity((value) => {
      methods(value)[0]!.includeTargets = [
        { targetType: "group", id: "all_users" },
        { targetType: "group", id: GROUP },
      ];
    });
    expect(
      diffIdentity(projection(same), projection(reordered)).changes,
    ).toEqual([]);
  });

  it("reports method state, targets, the registration campaign and security defaults", () => {
    const after = identity((value) => {
      methods(value)[1]!.state = "enabled";
      methods(value)[0]!.excludeTargets = [{ targetType: "group", id: GROUP }];
      campaign(value).state = "enabled";
      campaign(value).includeTargets = [
        {
          id: "all_users",
          targetType: "group",
          targetedAuthenticationMethod: "microsoftAuthenticator",
        },
      ];
      value.securityDefaults.isEnabled = true;
    });
    const diff = diffSnapshots(
      projection(identity(), { [GROUP]: "Finance" }),
      projection(after, { [GROUP]: "Finance" }),
    );
    const changes = diff.identity.changes;
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policy: "authenticationMethods",
          path: ["SMS"],
          name: "State",
          change: "changed",
          before: "disabled",
          after: "enabled",
        }),
        expect.objectContaining({
          path: ["Passkey (FIDO2)"],
          name: "Exclude target",
          change: "added",
          before: null,
          after: "Group Finance",
        }),
        expect.objectContaining({
          path: ["Registration campaign"],
          name: "State",
          before: "default",
          after: "enabled",
        }),
        expect.objectContaining({
          path: ["Registration campaign"],
          name: "Include target",
          before: "Group Finance (FIDO2)",
          after: "All users (microsoftAuthenticator)",
        }),
        expect.objectContaining({
          policy: "securityDefaults",
          policyLabel: "Security defaults",
          before: "false",
          after: "true",
        }),
      ]),
    );
    expect(diff.identity.total).toBe(changes.length);
    // Outside the configuration counts.
    expect(diff.policies).toEqual([]);
    expect(diff.totals).toMatchObject({
      policies: 0,
      settingChanges: 0,
      notComparedFamilies: 0,
    });
  });

  it("does not compare a policy that either side did not collect", () => {
    const denied = identity((value) => {
      value.status.authenticationMethods = "permissionDenied";
      delete value.authenticationMethods;
      value.securityDefaults.isEnabled = true;
    });
    const diff = diffIdentity(projection(identity()), projection(denied));
    expect(diff.notCompared).toEqual([
      {
        policy: "authenticationMethods",
        label: "Authentication methods policy",
        side: "to",
      },
    ]);
    // Removed rows of the uncollected policy are no change; security defaults still are.
    expect(diff.changes.map((change) => change.policy)).toEqual([
      "securityDefaults",
    ]);
    expect(
      diffIdentity(projection(denied), projection(identity())).notCompared[0]
        ?.side,
    ).toBe("from");
  });

  it("lists both policies as not compared when an older snapshot has none", () => {
    const diff = diffIdentity(projection(undefined), projection(identity()));
    expect(diff.changes).toEqual([]);
    expect(diff.notCompared.map((entry) => [entry.policy, entry.side])).toEqual(
      [
        ["authenticationMethods", "from"],
        ["securityDefaults", "from"],
      ],
    );
    expect(identityCompleteness(undefined, undefined).notCompared).toEqual([]);
  });

  it("ignores the authorization policy", () => {
    const withAuthorization = identity((value) => {
      value.status.authorization = "collected";
      value.authorization = { allowInvitesFrom: "everyone" };
    });
    expect(
      identityRows(withAuthorization).some((row) =>
        /invite/i.test(row.setting),
      ),
    ).toBe(false);
    expect(
      diffIdentity(projection(identity()), projection(withAuthorization))
        .changes,
    ).toEqual([]);
  });

  it("caps identity rows, keeping the total", () => {
    const after = identity((value) => {
      methods(value)[0]!.state = "disabled";
      methods(value)[1]!.state = "enabled";
    });
    const diff = diffSnapshots(projection(identity()), projection(after));
    const capped = capSnapshotDiff(diff, {
      maxPolicies: 1,
      maxSettingsPerPolicy: 1,
      maxAssignmentsPerPolicy: 1,
      maxValueLength: 3,
      maxNotComparedItems: 1,
      maxIdentityChanges: 1,
    });
    expect(capped.identity.changes).toHaveLength(1);
    expect(capped.identity.total).toBe(2);
    expect(capped.identity.changes[0]).toMatchObject({
      before: "ena...",
      after: "dis...",
    });
  });
});

describe("identity policy comparison", () => {
  const settings = (value = identity()) =>
    projectionSettings(projection(value));

  it("compares identity settings on their own, outside the configuration counts", () => {
    const other = identity((value) => {
      methods(value)[1]!.state = "enabled";
      value.securityDefaults.isEnabled = true;
    });
    const result = compareSettings(settings(), settings(other));
    expect(result.groups).toEqual([]);
    expect(Object.values(result.totals).every((count) => count === 0)).toBe(
      true,
    );
    expect(result.identity.totals.different).toBe(2);
    expect(
      result.identity.groups.every(
        (group) => group.platform === IDENTITY_PLATFORM,
      ),
    ).toBe(true);
    const sms = result.identity.groups
      .flatMap((group) => group.rows)
      .find((row) => row.setting === "method:sms:state");
    expect(sms).toMatchObject({
      status: "different",
      path: ["SMS"],
      expected: [{ value: "disabled" }],
      actual: [{ value: "enabled" }],
    });
  });

  it("treats group and user targets as not comparable across tenants, all users as comparable", () => {
    const result = compareSettings(settings(), settings());
    const rows = result.identity.groups.flatMap((group) => group.rows);
    expect(
      rows.find((row) => row.setting === "campaign:includeTargets")?.status,
    ).toBe("notComparable");
    expect(
      rows.find((row) => row.setting === "campaign:excludeTargets")?.status,
    ).toBe("notComparable");
    expect(
      rows.find((row) => row.setting === "method:fido2:includeTargets"),
    ).toMatchObject({
      status: "matching",
      expected: [{ value: "All users" }],
    });
  });

  it("lists a policy not collected on one side as not compared", () => {
    const denied = identity((value) => {
      value.status.securityDefaults = "failed";
      delete value.securityDefaults;
    });
    const result = compareSettings(settings(), settings(denied));
    expect(result.identity.notCompared).toEqual([
      {
        family: "securityDefaults",
        label: "Security defaults",
        side: "current",
      },
    ]);
    expect(
      result.identity.groups.some(
        (group) => group.family === "securityDefaults",
      ),
    ).toBe(false);
  });

  it("keeps identity settings in a reference file without any group or user id", async () => {
    const file = await createReference(projection(identity()), {
      createdAt: "2026-10-18T10:00:00.000Z",
      sourceLabel: "11111111...",
    });
    const text = serializeReference(file);
    expect(text).not.toContain(GROUP);
    expect(text).not.toContain(USER);
    const parsed = await parseReference(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = compareSettings(referenceSettings(parsed.file), settings());
    expect(result.identity.totals.different).toBe(0);
    expect(result.identity.totals.matching).toBeGreaterThan(0);
  });

  it("rejects identity settings outside an identity policy or with unknown keys", async () => {
    const file = await createReference(projection(identity()), {
      createdAt: "2026-10-18T10:00:00.000Z",
      sourceLabel: "11111111...",
    });
    const resign = async (body: Record<string, unknown>) => {
      const copy = { ...body };
      delete copy.checksum;
      return JSON.stringify({
        ...copy,
        checksum: { algorithm: "sha-256", value: await sha256(copy) },
      });
    };
    const identityPart = file.identity!;
    for (const bad of [
      { ...identityPart, extra: true },
      {
        ...identityPart,
        families: [
          ...identityPart.families,
          { key: "authorization", label: "Authorization" },
        ],
      },
      {
        ...identityPart,
        settings: [{ ...identityPart.settings[0]!, platform: "Windows" }],
      },
      { ...identityPart, notCompared: identityPart.families },
    ]) {
      const parsed = await parseReference(
        await resign({ ...file, identity: bad }),
      );
      expect(parsed).toEqual({ ok: false, reason: "schema" });
    }
  });

  it("reads an older reference without identity settings as not compared there", async () => {
    const file = await createReference(projection(identity()), {
      createdAt: "2026-10-18T10:00:00.000Z",
      sourceLabel: "11111111...",
    });
    const older = { ...file };
    delete older.identity;
    const result = compareSettings(referenceSettings(older), settings());
    expect(result.identity.groups).toEqual([]);
    expect(result.identity.notCompared.map((entry) => entry.side)).toEqual([
      "reference",
      "reference",
    ]);
  });
});

// Entra tenant identity policies of a snapshot as comparable rows: the
// authentication methods policy (method state, include and exclude targets,
// the registration campaign) and the security defaults state. They are
// tenant-wide settings, not configuration policies, so the history diff and
// the comparison report them on their own, outside the configuration
// counts. A policy is compared only when both sides collected it, and a
// setting only when both sides could read it: a field Graph omitted or
// returned in an unsupported shape or with a value it does not document is
// unreadable, never an empty, removed or changed value.
import type { SnapshotTenantIdentityPolicies } from "./projection";
import {
  isDocumented,
  type DocumentedField,
} from "../compliance/documented-values";

export type IdentityPolicyName = "authenticationMethods" | "securityDefaults";

export const IDENTITY_POLICY_LABELS: Readonly<
  Record<IdentityPolicyName, string>
> = {
  authenticationMethods: "Authentication methods policy",
  securityDefaults: "Security defaults",
};

const POLICIES = Object.keys(IDENTITY_POLICY_LABELS) as IdentityPolicyName[];

// Method configuration ids as Graph returns them, with the names the Entra
// admin center shows.
const METHOD_NAMES: Readonly<Record<string, string>> = {
  fido2: "Passkey (FIDO2)",
  microsoftauthenticator: "Microsoft Authenticator",
  sms: "SMS",
  temporaryaccesspass: "Temporary Access Pass",
  hardwareoath: "Hardware OATH tokens",
  softwareoath: "Third-party software OATH tokens",
  voice: "Voice call",
  email: "Email OTP",
  x509certificate: "Certificate-based authentication",
  qrcodepin: "QR code",
  verifiablecredentials: "Verified ID",
};

export interface IdentityRow {
  policy: IdentityPolicyName;
  // Stable key within the policy; repeated for each target of a list.
  setting: string;
  name: string;
  path: string[];
  // What is compared: target ids, not their display names.
  value: string;
  // What is shown: target ids resolved to group names.
  display: string;
  // The target is a directory object of this tenant (a group or user id),
  // so it means nothing in another tenant.
  tenantObject?: true;
  // Graph omitted the field or returned an unsupported shape on this side,
  // so the setting is not compared. Value and display are empty.
  unreadable?: true;
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function plain(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
}

// Whether the policy was read on this side: collected, and for the
// authentication methods policy with its method configurations, which the
// engine also needs to read it.
export function identityCollected(
  identity: SnapshotTenantIdentityPolicies | undefined,
  policy: IdentityPolicyName,
): boolean {
  const data = identity?.[policy];
  return (
    identity?.status?.[policy] === "collected" &&
    isRecord(data) &&
    (policy !== "authenticationMethods" ||
      Array.isArray(data.authenticationMethodConfigurations))
  );
}

function unreadableRow(
  policy: IdentityPolicyName,
  setting: string,
  name: string,
  path: string[],
): IdentityRow {
  return {
    policy,
    setting,
    name,
    path,
    value: "",
    display: "",
    unreadable: true,
  };
}

// A target is read only with a string id and a documented target type; the
// registration campaign also names a documented method to register.
function targetRows(
  policy: IdentityPolicyName,
  setting: string,
  name: string,
  path: string[],
  list: unknown,
  groupNames: Readonly<Record<string, string>>,
  campaign = false,
): IdentityRow[] {
  const readable =
    Array.isArray(list) &&
    list.every(
      (target) =>
        isRecord(target) &&
        typeof target.id === "string" &&
        isDocumented("authenticationMethodTargetType", target.targetType) &&
        (!campaign ||
          !("targetedAuthenticationMethod" in target) ||
          isDocumented(
            "targetedAuthenticationMethod",
            target.targetedAuthenticationMethod,
          )),
    );
  if (!readable) return [unreadableRow(policy, setting, name, path)];
  return (list as Json[]).map((target) => {
    const id = target.id as string;
    const type = target.targetType as string;
    const method = plain(target.targetedAuthenticationMethod);
    const all = id.toLowerCase() === "all_users";
    const label = all
      ? "All users"
      : `${type.charAt(0).toUpperCase()}${type.slice(1)} ${groupNames[id] ?? id}`;
    return {
      policy,
      setting,
      name,
      path,
      value: [type, id, method ?? ""].join(":"),
      display: method ? `${label} (${method})` : label,
      ...(all || !id ? {} : { tenantObject: true as const }),
    };
  });
}

// Compared value of an explicit null, apart from any text Graph returns.
const NULL_VALUE = "\u0000null";

// What a compared field must be to be read: one of its documented enum
// values, or a value of its documented type.
type Expected = DocumentedField | "boolean" | ((value: unknown) => boolean);

function valueRow(
  policy: IdentityPolicyName,
  setting: string,
  name: string,
  path: string[],
  value: unknown,
  expected: Expected,
): IdentityRow[] {
  // An explicit null is a value Graph returned: nothing is set.
  if (value === null)
    return [
      { policy, setting, name, path, value: NULL_VALUE, display: "Not set" },
    ];
  const valid =
    expected === "boolean"
      ? typeof value === "boolean"
      : typeof expected === "function"
        ? expected(value)
        : isDocumented(expected, value);
  const text = plain(value);
  return !valid || text === null
    ? [unreadableRow(policy, setting, name, path)]
    : [{ policy, setting, name, path, value: text, display: text }];
}

// Microsoft Learn: minimum 0 days, maximum 14 days.
const snoozeDays = (value: unknown) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 14;

// Rows of every policy collected on this side.
export function identityRows(
  identity: SnapshotTenantIdentityPolicies | undefined,
  groupNames: Readonly<Record<string, string>> = {},
): IdentityRow[] {
  const rows: IdentityRow[] = [];
  if (identityCollected(identity, "authenticationMethods")) {
    const methods = isRecord(identity!.authenticationMethods)
      ? identity!.authenticationMethods
      : {};
    const policy = "authenticationMethods" as const;
    rows.push(
      ...valueRow(
        policy,
        "policyMigrationState",
        "Migration state",
        [],
        methods.policyMigrationState,
        "authenticationMethodsPolicyMigrationState",
      ),
    );
    const configurations = Array.isArray(
      methods.authenticationMethodConfigurations,
    )
      ? methods.authenticationMethodConfigurations.filter(isRecord)
      : [];
    for (const configuration of configurations) {
      const id = plain(configuration.id);
      if (!id) continue;
      const path = [METHOD_NAMES[id.toLowerCase()] ?? id];
      const base = `method:${id.toLowerCase()}`;
      rows.push(
        ...valueRow(
          policy,
          `${base}:state`,
          "State",
          path,
          configuration.state,
          "authenticationMethodState",
        ),
        ...targetRows(
          policy,
          `${base}:includeTargets`,
          "Include target",
          path,
          configuration.includeTargets,
          groupNames,
        ),
        ...targetRows(
          policy,
          `${base}:excludeTargets`,
          "Exclude target",
          path,
          configuration.excludeTargets,
          groupNames,
        ),
        // Only certificate-based authentication has a default mode. A mode
        // configuration Graph omitted or returned as null holds no readable
        // mode, as the engine reads it (tenant-policies.ts).
        ...(id.toLowerCase() === "x509certificate"
          ? valueRow(
              policy,
              `${base}:x509CertificateAuthenticationDefaultMode`,
              "Default authentication mode",
              path,
              isRecord(configuration.authenticationModeConfiguration)
                ? configuration.authenticationModeConfiguration
                    .x509CertificateAuthenticationDefaultMode
                : undefined,
              "x509CertificateAuthenticationMode",
            )
          : []),
      );
    }
    // Graph beta: registrationEnforcement.authenticationMethodsRegistrationCampaign
    // (checked in the lab tenant, 2026-10-18 and 2026-10-21).
    const enforcement = isRecord(methods.registrationEnforcement)
      ? methods.registrationEnforcement
      : {};
    // A campaign Graph omitted leaves each of its settings unreadable.
    const campaign = isRecord(
      enforcement.authenticationMethodsRegistrationCampaign,
    )
      ? enforcement.authenticationMethodsRegistrationCampaign
      : {};
    const path = ["Registration campaign"];
    rows.push(
      ...valueRow(
        policy,
        "campaign:state",
        "State",
        path,
        campaign.state,
        "advancedConfigState",
      ),
      ...valueRow(
        policy,
        "campaign:snoozeDurationInDays",
        "Days users can postpone",
        path,
        campaign.snoozeDurationInDays,
        snoozeDays,
      ),
      ...valueRow(
        policy,
        "campaign:enforceRegistrationAfterAllowedSnoozes",
        "Require registration after the allowed postponements",
        path,
        campaign.enforceRegistrationAfterAllowedSnoozes,
        "boolean",
      ),
      ...targetRows(
        policy,
        "campaign:includeTargets",
        "Include target",
        path,
        campaign.includeTargets,
        groupNames,
        true,
      ),
      ...targetRows(
        policy,
        "campaign:excludeTargets",
        "Exclude target",
        path,
        campaign.excludeTargets,
        groupNames,
      ),
    );
  }
  if (identityCollected(identity, "securityDefaults")) {
    const defaults = isRecord(identity!.securityDefaults)
      ? identity!.securityDefaults
      : {};
    rows.push(
      ...valueRow(
        "securityDefaults",
        "isEnabled",
        "Security defaults turned on",
        [],
        defaults.isEnabled,
        "boolean",
      ),
    );
  }
  return rows;
}

export interface IdentityNotCompared {
  policy: IdentityPolicyName;
  label: string;
  // Which side did not collect it, or could not read the settings.
  side: "from" | "to" | "both";
  // Set when the policy was read on both sides but these settings were not
  // readable on one of them, so only they were not compared.
  settings?: string[];
}

// Policies collected on both sides, and the others with the side that lacks
// them. A policy collected on neither side is listed only when one side has
// identity policies at all, so collections from before identity signals do
// not add noise to both.
export function identityCompleteness(
  from: SnapshotTenantIdentityPolicies | undefined,
  to: SnapshotTenantIdentityPolicies | undefined,
): { compared: IdentityPolicyName[]; notCompared: IdentityNotCompared[] } {
  const compared: IdentityPolicyName[] = [];
  const notCompared: IdentityNotCompared[] = [];
  for (const policy of POLICIES) {
    const a = identityCollected(from, policy);
    const b = identityCollected(to, policy);
    if (a && b) compared.push(policy);
    else if (a || b || from || to)
      notCompared.push({
        policy,
        label: IDENTITY_POLICY_LABELS[policy],
        side: a ? "to" : b ? "from" : "both",
      });
  }
  return { compared, notCompared };
}

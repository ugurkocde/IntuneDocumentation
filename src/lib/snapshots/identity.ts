// Entra tenant identity policies of a snapshot as comparable rows: the
// authentication methods policy (method state, include and exclude targets,
// the registration campaign) and the security defaults state. They are
// tenant-wide settings, not configuration policies, so the history diff and
// the comparison report them on their own, outside the configuration
// counts. A policy is compared only when both sides collected it.
import type { SnapshotTenantIdentityPolicies } from "./projection";

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

// Whether the policy was read on this side.
export function identityCollected(
  identity: SnapshotTenantIdentityPolicies | undefined,
  policy: IdentityPolicyName,
): boolean {
  return identity?.status?.[policy] === "collected";
}

function targetRows(
  policy: IdentityPolicyName,
  setting: string,
  name: string,
  path: string[],
  list: unknown,
  groupNames: Readonly<Record<string, string>>,
): IdentityRow[] {
  if (!Array.isArray(list)) return [];
  return list.filter(isRecord).map((target) => {
    const id = plain(target.id) ?? "";
    const type = plain(target.targetType) ?? "";
    const method = plain(target.targetedAuthenticationMethod);
    const all = id.toLowerCase() === "all_users";
    const label = all
      ? "All users"
      : `${type ? `${type.charAt(0).toUpperCase()}${type.slice(1)} ` : ""}${groupNames[id] ?? id}`;
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

function valueRow(
  policy: IdentityPolicyName,
  setting: string,
  name: string,
  path: string[],
  value: unknown,
): IdentityRow[] {
  const text = plain(value);
  return text === null
    ? []
    : [{ policy, setting, name, path, value: text, display: text }];
}

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
        ...valueRow(
          policy,
          `${base}:x509CertificateAuthenticationDefaultMode`,
          "Default authentication mode",
          path,
          isRecord(configuration.authenticationModeConfiguration)
            ? configuration.authenticationModeConfiguration
                .x509CertificateAuthenticationDefaultMode
            : undefined,
        ),
      );
    }
    // Graph beta: registrationEnforcement.authenticationMethodsRegistrationCampaign
    // (checked in the lab tenant, 2026-10-18). Read when the snapshot kept it.
    const enforcement = isRecord(methods.registrationEnforcement)
      ? methods.registrationEnforcement
      : {};
    const campaign = enforcement.authenticationMethodsRegistrationCampaign;
    if (isRecord(campaign)) {
      const path = ["Registration campaign"];
      rows.push(
        ...valueRow(policy, "campaign:state", "State", path, campaign.state),
        ...valueRow(
          policy,
          "campaign:snoozeDurationInDays",
          "Days users can postpone",
          path,
          campaign.snoozeDurationInDays,
        ),
        ...valueRow(
          policy,
          "campaign:enforceRegistrationAfterAllowedSnoozes",
          "Require registration after the allowed postponements",
          path,
          campaign.enforceRegistrationAfterAllowedSnoozes,
        ),
        ...targetRows(
          policy,
          "campaign:includeTargets",
          "Include target",
          path,
          campaign.includeTargets,
          groupNames,
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
      ),
    );
  }
  return rows;
}

export interface IdentityNotCompared {
  policy: IdentityPolicyName;
  label: string;
  // Which side did not collect it.
  side: "from" | "to" | "both";
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

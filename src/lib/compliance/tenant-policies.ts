import type { DetailedExportData } from "../configuration-analyzer";
import type {
  AssignmentSummary,
  CapabilityEvidence,
  CollectionCoverage,
  ComplianceCapability,
  TechnicalCheck,
  TenantIdentityPolicyName,
  TenantPolicySignal,
} from "./types";

// Entra tenant policies are tenant-wide: they have no assignment relation, so
// evidence carries a fixed "tenant-wide" assignment and never claims device or
// sign-in coverage. Semantics and counter-evidence are documented in README.md.

type ExportData = Omit<DetailedExportData, "groupNames">;

/** Coverage family per policy, named after the Graph resource. */
export const TENANT_POLICY_FAMILIES: Record<TenantIdentityPolicyName, string> =
  {
    authenticationMethods: "authenticationMethodsPolicy",
    securityDefaults: "identitySecurityDefaultsEnforcementPolicy",
    authorization: "authorizationPolicy",
  };

const POLICY_NAMES: Record<TenantIdentityPolicyName, string> = {
  authenticationMethods: "Authentication methods policy",
  securityDefaults: "Security defaults",
  authorization: "Authorization policy",
};

// Delegated reads also need a directory role that may read the policy, for
// example Global Reader (Microsoft Learn, Get authenticationMethodsPolicy).
const PERMISSION_HINT =
  "Reading it needs Policy.Read.All, the permission used for Conditional Access, and a directory role that can read tenant policies, such as Global Reader. Grant consent or sign in with such a role, then refresh the policies.";

const TENANT_WIDE: AssignmentSummary = {
  state: "assigned",
  targets: ["Tenant-wide Entra ID policy"],
  exclusions: [],
  filters: [],
  coverage: "unverified",
};

const CAVEAT = {
  en: "Tenant-wide Entra ID policy setting. It shows what the tenant allows, not which methods users registered or which sign-ins used them.",
  de: "Mandantenweite Einstellung einer Entra ID-Richtlinie. Sie zeigt, was der Mandant zulässt, nicht welche Methoden Benutzer registriert haben oder bei Anmeldungen verwendet wurden.",
};

/** Conditional Access capabilities that replace security defaults. */
export const CONDITIONAL_ACCESS_ALTERNATIVES = [
  "tenant-mfa-required",
  "tenant-mfa-all-apps",
  "tenant-phishing-resistant-mfa",
  "tenant-compliant-device-required",
] as const;

const methodsDocs =
  "https://learn.microsoft.com/en-us/graph/api/resources/authenticationmethodspolicy?view=graph-rest-beta";

export const TENANT_POLICY_CAPABILITIES: readonly ComplianceCapability[] = [
  {
    id: "tenant-phishing-resistant-method-enabled",
    platform: "tenant",
    name: "Phishing-resistant sign-in method enabled (Entra ID)",
    description:
      "The authentication methods policy enables passkeys (FIDO2) or multifactor certificate-based authentication for at least one user group. Enabling a method does not require anyone to use it.",
    caveat: CAVEAT,
    documentationUrl: methodsDocs,
    signals: [
      {
        source: "tenantPolicy",
        policy: "authenticationMethods",
        check: "phishingResistantMethodEnabled",
      },
    ],
  },
  {
    id: "tenant-weak-methods-disabled",
    platform: "tenant",
    name: "SMS, voice call and email one-time passcode disabled (Entra ID)",
    description:
      "The authentication methods policy does not enable SMS, voice call or email one-time passcode for any user group. Legacy per-user MFA and SSPR settings are not read.",
    caveat: CAVEAT,
    documentationUrl: methodsDocs,
    signals: [
      {
        source: "tenantPolicy",
        policy: "authenticationMethods",
        check: "weakMethodsDisabled",
      },
    ],
  },
  {
    id: "tenant-security-defaults-enabled",
    platform: "tenant",
    name: "Security defaults enabled (Entra ID)",
    description:
      "Security defaults require MFA registration for all users and MFA challenges when Entra ID decides they are needed. This is baseline MFA, not phishing-resistant authentication, and it cannot be combined with Conditional Access policies.",
    caveat: CAVEAT,
    documentationUrl:
      "https://learn.microsoft.com/en-us/graph/api/resources/identitysecuritydefaultsenforcementpolicy?view=graph-rest-beta",
    // Creating Conditional Access policies prevents enabling security defaults
    // (Microsoft Learn, Plan a Conditional Access deployment), so any
    // Conditional Access MFA or compliant-device evidence rules them out.
    alternativeTo: CONDITIONAL_ACCESS_ALTERNATIVES,
    signals: [
      {
        source: "tenantPolicy",
        policy: "securityDefaults",
        check: "securityDefaultsEnabled",
      },
    ],
  },
];

export const TENANT_POLICY_EXPECTED: Record<
  TenantPolicySignal["check"],
  string
> = {
  phishingResistantMethodEnabled:
    "Passkeys (FIDO2) or multifactor certificate-based authentication enabled for at least one user group",
  weakMethodsDisabled:
    "SMS, voice call and email one-time passcode not enabled for any user group",
  securityDefaultsEnabled: "Security defaults enabled",
};

export function tenantPolicySettingId(signal: TenantPolicySignal): string {
  return `${TENANT_POLICY_FAMILIES[signal.policy]}.${signal.check}`;
}

/**
 * One coverage row per Entra policy. With `requireData`, a snapshot without
 * `tenantIdentityPolicies` (an older export) reports every policy as not
 * collected, so dependent checks are unable to check instead of missing.
 */
export function tenantPolicyCoverage(
  data: ExportData,
  evidence: ReadonlySet<string> = new Set(),
  requireData = false,
): CollectionCoverage[] {
  const policies = data.tenantIdentityPolicies;
  if (!policies && !requireData) return [];
  return (
    Object.keys(TENANT_POLICY_FAMILIES) as TenantIdentityPolicyName[]
  ).map((name) => {
    const family = TENANT_POLICY_FAMILIES[name];
    const status = policies?.status?.[name];
    const collected = status === "collected" && Boolean(policies?.[name]);
    const reason = policies?.errors?.[name];
    const errors =
      !policies || collected || status === "skipped"
        ? []
        : [
            status === "permissionDenied"
              ? `${POLICY_NAMES[name]}: access denied. ${PERMISSION_HINT}`
              : `${POLICY_NAMES[name]}: ${reason ?? "the Microsoft Graph request failed"}. Refresh the policies to retry.`,
          ];
    return {
      family,
      collectedPolicies: collected ? 1 : 0,
      recognizedPolicies:
        collected && evidence.has(`${family}:${family}`) ? 1 : 0,
      unsupportedPolicies:
        collected && !evidence.has(`${family}:${family}`) ? 1 : 0,
      status: collected
        ? data.collectedAt
          ? "complete"
          : "unknown"
        : errors.length
          ? "incomplete"
          : // Without a collection timestamp, completeness is unknown, as for
            // every other family of an imported snapshot.
            policies || data.collectedAt
            ? "notCollected"
            : "unknown",
      errors: errors.length
        ? errors
        : !collected
          ? [
              policies
                ? `${POLICY_NAMES[name]} was not collected${reason ? `: ${reason}` : ""}.`
                : `${POLICY_NAMES[name]} is not part of this snapshot.`,
            ]
          : [],
    };
  });
}

export function tenantPolicyNames(
  capability: ComplianceCapability,
): TenantIdentityPolicyName[] {
  return [
    ...new Set(
      capability.signals.flatMap((signal) =>
        signal.source === "tenantPolicy" ? [signal.policy] : [],
      ),
    ),
  ];
}

interface MethodState {
  id: string;
  readable: boolean;
  enabledForUsers: boolean;
  /** Certificate-based authentication default mode, when present. */
  mode?: unknown;
  actual: string;
}

function methodState(configs: unknown[], id: string): MethodState {
  const config = configs.find(
    (item): item is Record<string, any> =>
      !!item &&
      typeof item === "object" &&
      String((item as any).id).toLowerCase() === id.toLowerCase(),
  );
  if (!config || typeof config.state !== "string")
    return { id, readable: false, enabledForUsers: false, actual: "null" };
  const targets = Array.isArray(config.includeTargets)
    ? config.includeTargets.length
    : null;
  const x509Mode =
    id === "X509Certificate"
      ? (config.authenticationModeConfiguration
          ?.x509CertificateAuthenticationDefaultMode ?? null)
      : undefined;
  return {
    id,
    readable: targets !== null,
    // A method enabled without include targets applies to no user group, as
    // in Microsoft's default email OTP configuration for guests.
    enabledForUsers: config.state === "enabled" && (targets ?? 0) > 0,
    mode: x509Mode,
    actual: JSON.stringify({
      state: config.state,
      includeTargets: targets,
      ...(x509Mode !== undefined ? { defaultMode: x509Mode } : {}),
    }),
  };
}

/** Evidence and checks for the tenant policy signals of one capability. */
export function evaluateTenantPolicySignals(
  data: ExportData,
  capability: ComplianceCapability,
): { evidence: CapabilityEvidence[]; checks: TechnicalCheck[] } {
  const evidence: CapabilityEvidence[] = [];
  const checks: TechnicalCheck[] = [];
  for (const signal of capability.signals) {
    if (signal.source !== "tenantPolicy") continue;
    const policies = data.tenantIdentityPolicies;
    const policy = policies?.[signal.policy];
    // Failed, skipped or absent reads become collection gaps in the engine.
    if (policies?.status?.[signal.policy] !== "collected" || !policy) continue;
    const family = TENANT_POLICY_FAMILIES[signal.policy];
    const settingId = tenantPolicySettingId(signal);
    const expected = TENANT_POLICY_EXPECTED[signal.check];
    const base = {
      policyId: family,
      policyName: POLICY_NAMES[signal.policy],
      assignment: TENANT_WIDE,
    };
    const push = (verdict: "enforced" | "disabled", observed: string) =>
      evidence.push({
        capabilityId: capability.id,
        policyId: family,
        policyName: POLICY_NAMES[signal.policy],
        policyType: "Entra ID tenant policy",
        familyKey: family,
        source: "tenantPolicy",
        settingId,
        observedValue: observed,
        verdict,
        assignment: TENANT_WIDE,
        kind: "configuration",
        requirementGroup: signal.requirementGroup,
        policyModifiedAt:
          typeof policy.lastModifiedDateTime === "string"
            ? policy.lastModifiedDateTime
            : undefined,
      });

    if (signal.check === "securityDefaultsEnabled") {
      const enabled = policy.isEnabled;
      if (typeof enabled !== "boolean") {
        checks.push({
          ...base,
          assessmentStatus: "unableToCheck",
          result: null,
          settingId,
          expectedValue: expected,
          actualValue: null,
          reason: "Graph did not return a readable isEnabled value.",
        });
        continue;
      }
      checks.push({
        ...base,
        assessmentStatus: "checked",
        result: enabled ? "matches" : "different",
        settingId,
        expectedValue: expected,
        actualValue: JSON.stringify(enabled),
        reason: enabled
          ? "Baseline MFA for all users. This is not phishing-resistant authentication."
          : "Security defaults are off. They are only needed when no Conditional Access policy is used, because the two cannot be combined; off is not counter-evidence.",
      });
      // Off is not counter-evidence: Conditional Access replaces security defaults.
      if (enabled) push("enforced", "Security defaults enabled");
      continue;
    }

    const configs = policy.authenticationMethodConfigurations;
    if (!Array.isArray(configs)) {
      checks.push({
        ...base,
        assessmentStatus: "unableToCheck",
        result: null,
        settingId,
        expectedValue: expected,
        actualValue: null,
        reason:
          "Graph omitted the authentication method configurations of this policy.",
      });
      continue;
    }

    if (signal.check === "phishingResistantMethodEnabled") {
      const states = ["Fido2", "X509Certificate"].map((id) => {
        const state = methodState(configs, id);
        // Certificate-based authentication is phishing resistant only as a
        // multifactor method; single-factor default mode does not count.
        if (id === "X509Certificate" && state.enabledForUsers)
          state.enabledForUsers = state.mode === "x509CertificateMultiFactor";
        return state;
      });
      const enabled = states.filter((state) => state.enabledForUsers);
      for (const state of states)
        checks.push({
          ...base,
          assessmentStatus: state.readable ? "checked" : "unableToCheck",
          // One phishing-resistant method is enough: the other is an
          // alternative, not a different value.
          result: state.readable
            ? state.enabledForUsers
              ? "matches"
              : enabled.length
                ? null
                : "different"
            : null,
          settingId: `${family}/${state.id}`,
          expectedValue:
            state.id === "Fido2"
              ? "Enabled for at least one user group"
              : "Enabled for at least one user group with multifactor default mode",
          actualValue: state.actual,
          reason: !state.readable
            ? "Graph did not return a readable state and include targets for this method."
            : !state.enabledForUsers && enabled.length
              ? `Not required: ${enabled.map((item) => item.id).join(" and ")} is enabled, and one phishing-resistant method is enough.`
              : undefined,
        });
      // Disabled methods are not counter-evidence: Windows Hello for Business
      // is phishing resistant and is not part of this policy.
      if (enabled.length)
        push(
          "enforced",
          `${enabled.map((state) => state.id).join(" and ")} enabled for at least one user group`,
        );
      continue;
    }

    const states = ["Sms", "Voice", "Email"].map((id) =>
      methodState(configs, id),
    );
    for (const state of states)
      checks.push({
        ...base,
        assessmentStatus: state.readable ? "checked" : "unableToCheck",
        result: state.readable
          ? state.enabledForUsers
            ? "different"
            : "matches"
          : null,
        settingId: `${family}/${state.id}`,
        expectedValue: "Disabled, or enabled without any user group",
        actualValue: state.actual,
        reason: state.readable
          ? undefined
          : "Graph did not return a readable state and include targets for this method.",
      });
    const enabled = states.filter((state) => state.enabledForUsers);
    if (enabled.length)
      push(
        "disabled",
        `${enabled.map((state) => state.id).join(", ")} enabled for at least one user group`,
      );
    else if (states.every((state) => state.readable))
      push("enforced", "Sms, Voice and Email not enabled for any user group");
  }
  return { evidence, checks };
}

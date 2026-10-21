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
import { isDocumented } from "./documented-values";

// Entra tenant policies are tenant-wide: they have no assignment relation, so
// evidence carries a fixed "tenant-wide" assignment and never claims device or
// sign-in coverage. Semantics and counter-evidence are documented in README.md.

type ExportData = Omit<DetailedExportData, "groupNames">;

/** Coverage family per policy, named after the Graph resource. */
export const TENANT_POLICY_FAMILIES: Record<TenantIdentityPolicyName, string> =
  {
    authenticationMethods: "authenticationMethodsPolicy",
    securityDefaults: "identitySecurityDefaultsEnforcementPolicy",
  };

const POLICY_NAMES: Record<TenantIdentityPolicyName, string> = {
  authenticationMethods: "Authentication methods policy",
  securityDefaults: "Security defaults",
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

/**
 * Conditional Access MFA capabilities that replace security defaults. A
 * compliant-device requirement is not the same safeguard; it is covered by
 * the exclusivity of security defaults with Conditional Access instead.
 */
export const CONDITIONAL_ACCESS_ALTERNATIVES = [
  "tenant-mfa-required",
  "tenant-mfa-all-apps",
  "tenant-phishing-resistant-mfa",
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
    name: "SMS, voice call and email one-time passcode not enabled for users (Entra ID)",
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
    // Assigned enforcing Conditional Access MFA delivers the same safeguard.
    // Any Conditional Access policy, disabled ones included, prevents
    // enabling security defaults (Microsoft Learn, Plan a Conditional Access
    // deployment), so they are then not applicable, never recommended.
    alternativeTo: CONDITIONAL_ACCESS_ALTERNATIVES,
    exclusiveWithConditionalAccess: true,
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
  /** Enabled for users, but the default mode could not be read. */
  modeUnreadable?: boolean;
  /** Plain text for reports, for example "Enabled for 1 target". */
  actual: string | null;
}

const X509_MODES: Record<string, string> = {
  x509CertificateSingleFactor: "single-factor default mode",
  x509CertificateMultiFactor: "multifactor default mode",
};

/** Readable state of one method, never raw JSON (README "Tenant policies"). */
function methodActual(state: string, targets: number | null, mode: unknown) {
  const base =
    state === "enabled"
      ? targets === null
        ? "Enabled, include targets not readable"
        : targets > 0
          ? `Enabled for ${targets} ${targets === 1 ? "target" : "targets"}`
          : "Enabled, no users targeted"
      : state === "disabled"
        ? "Disabled"
        : `State ${state}`;
  if (mode === undefined) return base;
  return `${base}; ${typeof mode === "string" ? (Object.hasOwn(X509_MODES, mode) ? X509_MODES[mode] : `default mode ${mode}`) : "default mode not readable"}`;
}

// Include targets as a count of the users and groups they name, or null
// when Graph omitted the list or returned only targets it did not document.
function targetCount(list: unknown): number | null {
  if (!Array.isArray(list)) return null;
  const valid = list.filter(
    (target) =>
      !!target &&
      typeof target === "object" &&
      typeof target.id === "string" &&
      isDocumented("authenticationMethodTargetType", target.targetType),
  ).length;
  return valid || !list.length ? valid : null;
}

function methodState(configs: unknown[], id: string): MethodState {
  const config = configs.find(
    (item): item is Record<string, any> =>
      !!item &&
      typeof item === "object" &&
      String((item as any).id).toLowerCase() === id.toLowerCase(),
  );
  // Only a documented state is read: disabled applies to nobody whatever
  // its targets, enabled needs readable include targets, and any other
  // state is unknown.
  if (!config || !isDocumented("authenticationMethodState", config.state))
    return {
      id,
      readable: false,
      enabledForUsers: false,
      actual:
        typeof config?.state === "string"
          ? methodActual(config.state, null, undefined)
          : null,
    };
  const targets = targetCount(config.includeTargets);
  const x509Mode =
    id === "X509Certificate"
      ? (config.authenticationModeConfiguration
          ?.x509CertificateAuthenticationDefaultMode ?? null)
      : undefined;
  return {
    id,
    readable: config.state === "disabled" || targets !== null,
    // A method enabled without include targets applies to no user group, as
    // in Microsoft's default email OTP configuration for guests.
    enabledForUsers: config.state === "enabled" && (targets ?? 0) > 0,
    mode: x509Mode,
    actual: methodActual(config.state, targets, x509Mode),
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
        actualValue: enabled ? "On" : "Off",
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
        // multifactor method; single-factor default mode does not count. A
        // default mode Graph omitted or that is unknown cannot be judged.
        if (id === "X509Certificate" && state.enabledForUsers) {
          if (!isDocumented("x509CertificateAuthenticationMode", state.mode)) {
            state.readable = false;
            state.modeUnreadable = true;
          }
          state.enabledForUsers = state.mode === "x509CertificateMultiFactor";
        }
        return state;
      });
      const enabled = states.filter((state) => state.enabledForUsers);
      // Without an enabled method, an unreadable one leaves the result open.
      const open = !enabled.length && states.some((state) => !state.readable);
      for (const state of states)
        checks.push({
          ...base,
          assessmentStatus: state.readable ? "checked" : "unableToCheck",
          // One phishing-resistant method is enough: the other is an
          // alternative, not a different value.
          result: state.readable
            ? state.enabledForUsers
              ? "matches"
              : enabled.length || open
                ? null
                : "different"
            : null,
          settingId: `${family}/${state.id}`,
          expectedValue:
            state.id === "Fido2"
              ? "Enabled for at least one user group"
              : "Enabled for at least one user group with multifactor default mode",
          actualValue: state.actual,
          reason: state.modeUnreadable
            ? "Graph did not return a readable default mode for certificate-based authentication, so whether it is multifactor is unknown."
            : !state.readable
              ? "Graph did not return a documented state, or include targets for the enabled method."
              : !state.enabledForUsers && enabled.length
                ? `Not required: ${enabled.map((item) => item.id).join(" and ")} is enabled, and one phishing-resistant method is enough.`
                : open
                  ? "Not concluded: another phishing-resistant method could not be read."
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
          : "Graph did not return a documented state, or include targets for the enabled method.",
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

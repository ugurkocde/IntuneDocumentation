import type { PolicyCheckSignal } from "./types";
import { inspectAppLocker } from "./applocker";
import { isDocumented } from "./documented-values";
import {
  canonicalFlags,
  isInt32,
  isTimeOfDay,
  normalizeTargetType,
} from "./graph-rows";

export { isTimeOfDay };

export interface PolicyCheckResult {
  verdict: "enforced" | "disabled";
  observed: string;
}

/** The documented automaticUpdateMode values that install updates. */
export const AUTOMATIC_UPDATE_MODES: readonly string[] = [
  "autoInstallAtMaintenanceTime",
  "autoInstallAndRebootAtMaintenanceTime",
  "autoInstallAndRebootAtScheduledTime",
  "autoInstallAndRebootWithoutEndUserControl",
];

/** A list Graph returned, each entry a string such as an object id. */
export const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

// Microsoft built-in strength IDs, verified through Graph beta on 2026-09-07.
const MFA_STRENGTH_IDS = [
  "00000000-0000-0000-0000-000000000002",
  "00000000-0000-0000-0000-000000000003",
  "00000000-0000-0000-0000-000000000004",
];
const RESISTANT_METHODS = [
  "windowsHelloForBusiness",
  "fido2",
  "x509CertificateMultiFactor",
];

// AND of results where undefined is unknown: false wins, then unknown.
const all = (results: Array<boolean | undefined>) =>
  results.includes(false)
    ? false
    : results.includes(undefined)
      ? undefined
      : true;
// NOT of a result where undefined is unknown.
const not = (result: boolean | undefined) =>
  result === undefined ? undefined : !result;
// OR of results: true wins, then unknown.
const any = (results: Array<boolean | undefined>) =>
  results.includes(true)
    ? true
    : results.includes(undefined)
      ? undefined
      : false;

/**
 * Whether readable grant controls require the capability of a Conditional
 * Access check: undefined when the answer depends on a value Graph did not
 * document, such as an unknownFutureValue control, requirement or method.
 * AND needs at least one grant that requires it; under OR every alternative
 * must, so MFA OR compliant device is never evidence of MFA.
 */
export function grantRequires(
  controls: Record<string, any>,
  check: PolicyCheckSignal["check"],
): boolean | undefined {
  const required =
    check === "conditionalAccessCompliantDevice" ? "compliantDevice" : "mfa";
  const phishingResistant = check === "conditionalAccessPhishingResistantMfa";
  const strength = controls.authenticationStrength;
  const strengthResult = (): boolean | undefined => {
    if (required !== "mfa") return false;
    if (!strength || typeof strength !== "object") return undefined;
    if (phishingResistant) {
      // The built-in phishing-resistant strength; the other two built-in
      // ones allow methods that are not.
      if (strength.id === MFA_STRENGTH_IDS[2]) return true;
      if (MFA_STRENGTH_IDS.includes(strength.id)) return false;
      const combinations = strength.allowedCombinations;
      if (!Array.isArray(combinations) || !combinations.length)
        return undefined;
      // A combination is a set of documented modes in canonical form
      // (graph-rows.ts canonicalFlags); another value is unknown.
      return all(
        combinations.map((combination: unknown) => {
          const modes = canonicalFlags(
            "authenticationMethodModes",
            combination,
          );
          return modes === null ? undefined : RESISTANT_METHODS.includes(modes);
        }),
      );
    }
    if (MFA_STRENGTH_IDS.includes(strength.id)) return true;
    return isDocumented(
      "authenticationStrengthRequirements",
      strength.requirementsSatisfied,
    )
      ? strength.requirementsSatisfied === "mfa"
      : undefined;
  };
  // Graph beta returns every grant list and authenticationStrength (null
  // when unset), checked in the lab tenant on 21 October 2026. One it
  // omitted is an unknown grant: under OR it may be an alternative that
  // does not require the capability, under AND the one that does.
  const list = (
    key: string,
    result: (value: unknown) => boolean | undefined,
  ) =>
    Array.isArray(controls[key])
      ? (controls[key] as unknown[]).map(result)
      : [undefined];
  const branches: Array<boolean | undefined> = [
    ...list("builtInControls", (value) =>
      isDocumented("conditionalAccessGrantControl", value)
        ? !phishingResistant && value === required
        : undefined,
    ),
    ...(!("authenticationStrength" in controls)
      ? [undefined]
      : strength
        ? [strengthResult()]
        : []),
    ...list("customAuthenticationFactors", () => false),
    ...list("termsOfUse", () => false),
  ];
  if (!branches.length) return false;
  return controls.operator === "AND" ? any(branches) : all(branches);
}

// The guests or external users a Conditional Access policy includes or
// excludes (conditionalAccessGuestsOrExternalUsers, "Optionally populated":
// Graph returns null when none are selected, lab, 23 October 2026): their
// user types without none, and the external tenants they belong to, "all"
// or the tenant ids. Null when none are selected, undefined when the value
// is not of the documented shape: guestOrExternalUserTypes a flags value of
// documented members (canonicalFlags), and externalTenants omitted or null
// (every tenant), all tenants, or a list of tenant ids.
type GuestScope = { types: string[]; tenants: "all" | Set<string> };
function guestScope(value: unknown): GuestScope | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const flags = canonicalFlags(
    "conditionalAccessGuestOrExternalUserTypes",
    record.guestOrExternalUserTypes,
  );
  if (flags === null) return undefined;
  const types = flags.split(",").filter((type) => type !== "none");
  const tenants = record.externalTenants;
  if (tenants === null || tenants === undefined)
    return { types, tenants: "all" };
  if (typeof tenants !== "object" || Array.isArray(tenants)) return undefined;
  const kind = (tenants as Record<string, unknown>).membershipKind;
  const type = normalizeTargetType(
    (tenants as Record<string, unknown>)["@odata.type"],
  );
  const members = (tenants as Record<string, unknown>).members;
  if (
    kind === "all" &&
    (!type || type === "conditionalaccessallexternaltenants")
  )
    return { types, tenants: "all" };
  if (
    kind === "enumerated" &&
    (!type || type === "conditionalaccessenumeratedexternaltenants") &&
    isStringList(members) &&
    members.length &&
    !members.includes("")
  )
    return {
      types,
      tenants: new Set(members.map((member) => member.toLowerCase())),
    };
  return undefined;
}

// Whether an exclusion covers one included guest type: every tenant of
// the include is excluded for that type. Internal guests belong to this
// tenant, so an exclusion by external tenant leaves them unknown.
function guestTypeExcluded(
  type: string,
  include: GuestScope,
  exclude: GuestScope,
): boolean | undefined {
  if (!exclude.types.includes(type)) return false;
  if (exclude.tenants === "all") return true;
  if (type === "internalGuest") return undefined;
  const excluded = exclude.tenants;
  return (
    include.tenants !== "all" &&
    [...include.tenants].every((tenant) => excluded.has(tenant))
  );
}

/**
 * Whether a Conditional Access policy meets the check: undefined when the
 * answer depends on a field Graph omitted or a value it did not document.
 * A documented value that decides the answer keeps it definite, whatever
 * else was omitted: a disabled policy is no evidence whatever its targets.
 */
export function conditionalAccessOutcome(
  config: Record<string, any>,
  check: PolicyCheckSignal["check"],
): boolean | undefined {
  const controls = config.grantControls;
  const users = config.conditions?.users;
  const apps = config.conditions?.applications;
  // Graph uses the "None" sentinel for an include list that targets nobody.
  // An empty entry names no object: it may be any target or application, so
  // it leaves the answer open unless another entry decides it.
  const open = (list: string[], decided: boolean) =>
    decided ? true : list.includes("") ? undefined : false;
  // An include list targets someone when it names an entry its exclusion
  // list does not: exclusions take precedence (Microsoft Learn, Conditional
  // Access users and groups), so a group both included and excluded is
  // nobody. Graph returns every exclusion list (lab, 21 October 2026); one
  // it omitted, or an empty entry in it, may exclude any named include. The
  // All sentinel is no object id, so no exclusion list names it.
  const targets = (value: unknown, exclusions: unknown) => {
    if (!isStringList(value)) return undefined;
    const named = value.filter((item) => item !== "None" && item !== "");
    const all = named.includes("All");
    if (!all && named.length) {
      if (!isStringList(exclusions) || exclusions.includes(""))
        return undefined;
      const excluded = new Set(exclusions.map((item) => item.toLowerCase()));
      return open(
        value,
        named.some((item) => !excluded.has(item.toLowerCase())),
      );
    }
    return open(value, all);
  };
  // Guests or external users are a fourth include axis, excluded by
  // excludeGuestsOrExternalUsers per user type and tenant, or as a whole by
  // the GuestsOrExternalUsers entry of excludeUsers.
  const excludesAllGuests = (): boolean | undefined =>
    !isStringList(users?.excludeUsers) || users.excludeUsers.includes("")
      ? undefined
      : users.excludeUsers.some(
          (item: string) => item.toLowerCase() === "guestsorexternalusers",
        );
  const guests = (): boolean | undefined => {
    const included = guestScope(users?.includeGuestsOrExternalUsers);
    if (included === null) return false;
    if (included === undefined) return undefined;
    if (!included.types.length) return false;
    const whole = excludesAllGuests();
    if (whole !== false) return whole === undefined ? undefined : false;
    const excluded = guestScope(users?.excludeGuestsOrExternalUsers);
    if (excluded === null) return true;
    if (excluded === undefined) return undefined;
    return any(
      included.types.map((type) =>
        not(guestTypeExcluded(type, included, excluded)),
      ),
    );
  };
  const include = apps?.includeApplications;
  const exclude = apps?.excludeApplications;
  const builtIn = controls?.builtInControls;
  return all([
    // Only documented states decide; an omitted or undocumented one is
    // unknown.
    config.state === "enabled"
      ? true
      : ["disabled", "enabledForReportingButNotEnforced"].includes(config.state)
        ? false
        : undefined,
    controls &&
    typeof controls === "object" &&
    ["AND", "OR"].includes(controls.operator)
      ? all([
          !(Array.isArray(builtIn) && builtIn.includes("block")),
          grantRequires(controls, check),
        ])
      : undefined,
    ...(check === "conditionalAccessMfaAllApps"
      ? [
          isStringList(include)
            ? open(include, include.includes("All"))
            : undefined,
          // An omitted exclusion list is unknown, not empty.
          isStringList(exclude)
            ? not(
                open(
                  exclude,
                  exclude.some((item) => item !== ""),
                ),
              )
            : undefined,
        ]
      : []),
    any([
      targets(users?.includeUsers, users?.excludeUsers),
      targets(users?.includeGroups, users?.excludeGroups),
      targets(users?.includeRoles, users?.excludeRoles),
      guests(),
    ]),
    targets(apps?.includeApplications, apps?.excludeApplications),
  ]);
}

/** Compound checks must be satisfied by one policy, never unrelated policies. */
export function evaluatePolicyCheck(
  config: Record<string, any>,
  check: PolicyCheckSignal["check"],
): PolicyCheckResult | undefined {
  if (check === "appLockerRuleCollections") {
    const result = inspectAppLocker(config);
    return result?.complete
      ? {
          verdict: result.matches ? "enforced" : "disabled",
          observed: result.actual,
        }
      : undefined;
  }
  const type = String(config["@odata.type"] ?? "")
    .replace(/^#?(microsoft\.graph\.)?/, "")
    .toLowerCase();
  if (check === "scheduledAntivirusScan") {
    if (
      ![
        "windows10generalconfiguration",
        "windows10endpointprotectionconfiguration",
      ].includes(type)
    )
      return;
    const day =
      config.defenderSystemScanSchedule ?? config.defenderScheduledScanDay;
    const scan = config.defenderScanType;
    // A documented disabled scan or empty schedule is definite on its own.
    if (scan === "disabled" || day === "noScheduledScan")
      return {
        verdict: "disabled",
        observed: `Scan: ${scan ?? "unspecified"}; schedule: ${day ?? "unspecified"}`,
      };
    if (
      !["quick", "full"].includes(scan) ||
      ![
        "everyday",
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ].includes(day)
    )
      return;
    // Graph returns null when no scan time is set; Defender then runs the
    // scheduled scan at its default time, 2:00 AM (Policy CSP Defender
    // ScheduleScanTime, default 120 minutes past midnight).
    const defaultTime =
      "defenderScheduledScanTime" in config &&
      config.defenderScheduledScanTime === null;
    if (!defaultTime && !isTimeOfDay(config.defenderScheduledScanTime)) return;
    return {
      verdict: "enforced",
      observed: `${scan}; ${day}; ${
        defaultTime
          ? "02:00:00 (Defender default, no time configured)"
          : config.defenderScheduledScanTime
      }`,
    };
  }
  if (check === "qualityUpdateDeadline") {
    if (type !== "windowsupdateforbusinessconfiguration") return;
    const {
      qualityUpdatesDeferralPeriodInDays: deferral,
      deadlineForQualityUpdatesInDays: deadline,
    } = config;
    // Graph returns null when no grace period is set; with a deadline set,
    // Windows then uses its default grace period of 2 days (Policy CSP Update
    // ConfigureDeadlineGracePeriod).
    const defaultGrace =
      typeof deadline === "number" &&
      "deadlineGracePeriodInDays" in config &&
      config.deadlineGracePeriodInDays === null;
    const grace = defaultGrace ? 2 : config.deadlineGracePeriodInDays;
    if (
      ![deferral, deadline, grace].every(
        (value) => isInt32(value) && value >= 0,
      )
    )
      return;
    const days = deferral + deadline + grace;
    // Policy timing is supporting evidence. Release-to-device installation still requires observations.
    const paused = config.qualityUpdatesPaused;
    if (typeof paused !== "boolean") return;
    const automatic = AUTOMATIC_UPDATE_MODES.includes(
      config.automaticUpdateMode,
    );
    if (!automatic) return;
    // This shared signal supports frameworks with different remediation periods.
    // Exceeding its 14-day evidence threshold is not a framework deviation.
    if (!paused && days > 14) return;
    return {
      verdict: paused ? "disabled" : "enforced",
      observed: `Quality update deferral ${deferral}d + deadline ${deadline}d + grace ${grace}d${
        defaultGrace ? " (Windows default, no grace period configured)" : ""
      } = ${days}d; paused: ${paused}`,
    };
  }
  if (type !== "conditionalaccesspolicy") return;
  if (conditionalAccessOutcome(config, check) !== true) return;
  return {
    verdict: "enforced",
    observed: `${check === "conditionalAccessPhishingResistantMfa" ? "phishing-resistant MFA" : check === "conditionalAccessCompliantDevice" ? "compliantDevice" : "mfa"} required; enabled; configured conditions apply`,
  };
}

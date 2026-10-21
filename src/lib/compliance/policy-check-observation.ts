import type { PolicyCheckSignal } from "./types";
import { inspectAppLocker } from "./applocker";
import { grantControlsReadable } from "./policy-checks";

const UNREADABLE =
  "Required fields for this compound check are missing or unsupported. Review the actual values and refresh policy details.";

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Explain compound candidates that did not produce legacy supporting evidence. */
export function policyCheckObservation(
  config: Record<string, any>,
  check: PolicyCheckSignal["check"],
) {
  const type = String(config["@odata.type"] ?? "")
    .replace(/^#?microsoft\.graph\./, "")
    .toLowerCase();
  if (check === "appLockerRuleCollections")
    // A custom profile always has OMA-URI rows; without them its rule
    // collections are unknown.
    return type === "windows10customconfiguration" &&
      !Array.isArray(config.omaSettings)
      ? {
          complete: false,
          actual: "{}",
          reason: UNREADABLE,
        }
      : inspectAppLocker(config);
  let fields: Record<string, unknown>;
  let complete: boolean;
  // A definite reason when Graph reports a field as not configured: null for
  // a property it returned, or the enum default userDefined (Microsoft Learn:
  // "default value, no intent"). A field absent from the response stays
  // unreadable.
  let notConfigured: string | undefined;
  const isNull = (key: string) => key in config && config[key] === null;
  if (check.startsWith("conditionalAccess")) {
    if (type !== "conditionalaccesspolicy") return;
    const grants = config.grantControls;
    // Null: the policy has no grant controls, such as one with session
    // controls only, so it is no candidate.
    if (grants === null) return;
    const readable = isRecord(grants) && grantControlsReadable(grants);
    const wanted =
      check === "conditionalAccessCompliantDevice" ? "compliantDevice" : "mfa";
    const candidate =
      isRecord(grants) &&
      ((Array.isArray(grants.builtInControls) &&
        grants.builtInControls.includes(wanted)) ||
        (wanted === "mfa" && Boolean(grants.authenticationStrength)));
    // A policy is no candidate only when its grant controls show it; one
    // whose grant controls Graph omitted is unreadable.
    if (
      !candidate &&
      isRecord(grants) &&
      Array.isArray(grants.builtInControls) &&
      (wanted !== "mfa" || "authenticationStrength" in grants)
    )
      return;
    const users = config.conditions?.users;
    const apps = config.conditions?.applications;
    fields = {
      state: config.state,
      grantControls: grants,
      conditions: config.conditions,
    };
    // Every target list the check reads must have been returned: an omitted
    // one may hold the users or applications the policy applies to.
    complete =
      candidate &&
      readable &&
      ["enabled", "disabled", "enabledForReportingButNotEnforced"].includes(
        config.state,
      ) &&
      ["AND", "OR"].includes(grants.operator) &&
      ["includeUsers", "includeGroups", "includeRoles"].every((key) =>
        Array.isArray(users?.[key]),
      ) &&
      Array.isArray(apps?.includeApplications) &&
      (check !== "conditionalAccessMfaAllApps" ||
        Array.isArray(apps?.excludeApplications));
    if (
      candidate &&
      grants.authenticationStrength &&
      !grants.builtInControls?.includes("mfa")
    ) {
      const strength = grants.authenticationStrength;
      const known = [
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000004",
      ].includes(strength.id);
      complete &&=
        known ||
        (check === "conditionalAccessPhishingResistantMfa"
          ? Array.isArray(strength.allowedCombinations) &&
            strength.allowedCombinations.length > 0
          : typeof strength.requirementsSatisfied === "string");
    }
  } else if (check === "qualityUpdateDeadline") {
    if (type !== "windowsupdateforbusinessconfiguration") return;
    const keys = [
      "qualityUpdatesDeferralPeriodInDays",
      "deadlineForQualityUpdatesInDays",
      "deadlineGracePeriodInDays",
      "qualityUpdatesPaused",
      "automaticUpdateMode",
    ];
    // Only the fields Graph returned, so the actual value never shows an
    // omitted one as null.
    fields = Object.fromEntries(
      keys.filter((key) => key in config).map((key) => [key, config[key]]),
    );
    // Only fields Graph returned as null mean nothing is configured; fields
    // it omitted leave the ring unreadable.
    if (keys.every(isNull)) return;
    if (isNull("deadlineForQualityUpdatesInDays"))
      notConfigured =
        "No quality update deadline is configured in this update ring.";
    // With a deadline set, a null grace period is the Windows default of 2
    // days (Policy CSP Update ConfigureDeadlineGracePeriod), so it is read.
    const grace =
      typeof fields.deadlineForQualityUpdatesInDays === "number" &&
      isNull("deadlineGracePeriodInDays")
        ? 2
        : fields.deadlineGracePeriodInDays;
    complete =
      [
        fields.qualityUpdatesDeferralPeriodInDays,
        fields.deadlineForQualityUpdatesInDays,
        grace,
      ].every(
        (value) =>
          typeof value === "number" && Number.isInteger(value) && value >= 0,
      ) &&
      typeof fields.qualityUpdatesPaused === "boolean" &&
      typeof fields.automaticUpdateMode === "string";
  } else {
    if (
      ![
        "windows10generalconfiguration",
        "windows10endpointprotectionconfiguration",
      ].includes(type)
    )
      return;
    const dayKeys = ["defenderSystemScanSchedule", "defenderScheduledScanDay"];
    // Undefined, and so left out of the actual value, when Graph omitted it.
    fields = {
      scan: config.defenderScanType,
      day:
        config.defenderSystemScanSchedule ??
        config.defenderScheduledScanDay ??
        (dayKeys.some((key) => key in config) ? null : undefined),
      time: config.defenderScheduledScanTime,
    };
    // Only fields Graph returned as null mean nothing is configured; fields
    // it omitted leave the policy unreadable. Each type returns one of the
    // two day properties.
    if (
      isNull("defenderScanType") &&
      fields.day === null &&
      dayKeys.some(isNull) &&
      isNull("defenderScheduledScanTime")
    )
      return;
    if (fields.scan === "userDefined" || fields.day === "userDefined")
      notConfigured =
        "No scheduled scan is configured in this policy: the scan type or day is userDefined, the default with no intent.";
    // A null scan time is the Defender default of 2:00 AM (Policy CSP
    // Defender ScheduleScanTime), so it is read.
    complete =
      typeof fields.scan === "string" &&
      typeof fields.day === "string" &&
      (typeof fields.time === "string" || isNull("defenderScheduledScanTime"));
  }
  return {
    complete: complete || notConfigured !== undefined,
    actual: JSON.stringify(fields),
    reason:
      notConfigured ??
      (complete
        ? "The policy does not match the stated configuration check. This is not a framework compliance verdict."
        : UNREADABLE),
  };
}

import type { PolicyCheckSignal } from "./types";
import { inspectAppLocker } from "./applocker";
import { isDocumented } from "./documented-values";
import {
  AUTOMATIC_UPDATE_MODES,
  conditionalAccessOutcome,
  isTimeOfDay,
} from "./policy-checks";

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
    const wanted =
      check === "conditionalAccessCompliantDevice" ? "compliantDevice" : "mfa";
    const builtIn =
      isRecord(grants) && Array.isArray(grants.builtInControls)
        ? (grants.builtInControls as unknown[])
        : undefined;
    // A control Graph did not document may be the wanted one.
    const candidate =
      isRecord(grants) &&
      (Boolean(
        builtIn?.some(
          (value) =>
            value === wanted ||
            !isDocumented("conditionalAccessGrantControl", value),
        ),
      ) ||
        (wanted === "mfa" && Boolean(grants.authenticationStrength)));
    // A policy is no candidate only when its grant controls show it; one
    // whose grant controls Graph omitted is unreadable.
    if (
      !candidate &&
      builtIn &&
      (wanted !== "mfa" || "authenticationStrength" in grants)
    )
      return;
    fields = {
      state: config.state,
      grantControls: grants,
      conditions: config.conditions,
    };
    // Different only when a documented value decides it; an omitted field
    // or undocumented value it depends on leaves the policy unreadable.
    complete = candidate && conditionalAccessOutcome(config, check) === false;
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
    const days = [
      fields.qualityUpdatesDeferralPeriodInDays,
      fields.deadlineForQualityUpdatesInDays,
      grace,
    ];
    const timed = days.every(
      (value) =>
        typeof value === "number" && Number.isInteger(value) && value >= 0,
    );
    const mode = fields.automaticUpdateMode;
    // A documented manual mode, or more than 14 days without a pause, fails
    // the check whatever other field Graph omitted.
    complete =
      (isDocumented("automaticUpdateMode", mode) &&
        (!AUTOMATIC_UPDATE_MODES.includes(mode as string) ||
          (timed && typeof fields.qualityUpdatesPaused === "boolean"))) ||
      (timed &&
        fields.qualityUpdatesPaused === false &&
        (days as number[]).reduce((sum, value) => sum + value, 0) > 14);
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
      isDocumented("defenderScanType", fields.scan) &&
      isDocumented("weeklySchedule", fields.day) &&
      (isTimeOfDay(fields.time) || isNull("defenderScheduledScanTime"));
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

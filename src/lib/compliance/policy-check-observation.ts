import type { PolicyCheckSignal } from "./types";
import { inspectAppLocker } from "./applocker";

/** Explain compound candidates that did not produce legacy supporting evidence. */
export function policyCheckObservation(
  config: Record<string, any>,
  check: PolicyCheckSignal["check"],
) {
  if (check === "appLockerRuleCollections") return inspectAppLocker(config);
  const type = String(config["@odata.type"] ?? "")
    .replace(/^#?microsoft\.graph\./, "")
    .toLowerCase();
  let fields: Record<string, unknown>;
  let complete: boolean;
  if (check.startsWith("conditionalAccess")) {
    if (type !== "conditionalaccesspolicy") return;
    const grants = config.grantControls;
    if (!grants) return;
    const wanted =
      check === "conditionalAccessCompliantDevice" ? "compliantDevice" : "mfa";
    if (
      !grants.builtInControls?.includes(wanted) &&
      !(wanted === "mfa" && grants.authenticationStrength)
    )
      return;
    fields = {
      state: config.state,
      grantControls: grants,
      conditions: config.conditions,
    };
    complete =
      ["enabled", "disabled", "enabledForReportingButNotEnforced"].includes(
        config.state,
      ) &&
      ["AND", "OR"].includes(grants.operator) &&
      Boolean(config.conditions?.users && config.conditions?.applications);
    if (
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
    fields = Object.fromEntries(
      [
        "qualityUpdatesDeferralPeriodInDays",
        "deadlineForQualityUpdatesInDays",
        "deadlineGracePeriodInDays",
        "qualityUpdatesPaused",
        "automaticUpdateMode",
      ].map((key) => [key, config[key] ?? null]),
    );
    if (Object.values(fields).every((value) => value === null)) return;
    complete =
      [
        fields.qualityUpdatesDeferralPeriodInDays,
        fields.deadlineForQualityUpdatesInDays,
        fields.deadlineGracePeriodInDays,
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
    fields = {
      scan: config.defenderScanType ?? null,
      day:
        config.defenderSystemScanSchedule ??
        config.defenderScheduledScanDay ??
        null,
      time: config.defenderScheduledScanTime ?? null,
    };
    if (Object.values(fields).every((value) => value === null)) return;
    complete = Object.values(fields).every(
      (value) => typeof value === "string",
    );
  }
  return {
    complete,
    actual: JSON.stringify(fields),
    reason: complete
      ? "The policy does not match the stated configuration check. This is not a framework compliance verdict."
      : "Required fields for this compound check are missing or unsupported. Review the actual values and refresh policy details.",
  };
}

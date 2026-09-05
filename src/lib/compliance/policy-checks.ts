import type { PolicyCheckSignal } from "./types";

export interface PolicyCheckResult {
  verdict: "enforced" | "disabled";
  observed: string;
}

/** Compound checks must be satisfied by one policy, never unrelated policies. */
export function evaluatePolicyCheck(
  config: Record<string, any>,
  check: PolicyCheckSignal["check"],
): PolicyCheckResult | undefined {
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
    if (
      typeof config.defenderScheduledScanTime !== "string" ||
      !/^\d{2}:\d{2}:\d{2}/.test(config.defenderScheduledScanTime)
    )
      return;
    return {
      verdict: "enforced",
      observed: `${scan}; ${day}; ${config.defenderScheduledScanTime}`,
    };
  }
  if (check === "qualityUpdateDeadline") {
    if (type !== "windowsupdateforbusinessconfiguration") return;
    const {
      qualityUpdatesDeferralPeriodInDays: deferral,
      deadlineForQualityUpdatesInDays: deadline,
      deadlineGracePeriodInDays: grace,
    } = config;
    if (
      ![deferral, deadline, grace].every(
        (value) =>
          typeof value === "number" && Number.isInteger(value) && value >= 0,
      )
    )
      return;
    const days = deferral + deadline + grace;
    // Policy timing is supporting evidence. Release-to-device installation still requires observations.
    const paused = config.qualityUpdatesPaused;
    if (typeof paused !== "boolean") return;
    const automatic = [
      "autoInstallAtMaintenanceTime",
      "autoInstallAndRebootAtMaintenanceTime",
      "autoInstallAndRebootAtScheduledTime",
      "autoInstallAndRebootWithoutEndUserControl",
    ].includes(config.automaticUpdateMode);
    if (!automatic) return;
    return {
      verdict: !paused && days <= 14 ? "enforced" : "disabled",
      observed: `Quality update deferral ${deferral}d + deadline ${deadline}d + grace ${grace}d = ${days}d; paused: ${paused}`,
    };
  }
  if (type !== "conditionalaccesspolicy") return;
  const controls = config.grantControls;
  const required = check === "conditionalAccessMfa" ? "mfa" : "compliantDevice";
  if (
    !Array.isArray(controls?.builtInControls) ||
    !controls.builtInControls.includes(required) ||
    controls.builtInControls.includes("block")
  )
    return;
  const alternatives =
    controls.builtInControls.length +
    (controls.customAuthenticationFactors?.length ?? 0) +
    (controls.termsOfUse?.length ?? 0) +
    (controls.authenticationStrength ? 1 : 0);
  // OR with another grant does not require this particular control.
  if (
    controls.operator !== "AND" &&
    !(controls.operator === "OR" && alternatives === 1)
  )
    return;
  if (config.state !== "enabled") return;
  const users = config.conditions?.users;
  const apps = config.conditions?.applications;
  if (
    ![users?.includeUsers, users?.includeGroups, users?.includeRoles].some(
      (value) => Array.isArray(value) && value.length > 0,
    ) ||
    !Array.isArray(apps?.includeApplications) ||
    apps.includeApplications.length === 0
  )
    return;
  return {
    verdict: "enforced",
    observed: `${required} required; enabled; configured conditions apply`,
  };
}

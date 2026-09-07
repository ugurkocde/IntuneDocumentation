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
    // This shared signal supports frameworks with different remediation periods.
    // Exceeding its 14-day evidence threshold is not a framework deviation.
    if (!paused && days > 14) return;
    return {
      verdict: paused ? "disabled" : "enforced",
      observed: `Quality update deferral ${deferral}d + deadline ${deadline}d + grace ${grace}d = ${days}d; paused: ${paused}`,
    };
  }
  if (type !== "conditionalaccesspolicy") return;
  const controls = config.grantControls;
  if (!controls || !["AND", "OR"].includes(controls.operator)) return;
  const builtIn = Array.isArray(controls.builtInControls)
    ? controls.builtInControls
    : [];
  if (builtIn.includes("block")) return;
  const strength = controls.authenticationStrength;
  // Microsoft built-in strength IDs, verified through Graph beta on 2026-09-07.
  const mfaStrengthIds = [
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000003",
    "00000000-0000-0000-0000-000000000004",
  ];
  const requiresMfa = Boolean(
    strength &&
      (mfaStrengthIds.includes(strength.id) ||
        strength.requirementsSatisfied === "mfa"),
  );
  const resistantMethods = [
    "windowsHelloForBusiness",
    "fido2",
    "x509CertificateMultiFactor",
  ];
  const resistant = Boolean(
    strength &&
      (strength.id === mfaStrengthIds[2] ||
        (Array.isArray(strength.allowedCombinations) &&
          strength.allowedCombinations.length > 0 &&
          strength.allowedCombinations.every(
            (method: unknown) =>
              typeof method === "string" && resistantMethods.includes(method),
          ))),
  );
  const required =
    check === "conditionalAccessCompliantDevice" ? "compliantDevice" : "mfa";
  const branchResults = [
    ...builtIn.map((value: string) =>
      check === "conditionalAccessPhishingResistantMfa"
        ? false
        : value === required,
    ),
    ...(strength
      ? [
          check === "conditionalAccessPhishingResistantMfa"
            ? resistant
            : required === "mfa" && requiresMfa,
        ]
      : []),
    ...(controls.customAuthenticationFactors ?? []).map(() => false),
    ...(controls.termsOfUse ?? []).map(() => false),
  ];
  // AND needs at least one relevant enforced grant; every OR alternative must
  // require the capability. MFA OR compliant-device is never evidence of MFA.
  if (
    !branchResults.length ||
    !(controls.operator === "AND"
      ? branchResults.some(Boolean)
      : branchResults.every(Boolean))
  )
    return;
  if (check === "conditionalAccessMfaAllApps") {
    const apps = config.conditions?.applications;
    if (
      !apps?.includeApplications?.includes("All") ||
      (apps.excludeApplications?.length ?? 0) > 0
    )
      return;
  }
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
    observed: `${check === "conditionalAccessPhishingResistantMfa" ? "phishing-resistant MFA" : required} required; enabled; configured conditions apply`,
  };
}

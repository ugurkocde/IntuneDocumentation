import type {
  DetectionSignal,
  TechnicalCheck,
  ValueExpectation,
} from "./types";
import verified from "./verified-technical-settings.json";
import additionalVerified from "./additional-verified-settings.json";

const displayIdentifiers = [...verified.catalog, ...additionalVerified.catalog]
  .flatMap((definition) => [
    ...definition.options.map((option) => [option.id, option.label] as const),
    [definition.id, definition.name] as const,
  ])
  .sort(([left], [right]) => right.length - left.length);

/** Human labels for verified identifiers; exported records retain raw values. */
export function displayCheckValue(value: string): string {
  let text = value;
  for (const [id, label] of displayIdentifiers)
    text = text.replaceAll(id, label);
  return [...new Set(text.split("; alternative: "))].join("; alternative: ");
}

export const ASSESSMENT_LABELS = {
  checked: "Checked",
  unableToCheck: "Unable to check",
  outsideScope: "Outside selected scope",
} as const;
export const CHECK_RESULT_LABELS = {
  matches: "Matches expected value",
  missing: "Missing",
  different: "Different value",
} as const;

export function comparableValue(
  value: unknown,
  expected: ValueExpectation,
): boolean {
  const finite = typeof value !== "number" || Number.isFinite(value);
  if (!finite) return false;
  if (expected.kind === "equals") return typeof value === typeof expected.value;
  if (expected.kind === "oneOf")
    return expected.values.some((item) => typeof item === typeof value);
  if (expected.kind === "nonEmptyString") return typeof value === "string";
  return typeof value === "number";
}

export function expectedValue(signal: DetectionSignal): string {
  if (signal.source === "policyCheck") {
    const descriptions = {
      appLockerRuleCollections:
        "EXE, DLL, MSI and Script rule collections in one CSP group; each with EnforcementMode Enabled and at least one rule. Approved-rule content and device execution are separate checks.",
      scheduledAntivirusScan:
        "Quick or full scan, a scheduled day and a scan time",
      qualityUpdateDeadline:
        "Automatic installation; not paused; deferral + deadline + grace at most 14 days (supporting threshold)",
      conditionalAccessMfa:
        "Enabled policy requiring MFA without an alternative that bypasses MFA",
      conditionalAccessMfaAllApps:
        "Enabled policy requiring MFA for all cloud apps without application exclusions",
      conditionalAccessPhishingResistantMfa:
        "Enabled policy requiring phishing-resistant authentication without a bypass alternative",
      conditionalAccessCompliantDevice:
        "Enabled policy requiring a compliant device without a bypass alternative",
    };
    return descriptions[signal.check];
  }
  const expectation: ValueExpectation = signal.enforcedWhen;
  let value: string;
  switch (expectation.kind) {
    case "equals":
      value = JSON.stringify(expectation.value);
      break;
    case "oneOf":
      value = expectation.values
        .map((item) => JSON.stringify(item))
        .join(" or ");
      break;
    case "atLeast":
      value = `At least ${expectation.value}`;
      break;
    case "atMost":
      value = `At most ${expectation.value}`;
      break;
    case "nonEmptyString":
      value = "A non-empty string";
      break;
  }
  if (signal.source === "settingsCatalog" && signal.prerequisites?.length)
    value += `; requires ${signal.prerequisites.map((item) => `${item.settingDefinitionId}: ${item.values.join(" or ")}`).join("; ")}`;
  return value;
}

export function checkSummary(checks: readonly TechnicalCheck[]): string {
  const count = (value: TechnicalCheck["result"]) =>
    checks.filter((row) => row.result === value).length;
  const unchecked = checks.filter(
    (row) => row.assessmentStatus === "unableToCheck",
  ).length;
  if (!checks.length) return "Unable to check";
  if (checks.every((row) => row.assessmentStatus === "outsideScope"))
    return "Outside selected scope";
  return `${count("matches")} match; ${count("missing")} missing; ${count("different")} different${unchecked ? `; ${unchecked} unable to check` : ""}`;
}

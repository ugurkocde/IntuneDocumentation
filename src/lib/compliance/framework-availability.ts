import type { ComplianceAssessment } from "./types";

/**
 * Frameworks offered only in the desktop app. The web dashboard leaves them
 * out of its picker and its JSON evidence record; the engine still assesses
 * them so desktop output and the ruleset fingerprint stay identical.
 */
export const DESKTOP_ONLY_FRAMEWORK_IDS: ReadonlySet<string> = new Set([
  "nis2-2022-2555",
  "dora-2022-2554",
]);

export function isDesktopOnlyFramework(frameworkId: string): boolean {
  return DESKTOP_ONLY_FRAMEWORK_IDS.has(frameworkId);
}

/** The assessment as the web app shows it: desktop-only frameworks removed. */
export function withoutDesktopOnlyFrameworks(
  assessment: ComplianceAssessment,
): ComplianceAssessment {
  return {
    ...assessment,
    frameworks: assessment.frameworks.filter(
      (framework) => !isDesktopOnlyFramework(framework.framework.id),
    ),
  };
}

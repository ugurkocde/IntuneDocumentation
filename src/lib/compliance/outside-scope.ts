import { DORA_OUTSIDE_INTUNE_SCOPE } from "./frameworks/dora";
import { HIPAA_OUTSIDE_INTUNE_SCOPE } from "./frameworks/hipaa-security-rule";
import { NIS2_OUTSIDE_INTUNE_SCOPE } from "./frameworks/nis2";
import type { OutsideScopeMeasure } from "./management/types";

/**
 * Published measures without an Intune evidence mapping, for the frameworks
 * that list them. The evidence report and the management summary both read
 * this list, so they name the same measures and counts.
 */
const OUTSIDE_INTUNE_SCOPE: Readonly<
  Record<string, readonly OutsideScopeMeasure[]>
> = {
  "nis2-2022-2555": NIS2_OUTSIDE_INTUNE_SCOPE,
  "dora-2022-2554": DORA_OUTSIDE_INTUNE_SCOPE,
  "hipaa-security-rule": HIPAA_OUTSIDE_INTUNE_SCOPE,
};

export function outsideIntuneScope(
  frameworkId: string,
): readonly OutsideScopeMeasure[] {
  return OUTSIDE_INTUNE_SCOPE[frameworkId] ?? [];
}

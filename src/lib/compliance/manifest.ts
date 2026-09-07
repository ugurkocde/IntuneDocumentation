import {
  assessCompliance,
  COMPLIANCE_RULESET_VERSION,
  type ComplianceExportData,
} from "./engine";
import { COMPLIANCE_CAPABILITIES } from "./capabilities";
import type { AssessmentScope } from "./types";

export function canonicalJson(value: unknown): string {
  const normalize = (item: any): any => {
    if (item instanceof Map) return normalize(Object.fromEntries(item));
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .filter((key) => item[key] !== undefined)
          .map((key) => [key, normalize(item[key])]),
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createEvidenceManifest(
  data: ComplianceExportData,
  scope: AssessmentScope = data.assessmentScope ?? {},
) {
  const assessment = assessCompliance(data, scope);
  // Branding and report generation time do not alter the source snapshot fingerprint.
  const snapshot = { ...data };
  delete snapshot.branding;
  delete snapshot.assessmentScope;
  const [snapshotSha256, rulesetSha256] = await Promise.all([
    sha256(snapshot),
    sha256({
      version: COMPLIANCE_RULESET_VERSION,
      capabilities: COMPLIANCE_CAPABILITIES,
      frameworks: assessment.frameworks.map((framework) => ({
        ...framework.framework,
        controls: framework.controls.map((control) => ({
          control: control.control,
          capabilityIds: [
            ...control.capabilityIds,
            ...control.excludedCapabilityIds,
          ].sort(),
        })),
      })),
    }),
  ]);
  return { schemaVersion: 1, snapshotSha256, rulesetSha256, assessment };
}

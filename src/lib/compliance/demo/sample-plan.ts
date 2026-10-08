import type { DetailedExportData } from "../../configuration-analyzer";
import { COMPLIANCE_RULESET_VERSION } from "../engine";
import { sha256 } from "../manifest";
import type { ComplianceFrameworkId } from "../report-pdf";
import { SAMPLE_REPORTS, type SampleReport } from "../samples";
import type { ControlStatus } from "../types";
import { CONTOSO_TENANT, CONTOSO_TENANT_LABEL } from "./contoso-tenant";

// Build plan for the public sample reports. Shared by
// scripts/build-sample-reports.ts and the staleness test, so a change to the
// fixture, the ruleset or the excerpt choice is caught before release.

export const SAMPLE_RENDER_DATE = "2026-10-08T09:00:00Z";

/** Detail pages shown per framework, with the status each must keep. */
export const SAMPLE_EXCERPTS: Readonly<
  Partial<
    Record<
      ComplianceFrameworkId,
      readonly { controlId: string; status: ControlStatus }[]
    >
  >
> = {
  "iso-27001-2022": [
    { controlId: "8.24", status: "partialEvidence" },
    { controlId: "8.20", status: "noEvidence" },
  ],
  "nis2-2022-2555": [
    { controlId: "21.2.h", status: "partialEvidence" },
    { controlId: "21.2.b", status: "noEvidence" },
  ],
  "soc2-tsc": [
    { controlId: "CC6.7", status: "partialEvidence" },
    { controlId: "CC6.6", status: "noEvidence" },
  ],
  "nist-800-53-r5": [
    { controlId: "SC-28", status: "partialEvidence" },
    { controlId: "SC-7", status: "noEvidence" },
  ],
  "nist-800-171-r3": [
    { controlId: "03.13.08", status: "partialEvidence" },
    { controlId: "03.04.08", status: "noEvidence" },
  ],
  "nist-csf-2": [
    { controlId: "PR.DS-01", status: "partialEvidence" },
    { controlId: "PR.IR-01", status: "noEvidence" },
  ],
  // Every Cyber Essentials theme maps many capabilities; the two compact
  // themes keep the sample within seven pages.
  "cyber-essentials-v3": [
    { controlId: "Security update management", status: "conflictingEvidence" },
    { controlId: "Firewalls", status: "noEvidence" },
  ],
  "essential-eight": [
    { controlId: "ML1-MAC-01", status: "partialEvidence" },
    { controlId: "ML1-PO-07", status: "conflictingEvidence" },
  ],
  "bsi-it-grundschutz": [
    { controlId: "SYS.2.2.3.A5", status: "partialEvidence" },
    { controlId: "SYS.2.2.3.A4", status: "noEvidence" },
  ],
  "def-stan-05-138-i4": [
    { controlId: "2317", status: "partialEvidence" },
    { controlId: "2426", status: "partialEvidence" },
  ],
};

// Mirrors the report code used by default report IDs in report-pdf.ts.
const REPORT_CODES: Record<ComplianceFrameworkId, string> = {
  "nist-800-53-r5": "N53",
  "nist-csf-2": "CSF",
  "bsi-it-grundschutz": "BSI",
  "iso-27001-2022": "ISO",
  "soc2-tsc": "SOC",
  "def-stan-05-138-i4": "DEF",
  "cyber-essentials-v3": "CE",
  "essential-eight": "E8",
  "nist-800-171-r2": "N171",
  "nist-800-171-r3": "N171R3",
  "nis2-2022-2555": "NIS2",
};

export function sampleReportId(frameworkId: ComplianceFrameworkId): string {
  return `IDOC-${REPORT_CODES[frameworkId]}-${SAMPLE_RENDER_DATE.slice(0, 10).replaceAll("-", "")}-CTSO`;
}

/** The demo tenant with the assessment scope used for one sample. */
export function sampleTenant(sample: SampleReport): DetailedExportData {
  return sample.frameworkId === "essential-eight"
    ? { ...CONTOSO_TENANT, assessmentScope: { essentialEightMaturityLevel: 1 } }
    : CONTOSO_TENANT;
}

export function sampleMetadata(sample: SampleReport) {
  return {
    tenantLabel: CONTOSO_TENANT_LABEL,
    preparedFor: "Information Security",
    preparedBy: "Endpoint Engineering",
    reportId: sampleReportId(sample.frameworkId),
    revision: "1.0",
    classification: sample.locale === "de" ? "Intern" : "Internal",
  };
}

export function sampleExcerptControlIds(sample: SampleReport): string[] {
  return (SAMPLE_EXCERPTS[sample.frameworkId] ?? []).map(
    (row) => row.controlId,
  );
}

export interface SampleManifest {
  rulesetVersion: string;
  fixtureHash: string;
  files: {
    frameworkId: string;
    file: string;
    locale: string;
    reportId: string;
    excerptControlIds: string[];
  }[];
}

/** Deterministic manifest content: no timestamps, stable ordering. */
export async function expectedSampleManifest(): Promise<SampleManifest> {
  return {
    rulesetVersion: COMPLIANCE_RULESET_VERSION,
    fixtureHash: await sha256(CONTOSO_TENANT),
    files: SAMPLE_REPORTS.map((sample) => ({
      frameworkId: sample.frameworkId,
      file: sample.file,
      locale: sample.locale,
      reportId: sampleReportId(sample.frameworkId),
      excerptControlIds: sampleExcerptControlIds(sample),
    })),
  };
}

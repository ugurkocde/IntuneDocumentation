import { assessCompliance } from "../engine";
import {
  generateComplianceReportPDF,
  type ComplianceReportOptions,
} from "../report-pdf";
import type { SampleReport } from "../samples";
import {
  SAMPLE_EXCERPTS,
  SAMPLE_RENDER_DATE,
  sampleExcerptControlIds,
  sampleMetadata,
  sampleTenant,
} from "./sample-plan";

// Renders one public sample report. Shared by scripts/build-sample-reports.ts
// and the staleness test so both use exactly the same code path.

/** Throws when a showcase control no longer has the status the plan expects. */
export function assertSampleExcerptStatuses(sample: SampleReport): void {
  const framework = assessCompliance(sampleTenant(sample)).frameworks.find(
    (row) => row.framework.id === sample.frameworkId,
  );
  if (!framework) throw new Error(`Unknown framework ${sample.frameworkId}`);
  for (const expected of SAMPLE_EXCERPTS[sample.frameworkId] ?? []) {
    const actual = framework.controls.find(
      (row) => row.control.id === expected.controlId,
    )?.status;
    if (actual !== expected.status)
      throw new Error(
        `${sample.frameworkId} ${expected.controlId}: expected ${expected.status}, got ${actual ?? "missing"}. Update SAMPLE_EXCERPTS or the Contoso fixture.`,
      );
  }
}

export function sampleReportOptions(
  sample: SampleReport,
): ComplianceReportOptions {
  return {
    frameworkId: sample.frameworkId,
    renderDate: new Date(SAMPLE_RENDER_DATE),
    excerpt: { controlIds: sampleExcerptControlIds(sample) },
    metadata: sampleMetadata(sample),
  };
}

export async function renderSampleReport(
  sample: SampleReport,
): Promise<Uint8Array> {
  assertSampleExcerptStatuses(sample);
  return generateComplianceReportPDF(
    sampleTenant(sample),
    sampleReportOptions(sample),
  );
}

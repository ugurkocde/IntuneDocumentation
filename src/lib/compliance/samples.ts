import type { ComplianceFrameworkId } from "./report-pdf";

// Public sample evidence reports, rendered from the fictional Contoso demo
// tenant by scripts/build-sample-reports.ts and served from public/samples.
export interface SampleReport {
  frameworkId: ComplianceFrameworkId;
  label: string;
  file: string;
  /** Not offered in the web dashboard; only the desktop app creates it. */
  desktopOnly?: true;
}

export const SAMPLE_REPORTS_DIR = "/samples";

export const SAMPLE_REPORTS: readonly SampleReport[] = [
  {
    frameworkId: "iso-27001-2022",
    label: "ISO/IEC 27001:2022",
    file: "iso-27001-2022.pdf",
  },
  {
    frameworkId: "nis2-2022-2555",
    label: "NIS2 Directive",
    file: "nis2.pdf",
    desktopOnly: true,
  },
  {
    frameworkId: "dora-2022-2554",
    label: "DORA",
    file: "dora.pdf",
    desktopOnly: true,
  },
  { frameworkId: "soc2-tsc", label: "SOC 2", file: "soc2.pdf" },
  {
    frameworkId: "hipaa-security-rule",
    label: "HIPAA Security Rule",
    file: "hipaa-security-rule.pdf",
  },
  {
    frameworkId: "nist-800-53-r5",
    label: "NIST SP 800-53",
    file: "nist-800-53-r5.pdf",
  },
  {
    frameworkId: "nist-800-171-r3",
    label: "NIST SP 800-171",
    file: "nist-800-171-r3.pdf",
  },
  {
    frameworkId: "nist-csf-2",
    label: "NIST CSF 2.0",
    file: "nist-csf-2.pdf",
  },
  {
    frameworkId: "cyber-essentials-v3",
    label: "Cyber Essentials",
    file: "cyber-essentials.pdf",
  },
  {
    frameworkId: "essential-eight",
    label: "ASD Essential Eight",
    file: "essential-eight-ml1.pdf",
  },
  {
    frameworkId: "def-stan-05-138-i4",
    label: "Def Stan 05-138",
    file: "def-stan-05-138.pdf",
  },
];

export function sampleReportUrl(sample: SampleReport): string {
  return `${SAMPLE_REPORTS_DIR}/${sample.file}`;
}

export function sampleReportFor(
  frameworkId: ComplianceFrameworkId,
): SampleReport | undefined {
  return SAMPLE_REPORTS.find((sample) => sample.frameworkId === frameworkId);
}

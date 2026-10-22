import JSZip from "jszip";
import type { createEvidenceManifest } from "../manifest";
import { CONTROL_STATUS_LABELS } from "../presentation";
import type { ComplianceAssessment, ControlStatus } from "../types";
import { toCsv } from "./csv";
import { purviewTemplateFor } from "./purview-templates";
import { assessmentScopeText, controlEvidenceCounts } from "./register";

export type EvidenceManifest = Awaited<
  ReturnType<typeof createEvidenceManifest>
>;

export interface EvidencePackMeta {
  /** The framework evidence PDF from generateComplianceReportPDF. */
  reportPdf: Uint8Array;
  reportFileName: string;
  /** Name of the JSON evidence record; defaults to evidence-record.json. */
  recordFileName?: string;
  tenant?: string;
  generatedAt?: string | Date;
}

const UMLAUTS: Readonly<Record<string, string>> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
};
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;

/**
 * A file name that is valid on Windows, macOS and Linux: German umlauts are
 * transliterated, other accents dropped, anything outside letters, digits,
 * dot, hyphen and underscore replaced, and reserved device names prefixed.
 */
export function safeFileName(name: string, fallback = "file"): string {
  const dot = name.lastIndexOf(".");
  const extension =
    dot > 0 && /^\.[A-Za-z0-9]{1,8}$/.test(name.slice(dot))
      ? name.slice(dot).toLowerCase()
      : "";
  const stem = (extension ? name.slice(0, dot) : name)
    .replace(/[äöüÄÖÜß]/g, (letter) => UMLAUTS[letter] ?? letter)
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.\s-]+|[_.\s]+$/g, "")
    .slice(0, 120)
    .replace(/[_.\s]+$/g, "");
  const safe = stem || fallback;
  return `${WINDOWS_RESERVED.test(safe) ? `_${safe}` : safe}${extension}`;
}

/** Index note per control status; the PDF gives the full reason. */
const STATUS_NOTES: Partial<Record<ControlStatus, string>> = {
  notApplicable: "Outside the selected scope.",
  notAssessed: "Not assessed, see the PDF for the reason.",
  noEvidence: "No policy evidence found for the mapped capabilities.",
};

/**
 * ZIP for Purview Compliance Manager: the framework evidence PDF, the JSON
 * evidence record, index.csv and README.txt. The PDF and the record are
 * produced by the caller; `assessment` is normally `manifest.assessment`.
 */
export async function buildEvidencePack(
  assessment: ComplianceAssessment,
  manifest: EvidenceManifest,
  frameworkId: string,
  meta: EvidencePackMeta,
): Promise<Uint8Array> {
  const framework = assessment.frameworks.find(
    (item) => item.framework.id === frameworkId,
  );
  if (!framework)
    throw new Error(`Unknown compliance framework: ${frameworkId}`);
  const capabilities = new Map(
    assessment.capabilities.map((result) => [result.capability.id, result]),
  );
  const generatedAt = new Date(
    meta.generatedAt ?? assessment.generatedAt,
  ).toISOString();
  const template = purviewTemplateFor(frameworkId, assessment.scope);
  if (!template)
    throw new Error(
      `No Purview template mapping for framework: ${frameworkId}`,
    );
  const frameworkLabel = `${framework.framework.name} ${framework.framework.version}`;
  // The forced extensions keep both names distinct from README.txt and index.csv.
  const pdfName = safeFileName(meta.reportFileName, "evidence-report").replace(
    /(\.pdf)?$/i,
    ".pdf",
  );
  const recordName = safeFileName(
    meta.recordFileName ?? "evidence-record.json",
    "evidence-record",
  ).replace(/(\.json)?$/i, ".json");

  const index = [
    [
      "Framework",
      "Purview template",
      "Control ID",
      "Control title",
      "Status",
      "Assigned evidence",
      "Counter-evidence",
      "Evidence not assigned or unknown",
      "Where to find it",
      "Note",
    ],
    ...framework.controls.map((control) => {
      const counts = controlEvidenceCounts(control, capabilities);
      const note = [STATUS_NOTES[control.status], template.note]
        .filter(Boolean)
        .join(" ");
      return [
        frameworkLabel,
        template.displayName,
        control.control.id,
        control.control.title,
        CONTROL_STATUS_LABELS[control.status],
        counts.assigned,
        counts.counter,
        counts.unassigned,
        `${pdfName}, section for control ${control.control.id}`,
        note,
      ];
    }),
  ];

  const readme = [
    "Intune Documentation evidence pack",
    "",
    "WHAT THIS IS",
    `Technical evidence from the Intune configuration of ${meta.tenant ?? "the tenant"} for ${frameworkLabel}.`,
    `Collected at: ${assessment.provenance.collectedAt ?? "not recorded"}`,
    `Scope: ${assessmentScopeText(assessment.scope, [frameworkId])}`,
    `Ruleset version: ${assessment.provenance.rulesetVersion}`,
    `Generated at: ${generatedAt}`,
    "",
    "Files in this pack:",
    `- ${pdfName}: the evidence report for every control, with checks, evidence and limitations.`,
    `- ${recordName}: the machine readable evidence record with snapshot and ruleset fingerprints.`,
    "- index.csv: every control with its status, its evidence split into assigned evidence, counter-evidence and evidence on unassigned policies, and where to find it in the PDF.",
    "- README.txt: this file.",
    "",
    "This is evidence, not a compliance verdict. Whether a control is met is decided in your assessment.",
    assessment.disclaimer,
    "",
    "PURVIEW COMPLIANCE MANAGER TEMPLATE",
    `Template: ${template.displayName}`,
    ...(template.note ? [template.note] : []),
    "",
    "HOW TO ATTACH THE EVIDENCE IN PURVIEW COMPLIANCE MANAGER",
    "1. In the Microsoft Purview portal, open Compliance Manager and open the assessment that uses the template above.",
    "2. Open the improvement action related to the control. index.csv lists the control IDs.",
    "3. Open the Evidence tab.",
    "4. Select Add evidence, then Document.",
    `5. Choose this ZIP file or ${pdfName}.`,
    "6. Select Done.",
    "Purview accepts .pdf and .zip files as document evidence. Its list of accepted file types does not include .csv or .json, so attach the ZIP or the PDF.",
    "",
    "CONTROL IDS",
    "Control IDs are as published by the regulation. A Purview template can number, split or group controls differently, so check each ID against the controls of the template in your tenant before you attach evidence.",
    "",
    "INTEGRITY",
    `Snapshot SHA-256: ${manifest.snapshotSha256}`,
    `Ruleset SHA-256: ${manifest.rulesetSha256}`,
    "",
  ].join("\r\n");

  const date = new Date(generatedAt);
  const zip = new JSZip();
  zip.file("README.txt", readme, { date });
  zip.file("index.csv", toCsv(index, { bom: true }), { date });
  zip.file(pdfName, meta.reportPdf, { date, binary: true });
  zip.file(recordName, JSON.stringify(manifest, null, 2), { date });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

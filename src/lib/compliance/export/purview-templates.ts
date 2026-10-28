import type { AssessmentScope } from "../types";

/** Framework ids this export layer knows. */
export type ExportFrameworkId =
  | "nist-800-53-r5"
  | "nist-csf-2"
  | "iso-27001-2022"
  | "soc2-tsc"
  | "def-stan-05-138-i4"
  | "cyber-essentials-v3"
  | "nist-800-171-r2"
  | "nist-800-171-r3"
  | "essential-eight"
  | "nis2-2022-2555"
  | "hipaa-security-rule"
  | "dora-2022-2554";

export interface PurviewTemplate {
  /** Regulation name as listed in Purview Compliance Manager. */
  displayName: string;
  note?: string;
  verifiedAt: string;
}

interface PurviewTemplateEntry extends PurviewTemplate {
  /** Separate Purview templates per Essential Eight target maturity level. */
  maturityLevels?: Readonly<Record<1 | 2 | 3, string>>;
}

export const PURVIEW_TEMPLATE_SOURCE = {
  url: "https://learn.microsoft.com/en-us/purview/compliance-manager-regulations-list",
  verifiedAt: "2026-10-18",
} as const;

const verifiedAt = PURVIEW_TEMPLATE_SOURCE.verifiedAt;
const NIST_171_NOTE =
  "Purview lists one NIST 800-171 regulation. Check in the tenant which revision the template covers before attaching evidence.";

/**
 * Purview Compliance Manager regulation per framework. Compliance Manager has
 * no API for templates, so this is data checked by hand against the Microsoft
 * Learn list. Names are copied exactly; the spaced hyphens in names such as
 * "UK - Cyber Security for Defence Suppliers" are Microsoft's, so they must
 * not be rewritten.
 */
export const PURVIEW_TEMPLATES: Readonly<
  Record<ExportFrameworkId, PurviewTemplateEntry>
> = {
  "iso-27001-2022": { displayName: "ISO/IEC 27001:2022", verifiedAt },
  "soc2-tsc": {
    displayName: "System and Organization Controls (SOC) 2",
    verifiedAt,
  },
  "hipaa-security-rule": { displayName: "HIPAA/HITECH", verifiedAt },
  "nist-800-53-r5": { displayName: "NIST 800-53 rev.5", verifiedAt },
  "nist-csf-2": { displayName: "NIST CSF 2.0", verifiedAt },
  "nist-800-171-r2": {
    displayName: "NIST 800-171",
    note: NIST_171_NOTE,
    verifiedAt,
  },
  "nist-800-171-r3": {
    displayName: "NIST 800-171",
    note: NIST_171_NOTE,
    verifiedAt,
  },
  "nis2-2022-2555": {
    displayName:
      "NIS2 Directive (EU) 2022/2555 of the European Parliament and of the Council",
    verifiedAt,
  },
  "cyber-essentials-v3": { displayName: "UK Cyber Essentials", verifiedAt },
  "def-stan-05-138-i4": {
    displayName: "UK - Cyber Security for Defence Suppliers Standard 05-138",
    verifiedAt,
  },
  "essential-eight": {
    displayName: "Australia - ASD Essential 8",
    maturityLevels: {
      1: "Australia - ASD Essential 8 Maturity Level 1",
      2: "Australia - ASD Essential 8 Maturity Level 2",
      3: "Australia - ASD Essential 8 Maturity Level 3",
    },
    verifiedAt,
  },
  "dora-2022-2554": {
    displayName: "Digital Operational Resilience Act",
    verifiedAt,
  },
};

export function isExportFrameworkId(value: string): value is ExportFrameworkId {
  return Object.hasOwn(PURVIEW_TEMPLATES, value);
}

/**
 * The Purview template for an assessed framework, or undefined when the
 * framework id is not known to this module. Essential Eight resolves to the
 * template of the assessed maturity level.
 */
export function purviewTemplateFor(
  frameworkId: string,
  scope: AssessmentScope = {},
): PurviewTemplate | undefined {
  if (!isExportFrameworkId(frameworkId)) return undefined;
  const entry = PURVIEW_TEMPLATES[frameworkId];
  const level = scope.essentialEightMaturityLevel;
  if (entry.maturityLevels && level)
    return {
      displayName: entry.maturityLevels[level],
      note: `Purview also offers "${entry.displayName}" without a maturity level.`,
      verifiedAt: entry.verifiedAt,
    };
  return {
    displayName: entry.displayName,
    ...(entry.note ? { note: entry.note } : {}),
    verifiedAt: entry.verifiedAt,
  };
}

import type { ComplianceFrameworkId } from "../../shared/ipc-types";

// Labels and descriptions match the website's framework picker
// (src/components/dashboard/compliance-view.tsx).
export const FRAMEWORK_OPTIONS: ReadonlyArray<{
  id: ComplianceFrameworkId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "essential-eight",
    label: "ASD Essential Eight",
    shortLabel: "Essential Eight",
    description:
      "Australian enterprise IT requirements with target Maturity Levels 1, 2 and 3. Configuration evidence only.",
  },
  {
    id: "iso-27001-2022",
    label: "ISO/IEC 27001",
    shortLabel: "ISO 27001",
    description:
      "Selected Annex A technology controls mapped to managed-device configuration evidence.",
  },
  {
    id: "soc2-tsc",
    label: "SOC 2",
    shortLabel: "SOC 2",
    description:
      "Selected Trust Services Criteria mapped to managed-device configuration evidence.",
  },
  {
    id: "nist-800-53-r5",
    label: "NIST SP 800-53",
    shortLabel: "NIST 800-53",
    description:
      "Security and privacy controls for information systems and organizations.",
  },
  {
    id: "nist-csf-2",
    label: "NIST CSF 2.0",
    shortLabel: "NIST CSF",
    description:
      "Outcome-based guidance for managing and reducing cybersecurity risk.",
  },
  {
    id: "bsi-it-grundschutz",
    label: "BSI IT-Grundschutz",
    shortLabel: "BSI",
    description:
      "Baseline safeguards for systematic information security management.",
  },
  {
    id: "def-stan-05-138-i4",
    label: "Def Stan 05-138",
    shortLabel: "Def Stan",
    description:
      "UK MOD supplier controls under DEFCON 658, with the Cyber Risk Profile levels at which each applies.",
  },
  {
    id: "cyber-essentials-v3",
    label: "Cyber Essentials",
    shortLabel: "Cyber Essentials",
    description:
      "The five NCSC control themes mapped to managed-device configuration evidence.",
  },
  {
    id: "nist-800-171-r2",
    label: "NIST SP 800-171 Rev. 2",
    shortLabel: "NIST 171 R2",
    description:
      "Requirements for protecting controlled unclassified information, as referenced by CMMC 2.0 Level 2.",
  },
  {
    id: "nist-800-171-r3",
    label: "NIST SP 800-171 Rev. 3",
    shortLabel: "NIST 171 R3",
    description:
      "May 2024 requirements for protecting controlled unclassified information. Organization-defined parameters need separate review. Select Revision 2 for CMMC Level 2.",
  },
];

const STORAGE_KEY = "intunedoc.compliance.framework";

export function frameworkOption(id: ComplianceFrameworkId | null) {
  return FRAMEWORK_OPTIONS.find((option) => option.id === id);
}

export function loadFrameworkSelection(): ComplianceFrameworkId | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return frameworkOption(stored as ComplianceFrameworkId)?.id ?? null;
  } catch {
    return null;
  }
}

export function storeFrameworkSelection(id: ComplianceFrameworkId | null): void {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The picker remains usable when storage is unavailable.
  }
}

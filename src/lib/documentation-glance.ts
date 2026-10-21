import type {
  ConfigurationAnalytics,
  DetailedExportData,
} from "./configuration-analyzer";
import { ADDITIONAL_FAMILY_LABELS } from "./intune-policy-registry";

// Numbers for the "At a glance" page of the documentation export. PDF and
// Word both read this model, so the two formats always show the same counts,
// and every count comes from analyzeConfigurations.

export interface GlanceFamily {
  familyKey: string;
  label: string;
  configurations: number;
  /** Policy types (sections) of the family with at least one configuration. */
  policyTypes: number;
  assigned: number;
  notAssigned: number;
  assignmentUnknown: number;
}

export interface GlanceCollectionIssue {
  label: string;
  /** True when some data was read; false when the resource was unavailable. */
  partial: boolean;
}

export interface DocumentationGlance {
  configurations: number;
  /** Policy types with at least one configuration. */
  policyTypes: number;
  assigned: number;
  notAssigned: number;
  assignmentUnknown: number;
  /** Configurations that have an assignment relationship. */
  assignmentApplicable: number;
  /** assigned over assignmentApplicable; null when nothing is assignable. */
  assignedShare: number | null;
  /** Families with configurations, in document order. */
  families: GlanceFamily[];
  collection: {
    /** Fetch errors, then section errors not already listed as one. */
    issues: GlanceCollectionIssue[];
    partial: number;
    unavailable: number;
    /** Family keys left out of the collection on purpose. */
    skippedFamilies: string[];
    /** False means no collection warning was recorded, not that it is complete. */
    hasWarnings: boolean;
  };
}

// Core families in the order and with the names of the document sections.
const CORE_FAMILY_LABELS: Readonly<Record<string, string>> = {
  settingsCatalog: "Settings Catalog Policies",
  deviceConfigurations: "Device Configurations",
  administrativeTemplates: "Administrative Templates",
  compliancePolicies: "Compliance Policies",
  appProtectionPolicies: "App Protection Policies",
  securityBaselines: "Security Baselines",
  scripts: "Scripts",
  appConfigurations: "App Configuration Policies",
  windowsUpdatePolicies: "Windows Update Policies",
  conditionalAccessPolicies: "Conditional Access Policies",
  enrollmentConfigurations: "Enrollment Configurations",
};

// Inventory rows of an export without sections, keyed by family.
const LEGACY_INVENTORY_FAMILIES: Readonly<Record<string, string>> = {
  scriptsWindows: "scripts",
  scriptsMacOS: "scripts",
};

function familyLabel(familyKey: string, fallback: string): string {
  return (
    CORE_FAMILY_LABELS[familyKey] ??
    ADDITIONAL_FAMILY_LABELS[
      familyKey as keyof typeof ADDITIONAL_FAMILY_LABELS
    ] ??
    fallback
  );
}

export function buildGlanceModel(
  data: DetailedExportData,
  analytics: ConfigurationAnalytics,
): DocumentationGlance {
  const sectionFamilies = new Map(
    (data.sections ?? []).map((section) => [section.key, section.familyKey]),
  );
  const families = new Map<string, GlanceFamily>();
  for (const row of analytics.inventory) {
    if (row.total === 0) continue;
    const familyKey =
      sectionFamilies.get(row.key) ??
      LEGACY_INVENTORY_FAMILIES[row.key] ??
      row.key;
    const family = families.get(familyKey) ?? {
      familyKey,
      label: familyLabel(familyKey, row.label),
      configurations: 0,
      policyTypes: 0,
      assigned: 0,
      notAssigned: 0,
      assignmentUnknown: 0,
    };
    family.configurations += row.total;
    family.policyTypes += 1;
    family.assigned += row.assigned;
    family.notAssigned += row.unassigned;
    family.assignmentUnknown += row.unknown;
    families.set(familyKey, family);
  }
  const coreOrder = Object.keys(CORE_FAMILY_LABELS);
  const rank = (familyKey: string) => {
    const index = coreOrder.indexOf(familyKey);
    return index === -1 ? coreOrder.length : index;
  };
  // Core families first in document order; the others keep inventory order.
  const orderedFamilies = [...families.values()].sort(
    (left, right) => rank(left.familyKey) - rank(right.familyKey),
  );

  const fetchErrors = data.fetchErrors ?? [];
  const listed = new Set(fetchErrors.map((error) => error.policyId));
  const issues: GlanceCollectionIssue[] = [
    ...fetchErrors.map((error) => ({
      label: `${error.policyType}: ${error.policyName}`,
      partial: error.partial === true,
    })),
    ...(data.sections ?? []).flatMap((section) =>
      section.error && !listed.has(section.key)
        ? [{ label: section.label, partial: section.error.partial === true }]
        : [],
    ),
  ];
  const partial = issues.filter((issue) => issue.partial).length;
  const skippedFamilies = [...(data.collectionSkippedFamilies ?? [])];

  return {
    configurations: analytics.totalConfigs,
    policyTypes: analytics.inventory.filter((row) => row.total > 0).length,
    assigned: analytics.assignedConfigs,
    notAssigned: analytics.unassignedConfigs,
    assignmentUnknown: analytics.unknownAssignmentConfigs,
    assignmentApplicable: analytics.assignmentApplicableConfigs,
    assignedShare:
      analytics.assignmentApplicableConfigs > 0
        ? analytics.assignedConfigs / analytics.assignmentApplicableConfigs
        : null,
    families: orderedFamilies,
    collection: {
      issues,
      partial,
      unavailable: issues.length - partial,
      skippedFamilies,
      hasWarnings: issues.length > 0 || skippedFamilies.length > 0,
    },
  };
}

// Desktop side classification of a collection for the Overview. It only
// changes how items are counted and grouped for display: sections, their
// items, summary.totalConfigurations and every export stay as collected.
import type {
  CollectionBreakdown,
  SectionCount,
  SectionFamilyCount,
} from "../shared/ipc-types";

export interface ClassifiableSection {
  key: string;
  familyKey: string;
  label: string;
  items: unknown[];
  error?: { message: string };
}

export type ItemBucket = "policy" | "app" | "rbac" | "microsoftDefault";

export interface ItemClassification {
  // Family the item is shown under in the desktop app.
  familyKey: string;
  // Exactly one bucket per item, so the buckets add up to the total.
  bucket: ItemBucket;
  // Created by Microsoft. Built in RBAC items are in the rbac bucket.
  microsoftDefault: boolean;
}

export const ENDPOINT_SECURITY_FAMILY = "endpointSecurityPolicies";
export const SECURITY_BASELINE_FAMILY = "securityBaselinePolicies";
const APPS_SECTION = "mobileApps";
const RBAC_FAMILY = "assignmentAndRbac";

// Sections whose items are spread across display families.
const SPLIT_SECTIONS = new Set(["settingsCatalog"]);

// Sections shown under another family than the one Graph data is filed in.
const SECTION_FAMILY_OVERRIDES: Record<string, string> = {
  // The Apple ADE token is a connector token, not a provisioning profile.
  depOnboardingSettings: "connectors",
};

// Clearer names for sections whose collected label misleads.
const SECTION_LABEL_OVERRIDES: Record<string, string> = {
  // Legacy /deviceManagement/intents, mostly endpoint security templates.
  securityBaselines: "Endpoint security (legacy templates)",
};

// Ids of the default enrollment configurations every tenant has, such as
// "<tenant>_DefaultLimit" or "<tenant>_WindowsRestore".
const DEFAULT_ENROLLMENT_ID = /_(Default[A-Za-z0-9]+|WindowsRestore)$/;

// Singletons every tenant has, whether or not an administrator changed them.
const TENANT_SINGLETONS = new Set([
  "deviceManagementSettings",
  "androidForWorkSettings",
]);

function record(item: unknown): Record<string, unknown> {
  return item && typeof item === "object"
    ? (item as Record<string, unknown>)
    : {};
}

export function sectionFamilyKey(
  section: Pick<ClassifiableSection, "key" | "familyKey">,
): string {
  return SECTION_FAMILY_OVERRIDES[section.key] ?? section.familyKey;
}

export function sectionLabel(
  section: Pick<ClassifiableSection, "key" | "label">,
): string {
  return SECTION_LABEL_OVERRIDES[section.key] ?? section.label;
}

// Display family of one item. Settings Catalog policies created from an
// endpoint security or security baseline template move to those families.
export function itemFamilyKey(
  section: Pick<ClassifiableSection, "key" | "familyKey">,
  item: unknown,
): string {
  if (section.key === "settingsCatalog") {
    const reference = record(record(item).templateReference);
    const family = reference.templateFamily;
    if (family === "baseline") return SECURITY_BASELINE_FAMILY;
    if (typeof family === "string" && family.startsWith("endpointSecurity")) {
      return ENDPOINT_SECURITY_FAMILY;
    }
  }
  return sectionFamilyKey(section);
}

export function isMicrosoftDefault(sectionKey: string, item: unknown): boolean {
  const value = record(item);
  switch (sectionKey) {
    case "roleDefinitions":
      return value.isBuiltIn === true || value.isBuiltInRoleDefinition === true;
    case "roleScopeTags":
      return value.isBuiltIn === true || value.id === "0";
    case "enrollmentConfigurations":
      return (
        typeof value.id === "string" && DEFAULT_ENROLLMENT_ID.test(value.id)
      );
    case "deviceHealthScripts":
      return value.isGlobalScript === true;
    case "deviceManagementPartners":
      return value.isConfigured === false;
    case "remoteAssistancePartners":
      return value.onboardingStatus === "notOnboarded";
    default:
      return TENANT_SINGLETONS.has(sectionKey);
  }
}

// Apps first, then RBAC (built in roles and the Default scope tag stay RBAC),
// then Microsoft defaults; everything else is a policy or profile.
export function classifyItem(
  section: Pick<ClassifiableSection, "key" | "familyKey">,
  item: unknown,
): ItemClassification {
  const microsoftDefault = isMicrosoftDefault(section.key, item);
  const bucket: ItemBucket =
    section.key === APPS_SECTION
      ? "app"
      : section.familyKey === RBAC_FAMILY
        ? "rbac"
        : microsoftDefault
          ? "microsoftDefault"
          : "policy";
  return { familyKey: itemFamilyKey(section, item), bucket, microsoftDefault };
}

export function sectionCount(section: ClassifiableSection): SectionCount {
  const familyKey = sectionFamilyKey(section);
  const groups = new Map<
    string,
    { count: number; microsoftDefaults: number }
  >();
  if (SPLIT_SECTIONS.has(section.key))
    groups.set(familyKey, { count: 0, microsoftDefaults: 0 });
  let microsoftDefaults = 0;
  for (const item of section.items) {
    const classification = classifyItem(section, item);
    if (classification.microsoftDefault) microsoftDefaults += 1;
    const group = groups.get(classification.familyKey) ?? {
      count: 0,
      microsoftDefaults: 0,
    };
    group.count += 1;
    if (classification.microsoftDefault) group.microsoftDefaults += 1;
    groups.set(classification.familyKey, group);
  }
  const families: SectionFamilyCount[] | undefined = SPLIT_SECTIONS.has(
    section.key,
  )
    ? [...groups].map(([key, group]) => ({
        familyKey: key,
        count: group.count,
        ...(group.microsoftDefaults
          ? { microsoftDefaults: group.microsoftDefaults }
          : {}),
      }))
    : undefined;
  return {
    key: section.key,
    familyKey,
    label: sectionLabel(section),
    count: section.items.length,
    ...(section.error ? { error: section.error.message } : {}),
    ...(microsoftDefaults ? { microsoftDefaults } : {}),
    ...(families ? { families } : {}),
  };
}

export function collectionBreakdown(
  sections: ClassifiableSection[],
): CollectionBreakdown {
  const breakdown: CollectionBreakdown = {
    policies: 0,
    apps: 0,
    appsAssigned: 0,
    rbac: 0,
    microsoftDefaults: 0,
    microsoftDefaultsInRbac: 0,
  };
  for (const section of sections) {
    for (const item of section.items) {
      const { bucket, microsoftDefault } = classifyItem(section, item);
      if (microsoftDefault) breakdown.microsoftDefaults += 1;
      if (bucket === "policy") breakdown.policies += 1;
      else if (bucket === "rbac") {
        breakdown.rbac += 1;
        if (microsoftDefault) breakdown.microsoftDefaultsInRbac += 1;
      } else if (bucket === "app") {
        breakdown.apps += 1;
        if (record(item).isAssigned === true) breakdown.appsAssigned += 1;
      }
    }
  }
  return breakdown;
}

// Family a fetch error is shown under: the family of the failed item when
// the error names one (Settings Catalog policies are split), otherwise the
// family of the section, which may have moved (the Apple ADE token).
export function errorFamilyKey(
  sections: ClassifiableSection[],
  error: { policyId: string; familyKey?: string },
): string | undefined {
  if (!error.familyKey) return undefined;
  if (SPLIT_SECTIONS.has(error.familyKey)) {
    const section = sections.find((entry) => entry.key === error.familyKey);
    const item = section?.items.find(
      (entry) => record(entry).id === error.policyId,
    );
    if (section && item) return itemFamilyKey(section, item);
  }
  // Registry sections report a failed fetch with the section key as policyId.
  return sectionFamilyKey({ key: error.policyId, familyKey: error.familyKey });
}

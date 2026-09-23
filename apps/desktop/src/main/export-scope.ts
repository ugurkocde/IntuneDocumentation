import {
  getStableItemId,
  type ConfigurationSectionData,
} from "../../../../src/lib/configuration-sections";
import { scopeKey, type ScopeItemRef } from "../shared/export-scope";

// The legacy per type arrays the generators read, by the key of the section
// that holds the same items.
const LEGACY_ARRAYS = {
  settingsCatalog: "settingsCatalog",
  deviceConfigurations: "deviceConfigurations",
  administrativeTemplates: "administrativeTemplates",
  securityBaselines: "securityBaselines",
  compliancePolicies: "compliancePolicies",
  appProtectionPolicies: "appProtectionPolicies",
  appConfigurations: "appConfigurations",
  windowsUpdatePolicies: "windowsUpdatePolicies",
  enrollmentConfigurations: "enrollmentConfigurations",
  conditionalAccessPolicies: "conditionalAccessPolicies",
} as const;

interface ScopeSource {
  sections: ConfigurationSectionData[];
  fetchErrors?: Array<{ policyId: string }>;
}

// A copy of the collection that holds only the referenced items, in
// collection order, in the shape the document generators expect. Throws when
// a reference is not part of the collection.
export function buildScopedExportData<T extends ScopeSource>(
  data: T,
  refs: readonly ScopeItemRef[],
): T {
  const wanted = new Set(refs.map(scopeKey));
  const found = new Set<string>();
  const sections: ConfigurationSectionData[] = [];
  for (const section of data.sections) {
    const items = section.items.filter((item, index) => {
      const key = scopeKey({
        sectionKey: section.key,
        itemId: getStableItemId(section, item as Record<string, unknown>, index),
      });
      if (!wanted.has(key)) return false;
      found.add(key);
      return true;
    });
    if (items.length > 0) sections.push({ ...section, items });
  }
  if (found.size !== wanted.size) {
    throw new Error(
      "Some selected configurations are not in the last collection. Clear the selection and choose them again.",
    );
  }

  const itemsOf = (key: string) =>
    sections.find((section) => section.key === key)?.items ?? [];
  const legacy = Object.fromEntries(
    Object.entries(LEGACY_ARRAYS).map(([field, key]) => [field, itemsOf(key)]),
  ) as Record<keyof typeof LEGACY_ARRAYS, unknown[]>;

  // Only warnings about the exported items or their sections.
  const itemIds = new Set(
    sections.flatMap((section) =>
      section.items.map((item, index) =>
        getStableItemId(section, item as Record<string, unknown>, index),
      ),
    ),
  );
  const sectionKeys = new Set(sections.map((section) => section.key));
  const fetchErrors = (data.fetchErrors ?? []).filter(
    (error) =>
      itemIds.has(String(error.policyId)) || sectionKeys.has(error.policyId),
  );

  return {
    ...data,
    ...legacy,
    sections,
    scripts: {
      windows: itemsOf("windowsScripts"),
      macOS: itemsOf("macOSScripts"),
    },
    fetchErrors,
  } as T;
}

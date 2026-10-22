import {
  INTUNE_POLICY_REGISTRY,
  type AdditionalConfigurationFamily,
} from "./intune-policy-registry";

export interface SectionError {
  message: string;
  errorCode?: string;
  statusCode?: number;
  permissionHint?: string;
  partial?: boolean;
}

export interface ConfigurationSectionData {
  key: string;
  familyKey: string;
  label: string;
  endpoint?: string;
  permissionHint?: string;
  selectionPrefix: string;
  items: any[];
  error?: SectionError;
  legacy?: boolean;
}

export type AdditionalConfigurationSection = ConfigurationSectionData & {
  familyKey: AdditionalConfigurationFamily;
};

export function getStableItemId(
  section: Pick<ConfigurationSectionData, "key">,
  item: Record<string, unknown>,
  index?: number,
): string {
  const candidate = item.id ?? item.policyId ?? item.templateId;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : `singleton-${section.key}${index === undefined ? "" : `-${index}`}`;
}

// Sections of one resource that Graph returns without an id, such as the
// Intune tenant settings: their position is their identity.
const SINGLETON_SECTIONS: ReadonlySet<string> = new Set(
  INTUNE_POLICY_REGISTRY.filter((entry) => entry.shape === "singleton").map(
    (entry) => entry.key,
  ),
);

/**
 * Whether a stable item id names the item. getStableItemId falls back to
 * the item's position when Graph returned no id; that names the one
 * resource of a singleton section, but in a collection it names whichever
 * item came at that position, so two such items are never one policy.
 */
export function isItemIdentity(
  section: Pick<ConfigurationSectionData, "key">,
  id: unknown,
): id is string {
  if (typeof id !== "string" || id === "") return false;
  const prefix = `singleton-${section.key}`;
  const positional =
    id.startsWith(prefix) && /^(-\d+)?$/.test(id.slice(prefix.length));
  return !positional || SINGLETON_SECTIONS.has(section.key);
}

export function getItemLabel(
  section: Pick<ConfigurationSectionData, "label">,
  item: Record<string, unknown>,
): string {
  const candidate =
    item.displayName ??
    item.name ??
    item.title ??
    item.fileName ??
    item.publisher;
  return typeof candidate === "string" || typeof candidate === "number"
    ? String(candidate)
    : section.label;
}

export function getSelectionId(
  section: Pick<ConfigurationSectionData, "key" | "selectionPrefix">,
  item: Record<string, unknown>,
  index?: number,
): string {
  return `${section.selectionPrefix}-${getStableItemId(section, item, index)}`;
}

export function getAllSectionItems(sections: ConfigurationSectionData[]) {
  return sections.flatMap((section) => section.items);
}

import type { AdditionalConfigurationFamily } from "./intune-policy-registry";

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

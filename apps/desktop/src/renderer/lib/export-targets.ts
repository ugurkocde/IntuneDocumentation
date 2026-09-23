import {
  exportFileName,
  type ScopeItemRef,
} from "../../shared/export-scope";
import { localDateStamp } from "../../shared/dates";
import type { SectionItemSummary, SectionItemsResult } from "../../shared/ipc-types";
import type { ExportFormat, SelectedItem } from "../state/types";

// What one export documents: the whole tenant, one configuration, one
// section or a selection.
export interface ExportTarget {
  kind: "tenant" | "item" | "section" | "selection";
  // Empty for the whole tenant.
  items: ScopeItemRef[];
  // Cover title and, apart from a selection, the file name.
  title: string;
  subtitle: string;
}

export const TENANT_TARGET: ExportTarget = {
  kind: "tenant",
  items: [],
  title: "Whole tenant",
  subtitle: "",
};

function count(value: number): string {
  return `${value.toLocaleString()} ${value === 1 ? "configuration" : "configurations"}`;
}

export function itemTarget(
  section: { key: string; label: string },
  item: Pick<SectionItemSummary, "id" | "displayName">,
): ExportTarget {
  return {
    kind: "item",
    items: [{ sectionKey: section.key, itemId: item.id }],
    title: item.displayName,
    subtitle: section.label,
  };
}

export function sectionTarget(section: SectionItemsResult): ExportTarget {
  return {
    kind: "section",
    items: section.items.map((item) => ({ sectionKey: section.key, itemId: item.id })),
    title: section.label,
    subtitle: count(section.items.length),
  };
}

export function selectionTarget(selected: SelectedItem[]): ExportTarget {
  const [only] = selected;
  if (selected.length === 1 && only) {
    return itemTarget({ key: only.sectionKey, label: only.sectionLabel }, { id: only.itemId, displayName: only.name });
  }
  const sections = new Set(selected.map((item) => item.sectionLabel)).size;
  return {
    kind: "selection",
    items: selected.map(({ sectionKey, itemId }) => ({ sectionKey, itemId })),
    title: "Selected configurations",
    subtitle: `${count(selected.length)} from ${sections} ${sections === 1 ? "section" : "sections"}`,
  };
}

export function targetFileName(target: ExportTarget, format: ExportFormat): string {
  if (target.kind === "tenant") {
    return `Intune-Configuration-Documentation-${localDateStamp()}.${format}`;
  }
  return exportFileName(
    target.kind === "selection" ? "Intune selected configurations" : target.title,
    format,
  );
}

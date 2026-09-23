// Scoped configuration exports, shared by main and the renderer. Free of
// runtime imports so every bundle can use it.
import { localDateStamp } from "./dates";

export interface ScopeItemRef {
  sectionKey: string;
  itemId: string;
}

// The part of the tenant a configuration export documents. Without a scope
// the export covers the whole tenant.
export interface ExportScopeRequest {
  items: ScopeItemRef[];
}

export const MAX_SCOPE_ITEMS = 5000;
export const MAX_SECTION_KEY_LENGTH = 200;
export const MAX_ITEM_ID_LENGTH = 400;

// Scoped documents with this many items or fewer skip the executive summary
// and the table of contents.
export const COMPACT_SCOPE_MAX_ITEMS = 3;

const MAX_FILE_NAME_LENGTH = 120;

export function scopeKey(ref: ScopeItemRef): string {
  return `${ref.sectionKey}\n${ref.itemId}`;
}

// Validates a scope received over IPC. Returns null for a whole tenant
// export and throws for anything malformed.
export function parseExportScope(input: unknown): ScopeItemRef[] | null {
  if (input === undefined || input === null) return null;
  const items =
    typeof input === "object" ? (input as { items?: unknown }).items : null;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Choose at least one configuration to export.");
  }
  if (items.length > MAX_SCOPE_ITEMS) {
    throw new Error(
      `Export up to ${MAX_SCOPE_ITEMS.toLocaleString("en-US")} selected configurations at a time, or export the whole tenant.`,
    );
  }
  const seen = new Set<string>();
  const refs: ScopeItemRef[] = [];
  for (const item of items) {
    const sectionKey =
      item && typeof item === "object"
        ? (item as { sectionKey?: unknown }).sectionKey
        : undefined;
    const itemId =
      item && typeof item === "object"
        ? (item as { itemId?: unknown }).itemId
        : undefined;
    if (
      typeof sectionKey !== "string" ||
      typeof itemId !== "string" ||
      !sectionKey ||
      !itemId ||
      sectionKey.length > MAX_SECTION_KEY_LENGTH ||
      itemId.length > MAX_ITEM_ID_LENGTH
    ) {
      throw new Error("The export selection is not valid.");
    }
    const ref = { sectionKey, itemId };
    const key = scopeKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

// Characters Windows or macOS reject in file names, and control characters.
// eslint-disable-next-line no-control-regex
const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

// A file name "<stem> - <local date>.<extension>" that Windows and macOS
// accept: unsafe characters removed, no trailing dots or spaces, at most 120
// characters.
export function exportFileName(
  stem: string,
  extension: "pdf" | "docx",
  date: Date = new Date(),
): string {
  const suffix = ` - ${localDateStamp(date)}.${extension}`;
  const room = MAX_FILE_NAME_LENGTH - suffix.length;
  const clean = (value: string) =>
    value
      .replace(UNSAFE_FILE_CHARACTERS, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.\s]+$/, "")
      .replace(/^[.\s]+/, "");
  const cleaned = clean(Array.from(clean(stem)).slice(0, room).join(""));
  return `${cleaned || "Intune configuration"}${suffix}`;
}

import type jsPDF from "jspdf";

/**
 * The jsPDF outline plugin (doc.outline.add). The project's @types/jspdf 1.3
 * typings predate it, so it is described here.
 */
interface OutlineNode {
  title: string;
  children: unknown[];
}

interface OutlinePlugin {
  add(
    parent: OutlineNode | null,
    title: string,
    options: { pageNumber: number },
  ): OutlineNode;
}

/** One PDF bookmark, optionally with nested bookmarks. */
export interface PdfOutlineEntry {
  title: string;
  /** One-based page the bookmark opens. */
  pageNumber: number;
  children?: PdfOutlineEntry[];
}

/**
 * Writes entries into the document outline (the bookmarks pane) using the
 * jsPDF outline plugin. Titles are collapsed to a single line; entries with an
 * empty title or a page outside the document are skipped with their children.
 */
export function addPdfOutline(
  doc: jsPDF,
  entries: readonly PdfOutlineEntry[],
  parent: OutlineNode | null = null,
): void {
  const { outline } = doc as jsPDF & { outline: OutlinePlugin };
  const pageCount = doc.internal.getNumberOfPages();
  for (const entry of entries) {
    const title = entry.title.replace(/\s+/g, " ").trim();
    if (
      !title ||
      !Number.isInteger(entry.pageNumber) ||
      entry.pageNumber < 1 ||
      entry.pageNumber > pageCount
    ) {
      continue;
    }
    const item = outline.add(parent, title, {
      pageNumber: entry.pageNumber,
    });
    if (entry.children?.length) addPdfOutline(doc, entry.children, item);
  }
}

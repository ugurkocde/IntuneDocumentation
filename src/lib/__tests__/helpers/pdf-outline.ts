import { inflateSync } from "node:zlib";

export interface ParsedOutlineNode {
  title: string;
  /** One-based page the bookmark points to, or undefined without a destination. */
  page?: number;
  children: ParsedOutlineNode[];
}

function decodePdfString(raw: string): string {
  const unescaped = raw.replace(/\\([\\()])/g, "$1");
  if (!unescaped.startsWith("þÿ")) return unescaped;
  let decoded = "";
  for (let index = 2; index + 1 < unescaped.length; index += 2) {
    decoded += String.fromCharCode(
      (unescaped.charCodeAt(index) << 8) | unescaped.charCodeAt(index + 1),
    );
  }
  return decoded;
}

/**
 * Reads the bookmark tree jsPDF writes. Outline objects are plain dictionaries
 * outside compressed streams, so they can be parsed from the raw bytes.
 */
export function readPdfOutline(bytes: Uint8Array): {
  hasOutlinesCatalogEntry: boolean;
  outline: ParsedOutlineNode[];
  linkPages: number[];
} {
  const pdf = Buffer.from(bytes).toString("latin1");

  const pageObjectIds = [
    ...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Type \/Page\b(?!s)/g),
  ].map((match) => Number(match[1]));
  const pageFor = (objectId: string | undefined) => {
    const index = pageObjectIds.indexOf(Number(objectId));
    return index >= 0 ? index + 1 : undefined;
  };

  const rootId = /(\d+) 0 obj\s*<<\s*\/Type \/Outlines/.exec(pdf)?.[1];
  const items = [
    ...pdf.matchAll(
      /(\d+) 0 obj\s*<<\s*\/Title \(((?:\\.|[^\\)])*)\)\s*\/Parent (\d+) 0 R([\s\S]*?)>>\s*endobj/g,
    ),
  ]
    .map((match) => ({
      id: Number(match[1]),
      parent: Number(match[3]),
      node: {
        title: decodePdfString(match[2] ?? ""),
        page: pageFor(/\/Dest \[(\d+) 0 R/.exec(match[4] ?? "")?.[1]),
        children: [] as ParsedOutlineNode[],
      },
    }))
    .sort((left, right) => left.id - right.id);

  const byId = new Map(items.map((item) => [item.id, item.node]));
  const outline: ParsedOutlineNode[] = [];
  for (const item of items) {
    if (item.parent === Number(rootId)) outline.push(item.node);
    else byId.get(item.parent)?.children.push(item.node);
  }

  const linkPages = [
    ...pdf.matchAll(/\/Subtype \/Link[^>]*?\/Dest \[(\d+) 0 R/g),
  ].flatMap((match) => pageFor(match[1]) ?? []);

  return {
    hasOutlinesCatalogEntry: /\/Type \/Catalog[\s\S]*?\/Outlines \d+ 0 R/.test(
      pdf,
    ),
    outline,
    linkPages,
  };
}

/** Decompressed content stream text of every page, in page order. */
export function readPdfPageTexts(bytes: Uint8Array): string[] {
  const pdf = Buffer.from(bytes);
  const source = pdf.toString("latin1");
  const streamText = (objectId: number): string => {
    const objectStart = source.search(new RegExp(`(^|\\s)${objectId} 0 obj`));
    if (objectStart < 0) return "";
    const streamStart = source.indexOf("stream\n", objectStart);
    const dictionary = source.slice(objectStart, streamStart);
    const length = Number(/\/Length\s+(\d+)/.exec(dictionary)?.[1] ?? 0);
    const data = pdf.subarray(
      streamStart + "stream\n".length,
      streamStart + "stream\n".length + length,
    );
    return dictionary.includes("/FlateDecode")
      ? inflateSync(data).toString("latin1")
      : data.toString("latin1");
  };

  return [...source.matchAll(/\d+ 0 obj\s*<<\s*\/Type \/Page\b(?!s)/g)].map(
    (match) => {
      const pageObject = source.slice(
        match.index,
        source.indexOf("endobj", match.index),
      );
      const contentsId = /\/Contents (\d+) 0 R/.exec(pageObject)?.[1];
      return contentsId ? streamText(Number(contentsId)) : "";
    },
  );
}

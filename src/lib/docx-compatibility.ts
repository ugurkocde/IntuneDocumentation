import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import JSZip from "jszip";

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// CT_RPr requires this order. docx 8.x writes fonts after size/color and
// underline before color, which Word's schema validator rejects.
const RUN_PROPERTY_ORDER = [
  "rStyle",
  "rFonts",
  "b",
  "bCs",
  "i",
  "iCs",
  "caps",
  "smallCaps",
  "strike",
  "dstrike",
  "outline",
  "shadow",
  "emboss",
  "imprint",
  "noProof",
  "snapToGrid",
  "vanish",
  "webHidden",
  "color",
  "spacing",
  "w",
  "kern",
  "position",
  "sz",
  "szCs",
  "highlight",
  "u",
  "effect",
  "bdr",
  "shd",
  "fitText",
  "vertAlign",
  "rtl",
  "cs",
  "em",
  "lang",
  "eastAsianLayout",
  "specVanish",
  "oMath",
  "rPrChange",
];
const propertyRanks = new Map(
  RUN_PROPERTY_ORDER.map((name, index) => [name, index]),
);

/** Keep text, formatting values, images, and relationships intact. */
export async function normalizeDocx(bytes: Uint8Array): Promise<Uint8Array> {
  const archive = await JSZip.loadAsync(bytes);
  // ImageRun in docx 8.x names every image .png, including JPEG uploads.
  // Match the part name and MIME declaration to the actual image bytes.
  const renamedImages = new Map<string, string>();
  for (const entry of Object.values(archive.files)) {
    if (entry.dir || !/^word\/media\/.*\.png$/.test(entry.name)) continue;
    const image = await entry.async("uint8array");
    if (image[0] !== 0xff || image[1] !== 0xd8) continue;
    const name = entry.name.replace(/\.png$/, ".jpeg");
    archive.file(name, image, { date: entry.date });
    archive.remove(entry.name);
    renamedImages.set(
      entry.name.slice("word/media/".length),
      name.slice("word/media/".length),
    );
  }
  if (renamedImages.size) {
    const relationshipNamespace =
      "http://schemas.openxmlformats.org/package/2006/relationships";
    for (const entry of Object.values(archive.files)) {
      if (entry.dir || !/^word\/_rels\/.*\.rels$/.test(entry.name)) continue;
      const relationships = new DOMParser().parseFromString(
        await entry.async("string"),
        "application/xml",
      );
      let changed = false;
      for (const relationship of Array.from(
        relationships.getElementsByTagNameNS(
          relationshipNamespace,
          "Relationship",
        ),
      )) {
        if (relationship.getAttribute("TargetMode") === "External") continue;
        if (!relationship.getAttribute("Type")?.endsWith("/image")) continue;
        const target = relationship.getAttribute("Target") ?? "";
        const slash = target.lastIndexOf("/");
        const renamed = renamedImages.get(target.slice(slash + 1));
        if (!renamed) continue;
        relationship.setAttribute(
          "Target",
          target.slice(0, slash + 1) + renamed,
        );
        changed = true;
      }
      if (changed)
        archive.file(
          entry.name,
          new XMLSerializer().serializeToString(relationships),
        );
    }
    const contentTypesPart = archive.file("[Content_Types].xml");
    if (!contentTypesPart)
      throw new Error("Word document content types are missing");
    const contentTypes = new DOMParser().parseFromString(
      await contentTypesPart.async("string"),
      "application/xml",
    );
    const namespace =
      "http://schemas.openxmlformats.org/package/2006/content-types";
    const hasJpeg = Array.from(
      contentTypes.getElementsByTagNameNS(namespace, "Default"),
    ).some(
      (entry) =>
        entry.getAttribute("Extension") === "jpeg" &&
        entry.getAttribute("ContentType") === "image/jpeg",
    );
    if (!hasJpeg) {
      const declaration = contentTypes.createElementNS(namespace, "Default");
      declaration.setAttribute("Extension", "jpeg");
      declaration.setAttribute("ContentType", "image/jpeg");
      contentTypes.documentElement!.appendChild(declaration);
      archive.file(
        "[Content_Types].xml",
        new XMLSerializer().serializeToString(contentTypes),
      );
    }
  }
  for (const entry of Object.values(archive.files)) {
    if (entry.dir || !/^word\/.*\.xml$/.test(entry.name)) continue;
    const xml = await entry.async("string");
    if (!xml.includes("<w:rPr")) continue;
    const document = new DOMParser({
      onError: () => {
        throw new Error("Invalid Word document XML");
      },
    }).parseFromString(xml, "application/xml");
    // Snapshot the live NodeList before moving nodes, so large reports don't
    // repeatedly scan the entire document after each formatting change.
    const properties = Array.from(
      document.getElementsByTagNameNS(WORD_NAMESPACE, "rPr"),
    );
    let changed = false;
    for (const property of properties) {
      const children = Array.from(property.childNodes).filter(
        (child) => child.nodeType === 1,
      );
      const rank = (child: (typeof children)[number]) =>
        propertyRanks.get(child.nodeName.split(":").pop() ?? "") ??
        RUN_PROPERTY_ORDER.length;
      const ordered = [...children].sort(
        (left, right) => rank(left) - rank(right),
      );
      if (
        ordered.every((child, childIndex) => child === children[childIndex])
      ) {
        continue;
      }
      for (const child of ordered) property.appendChild(child);
      changed = true;
    }
    if (changed)
      archive.file(entry.name, new XMLSerializer().serializeToString(document));
  }
  return archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

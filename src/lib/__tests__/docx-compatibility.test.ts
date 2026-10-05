import { DOMParser } from "@xmldom/xmldom";
import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { normalizeDocx } from "../docx-compatibility";
import { extractZipEntry } from "./helpers/zip";

const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

describe("Word-compatible run properties", () => {
  it("orders fonts, colors, sizes, and underlines without changing content", async () => {
    const document = new Document({
      styles: {
        default: {
          document: { run: { font: "Calibri", color: "000000", size: 22 } },
        },
      },
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Visible & readable <policy>",
                  font: "Calibri",
                  bold: true,
                  color: "003366",
                  size: 22,
                  underline: {},
                }),
              ],
            }),
          ],
        },
      ],
    });
    const original = new Uint8Array(await Packer.toBuffer(document));
    const normalized = await normalizeDocx(original);
    for (const name of ["word/document.xml", "word/styles.xml"]) {
      const xml = extractZipEntry(normalized, name);
      const parsed = new DOMParser().parseFromString(xml, "application/xml");
      const properties = parsed.getElementsByTagNameNS(WORD_NAMESPACE, "rPr");
      for (let index = 0; index < properties.length; index++) {
        const children = Array.from(properties.item(index)!.childNodes)
          .filter((child) => child.nodeType === 1)
          .map((child) => child.nodeName.split(":").pop());
        if (children.includes("rFonts")) expect(children[0]).toBe("rFonts");
        if (children.includes("u"))
          expect(children.indexOf("u")).toBeGreaterThan(
            children.indexOf("color"),
          );
      }
    }
    const getText = (bytes: Uint8Array) =>
      new DOMParser().parseFromString(
        extractZipEntry(bytes, "word/document.xml"),
        "application/xml",
      ).documentElement!.textContent;
    expect(getText(normalized)).toBe(getText(original));
    expect(extractZipEntry(normalized, "word/_rels/document.xml.rels")).toBe(
      extractZipEntry(original, "word/_rels/document.xml.rels"),
    );
  });

  it("labels JPEG media correctly and keeps its bytes and references", async () => {
    const archive = new JSZip();
    const jpegBytes = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
    archive.file("word/media/logo.png", jpegBytes);
    archive.file(
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/></Types>',
    );
    archive.file(
      "word/_rels/document.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>',
    );
    const normalized = await normalizeDocx(
      await archive.generateAsync({ type: "uint8array" }),
    );
    const result = await JSZip.loadAsync(normalized);
    expect(result.file("word/media/logo.png")).toBeNull();
    expect(
      await result.file("word/media/logo.jpeg")!.async("uint8array"),
    ).toEqual(jpegBytes);
    expect(
      extractZipEntry(normalized, "word/_rels/document.xml.rels"),
    ).toContain('Target="media/logo.jpeg"');
    expect(extractZipEntry(normalized, "[Content_Types].xml")).toContain(
      'Extension="jpeg" ContentType="image/jpeg"',
    );
  });
});

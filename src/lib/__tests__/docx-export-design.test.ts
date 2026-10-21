import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import {
  COVER_BAND_HEIGHT,
  coverLogoSize,
  coverTitle,
  imageSize,
} from "../docx-design";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WP =
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const LOGO_DATA_URL = `data:image/png;base64,${LOGO_BASE64}`;

const CONTOSO: DetailedExportData = {
  ...CONTOSO_TENANT,
  tenantLabel: "ffc10f05...",
};

const EMPTY: DetailedExportData = {
  settingsCatalog: [],
  deviceConfigurations: [],
  administrativeTemplates: [],
  compliancePolicies: [],
  securityBaselines: [],
  scripts: { windows: [], macOS: [] },
  includeComplianceEvidence: false,
};

async function parts(data: DetailedExportData) {
  const result = await generateDetailedDOCX(data);
  const archive = await JSZip.loadAsync(result.buffer);
  const xml = new Map<string, string>();
  for (const entry of Object.values(archive.files))
    if (!entry.dir && /\.(xml|rels)$/.test(entry.name))
      xml.set(entry.name, await entry.async("string"));
  return { result, xml };
}

function parse(xml: string) {
  const errors: string[] = [];
  const document = new DOMParser({
    onError: (level, message) => {
      if (level !== "warning") errors.push(message);
    },
  }).parseFromString(xml, "text/xml");
  return { document, errors };
}

async function documentOf(data: DetailedExportData) {
  const { xml } = await parts(data);
  return parse(xml.get("word/document.xml") ?? "").document;
}

// En dash, em dash and a double hyphen, built from code points so the test
// source itself stays free of them.
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]|--`);

const elements = (node: Document | Element, name: string) =>
  Array.from(node.getElementsByTagNameNS(W, name));
const textOf = (node: Element) =>
  elements(node, "t")
    .map((text) => text.textContent ?? "")
    .join("");

describe("Word documentation export design", () => {
  it("writes XML parts that parse", async () => {
    for (const data of [
      CONTOSO,
      {
        ...CONTOSO,
        branding: {
          logo: { dataUrl: LOGO_DATA_URL, position: "header" as const },
          header: { enabled: true, text: "Header" },
        },
      },
    ]) {
      const { xml } = await parts(data);
      expect(xml.has("word/document.xml")).toBe(true);
      for (const [name, content] of xml) {
        const { document, errors } = parse(content);
        expect(errors, name).toEqual([]);
        expect(document.documentElement, name).toBeTruthy();
      }
    }
  });

  it("draws exactly one image with a cover logo and none without", async () => {
    const withLogo = await documentOf({
      ...CONTOSO,
      branding: { logo: { dataUrl: LOGO_DATA_URL, position: "cover" } },
    });
    expect(withLogo.getElementsByTagNameNS(WP, "extent").length).toBe(1);
    const withoutLogo = await documentOf(CONTOSO);
    expect(withoutLogo.getElementsByTagNameNS(WP, "extent").length).toBe(0);
  });

  it("links every contents row to a bookmark and its page number", async () => {
    const document = await documentOf(CONTOSO);
    const bookmarks = new Set(
      elements(document, "bookmarkStart").map((node) =>
        node.getAttributeNS(W, "name"),
      ),
    );
    const anchors = elements(document, "hyperlink").map((node) =>
      node.getAttributeNS(W, "anchor"),
    );
    expect(anchors.length).toBeGreaterThan(5);
    expect(new Set(anchors)).toEqual(bookmarks);
    const references = elements(document, "instrText")
      .map((node) => /PAGEREF (\S+)/.exec(node.textContent ?? "")?.[1])
      .filter(Boolean);
    expect(references).toEqual(anchors);
  });

  it("gives the cover band a fixed height on a page without margins", async () => {
    const document = await documentOf(CONTOSO);
    const body = elements(document, "body")[0]!;
    const cover = Array.from(body.childNodes).find(
      (node) => node.nodeName === "w:tbl",
    ) as Element;
    const height = elements(elements(cover, "tr")[0]!, "trHeight")[0]!;
    expect(height.getAttributeNS(W, "hRule")).toBe("exact");
    expect(Number(height.getAttributeNS(W, "val"))).toBe(COVER_BAND_HEIGHT);
    const margin = elements(elements(document, "sectPr")[0]!, "pgMar")[0]!;
    for (const side of ["top", "right", "bottom", "left"])
      expect(margin.getAttributeNS(W, side)).toBe("0");
  });

  it("shows the glance counts of analyzeConfigurations", async () => {
    const analytics = analyzeConfigurations(CONTOSO);
    const document = await documentOf(CONTOSO);
    const title = elements(document, "p").find(
      (paragraph) => textOf(paragraph) === "At a glance",
    )!;
    let node = title.nextSibling;
    while (node && node.nodeName !== "w:tbl") node = node.nextSibling;
    const tiles = Object.fromEntries(
      elements(node as Element, "tc").map((cell) => {
        const [value, label] = elements(cell, "p").map(textOf);
        return [label, Number(value)];
      }),
    );
    expect(tiles).toEqual({
      "Configurations collected": analytics.totalConfigs,
      Assigned: analytics.assignedConfigs,
      "Not assigned": analytics.unassignedConfigs,
      "Assignment unknown": analytics.unknownAssignmentConfigs,
    });
    const text = document.documentElement!.textContent ?? "";
    const share = Math.round(
      (analytics.assignedConfigs / analytics.assignmentApplicableConfigs) * 100,
    );
    expect(text).toContain(`${share}%`);
    expect(text).toContain("Unknown assignments are not counted as assigned.");
    // Conditional Access has no assignment relationship.
    expect(text).toContain("Conditional Access Policies4n/an/an/a");
    expect(text).toContain("No collection warnings recorded.");
    expect(text).not.toContain("Potential Gaps");
    expect(text).not.toContain("Assignment Coverage");
  });

  it("shows n/a when no configuration takes assignments", async () => {
    const text = (await documentOf(EMPTY)).documentElement!.textContent ?? "";
    expect(text).toContain("At a glance");
    expect(text).toContain("n/a");
  });

  it("lists collection warnings without calling the collection complete", async () => {
    const text =
      (
        await documentOf({
          ...CONTOSO,
          fetchErrors: [
            {
              policyId: "scripts",
              policyName: "Scripts",
              policyType: "Platform scripts",
              error: "Forbidden",
              statusCode: 403,
            },
          ],
        })
      ).documentElement!.textContent ?? "";
    expect(text).toContain(
      "Collection warnings recorded: 1 resource unavailable.",
    );
    expect(text).toContain("Unavailable: Platform scripts: Scripts");
    expect(text).not.toContain("No collection warnings recorded");
    expect(text).not.toMatch(/collection (is )?complete/i);
  });

  it("shows only a classification set in branding", async () => {
    const plain =
      (await documentOf(CONTOSO)).documentElement!.textContent ?? "";
    expect(plain).not.toContain("AUDIT READY");
    expect(plain).not.toContain("Classification");
    const classified =
      (
        await documentOf({
          ...CONTOSO,
          branding: { metadata: { classification: "confidential" } },
        })
      ).documentElement!.textContent ?? "";
    expect(classified).not.toContain("AUDIT READY");
    expect(classified).toContain("Confidential");
  });

  it("shows the collection time and document control rows only when known", async () => {
    const coverText = async (data: DetailedExportData) =>
      textOf(elements(await documentOf(data), "tbl")[0]!);
    // Noon UTC is 8 October in every time zone from UTC-11 to UTC+11.
    const collected = await coverText({
      ...CONTOSO,
      collectedAt: "2026-10-08T12:00:00Z",
    });
    expect(collected).toMatch(/Data collected\s+8 Oct 2026/);
    expect(collected).toContain("Tenantffc10f05...");
    const unknown = await coverText({
      ...CONTOSO,
      collectedAt: undefined,
      tenantLabel: undefined,
    });
    expect(unknown).not.toContain("Data collected");
    expect(unknown).not.toContain("Tenant");
    expect(unknown).not.toContain("Organization");
    expect(unknown).not.toContain("Prepared by");
    expect(unknown).toContain("Generated");
    expect(unknown).toContain("Version");
  });

  it("writes no em or en dash and no spaced hyphen of its own", async () => {
    const branding = {
      companyName: "Contoso",
      department: "IT",
      footer: { enabled: true, confidentialityNotice: "Internal" },
    };
    const { xml } = await parts({ ...CONTOSO, branding });
    for (const [name, content] of xml) {
      if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
      const text = parse(content).document.documentElement!.textContent ?? "";
      expect(text, name).not.toMatch(DASHES);
    }
    // Contoso policy names contain " - "; text the export writes never does.
    const generated = (await parts({ ...EMPTY, branding })).xml.get(
      "word/document.xml",
    );
    expect(
      parse(generated ?? "").document.documentElement!.textContent,
    ).not.toMatch(/ - /);
  });

  it("applies the branding primary colour to the cover band and table headers", async () => {
    const document = await documentOf({
      ...CONTOSO,
      branding: {
        colors: {
          primary: "#AA0000",
          secondary: "#00AA00",
          accent: "#0000AA",
          text: "#111111",
        },
      },
    });
    const headerRows = elements(document, "tr").filter(
      (row) => elements(row, "tblHeader").length > 0,
    );
    expect(headerRows.length).toBeGreaterThan(0);
    for (const row of headerRows)
      for (const shading of elements(row, "shd"))
        expect(shading.getAttributeNS(W, "fill")).toBe("AA0000");
    const band = elements(elements(document, "tr")[0]!, "shd")[0]!;
    expect(band.getAttributeNS(W, "fill")).toBe("AA0000");
  });

  it("puts the page number on the right of the content footer", async () => {
    const { xml } = await parts(CONTOSO);
    const footers = [...xml]
      .filter(([name]) => /^word\/footer\d*\.xml$/.test(name))
      .map(([, content]) => content);
    const content = footers.find((footer) => footer.includes("NUMPAGES"));
    expect(content).toBeDefined();
    // Left text, a tab to the right stop, then "Page X of Y".
    expect(content).toContain('w:val="right"');
    const afterTabs = content!.split("<w:tab/>");
    expect(afterTabs).toHaveLength(2);
    expect(afterTabs[1]).toMatch(/Page .*PAGE.* of .*NUMPAGES/);
  });

  it("makes room on the cover for the lines of a long notice", async () => {
    const lowerHeight = async (notice?: string) => {
      const document = await documentOf({
        ...CONTOSO,
        branding: { footer: { enabled: true, confidentialityNotice: notice } },
      });
      const cover = elements(document, "tbl")[0]!;
      const row = Array.from(cover.childNodes).filter(
        (node) => node.nodeName === "w:tr",
      )[1] as Element;
      return Number(elements(row, "trHeight")[0]!.getAttributeNS(W, "val"));
    };
    const without = await lowerHeight();
    const short = await lowerHeight("Internal use only");
    const long = await lowerHeight(
      "Shared with the audit team only. ".repeat(12),
    );
    // The cover stays one page: the band, the lower row and the footer fit.
    expect(short).toBeLessThan(without);
    expect(long).toBeLessThan(short);
    expect(long).toBeGreaterThanOrEqual(3000);
  });

  it("gives a long confidentiality notice its own centred line above the footer", async () => {
    const notice = `Restricted: ${"shared with the audit team only, ".repeat(6)}end of notice`;
    const { xml } = await parts({
      ...CONTOSO,
      branding: { footer: { enabled: true, confidentialityNotice: notice } },
    });
    const footers = [...xml]
      .filter(([name]) => /^word\/footer\d*\.xml$/.test(name))
      .map(([, content]) => parse(content).document);
    expect(footers).toHaveLength(2);
    for (const footer of footers) {
      const [first, second] = elements(footer, "p");
      // The whole notice, centred, in a paragraph of its own.
      expect(textOf(first!)).toBe(notice);
      expect(elements(first!, "jc")[0]?.getAttributeNS(W, "val")).toBe(
        "center",
      );
      expect(textOf(second!)).toContain(
        "Generated with Intune Documentation (intunedocumentation.com)",
      );
      expect(elements(second!, "tab").length).toBeLessThanOrEqual(2);
    }
  });
});

describe("Word documentation export options", () => {
  const textOfDocument = async (data: DetailedExportData) =>
    (await documentOf(data)).documentElement!.textContent ?? "";

  it("goes from the cover straight to the content for a compact scope", async () => {
    const document = await documentOf({
      ...CONTOSO,
      documentScope: {
        title: "Win Ring 3",
        subtitle: "Settings Catalog",
        compact: true,
      },
    });
    const text = document.documentElement!.textContent ?? "";
    expect(text).not.toContain("At a glance");
    expect(text).not.toContain("Table of Contents");
    expect(text).not.toContain("Executive Summary");
    expect(elements(document, "hyperlink")).toHaveLength(0);
    const cover = textOf(elements(document, "tbl")[0]!);
    expect(cover).toContain("Win Ring 3");
    expect(cover).toContain("Settings Catalog");
    // As in the PDF, the lead names the document instead of the tagline.
    expect(cover).toContain("Configuration Documentation");
    expect(cover).not.toContain("Comprehensive export");
  });

  it("says Not assigned and n/a and labels sections by family", async () => {
    const text = await textOfDocument(CONTOSO);
    expect(text).not.toContain("Unassigned");
    expect(text).not.toContain("N/A");
    expect(text).toContain("Not assigned");
    expect(text).toContain("n/a");
    const eyebrows = elements(await documentOf(CONTOSO), "p")
      .map(textOf)
      .filter((paragraph) => /^\d{2} {2}/.test(paragraph));
    expect(eyebrows).toContain("01  Tenant Overview");
    expect(
      eyebrows.some((eyebrow) => eyebrow.endsWith("  Device configuration")),
    ).toBe(true);
    expect(
      eyebrows.some((eyebrow) => eyebrow.endsWith("  Identity and access")),
    ).toBe(true);
    expect(
      eyebrows.filter((eyebrow) => eyebrow.endsWith("  Configuration")),
    ).toEqual([]);
  });

  it("honours includeTableOfContents and includeAnalytics", async () => {
    const withoutContents = await textOfDocument({
      ...CONTOSO,
      branding: {
        documentSettings: {
          includeTableOfContents: false,
          includeAnalytics: true,
          format: "detailed",
        },
      },
    });
    expect(withoutContents).not.toContain("Table of Contents");
    expect(withoutContents).toContain("At a glance");
    expect(withoutContents).toContain("Executive Summary");
    const withoutAnalytics = await textOfDocument({
      ...CONTOSO,
      branding: {
        documentSettings: {
          includeTableOfContents: true,
          includeAnalytics: false,
          format: "detailed",
        },
      },
    });
    expect(withoutAnalytics).toContain("Table of Contents");
    expect(withoutAnalytics).not.toContain("At a glance");
    expect(withoutAnalytics).not.toContain("Executive Summary");
  });

  it("states the configurations that take no assignments", async () => {
    const analytics = analyzeConfigurations(CONTOSO);
    expect(analytics.assignmentNotApplicableConfigs).toBeGreaterThan(0);
    expect(await textOfDocument(CONTOSO)).toContain(
      `${analytics.totalConfigs - analytics.assignmentApplicableConfigs} configurations take no assignments and are not counted in the assignment tiles.`,
    );
  });

  const chrome = async (data: DetailedExportData, kind: "header" | "footer") =>
    [...(await parts(data)).xml]
      .filter(([name]) => new RegExp(`^word/${kind}\\d*\\.xml$`).test(name))
      .map(
        ([, content]) =>
          parse(content).document.documentElement!.textContent ?? "",
      );

  it("writes one running header with the branding text or the tenant", async () => {
    const tenant = await chrome(CONTOSO, "header");
    expect(tenant).toHaveLength(1);
    expect(tenant[0]).toContain("Microsoft Intune");
    expect(tenant[0]).toContain("ffc10f05...");
    const branded = await chrome(
      {
        ...CONTOSO,
        branding: { header: { enabled: true, text: "Contoso internal" } },
      },
      "header",
    );
    expect(branded[0]).toContain("Contoso internal");
    expect(branded[0]).not.toContain("ffc10f05...");
  });

  it("shows the confidentiality notice only with the footer enabled", async () => {
    const notice = "Confidential, internal use only";
    const disabled = await chrome(
      {
        ...CONTOSO,
        branding: { footer: { enabled: false, confidentialityNotice: notice } },
      },
      "footer",
    );
    expect(disabled.join("\n")).not.toContain(notice);
    const enabled = await chrome(
      {
        ...CONTOSO,
        branding: {
          footer: {
            enabled: true,
            text: "Contoso IT",
            confidentialityNotice: notice,
          },
        },
      },
      "footer",
    );
    // The cover footer and the running footer.
    expect(enabled).toHaveLength(2);
    for (const footer of enabled) expect(footer).toContain(notice);
    expect(enabled.join("\n")).toContain("Contoso IT");
  });
});

describe("Word design helpers", () => {
  it("reads PNG and JPEG sizes", () => {
    expect(imageSize(LOGO_BASE64)).toEqual({ width: 1, height: 1 });
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11,
      0x08, 0x00, 0x20, 0x00, 0x40, 0x03, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(imageSize(btoa(String.fromCharCode(...jpeg)))).toEqual({
      width: 64,
      height: 32,
    });
    expect(imageSize("not an image")).toBeUndefined();
  });

  it("fits the cover logo into 44 x 14 mm keeping its ratio", () => {
    expect(coverLogoSize({}, { width: 400, height: 100 })).toEqual({
      widthMm: 36,
      heightMm: 9,
    });
    const wide = coverLogoSize({ width: 60, height: 10 });
    expect(wide.widthMm).toBe(44);
    expect(wide.heightMm).toBeCloseTo(44 / 6, 10);
    expect(coverLogoSize({ width: 20, height: 40 })).toEqual({
      widthMm: 7,
      heightMm: 14,
    });
  });

  it("shrinks and clamps long cover titles", () => {
    expect(coverTitle("Microsoft Intune").sizeHp).toBe(72);
    const long = coverTitle(`${"Very long configuration name ".repeat(8)}end`);
    expect(long.sizeHp).toBe(48);
    expect(long.text.endsWith("...")).toBe(true);
    expect(long.text.length).toBeLessThanOrEqual(96);
  });
});

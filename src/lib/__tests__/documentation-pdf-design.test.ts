import { describe, expect, it } from "vitest";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import type { BrandingOptions } from "~/types/branding";
import { readPdfOutline, readPdfPageTexts } from "./helpers/pdf-outline";
import { extractPdfStreamText } from "./helpers/pdf-text";

// A valid 2x2 PNG (the 1x1 fixture of the Word tests fails the PNG checksum
// that jsPDF verifies).
const LOGO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgSDvDsCyIgcE47f///wAekQXBjgK93AAAAABJRU5ErkJggg==";
const RENDER_DATE = new Date("2026-10-21T09:00:00Z");

const EMPTY: DetailedExportData = {
  settingsCatalog: [],
  deviceConfigurations: [],
  administrativeTemplates: [],
  compliancePolicies: [],
  securityBaselines: [],
  scripts: { windows: [], macOS: [] },
  includeComplianceEvidence: false,
};

function contoso(extra: Partial<DetailedExportData> = {}): DetailedExportData {
  return {
    ...structuredClone(CONTOSO_TENANT),
    tenantLabel: "ffc10f05...",
    ...extra,
  };
}

async function render(data: DetailedExportData) {
  const result = await generateDetailedPDF(data, {
    audience: "desktop",
    renderDate: RENDER_DATE,
  });
  return {
    buffer: result.buffer,
    pages: readPdfPageTexts(result.buffer),
  };
}

/** PDF baselines (points from the page bottom) of every text run. */
function baselines(text: string): number[] {
  return [...text.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Td/g)].map(
    (match) => Number(match[2]),
  );
}

/** Text runs with their baselines in points from the page bottom. */
function runs(text: string): Array<{ y: number; text: string }> {
  return [...text.matchAll(/(-?[\d.]+) (-?[\d.]+) Td\n\((.*?)\) Tj/g)].map(
    (match) => ({
      y: Number(match[2]),
      text: (match[3] ?? "").replace(/\\([()\\])/g, "$1"),
    }),
  );
}

// Body text stays above the footer rule (14.5 mm from the bottom); only the
// footer line and the cover foot sit below it.
const FOOTER_TEXT_MAX = 31;
const FOOTER_RULE = 14.5 * (72 / 25.4);

function branding(position: "cover" | "header" | "footer"): BrandingOptions {
  return {
    companyName: "Fabrikam Ltd",
    logo: { dataUrl: LOGO_DATA_URL, position, width: 14, height: 14 },
    colors: {
      primary: "#5b2a86",
      secondary: "#0f766e",
      accent: "#f59e0b",
      text: "#222222",
    },
    fonts: { family: "times", headerSize: 14, bodySize: 11, lineHeight: 1.5 },
    header: { enabled: true, text: "Fabrikam internal review" },
    footer: {
      enabled: true,
      text: "Fabrikam Workplace Engineering",
      confidentialityNotice: "Confidential: internal use only",
    },
    watermark: { enabled: true, text: "DRAFT", opacity: 0.1 },
    metadata: { classification: "confidential" },
  };
}

describe("documentation PDF cover and glance", () => {
  it("shows the analyzeConfigurations counts at a glance", async () => {
    const data = contoso();
    const analytics = analyzeConfigurations(data, RENDER_DATE);
    const [cover = ""] = (await render(data)).pages;
    const share = Math.round(
      (analytics.assignedConfigs / analytics.assignmentApplicableConfigs) * 100,
    );

    expect(cover).toContain("(AT A GLANCE) Tj");
    expect(cover).toContain(`(${share}%) Tj`);
    expect(cover).toContain(
      `(${analytics.assignedConfigs} of ${analytics.assignmentApplicableConfigs} assignable) Tj`,
    );
    for (const count of [
      analytics.totalConfigs,
      analytics.assignedConfigs,
      analytics.unassignedConfigs,
      analytics.unknownAssignmentConfigs,
    ])
      expect(cover).toContain(`(${count}) Tj`);
    expect(cover).toContain(
      "(Unknown assignments are not counted as assigned.) Tj",
    );
    expect(cover).toContain(
      "(Collection: no collection warnings recorded.) Tj",
    );
  });

  it("shows n/a when no configuration takes assignments", async () => {
    const data: DetailedExportData = {
      ...EMPTY,
      conditionalAccessPolicies: structuredClone(
        CONTOSO_TENANT.conditionalAccessPolicies,
      ),
    };
    const analytics = analyzeConfigurations(data, RENDER_DATE);
    expect(analytics.totalConfigs).toBeGreaterThan(0);
    expect(analytics.assignmentApplicableConfigs).toBe(0);

    const { pages } = await render(data);
    expect(pages[0]).toContain("(n/a) Tj");
    expect(pages[0]).toContain("(0 of 0 assignable) Tj");
    expect(pages.join("\n")).toContain("(Assignment not applicable) Tj");
  });

  it("names partial and unavailable collection in the glance", async () => {
    const { pages } = await render({
      ...EMPTY,
      collectionSkippedFamilies: ["connectors"],
      fetchErrors: [
        {
          policyId: "a",
          policyName: "Feature update profiles",
          policyType: "Windows update profiles",
          error: "Forbidden",
          statusCode: 403,
        },
        {
          policyId: "b",
          policyName: "Settings catalog",
          policyType: "Settings Catalog",
          error: "Throttled",
          partial: true,
        },
      ],
    });
    expect(pages[0]).toContain(
      "(Collection: 1 resource partially collected, 1 resource unavailable, 1 policy family left out of the collection.) Tj",
    );
    expect(pages.join("\n")).toContain("(Collection Warnings) Tj");
  });

  it("puts the tenant, collection date and document control on the cover", async () => {
    const [cover = ""] = (await render(contoso())).pages;
    expect(cover).toContain("(Intune Documentation) Tj");
    expect(cover).toContain("(Intune Configuration Export) Tj");
    expect(cover).toContain("(Microsoft Intune) Tj");
    expect(cover).toContain("(Configuration Documentation) Tj");
    expect(cover).toContain("(TENANT) Tj");
    expect(cover).toContain("(ffc10f05...) Tj");
    expect(cover).toContain("(Data collected) Tj");
    expect(cover).toContain("(8 Oct 2026 \u00b7 09:00) Tj");
    expect(cover).toContain("(21 Oct 2026 \u00b7 09:00) Tj");
    expect(cover).toContain("(DOCUMENT CONTROL) Tj");
    expect(cover).toContain("(Version) Tj");
    expect(cover).toContain("(v2026.10.21) Tj");
    // Rows without a value are left out.
    expect(cover).not.toContain("(Prepared by) Tj");
    expect(cover).not.toContain("(Classification) Tj");
    expect(cover).not.toContain("(Organization) Tj");
  });

  it("leaves out the tenant and collection rows when they are unknown", async () => {
    const data = contoso();
    delete data.tenantLabel;
    delete data.collectedAt;
    const { pages } = await render(data);
    expect(pages[0]).not.toContain("(TENANT) Tj");
    expect(pages[0]).not.toContain("(Tenant) Tj");
    expect(pages[0]).not.toContain("Data collected");
    // Never today's date in place of the collection date.
    expect(pages[0]).toContain("(Generated) Tj");
  });

  it("has no grading, severity labels or default classification", async () => {
    const text = extractPdfStreamText((await render(contoso())).buffer);
    for (const removed of [
      "Potential Gaps",
      "CRITICAL",
      "WARNING",
      "AUDIT READY",
      "Assignment Coverage",
    ])
      expect(text).not.toContain(removed);
  });
});

describe("documentation PDF layout", () => {
  it("keeps every text baseline above the footer rule", async () => {
    for (const data of [
      contoso(),
      contoso({ branding: branding("footer") }),
      contoso({
        documentScope: { title: "Scoped", subtitle: "Item", compact: true },
      }),
    ]) {
      const { pages } = await render(data);
      pages.forEach((text) => {
        for (const baseline of baselines(text))
          expect(baseline <= FOOTER_TEXT_MAX || baseline > FOOTER_RULE).toBe(
            true,
          );
      });
    }
  });

  it("prints a long notice and footer text whole, with the content above them", async () => {
    const notice =
      "Notice: this record describes the managed estate of the organisation and is shared with the internal audit team and the appointed external assessors only; copies outside that circle need written approval from the security office";
    const footerText =
      "Fabrikam Workplace Engineering, Endpoint Platform team, configuration record kept under the change process of the service desk, revision history archived for seven years";
    const { pages } = await render(
      contoso({
        branding: {
          ...branding("cover"),
          metadata: {},
          footer: {
            enabled: true,
            text: footerText,
            confidentialityNotice: notice,
          },
        },
      }),
    );
    const capPoints = 6.5 * 0.7;
    pages.forEach((page, index) => {
      const pageRuns = runs(page);
      const noticeRuns = pageRuns.filter(
        (run) => run.text.length >= 8 && notice.includes(run.text),
      );
      // Wrapped, never cut: the lines join to the whole notice.
      expect(noticeRuns.map((run) => run.text).join(" ")).toBe(notice);
      if (index === 0) return;
      const footerRuns = pageRuns.filter(
        (run) => run.y < FOOTER_RULE && footerText.includes(run.text),
      );
      expect(footerRuns.map((run) => run.text).join(" ")).toBe(footerText);
      const noticeTop = Math.max(...noticeRuns.map((run) => run.y)) + capPoints;
      for (const run of pageRuns)
        if (
          !noticeRuns.includes(run) &&
          run.y > FOOTER_RULE &&
          run.y < 297 * (72 / 25.4) - 14.6 * (72 / 25.4)
        )
          expect(run.y, run.text).toBeGreaterThan(noticeTop);
    });
  });

  it("states the configurations not modified in 90 days or more", async () => {
    const data = contoso();
    const { staleConfigs } = analyzeConfigurations(data, RENDER_DATE);
    expect(staleConfigs).toBeGreaterThan(1);
    const text = (await render(data)).pages.join("\n");
    expect(text).toContain(
      `(Not modified in 90 days or more: ${staleConfigs} configurations.) Tj`,
    );
  });

  it("numbers every page after the cover as Page N of M", async () => {
    const { pages } = await render(contoso());
    expect(pages[0]).not.toContain("(Page 1");
    pages.slice(1).forEach((text, index) => {
      expect(text).toContain(`(Page ${index + 2} of ${pages.length}) Tj`);
    });
  });

  it("writes no em or en dash", async () => {
    for (const data of [
      contoso(),
      contoso({ branding: branding("cover") }),
      contoso({
        documentScope: { title: "Scoped", subtitle: "Item", compact: true },
      }),
    ]) {
      const text = extractPdfStreamText((await render(data)).buffer);
      // WinAnsi encodes the en and em dash as 0x96 and 0x97.
      expect(text).not.toMatch(/[\u2013\u2014\x96\x97]/);
      expect(text).not.toMatch(/\\22[67]/);
    }
  });

  it("continues the contents on inserted pages with correct numbers and links", async () => {
    const data: DetailedExportData = {
      ...EMPTY,
      branding: { watermark: { enabled: true, text: "DRAFT" } },
      sections: Array.from({ length: 40 }, (_, index) => ({
        key: `additional-test-${index}`,
        familyKey: "test",
        label: `Additional section ${index + 1}`,
        selectionPrefix: `additional-test-${index}`,
        items: [{ id: `item-${index}`, displayName: `Extra ${index + 1}` }],
      })),
    };
    const { buffer, pages } = await render(data);
    const { outline, linkPages } = readPdfOutline(buffer);
    const tocPages = pages.flatMap((text, index) =>
      text.includes("(Table of Contents) Tj") ? [index] : [],
    );

    expect(tocPages).toEqual([1, 2]);
    expect(linkPages).toEqual(outline.map((section) => section.page));
    expect(outline[0]?.page).toBe(4);
    for (const section of outline) {
      const page = section.page ?? 0;
      const contents = tocPages.map((index) => pages[index]).join("\n");
      expect(contents).toContain(`(${page}) Tj`);
      expect(pages[page - 1]).toContain(
        `(${section.title === "Tenant Overview" ? "Executive Summary" : section.title}) Tj`,
      );
    }
    // The watermark of the inserted contents page is drawn before its rows.
    const inserted = pages[2] ?? "";
    expect(inserted.indexOf("(DRAFT) Tj")).toBeGreaterThanOrEqual(0);
    expect(inserted.indexOf("(DRAFT) Tj")).toBeLessThan(
      inserted.indexOf("(Table of Contents) Tj"),
    );
  });
});

describe("documentation PDF branding", () => {
  it("applies the branding colours, font, texts and cover logo", async () => {
    const { buffer, pages } = await render(
      contoso({ branding: branding("cover") }),
    );
    const [cover = "", , summary = ""] = pages;

    // Cover band in the primary colour, the logo in the masthead.
    expect(cover).toMatch(/^[\s\S]{0,40}0\.36 0\.16 0\.53 rg/);
    expect(cover).toMatch(/\/I\d+ Do/);
    expect(cover).toContain("(Classification) Tj");
    expect(cover).toContain("(Confidential) Tj");
    // Section titles in the primary colour and the Times bold font.
    expect(summary).toMatch(
      /\/F10 20 Tf[\s\S]{0,40}0\.357 0\.165 0\.525 rg[\s\S]{0,80}\(Executive Summary\) Tj/,
    );
    expect(summary).not.toMatch(/\/F[12] /);
    // Header text, footer text and confidentiality notice on content pages.
    expect(summary).toContain("(Fabrikam internal review) Tj");
    expect(summary).toContain("(Fabrikam Workplace Engineering) Tj");
    expect(summary).toContain("(Confidential: internal use only) Tj");
    // The watermark is drawn before the content, so it stays underneath.
    expect(summary.indexOf("(DRAFT) Tj")).toBeGreaterThanOrEqual(0);
    expect(summary.indexOf("(DRAFT) Tj")).toBeLessThan(
      summary.indexOf("(Executive Summary) Tj"),
    );
    expect(Buffer.from(buffer).toString("latin1")).toContain("/Subtype /Image");
  });

  it("keeps the cover logo ratio when only a height is set", async () => {
    const [cover = ""] = (
      await render(
        contoso({
          branding: {
            logo: { dataUrl: LOGO_DATA_URL, position: "cover", height: 10 },
          },
        }),
      )
    ).pages;
    const match = /([\d.]+) 0 0 ([\d.]+) [\d.]+ [\d.]+ cm\n\/I\d+ Do/.exec(
      cover,
    );
    // The 2x2 image is square: 10 mm high and 10 mm wide.
    expect(Number(match?.[2]) / (72 / 25.4)).toBeCloseTo(10, 1);
    expect(Number(match?.[1])).toBeCloseTo(Number(match?.[2]), 1);
  });

  it("puts a header or footer logo on every page after the cover", async () => {
    for (const position of ["header", "footer"] as const) {
      const { pages } = await render(contoso({ branding: branding(position) }));
      expect(pages[0]).not.toMatch(/\/I\d+ Do/);
      for (const text of pages.slice(1)) expect(text).toMatch(/\/I\d+ Do/);
    }
  });
});

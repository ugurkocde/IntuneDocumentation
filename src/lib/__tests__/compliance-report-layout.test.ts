import { describe, expect, it, vi } from "vitest";
import * as manifest from "../compliance/manifest";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import { generateComplianceReportPDF } from "../compliance/report-pdf";
import type { ControlAssessment } from "../compliance/types";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { readPdfPageTexts } from "./helpers/pdf-outline";

vi.mock("../compliance/manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof manifest>();
  return {
    ...actual,
    createEvidenceManifest: vi.fn(actual.createEvidenceManifest),
  };
});

type Assessment = Awaited<ReturnType<typeof manifest.createEvidenceManifest>>;

/** Runs the next report on a manifest changed by `edit`. */
async function withManifest(edit: (result: Assessment) => void) {
  const actual = await vi.importActual<typeof manifest>(
    "../compliance/manifest",
  );
  vi.mocked(manifest.createEvidenceManifest).mockImplementationOnce(
    async (...args) => {
      const result = await actual.createEvidenceManifest(...args);
      edit(result);
      return result;
    },
  );
}

/** PDF baselines (points from the page bottom) of every text run. */
function baselines(text: string): number[] {
  return [...text.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Td/g)].map(
    (match) => Number(match[2]),
  );
}

// Body text must stay above the footer rule (14.5 mm from the bottom).
const FOOTER_TEXT_MAX = 31;
const FOOTER_RULE = (297 - 282.5) * (72 / 25.4);

describe("report layout on extreme input", () => {
  it("keeps every top finding on a one page summary with twenty families", async () => {
    await withManifest((result) => {
      const framework = result.assessment.frameworks.find(
        (item) => item.framework.id === "nist-800-53-r5",
      );
      const families = "ABDEFGHJKLMNOQTUVWXY".split("");
      const synthetic: ControlAssessment[] = families.map((letter, index) => ({
        control: {
          id: `Z${letter}-${index + 1}`,
          title: `Synthetic family ${letter}`,
          summary: "Synthetic control used to add families.",
        },
        capabilityIds: [],
        enforcedCapabilityIds: [],
        status: index % 3 === 0 ? "noEvidence" : "partialEvidence",
        unassessedAspects: [],
        excludedCapabilityIds: [],
      }));
      framework?.controls.push(...synthetic);
    });
    const report = await generateComplianceReportPDF(
      structuredClone(CONTOSO_TENANT),
      { frameworkId: "nist-800-53-r5" },
    );
    if (process.env.LAYOUT_DUMP)
      (await import("node:fs")).writeFileSync(process.env.LAYOUT_DUMP, report);
    const pages = readPdfPageTexts(report);
    const summary = pages[2] ?? "";
    expect(summary).toContain("(Summary) Tj");
    expect(summary).toContain("(Key findings) Tj");
    // Up to five findings, as before the redesign, all on the summary.
    const findingRuns =
      (summary.match(/\((Assigned deviation|Not assigned)\) Tj/g) ?? [])
        .length;
    expect(findingRuns).toBe(5);
    expect(summary).toMatch(/more famil(y is|ies are) listed/);
    expect(summary).toContain("Scope note".toUpperCase());
    // The results overview opens the next page: the summary is one page.
    expect(pages[3]).toContain("(Results Overview) Tj");
  });

  it("breaks very long reasons and unassessed aspects across pages", async () => {
    await withManifest((result) => {
      const framework = result.assessment.frameworks.find(
        (item) => item.framework.id === "iso-27001-2022",
      );
      const control = framework?.controls[0];
      if (!control) throw new Error("no control");
      control.unassessedAspects = Array.from(
        { length: 120 },
        (_, index) =>
          `Synthetic organizational aspect ${index + 1} that needs a separate review by the information owner.`,
      );
      const capability = result.assessment.capabilities.find(
        (item) => item.capability.id === control.capabilityIds[0],
      );
      const check = capability?.checks[0];
      if (check) check.reason = "Very long reason text. ".repeat(900);
    });
    const report = await generateComplianceReportPDF(
      structuredClone(CONTOSO_TENANT),
      { frameworkId: "iso-27001-2022" },
    );
    const text = extractPdfStreamText(report);
    expect(text).toContain("Synthetic organizational aspect 120");
    const lowest = Math.min(
      ...baselines(text).filter((y) => y > FOOTER_TEXT_MAX),
    );
    // Nothing between the footer and the content area, nothing below zero.
    expect(baselines(text).every((y) => y >= 0)).toBe(true);
    expect(lowest).toBeGreaterThan(FOOTER_RULE);
  });
});

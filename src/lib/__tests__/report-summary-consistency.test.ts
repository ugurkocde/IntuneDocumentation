import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import { buildEvidenceRegister } from "../compliance/export";
import { buildManagementSummary } from "../compliance/management/management-summary";
import { outsideIntuneScope } from "../compliance/outside-scope";
import { generateComplianceReportPDF } from "../compliance/report-pdf";
import type { ComplianceFrameworkId } from "../compliance/report-pdf";
import { readPdfPageTexts } from "./helpers/pdf-outline";
import { extractPdfStreamText } from "./helpers/pdf-text";

// The evidence report and the security summary are built from one
// assessment and must agree on every figure they share.

/** Every shown text run joined with spaces, so wrapped sentences match. */
function plainText(bytes: Uint8Array): string {
  return [...extractPdfStreamText(bytes).matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((match) => (match[1] ?? "").replace(/\\(.)/g, "$1"))
    .join(" ")
    .replace(/\s+/g, " ");
}

/** "N of M" meters of the control detail headers, sorted. */
function detailMeters(pages: readonly string[]): string[] {
  return pages
    .flatMap((page) => [
      ...page.matchAll(
        /\((\d+ of \d+)\) Tj\s*ET\s*BT[\s\S]{0,120}?\(capabilities\) Tj/g,
      ),
    ])
    .map((match) => match[1] ?? "")
    .sort();
}

describe("evidence report and security summary", () => {
  it("give the same safeguard counts per control when an alternative is in use", async () => {
    const assessment = assessCompliance(CONTOSO_TENANT);
    const defaults = assessment.capabilities.find(
      (result) => result.capability.id === "tenant-security-defaults-enabled",
    );
    expect(defaults?.alternative?.state).toBe("inUse");
    const summary = buildManagementSummary(assessment, "iso-27001-2022");
    const pages = readPdfPageTexts(
      await generateComplianceReportPDF(CONTOSO_TENANT, {
        frameworkId: "iso-27001-2022",
      }),
    );
    expect(detailMeters(pages)).toEqual(
      Object.values(summary.safeguards)
        .map((count) => `${count.inPlace} of ${count.total}`)
        .sort(),
    );
    // ISO 8.5 maps security defaults; the summary leaves it out.
    const framework = assessment.frameworks.find(
      (item) => item.framework.id === "iso-27001-2022",
    )!;
    const control = framework.controls.find(
      (item) => item.control.id === "8.5",
    )!;
    expect(control.capabilityIds).toContain("tenant-security-defaults-enabled");
    expect(summary.safeguards["8.5"]?.total).toBe(
      control.capabilityIds.length - 1,
    );
  });

  it("label an alternative in use neutrally in the report and the register", async () => {
    const text = extractPdfStreamText(
      await generateComplianceReportPDF(CONTOSO_TENANT, {
        frameworkId: "iso-27001-2022",
      }),
    );
    const card = text.slice(
      text.indexOf("(Security defaults enabled \\(Entra ID\\)) Tj"),
    );
    const pill = /\(([^)]*)\) Tj/.exec(card.slice(card.indexOf("Tj") + 2));
    expect(pill?.[1]).toBe("Not needed, an alternative is set up");

    const register = buildEvidenceRegister(assessCompliance(CONTOSO_TENANT), {
      frameworkId: "iso-27001-2022",
    });
    const rows = register.checks.filter(
      (row) => row.capabilityId === "tenant-security-defaults-enabled",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows)
      expect(row.capabilityStatus).toBe("Not needed, an alternative is set up");
  });
});

describe("measures outside Intune scope in the evidence report", () => {
  it.each(["dora-2022-2554", "nis2-2022-2555"] as const)(
    "lists the same measures as the security summary for %s",
    async (frameworkId) => {
      const measures = outsideIntuneScope(frameworkId);
      expect(measures.length).toBeGreaterThan(0);
      const text = extractPdfStreamText(
        await generateComplianceReportPDF(CONTOSO_TENANT, { frameworkId }),
      );
      expect(text).toContain("(Measures outside Intune scope) Tj");
      for (const measure of measures) {
        expect(text).toContain(`(${measure.id}) Tj`);
        expect(text).toContain(measure.title.en);
      }
      expect(text).toContain(
        `${measures.length} measures are outside Intune scope; each needs its own assessment.`,
      );
      expect(text).not.toContain("outside scope; ");
      expect(text).toContain("outside the selected scope;");
    },
  );
});

describe("data basis wording for device status", () => {
  it("says status summaries were collected as context when they were", async () => {
    const withStatus = plainText(
      await generateComplianceReportPDF(CONTOSO_TENANT, {
        frameworkId: "iso-27001-2022",
      }),
    );
    expect(withStatus).toContain(
      "Per device state is not assessed; Intune status summaries per policy were collected as context only.",
    );
    expect(withStatus).not.toContain("Device state not collected");

    const without = plainText(
      await generateComplianceReportPDF(
        { ...CONTOSO_TENANT, policyDeviceStatus: undefined },
        { frameworkId: "iso-27001-2022" },
      ),
    );
    expect(without).toContain(
      "Device state not collected; effective access unverified.",
    );
  });
});

interface HeaderLabel {
  text: string;
  x: number;
  y: number;
  charSpace: number;
}

/** Bold 5.6 pt labels of the device status annex header, in points. */
function annexHeaderLabels(page: string): HeaderLabel[] {
  return [
    ...page.matchAll(
      /\/F2 5\.6 Tf[^B]*?(-?[\d.]+) Tc\s+([\d.]+) ([\d.]+) Td\s+\(([^)]*)\) Tj/g,
    ),
  ].map((match) => ({
    charSpace: Number(match[1]),
    x: Number(match[2]),
    y: Number(match[3]),
    text: match[4] ?? "",
  }));
}

describe("device status annex header", () => {
  it.each([
    ["iso-27001-2022", "SUCCEEDED"],
    ["bsi-it-grundschutz", "ERFOLGREICH"],
  ] as const)(
    "keeps every %s header label inside its column",
    async (frameworkId: ComplianceFrameworkId, marker: string) => {
      const pages = readPdfPageTexts(
        await generateComplianceReportPDF(CONTOSO_TENANT, { frameworkId }),
      );
      const page = pages.find((text) => text.includes(`(${marker}) Tj`));
      expect(page).toBeDefined();
      // The annex header rows sit at and just below the marker's baseline;
      // the evidence register header on the same page is further up.
      const all = annexHeaderLabels(page!);
      const top = all.find((label) => label.text === marker)!.y;
      const labels = all.filter(
        (label) => label.y <= top + 0.1 && label.y >= top - 10,
      );
      expect(labels.length).toBeGreaterThanOrEqual(7);
      const columns = [...new Set(labels.map((label) => label.x))].sort(
        (left, right) => left - right,
      );
      const measure = new jsPDF({ unit: "pt" });
      measure.setFont("helvetica", "bold");
      measure.setFontSize(5.6);
      for (const label of labels) {
        const next = columns.find((x) => x > label.x);
        if (next === undefined) continue;
        const width =
          measure.getTextWidth(label.text) +
          label.charSpace * Math.max(label.text.length - 1, 0);
        expect(
          label.x + width,
          `${label.text} runs into the next column`,
        ).toBeLessThan(next);
      }
    },
  );
});

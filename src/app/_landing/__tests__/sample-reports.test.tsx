// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_REPORTS, sampleReportUrl } from "~/lib/compliance/samples";
import CompliancePage from "../../compliance/page";
import { Compliance } from "../compliance";
import { complianceFrameworks } from "../content";

vi.mock("~/components/navigation-header", () => ({
  NavigationHeader: () => null,
}));
vi.mock("~/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("~/components/back-to-top-button", () => ({
  BackToTopButton: () => null,
}));

function sampleLinks(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
    (link) => link.getAttribute("href")?.startsWith("/samples/"),
  );
}

function expectEverySampleLinked(html: string) {
  const links = sampleLinks(html);
  for (const sample of SAMPLE_REPORTS) {
    const link = links.find(
      (candidate) =>
        candidate.getAttribute("href") === sampleReportUrl(sample) &&
        candidate.getAttribute("aria-label")?.includes(sample.label),
    );
    expect(link, sample.label).toBeDefined();
  }
  for (const link of links) {
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.className).toContain("plausible-event-name=Sample+Report+Open");
  }
}

describe("sample report links", () => {
  it("lists every sample framework, including NIS2", () => {
    expect(complianceFrameworks).toEqual(SAMPLE_REPORTS.map((s) => s.label));
    expect(complianceFrameworks).toContain("NIS2 Directive");
  });

  it("links every sample from the landing compliance section", () => {
    const html = renderToStaticMarkup(<Compliance />);
    expectEverySampleLinked(html);
    expect(html).toContain("View a sample ISO 27001 evidence report");
  });

  it("marks NIS2 as desktop only, since the web dashboard does not offer it", () => {
    for (const html of [
      renderToStaticMarkup(<Compliance />),
      renderToStaticMarkup(<CompliancePage />),
    ]) {
      const nis2 = sampleLinks(html).find(
        (link) =>
          link.getAttribute("href") === "/samples/nis2.pdf" &&
          link.hasAttribute("aria-label"),
      );
      expect(nis2?.getAttribute("aria-label")).toContain("desktop app only");
      expect(html).toContain(
        "NIS2 Directive is available in the desktop app only.",
      );
    }

    const nis2SampleCard = sampleLinks(
      renderToStaticMarkup(<CompliancePage />),
    ).find(
      (link) =>
        link.getAttribute("href") === "/samples/nis2.pdf" &&
        link.textContent?.includes("View sample (PDF)"),
    );
    expect(nis2SampleCard?.textContent).toContain("desktop app only");
  });

  it("links every sample from the /compliance page", () => {
    const html = renderToStaticMarkup(<CompliancePage />);
    expect(html).toContain('id="samples"');
    expectEverySampleLinked(html);
  });
});

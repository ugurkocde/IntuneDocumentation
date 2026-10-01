import { describe, expect, it } from "vitest";
import { COMPLIANCE_DISCLAIMER } from "../compliance/engine";
import {
  generateManagementReportPDF,
  isAllowedPortalUrl,
  managementReportFileName,
  type ManagementReportControl,
  type ManagementReportInput,
} from "../compliance/management/management-report-pdf";
import { MANAGEMENT_REPORT_STRINGS } from "../compliance/management/management-report-strings";
import type {
  ManagementLocale,
  ManagementSummary,
  NextAction,
} from "../compliance/management/types";
import { extractPdfStreamText } from "./helpers/pdf-text";

const BANNED = /compliant|compliance score|konform|erfüllt/i;

/** Text of every Tj operator, joined with spaces so wrapped lines read as one. */
function renderedText(bytes: Uint8Array): string {
  const stream = extractPdfStreamText(bytes);
  return [...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
    .map((match) => (match[1] ?? "").replace(/\\(.)/g, "$1"))
    .join(" ")
    .replace(/\s+/g, " ");
}

interface PageLinks {
  internal: number[];
  external: string[];
}

/** Link annotations per page (one-based), read from the uncompressed page objects. */
function readLinks(bytes: Uint8Array): PageLinks[] {
  const pdf = Buffer.from(bytes).toString("latin1");
  const pages = [
    ...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Type \/Page\b(?!s)([\s\S]*?)endobj/g),
  ];
  const pageIds = pages.map((match) => Number(match[1]));
  return pages.map((match) => {
    const body = match[2] ?? "";
    return {
      internal: [
        ...body.matchAll(/\/Subtype \/Link[^\n]*\/Dest \[(\d+) 0 R/g),
      ].map((link) => pageIds.indexOf(Number(link[1])) + 1),
      external: [
        ...body.matchAll(/\/Subtype \/Link[^\n]*\/URI \(((?:\\.|[^\\)])*)\)/g),
      ].map((link) => link[1] ?? ""),
    };
  });
}

function action(
  rank: number,
  tier: NextAction["tier"],
  name: string,
  url: string,
  area: NextAction["area"] = "diskEncryption",
): NextAction {
  return {
    capabilityId: `capability-${rank}`,
    name,
    tier,
    controlIds: ["21.2.e", "21.2.h"],
    area,
    url,
    rank,
  };
}

function createSummary(): ManagementSummary {
  return {
    frameworkId: "nis2",
    frameworkName: "NIS2 Directive Article 21(2)",
    frameworkVersion: "2022/2555",
    generatedAt: "2026-10-01T09:00:00.000Z",
    rulesetVersion: "2026.09.8",
    scopeKey: "windows",
    metrics: {
      assessable: 25,
      withEvidence: 18,
      coveragePct: 72,
      withoutEvidence: 5,
      conflicting: 2,
      unassignedConfigs: 3,
      outsideIntuneScope: 4,
      dataGaps: 1,
    },
    nextActions: [
      action(
        0,
        "conflicting",
        "Firewall",
        "https://intune.microsoft.com/#view/firewall",
      ),
      action(
        1,
        "assignedDeviation",
        "Microsoft Defender Antivirus",
        "https://intune.microsoft.com/#view/av",
        "antivirus",
      ),
      action(
        2,
        "partial",
        "Windows Hello for Business",
        "http://intune.microsoft.com/#insecure",
        "accountProtection",
      ),
      action(
        3,
        "unassigned",
        "BitLocker",
        "https://intune.microsoft.com.evil.example/#view",
      ),
      action(
        4,
        "missing",
        "multifactor authentication",
        "https://entra.microsoft.com/#view/ca",
        "conditionalAccess",
      ),
    ],
    controls: {},
    outsideScope: [
      {
        id: "21.2.a",
        title: {
          en: "Risk analysis policies",
          de: "Konzepte zur Risikoanalyse",
        },
      },
      {
        id: "21.2.c",
        title: {
          en: "Business continuity",
          de: "Aufrechterhaltung des Betriebs",
        },
      },
      {
        id: "21.2.d",
        title: {
          en: "Supply chain security",
          de: "Sicherheit der Lieferkette",
        },
      },
      {
        id: "21.2.f",
        title: {
          en: "Effectiveness assessment",
          de: "Bewertung der Wirksamkeit",
        },
      },
    ],
  };
}

function createControls(count = 6): ManagementReportControl[] {
  const statuses: ManagementReportControl["status"][] = [
    "evidenceFound",
    "partialEvidence",
    "noEvidence",
    "conflictingEvidence",
    "notApplicable",
    "notAssessed",
  ];
  return Array.from({ length: count }, (_, index) => ({
    id: `21.2.${index + 1}`,
    title: `Synthetic control title ${index + 1}`,
    status: statuses[index % statuses.length] ?? "noEvidence",
    aliases: [
      { scheme: "DK", id: `NIS2-loven § 6 stk. 1 nr. ${index + 1}` },
      { scheme: "DE", id: `§ 30 Abs. 2 Nr. ${index + 1} BSIG` },
    ],
    cis: index === 0 ? ["99.1", "99.2"] : undefined,
  }));
}

function createInput(
  locale: ManagementLocale,
  overrides: Partial<ManagementReportInput> = {},
): ManagementReportInput {
  return {
    summary: createSummary(),
    controls: createControls(),
    unassigned: [
      { capabilityId: "bitlocker", name: "BitLocker", controlIds: ["21.2.h"] },
    ],
    delta: {
      coverageDeltaPoints: 8,
      newlyEvidenced: ["21.2.e", "21.2.h", "21.2.i"],
      regressions: ["21.2.j"],
      added: [],
      removed: [],
      rulesetChanged: true,
      baselineDate: "2026-09-01T09:00:00.000Z",
    },
    crosswalkLoaded: true,
    disclaimer: COMPLIANCE_DISCLAIMER,
    tenantLabel: "Contoso Ltd",
    locale,
    ...overrides,
  };
}

function disclaimerFor(locale: ManagementLocale): string {
  return MANAGEMENT_REPORT_STRINGS[locale].disclaimer ?? COMPLIANCE_DISCLAIMER;
}

describe.each(["en", "de"] as const)("management report PDF (%s)", (locale) => {
  const strings = MANAGEMENT_REPORT_STRINGS[locale];

  it("renders the headline, outside-scope line and disclaimer without verdict wording", async () => {
    const bytes = await generateManagementReportPDF(createInput(locale));
    expect(Buffer.from(bytes.subarray(0, 4)).toString("latin1")).toBe("%PDF");

    const text = renderedText(bytes);
    expect(text).toContain(
      locale === "en" ? "Evidence coverage 72%" : "Nachweisabdeckung 72 %",
    );
    expect(text).toContain(strings.outsideScopeLine(4));
    expect(text).toContain(disclaimerFor(locale));
    expect(text).toContain(strings.cisLabel);
    expect(text).toContain("§ 30 Abs. 2 Nr. 1 BSIG");
    expect(text).toContain(
      locale === "en" ? "Risk analysis policies" : "Konzepte zur Risikoanalyse",
    );
    expect(text).toContain(strings.deltaPoints(8));
    expect(text.replace(disclaimerFor(locale), "")).not.toMatch(BANNED);
  });

  it("links the tiles, the outside-scope line and every detail page", async () => {
    const bytes = await generateManagementReportPDF(createInput(locale));
    const links = readLinks(bytes);
    // Summary plus D1 to D5, each short enough for one page.
    expect(links).toHaveLength(6);

    const summaryLinks = links[0];
    expect(summaryLinks?.internal).toEqual([2, 3, 4, 5, 6]);
    for (const page of links.slice(1)) expect(page.internal).toEqual([1]);

    // Two actions have a link the report must not open: plain http and a lookalike host.
    expect(summaryLinks?.external).toEqual([
      "https://intune.microsoft.com/#view/firewall",
      "https://intune.microsoft.com/#view/av",
      "https://entra.microsoft.com/#view/ca",
    ]);
    const text = renderedText(bytes);
    expect(text.split(strings.openInIntune).length - 1).toBe(2);
    expect(text).toContain(strings.openInEntra);
    expect(text).toContain(strings.pageNumber(6, 6));
  });

  it("explains a missing coverage figure and a missing baseline", async () => {
    const input = createInput(locale, { delta: undefined });
    input.summary.metrics = {
      ...input.summary.metrics,
      assessable: 0,
      withEvidence: 0,
      coveragePct: null,
      withoutEvidence: 0,
      conflicting: 0,
      dataGaps: 0,
    };
    const bytes = await generateManagementReportPDF(input);
    const text = renderedText(bytes);
    expect(text).toContain(strings.coverageNotAvailable);
    expect(text).toContain(strings.coverageNotAvailableReason);
    expect(text).toContain(strings.noBaseline);
    expect(text).toContain(strings.noBaselineHint);
    expect(text).toContain(strings.noBaselineHeading);
    expect(text).not.toContain(strings.dataGapsNote(1));
    expect(text.replace(disclaimerFor(locale), "")).not.toMatch(BANNED);
    // The change tile still links to the page that explains how to make a baseline.
    expect(readLinks(bytes)[0]?.internal).toEqual([2, 3, 4, 5, 6]);
  });

  it("skips the outside-scope page and its link when there are no such measures", async () => {
    const input = createInput(locale);
    input.summary.outsideScope = [];
    input.summary.metrics = {
      ...input.summary.metrics,
      outsideIntuneScope: null,
    };
    const bytes = await generateManagementReportPDF(input);
    const links = readLinks(bytes);
    expect(links).toHaveLength(5);
    expect(links[0]?.internal).toEqual([2, 3, 4, 5]);
    expect(renderedText(bytes)).not.toContain(strings.outsideScopeHeading);
  });

  it("paginates a long control list and keeps text above the footer", async () => {
    const input = createInput(locale, { controls: createControls(150) });
    const bytes = await generateManagementReportPDF(input);
    const links = readLinks(bytes);
    expect(links.length).toBeGreaterThan(8);
    for (const page of links.slice(1)) expect(page.internal).toEqual([1]);
    const internalCount = links.reduce(
      (total, page) => total + page.internal.length,
      0,
    );
    expect(internalCount).toBe(5 + links.length - 1);

    const text = renderedText(bytes);
    expect(text).toContain(strings.continued(strings.controlsHeading));
    expect(text).toContain("21.2.150");
    const positions = [
      ...extractPdfStreamText(bytes).matchAll(
        /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Td/g,
      ),
    ];
    // Footer text sits 10 mm (about 28 pt) above the bottom edge; nothing goes lower.
    expect(positions.every((match) => Number(match[2]) >= 28)).toBe(true);
  });
});

describe("management report helpers", () => {
  it("allows only https links to the Intune and Entra admin centers", () => {
    expect(isAllowedPortalUrl("https://intune.microsoft.com/#home")).toBe(true);
    expect(isAllowedPortalUrl("https://entra.microsoft.com/#view")).toBe(true);
    expect(isAllowedPortalUrl("http://intune.microsoft.com/#home")).toBe(false);
    expect(
      isAllowedPortalUrl("https://intune.microsoft.com.evil.example/"),
    ).toBe(false);
    expect(isAllowedPortalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedPortalUrl("not a url")).toBe(false);
  });

  it("builds a localized file name with tenant slug and date", () => {
    const date = new Date(2026, 9, 1, 12, 0);
    expect(managementReportFileName("nis2", "en", date, "Contoso Ltd.")).toBe(
      "Management-Summary-nis2-contoso-ltd-2026-10-01.pdf",
    );
    expect(managementReportFileName("iso-27001-2022", "de", date)).toBe(
      "Management-Zusammenfassung-iso-27001-2022-2026-10-01.pdf",
    );
  });
});

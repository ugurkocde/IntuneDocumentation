import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { COMPLIANCE_DISCLAIMER } from "../compliance/engine";
import {
  generateManagementReportPDF,
  isAllowedPortalUrl,
  managementReportFileName,
  type ManagementReportControl,
  type ManagementReportInput,
  type ManagementReportSafeguard,
} from "../compliance/management/management-report-pdf";
import { MANAGEMENT_REPORT_STRINGS } from "../compliance/management/management-report-strings";
import type {
  ManagementLocale,
  ManagementSummary,
  NextAction,
  SafeguardState,
} from "../compliance/management/types";

const BANNED = /compliant|compliance score|konform|erfüllt/i;
const CONTROL_ID = /\b21\.2\.[a-j]\b/;
const TECHNICAL: Record<ManagementLocale, RegExp> = {
  en: /capabilit|assigned|evidence|polic(y|ies)|mapping/i,
  de: /zugewiesen|nachweis|richtlinie|zuordnung/i,
};

interface PdfPage {
  text: string;
  /** Baseline y positions (pt from the bottom) of every text line. */
  positions: number[];
  internal: number[];
  external: string[];
}

function decodeText(stream: string): string {
  return [...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
    .map((match) => (match[1] ?? "").replace(/\\(.)/g, "$1"))
    .join(" ")
    .replace(/\s+/g, " ");
}

/** Text, positions and link annotations per page (one-based order). */
function readPages(bytes: Uint8Array): PdfPage[] {
  const raw = Buffer.from(bytes);
  const pdf = raw.toString("latin1");
  const pages = [
    ...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Type \/Page\b(?!s)([\s\S]*?)endobj/g),
  ];
  const pageIds = pages.map((match) => Number(match[1]));
  return pages.map((match) => {
    const body = match[2] ?? "";
    const contentId = /\/Contents (\d+) 0 R/.exec(body)?.[1];
    const object = new RegExp(
      `(?:^|\\n)${contentId} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\n`,
    ).exec(pdf);
    let stream = "";
    if (object) {
      const start = (object.index ?? 0) + object[0].length;
      const length = Number(/\/Length (\d+)/.exec(object[1] ?? "")?.[1]);
      const data = raw.subarray(start, start + length);
      stream = (
        object[1]?.includes("/FlateDecode") ? inflateSync(data) : data
      ).toString("latin1");
    }
    return {
      text: decodeText(stream),
      positions: [
        ...stream.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) Td/g),
      ].map((position) => Number(position[2])),
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
  controlIds = ["21.2.g", "21.2.h"],
): NextAction {
  return {
    capabilityId: `capability-${rank}`,
    name,
    tier,
    controlIds,
    area: "diskEncryption",
    url,
    rank,
  };
}

const OTHER_STATES: SafeguardState[] = [
  "notAssigned",
  "notConfigured",
  "switchedOff",
  "partial",
  "conflicting",
  "dataMissing",
];

/** inPlace safeguards first in the input order is not assumed by the renderer. */
function safeguards(
  prefix: string,
  inPlace: number,
  total: number,
): ManagementReportSafeguard[] {
  return Array.from({ length: total }, (_, index) => {
    const state =
      index >= total - inPlace
        ? "inPlace"
        : (OTHER_STATES[index % OTHER_STATES.length] ?? "notConfigured");
    const policies =
      state === "inPlace"
        ? [{ name: `Baseline ${prefix}-${index}`, assigned: true }]
        : state === "notAssigned"
          ? [{ name: `Draft ${prefix}-${index}`, assigned: false }]
          : state === "notConfigured"
            ? []
            : [{ name: `Policy ${prefix}-${index}`, assigned: true }];
    return {
      capabilityId: `${prefix}-${index}`,
      name: `Safeguard ${prefix} ${index + 1}`,
      state,
      policies,
    };
  });
}

// Same counts as the NIS2 run on the lab tenant: 6 of 60 in place.
const LAB: { letter: string; title: string; inPlace: number; total: number }[] =
  [
    { letter: "b", title: "Incident handling", inPlace: 0, total: 4 },
    { letter: "e", title: "Secure acquisition", inPlace: 2, total: 6 },
    { letter: "g", title: "Basic cyber hygiene", inPlace: 2, total: 33 },
    { letter: "h", title: "Cryptography and encryption", inPlace: 2, total: 3 },
    { letter: "i", title: "Access control", inPlace: 0, total: 11 },
    { letter: "j", title: "Multi-factor authentication", inPlace: 0, total: 3 },
  ];

function createControls(): ManagementReportControl[] {
  return LAB.map((item, index) => ({
    id: `21.2.${item.letter}`,
    title: item.title,
    status: item.inPlace > 0 ? "partialEvidence" : "noEvidence",
    aliases: [
      { scheme: "DK", id: `NIS2-loven § 6 stk. 1 nr. ${index + 2}` },
      { scheme: "DE", id: `§ 30 Abs. 2 Nr. ${index + 2} BSIG` },
    ],
    cis: index === 0 ? ["99.1", "99.2"] : undefined,
    safeguards: safeguards(item.letter, item.inPlace, item.total),
  }));
}

/** Synthetic controls with a falling share of safeguards in place. */
function createManyControls(count: number): ManagementReportControl[] {
  return Array.from({ length: count }, (_, index) => {
    const total = 4;
    const inPlace = index % 5 === 0 ? 0 : Math.min(total, (index % 4) + 1);
    return {
      id: `X.${index + 1}`,
      title: `Synthetic measure ${index + 1}`,
      status: "partialEvidence" as const,
      safeguards: safeguards(`x${index}`, inPlace, total),
    };
  });
}

function safeguardMap(
  controls: readonly ManagementReportControl[],
): ManagementSummary["safeguards"] {
  return Object.fromEntries(
    controls.map((control) => [
      control.id,
      {
        inPlace: control.safeguards.filter((item) => item.state === "inPlace")
          .length,
        total: control.safeguards.length,
      },
    ]),
  );
}

function createSummary(controls: ManagementReportControl[]): ManagementSummary {
  return {
    frameworkId: "nis2",
    frameworkName: "NIS2",
    frameworkVersion: "Directive (EU) 2022/2555, Art. 21(2)",
    generatedAt: "2026-10-01T09:00:00.000Z",
    rulesetVersion: "2026.10.2",
    scopeKey: JSON.stringify([["windows", "macos"], 1, null]),
    metrics: {
      assessable: 6,
      withEvidence: 3,
      coveragePct: 50,
      withoutEvidence: 3,
      conflicting: 0,
      unassignedConfigs: 25,
      outsideIntuneScope: 4,
      dataGaps: 1,
      safeguardsTotal: 60,
      safeguardsInPlace: 6,
      safeguardPct: 10,
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
      ),
      action(
        2,
        "partial",
        "Windows Hello for Business",
        "http://intune.microsoft.com/#insecure",
      ),
      action(
        3,
        "unassigned",
        "Credential Guard",
        "https://intune.microsoft.com.evil.example/#view",
        ["21.2.i"],
      ),
      action(
        4,
        "missing",
        "multifactor authentication for all cloud apps",
        "https://entra.microsoft.com/#view/ca",
        ["21.2.j"],
      ),
    ],
    controls: Object.fromEntries(
      controls.map((control) => [control.id, control.status]),
    ),
    safeguards: safeguardMap(controls),
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

function createInput(
  locale: ManagementLocale,
  overrides: Partial<ManagementReportInput> = {},
): ManagementReportInput {
  const controls = overrides.controls
    ? [...overrides.controls]
    : createControls();
  return {
    summary: createSummary(controls),
    controls,
    unassigned: [
      {
        capabilityId: "credential-guard",
        name: "Credential Guard",
        controlIds: ["21.2.i"],
      },
    ],
    delta: {
      coverageDeltaPoints: 17,
      newlyEvidenced: ["21.2.e"],
      regressions: ["21.2.j"],
      added: [],
      removed: [],
      safeguardDeltaPoints: 4,
      safeguardChanges: [
        { controlId: "21.2.e", from: 0, to: 2, total: 6 },
        { controlId: "21.2.h", from: 1, to: 2, total: 3 },
      ],
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

/** First page after the overview whose text contains the measure section heading. */
function sectionPage(
  pages: PdfPage[],
  locale: ManagementLocale,
  id: string,
  title: string,
): number {
  const overview = MANAGEMENT_REPORT_STRINGS[locale].overviewHeading;
  return (
    pages.findIndex(
      (page, index) =>
        index > 0 &&
        !page.text.includes(overview) &&
        page.text.includes(`${id} ${title}`),
    ) + 1
  );
}

describe.each(["en", "de"] as const)("security summary PDF (%s)", (locale) => {
  const strings = MANAGEMENT_REPORT_STRINGS[locale];

  it("keeps page 1 to plain numbers on one page", async () => {
    const bytes = await generateManagementReportPDF(createInput(locale));
    expect(Buffer.from(bytes.subarray(0, 4)).toString("latin1")).toBe("%PDF");
    const pages = readPages(bytes);
    const page1 = pages[0]?.text ?? "";

    expect(page1).toContain(strings.title("NIS2"));
    expect(page1).toContain(strings.percent(10));
    expect(page1).toContain(strings.heroSentence(6, 60));
    expect(page1).toContain(strings.ofCount(6, 60));
    expect(page1).toContain(strings.tileNoSafeguardsDetail(6));
    expect(page1).toContain(strings.deltaPoints(4));
    for (const item of LAB) {
      expect(page1).toContain(item.title);
      expect(page1).toContain(strings.ofCount(item.inPlace, item.total));
    }
    expect(page1).toContain(strings.outsideScopeLine(4));
    expect(page1).toContain(strings.dataGapsNote(1));
    // Everything that belongs on page 1 is on it: all five steps, the note
    // and the disclaimer below them.
    for (const item of createSummary([]).nextActions)
      expect(page1).toContain(strings.actionSentence[item.tier](item.name));
    expect(page1).toContain(strings.page1Note);
    expect(page1).toContain(disclaimerFor(locale));
    expect(pages[1]?.text).toContain(strings.itBand.toUpperCase());

    const plain = page1.replace(disclaimerFor(locale), "");
    expect(plain).not.toMatch(CONTROL_ID);
    expect(plain).not.toMatch(TECHNICAL[locale]);
    expect(plain).not.toMatch(BANNED);
    // Footer text sits 10 mm (about 28 pt) above the bottom edge; nothing goes lower.
    for (const page of pages)
      expect(page.positions.every((position) => position >= 28)).toBe(true);
  });

  it("explains every number on the IT pages", async () => {
    const pages = readPages(
      await generateManagementReportPDF(createInput(locale)),
    );
    const itText = pages
      .slice(1)
      .map((page) => page.text)
      .join(" ");
    for (const page of pages.slice(1))
      expect(page.text).toContain(strings.itBand.toUpperCase());
    for (const [index, page] of pages.entries())
      expect(page.text).toContain(strings.pageNumber(index + 1, pages.length));

    expect(itText).toContain(strings.guideHeading);
    for (const section of strings.guideSections) {
      expect(itText).toContain(section.heading);
      for (const text of [...section.paragraphs, ...(section.bullets ?? [])])
        expect(itText).toContain(text);
    }
    for (const figure of Object.values(strings.figures))
      expect(itText).toContain(figure.label);
    expect(itText).toContain(
      `${strings.measuresOf(3, 6)} (${strings.percent(50)})`,
    );
    expect(itText).toContain(strings.platforms.macos);
    expect(itText).toContain("2026.10.2");
    expect(itText).toContain(disclaimerFor(locale));

    expect(itText).toContain(strings.measureCount(2, 33));
    expect(itText).toContain(strings.measureCount(0, 4));
    expect(itText).toContain("§ 30 Abs. 2 Nr. 2 BSIG");
    expect(itText).toContain(`${strings.cisLabel}: 99.1, 99.2`);
    expect(itText).toContain(`Draft g-0 ${strings.notAssignedSuffix}`);
    expect(itText).toContain("Baseline g-32");
    expect(itText).not.toContain(`Baseline g-32 ${strings.notAssignedSuffix}`);
    expect(itText).toContain(strings.noPolicy);
    for (const label of Object.values(strings.safeguardStates))
      expect(itText).toContain(label);
    // Every safeguard of the largest measure is listed.
    for (let index = 1; index <= 33; index += 1)
      expect(itText).toContain(`Safeguard g ${index} `);

    expect(itText).toContain(strings.changeFromTo(0, 2, 6));
    expect(itText).toContain(strings.changeFromTo(1, 2, 3));
    expect(itText).toContain(strings.rulesetChanged);
    expect(itText).toContain(strings.outsideScopeHeading);
    expect(itText).toContain(
      locale === "en" ? "Risk analysis policies" : "Konzepte zur Risikoanalyse",
    );
    expect(itText).toContain(strings.unassignedIntro);
    expect(itText.replace(disclaimerFor(locale), "")).not.toMatch(BANNED);
  });

  it("lists safeguards in place first, then what needs attention", async () => {
    const pages = readPages(
      await generateManagementReportPDF(createInput(locale)),
    );
    const page =
      pages[sectionPage(pages, locale, "21.2.e", "Secure acquisition") - 1];
    const section = page?.text.split("21.2.e Secure acquisition")[1] ?? "";
    const order = [
      "inPlace",
      "switchedOff",
      "partial",
      "notAssigned",
      "notConfigured",
    ].map((state) =>
      section.indexOf(strings.safeguardStates[state as SafeguardState]),
    );
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("links tiles and measure rows to their IT pages", async () => {
    const pages = readPages(
      await generateManagementReportPDF(createInput(locale)),
    );
    const find = (text: string) =>
      pages.findIndex((page, index) => index > 0 && page.text.includes(text)) +
      1;
    const guide = find(strings.guideHeading);
    const overview = find(strings.overviewHeading);
    const unassigned = find(strings.unassignedIntro);
    const change = find(strings.changeSafeguards);
    const outside = find(strings.outsideScopeIntro);
    const sections = createControls().map((control) =>
      sectionPage(pages, locale, control.id, control.title),
    );
    expect(sections.every((page) => page > overview)).toBe(true);

    expect(pages[0]?.internal).toEqual([
      guide,
      overview,
      unassigned,
      change,
      ...sections,
      outside,
    ]);
    // Two actions have a link the report must not open: plain http and a lookalike host.
    expect(pages[0]?.external).toEqual([
      "https://intune.microsoft.com/#view/firewall",
      "https://intune.microsoft.com/#view/av",
      "https://entra.microsoft.com/#view/ca",
    ]);
    // Every IT page leads back to the summary; overview rows open the sections.
    for (const page of pages.slice(1)) expect(page.internal[0]).toBe(1);
    expect(pages[overview - 1]?.internal).toEqual([1, ...sections]);
  });

  it("shows no figure when no safeguards are mapped", async () => {
    const input = createInput(locale);
    input.summary.metrics = {
      ...input.summary.metrics,
      safeguardsTotal: 0,
      safeguardsInPlace: 0,
      safeguardPct: null,
    };
    const text = readPages(await generateManagementReportPDF(input))[0]?.text;
    expect(text).toContain(strings.heroNotAvailable);
    expect(text).toContain(strings.heroNotAvailableSentence);
    expect(text).toContain(strings.ofCount(0, 0));
    expect(text).not.toContain(strings.percent(10));
  });

  it("shows the eight weakest measures when there are more", async () => {
    const controls = createManyControls(12);
    const pages = readPages(
      await generateManagementReportPDF(createInput(locale, { controls })),
    );
    const page1 = pages[0]?.text ?? "";
    const counts = safeguardMap(controls);
    const share = (id: string) =>
      (counts[id]?.inPlace ?? 0) / (counts[id]?.total ?? 1);
    const ranked = controls
      .map((control, index) => ({ control, index }))
      .sort(
        (left, right) =>
          share(left.control.id) - share(right.control.id) ||
          left.index - right.index,
      );
    const shown = ranked.slice(0, 8).map((item) => item.control);
    const hidden = ranked.slice(8).map((item) => item.control);
    for (const control of shown) expect(page1).toContain(`${control.title} `);
    for (const control of hidden)
      expect(page1).not.toContain(`${control.title} `);
    expect(page1).toContain(strings.moreMeasures(4));

    // Rows keep framework order and link to their sections; the "more" line
    // opens the overview.
    const expectedSections = controls
      .filter((control) => shown.includes(control))
      .map((control) => sectionPage(pages, locale, control.id, control.title));
    const overview =
      pages.findIndex((page) => page.text.includes(strings.overviewIntro)) + 1;
    expect(pages[0]?.internal.slice(4, 13)).toEqual([
      ...expectedSections,
      overview,
    ]);
    const plain = page1.replace(disclaimerFor(locale), "");
    expect(plain).not.toMatch(/X\.\d/);
    expect(pages[0]?.positions.every((position) => position >= 28)).toBe(true);
  });

  it("explains a missing baseline on page 1 and its IT page", async () => {
    const bytes = await generateManagementReportPDF(
      createInput(locale, { delta: undefined }),
    );
    const pages = readPages(bytes);
    expect(pages[0]?.text).toContain(strings.noBaseline);
    expect(pages[0]?.text).toContain(strings.noBaselineHint);
    const change =
      pages.findIndex(
        (page, index) =>
          index > 0 && page.text.includes(strings.noBaselineHeading),
      ) + 1;
    expect(change).toBeGreaterThan(1);
    for (const step of strings.noBaselineSteps)
      expect(pages[change - 1]?.text).toContain(step);
    expect(pages[0]?.internal[3]).toBe(change);
  });

  it("handles a baseline saved before safeguard counts existed", async () => {
    const input = createInput(locale);
    input.delta = {
      ...input.delta!,
      safeguardDeltaPoints: null,
      safeguardChanges: [],
    };
    const pages = readPages(await generateManagementReportPDF(input));
    expect(pages[0]?.text).toContain(strings.deltaNotAvailable);
    expect(pages[0]?.text).toContain(strings.oldBaselineDetail);
    const change = pages.find((page) =>
      page.text.includes(strings.changeSafeguards),
    );
    expect(change?.text).toContain(strings.changeSafeguardsMissing);
    expect(change?.text).not.toContain(strings.deltaPoints(17));
    expect(change?.text).not.toContain(strings.changePerMeasure);
  });

  it("skips the outside-scope page and its link when there are no such measures", async () => {
    const input = createInput(locale);
    input.summary.outsideScope = [];
    input.summary.metrics = {
      ...input.summary.metrics,
      outsideIntuneScope: null,
    };
    const pages = readPages(await generateManagementReportPDF(input));
    const text = pages.map((page) => page.text).join(" ");
    expect(text).not.toContain(strings.outsideScopeHeading);
    expect(text).not.toContain(strings.outsideScopeLine(4));
    expect(pages[0]?.internal).toHaveLength(4 + LAB.length);
  });

  it("derives measure coverage from the safeguard counts", async () => {
    const input = createInput(locale);
    // Control-status figures from an older run disagree on purpose.
    input.summary.metrics = {
      ...input.summary.metrics,
      withEvidence: 5,
      coveragePct: 83,
    };
    const pages = readPages(await generateManagementReportPDF(input));
    const itText = pages
      .slice(1)
      .map((page) => page.text)
      .join(" ");
    // 3 of the 6 measures have a safeguard in place (e, g, h); 3 have none.
    expect(itText).toContain(
      `${strings.measuresOf(3, 6)} (${strings.percent(50)})`,
    );
    expect(itText).not.toContain(strings.measuresOf(5, 6));
    expect(itText).toContain(
      `${strings.figures.noSafeguards.label} ${strings.figures.noSafeguards.note} ${strings.measuresValue(3)}`,
    );
    expect(pages[0]?.text).toContain(
      `${strings.tileNoSafeguards} 3 ${strings.tileNoSafeguardsDetail(6)}`,
    );
  });

  it("caps the policies listed per safeguard", async () => {
    const controls = createControls();
    const target = controls[1]!.safeguards[0]!;
    target.state = "inPlace";
    target.policies = Array.from({ length: 60 }, (_, index) => ({
      name: `Shared policy ${String(index + 1).padStart(2, "0")}`,
      assigned: index < 30,
    }));
    // A row taller than a page is cut rather than run into the footer.
    controls[2]!.safeguards[0]!.name = "Very long safeguard name ".repeat(300);
    const pages = readPages(
      await generateManagementReportPDF(createInput(locale, { controls })),
    );
    expect(pages.length).toBeLessThan(20);
    const text = pages.map((page) => page.text).join(" ");
    expect(text).toContain(strings.moreItems(52));
    expect(text).toContain("Shared policy 08");
    expect(text).not.toContain("Shared policy 09");
    expect(text).not.toContain(`Shared policy 31`);
    for (const page of pages)
      expect(page.positions.every((position) => position >= 28)).toBe(true);
  });

  it("paginates long measure lists and keeps text above the footer", async () => {
    const controls = createManyControls(150);
    const pages = readPages(
      await generateManagementReportPDF(createInput(locale, { controls })),
    );
    expect(pages.length).toBeGreaterThan(20);
    const text = pages.map((page) => page.text).join(" ");
    expect(text).toContain(strings.continued(strings.overviewHeading));
    expect(text).toContain("X.150 Synthetic measure 150");
    for (const control of controls)
      expect(
        sectionPage(pages, locale, control.id, control.title),
      ).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.positions.every((position) => position >= 28)).toBe(true);
    }
    for (const page of pages.slice(1)) expect(page.internal[0]).toBe(1);
  });
});

describe("security summary helpers", () => {
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
      "Security-Summary-nis2-contoso-ltd-2026-10-01.pdf",
    );
    expect(managementReportFileName("iso-27001-2022", "de", date)).toBe(
      "Sicherheitsuebersicht-iso-27001-2022-2026-10-01.pdf",
    );
  });

  it("keeps report text free of dashes and arrows the font cannot draw", () => {
    // Function sources are included so template strings are checked too.
    const collect = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : typeof value === "function"
          ? [String(value)]
          : value && typeof value === "object"
            ? Object.values(value).flatMap(collect)
            : [];
    const all = collect(MANAGEMENT_REPORT_STRINGS).join("\n");
    expect(all).not.toMatch(/[\u2013\u2014\u2190-\u21ff]/);
    expect(all).not.toMatch(/\w - \w/);
  });
});

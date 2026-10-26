import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  COVER_LEAD,
  LEVEL_2_NOTE,
  READINESS_DISCLAIMER,
  SETTINGS_BASIS_NOTE,
} from "../display";
import {
  MANUAL_RECOMMENDATIONS_NOTICE,
  MANUAL_RECOMMENDATIONS_URL,
} from "../manual";
import { renderReadinessPdf, valueText, wrapText } from "../readiness-pdf";
import jsPDF from "jspdf";
import {
  EXCEPTIONS,
  PACK_POLICY,
  TENANT_POLICY,
  UNASSIGNED_POLICY,
  UNASSIGNED_MATCH,
  UNASSIGNED_OTHER,
  richAssessment,
  unassessedAssessment,
  unassignedAssessment,
} from "./export-fixtures";
import { assessBenchmark } from "../assessment";
import {
  choice,
  collection,
  NOW,
  pack,
  simpleInteger,
  simpleSecret,
  tenantPolicy,
} from "./fixtures";
import type { RecordJson } from "../policies";

const RENDER_DATE = new Date("2026-10-22T12:00:00.000Z");

/** Text of every page, one-based order, with whitespace collapsed. */
function pageTexts(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes);
  const pdf = raw.toString("latin1");
  const pages = [
    ...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Type \/Page\b(?!s)([\s\S]*?)endobj/g),
  ];
  return pages.map((match) => {
    const contentId = /\/Contents (\d+) 0 R/.exec(match[2] ?? "")?.[1];
    const object = new RegExp(
      `(?:^|\\n)${contentId} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\n`,
    ).exec(pdf);
    if (!object) return "";
    const start = (object.index ?? 0) + object[0].length;
    const length = Number(/\/Length (\d+)/.exec(object[1] ?? "")?.[1]);
    const data = raw.subarray(start, start + length);
    const stream = (
      object[1]?.includes("/FlateDecode") ? inflateSync(data) : data
    ).toString("latin1");
    return [...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
      .map((item) => (item[1] ?? "").replace(/\\(.)/g, "$1"))
      .join(" ")
      .replace(/\s+/g, " ");
  });
}

function render(
  assessment = richAssessment(),
  options: Parameters<typeof renderReadinessPdf>[1] = {},
) {
  return renderReadinessPdf(assessment, {
    renderDate: RENDER_DATE,
    tenantLabel: "Synthetic Tenant",
    exceptions: EXCEPTIONS,
    ...options,
  });
}

const FOOTER = `Generated with Intune Documentation (intunedocumentation.com). ${READINESS_DISCLAIMER}.`;

/** The first page whose text holds the marker. */
const pageWith = (pages: readonly string[], marker: string) =>
  pages.find((text) => text.includes(marker))!;

describe("benchmark readiness PDF", () => {
  const rich = pageTexts(render());
  const all = rich.join(" ");
  const summary = pageWith(rich, "01 SUMMARY");
  const detail = pageWith(rich, "05 RESULT DETAIL");

  it("states the disclaimer on the cover, in the about callout and in the footer of every page", () => {
    expect(rich.length).toBeGreaterThan(6);
    expect(rich[0]).toContain(COVER_LEAD);
    expect(rich[0]).toContain(
      `Generated with Intune Documentation (intunedocumentation.com) ${READINESS_DISCLAIMER}`,
    );
    for (const [index, text] of rich.slice(1).entries())
      expect(text, `page ${index + 2}`).toContain(FOOTER);
    expect(rich[1]).toContain(`Read this first ${READINESS_DISCLAIMER}.`);
  });

  it("carries the manual notice on the cover, the about page and the manual section only", () => {
    const withNotice = rich
      .map((text, index) =>
        text.includes(MANUAL_RECOMMENDATIONS_NOTICE) ? index : -1,
      )
      .filter((index) => index >= 0);
    const manualPage = rich.findIndex((text) => text.startsWith("APPENDIX"));
    expect(withNotice).toEqual(
      [0, 1, manualPage].filter(
        (index, at, list) => list.indexOf(index) === at,
      ),
    );
    for (const index of withNotice)
      expect(rich[index]).toContain(MANUAL_RECOMMENDATIONS_URL);
    expect(rich[rich.length - 1]).toContain("Synthetic manual review item");
  });

  it("puts the about page and the contents after the cover, with bookmarks", () => {
    expect(rich[1]).toContain("ABOUT THIS REPORT");
    expect(rich[1]).toMatch(
      /Table of Contents Summary 3 What to Do 4 Results 5 Data Basis 6 Result Detail 7 Differs 7 Needs review \d+ Appendix: Manual Recommendations, Exceptions and Method \d+/,
    );
    const pdf = Buffer.from(render()).toString("latin1");
    expect(pdf).toContain("/Outlines");
    expect(pdf).toMatch(/\/Title \(Result Detail\)/);
  });

  it("writes fixed document metadata", () => {
    const pdf = Buffer.from(render()).toString("latin1");
    expect(pdf).toContain("/Title (CIS Benchmark readiness comparison)");
    expect(pdf).toContain(
      "/Author (Generated with Intune Documentation \\(intunedocumentation.com\\))",
    );
  });

  it("names every Level the results cover on the cover", () => {
    const base = richAssessment();
    const [first] = base.levels;
    const both = {
      ...base,
      levels: [first!, { ...first!, level: 2 as const }],
    };
    const pages = pageTexts(render(both));
    expect(pages[0]).toContain("Levels 1 and 2");
    expect(pages[0]).toMatch(/LEVEL 1 LEVEL 2/);
    // Both Levels get their headline and the Level 2 note.
    const both2 = pageWith(pages, "01 SUMMARY");
    expect(both2).toContain(LEVEL_2_NOTE);
    expect(both2).toContain(
      "Level 1: 1 of 8 recommendations matches on assigned policies.",
    );
    expect(both2).toContain(
      "Level 2: 1 of 8 recommendations matches on assigned policies.",
    );
  });

  it("shows the cover title, Level, tenant and dates", () => {
    const cover = pageTexts(
      render(richAssessment(), { benchmarkName: "Synthetic Workstation" }),
    )[0]!;
    expect(cover).toContain("Synthetic Workstation 1.0.0");
    expect(cover).toContain("Level 1");
    expect(cover).toContain("Synthetic Tenant");
    expect(cover).toContain("2026-10-22 Report date");
    expect(cover).toContain("2026-10-20 Data collected");
    expect(cover).toContain("2026-10-21 10:00 UTC");
    expect(rich[0]).toContain("Synthetic Bench 1.0.0");
    // Data collected is left out when it is the report date.
    const sameDay = pageTexts(
      render(richAssessment(), {
        renderDate: new Date("2026-10-20T18:00:00.000Z"),
      }),
    )[0]!;
    expect(sameDay).not.toMatch(/\d{4}-\d{2}-\d{2} Data collected/);
  });

  it("leads with the counts and shows the rate with its base", () => {
    // 5 assessed is too few for the rate to lead (rateIsHero).
    expect(rich[0]).toContain("1 of 8 match");
    expect(rich[0]).toContain("20% of 5 assessed, 2 need review");
    expect(summary).toContain("Summary 1 MATCHING, LEVEL 1");
    expect(summary).toContain(
      "20% of 5 assessed, 2 need review; 40% with 1 exclusion.",
    );
    expect(summary).toContain(
      "Matches 1, Differs 1, Not configured 3, Needs review 2, Not assessed 1.",
    );
    expect(summary).not.toMatch(/\b1 matches\b/);
  });

  it("explains an empty headline instead of showing n/a or 0%", () => {
    const pages = pageTexts(render(unassessedAssessment()));
    expect(pages[0]).toContain("Nothing was assessed as Matches or Differs");
    expect(pages[0]).not.toContain("n/a");
    expect(pages[0]).not.toMatch(/\b0%/);
    const results = pageWith(pages, "03 RESULTS");
    expect(results).toContain("Collection incomplete");
    expect(results).toContain(
      "The collection is incomplete, so this cannot be shown to match or to be missing.",
    );
  });

  it("shows coverage of the full benchmark only with a delivered list", () => {
    expect(rich[0]).toContain(
      "Coverage: 77.8% (7 of 9 automated recommendations)",
    );
    const without = pageTexts(render(richAssessment({ list: false }))).join(
      " ",
    );
    expect(without).toContain(
      "coverage of the full benchmark will be shown once its list is published",
    );
    expect(without).not.toContain("Coverage: ");
  });

  it("summarises reasons, sections, first steps and key findings with pages", () => {
    expect(summary).toContain("Open results by reason 7 of 8 results");
    expect(summary).toContain("Not configured: Set in no collected policy 3");
    expect(summary).toContain(
      "Status distribution 8 results 1 Matches, 13% 1 Differs, 13% 3 Not configured, 38%",
    );
    expect(summary).toContain("NOT CONFIGURED 3 Counted in the headline");
    expect(summary).toContain(
      "What to do first 4 steps in total 1. Change 1 setting in policy",
    );
    expect(summary).toContain("Key findings");
    expect(summary).toContain("Differs 1.2 Synthetic beta is on");
    expect(summary).toContain("See page 7");
  });

  it("lists the fix plan in order on the what to do page", () => {
    const steps = pageWith(rich, "02 WHAT TO DO");
    const order = [
      "1. Change 1 setting in policy",
      "2. Assign policy Synthetic unassigned profile",
      "3. Check 1 setting by hand",
      "4. Add 3 settings",
    ].map((text) => steps.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(steps).toContain("Helps with: 1.3, 1.4, 1.5");
    expect(steps).toContain("See page 7");
  });

  it("lists every result with its id chip, title, label, short reason and the reason key", () => {
    const table = pageWith(rich, "03 RESULTS");
    for (const id of ["1.1", "1.2", "1.3", "2.1", "2.2", "3.1"])
      expect(table).toContain(id);
    for (const title of ["Synthetic alpha is on", "Synthetic gamma is on"])
      expect(table).toContain(title);
    for (const label of [
      "Matches",
      "Differs",
      "Not configured",
      "Needs review",
      "Not assessed",
    ])
      expect(table).toContain(label);
    expect(table).toContain("Section 1 1 of 5 match");
    expect(table).toContain(
      "2.1 Synthetic gamma is on Needs review Only on unassigned policies",
    );
    // Each full sentence once, in the reason key.
    expect(
      table.split(
        "The matching value is only on policies that are not assigned.",
      ).length - 1,
    ).toBe(1);
    expect(table).toContain(
      "The recommendation names a setting outside the pack, so it is not assessed here.",
    );
    expect(table).toContain("HOW TO READ THIS REPORT");
  });

  it("details each result that differs or needs review as a card", () => {
    expect(detail).toContain(
      `1.2 Synthetic beta is on synthetic_bench_beta Differs POLICY ASSIGNMENT CURRENT RECOMMENDED RESULT ${TENANT_POLICY} Assigned All Users false true Differs`,
    );
    expect(detail).toContain(
      `${UNASSIGNED_POLICY} Not assigned 1 1 Matches, unassigned The matching value is only on policies that are not assigned.`,
    );
    expect(detail).toContain(
      "No collected policy holds this setting. Not configured 14 Not configured",
    );
    expect(detail).toContain(
      "NEXT STEP Change synthetic_bench_beta in policy Synthetic tenant baseline from false to true.",
    );
    expect(detail).not.toContain("Synthetic alpha is on");
    // The secret's cause is named under its row.
    expect(all).toContain(
      "The value is a secret, which Microsoft Graph never returns in a readable form.",
    );
  });

  it("closes with the manual recommendations, the exceptions and the method on one page", () => {
    const appendix = rich[rich.length - 1]!;
    for (const text of [
      "Manual recommendations 3 listed",
      "Exceptions 2 recorded",
      "Method",
    ])
      expect(appendix).toContain(text);
    expect(appendix).toContain("Synthetic Owner");
    expect(appendix).toContain("Synthetic accepted difference for a pilot.");
    expect(appendix).toContain("2027-01-31");
    expect(appendix).toContain("Applied to the headline");
    expect(appendix).toContain("Not in effect");
    const empty = pageTexts(
      render(unassignedAssessment(), { exceptions: [] }),
    ).join(" ");
    expect(empty).toContain(
      "No recommendation list was delivered, so no manual recommendation is listed.",
    );
    expect(empty).toContain(
      "No exceptions are recorded for this benchmark, version and Level.",
    );
  });

  it("never claims compliance, a score or certification and names no pack policy", () => {
    for (const text of [all, ...pageTexts(render(unassessedAssessment()))]) {
      expect(text).not.toMatch(/\bcompliant\b|\bscore\b|\bcertified\b/i);
      expect(text).not.toMatch(/[\u2013\u2014]| - /);
      expect(text).not.toContain(PACK_POLICY);
    }
  });

  it("renders the same bytes for the same input and render date", () => {
    expect(Buffer.from(render()).equals(Buffer.from(render()))).toBe(true);
  });
});

// Round 39: a value other than the recommended one on an unassigned policy
// never reads as a matching value.
describe("readiness PDF: values only on unassigned policies", () => {
  const pages = pageTexts(render(unassignedAssessment()));
  const all = pages.join(" ");
  const count = (text: string) => all.split(text).length - 1;

  it("names a matching, a differing and a mixed holding with their own reason", () => {
    const detail = pageWith(pages, "05 RESULT DETAIL");
    // The setting's own status says why a match needs review.
    expect(detail).toContain(
      "Matches, unassigned The matching value is only on policies that are not assigned.",
    );
    expect(detail).not.toContain("Matches. The matching value");
    expect(detail).toContain(
      "Differs, unassigned Only policies that are not assigned hold this setting, and none of them matches the recommended value.",
    );
    expect(detail).toContain(
      "Not readable The value is a secret, which Microsoft Graph never returns in a readable form. Only policies that are not assigned hold this setting: some match the recommended value and some hold another value.",
    );
    expect(detail).toContain(
      `${UNASSIGNED_OTHER} Not assigned 9 14 Differs, unassigned`,
    );
    expect(detail).toContain(
      `${UNASSIGNED_MATCH} Not assigned 1 1 Matches, unassigned`,
    );
    // A match beside a Needs review result always carries its qualifier.
    expect(detail).not.toMatch(/ Matches (?!, )(?!out)/);
    // Once in the reason key and once in the detail: only for 1.1.
    expect(
      count("The matching value is only on policies that are not assigned."),
    ).toBe(2);
  });

  it("explains that another value only on unassigned policies needs review", () => {
    expect(all).toContain(
      "A policy that is not assigned applies to nobody, so another value held only there needs review too.",
    );
    expect(all).toContain(
      "Differs needs a readable tenant value that differs on a policy that is assigned or whose assignment could not be read",
    );
  });
});

describe("readiness PDF: a pack without recommendations", () => {
  const SPACED =
    "com.synthetic.energysaver.desktop.acpower_display sleep timer";
  const assessment = assessBenchmark(
    collection({
      policies: [
        tenantPolicy({
          name: TENANT_POLICY,
          settings: [choice("synthetic_bench_alpha", "1")],
        }),
        tenantPolicy({
          name: UNASSIGNED_POLICY,
          settings: [choice("synthetic_bench_gamma", "1")],
          assignments: [],
        }),
      ],
    }),
    pack([
      {
        name: PACK_POLICY,
        settings: [
          choice("synthetic_bench_alpha", "1"),
          choice("synthetic_bench_gamma", "1"),
          choice(SPACED, "1"),
        ],
      },
    ]),
    { now: NOW },
  );
  const pages = pageTexts(render(assessment));
  const detail = pageWith(pages, "05 RESULT DETAIL");

  it("counts settings, not recommendations, in the automatic check summary", () => {
    expect(assessment.basis).toBe("settings");
    const basis = pageWith(pages, "04 DATA BASIS");
    expect(basis).toContain(
      "Level 1: Intune Documentation checks 3 settings of this pack automatically.",
    );
    expect(basis).not.toMatch(/checks \d+ recommendations? of this pack/);
    expect(pageWith(pages, "01 SUMMARY")).toContain(SETTINGS_BASIS_NOTE);
  });

  it("names each setting once in its detail card", () => {
    expect(detail.split(`${SPACED} Not configured POLICY`).length - 1).toBe(1);
    expect(detail.split("synthetic_bench_gamma").length - 1).toBe(1);
    expect(detail).toContain(
      "synthetic_bench_gamma Needs review POLICY ASSIGNMENT CURRENT RECOMMENDED RESULT",
    );
    expect(detail).toContain(
      "Matches, unassigned The matching value is only on policies that are not assigned.",
    );
  });

  it("shows the headline base for settings", () => {
    expect(pages[0]).toContain("50% of 2 assessed, 1 needs review");
  });
});

describe("readiness PDF: characters outside the standard font", () => {
  it("writes them in a form the font draws, so lines are measured as drawn", () => {
    const title =
      "Synthetic value \u2264 15 minutes \u2192 or \u2265 the synthetic limit \u201cquoted\u201d, \u2018single\u2019 and \u2026 kept, \u4e2d unknown";
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ settings: [choice("synthetic_bench_alpha", "0")] }),
        ],
      }),
      pack(
        [{ settings: [choice("synthetic_bench_alpha", "1")] }],
        [
          {
            id: "1.1",
            title,
            level: 1,
            settings: ["synthetic_bench_alpha"],
          },
        ],
      ),
      { now: NOW },
    );
    const all = pageTexts(render(assessment)).join(" ");
    expect(all).toContain(
      "Synthetic value <= 15 minutes -> or >= the synthetic limit",
    );
    expect(all).toContain("? unknown");
    const branded = pageTexts(
      render(assessment, {
        branding: { companyName: "Synthetic \u2192 Partner" },
      } as Parameters<typeof render>[1]),
    ).join(" ");
    expect(branded).toContain("Synthetic -> Partner");
    expect(branded).not.toContain("\u2192");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const lines = wrapText(doc, title, 60, 8.6, "bold");
    expect(lines.join(" ")).toContain(
      "\u201cquoted\u201d, \u2018single\u2019 and \u2026 kept",
    );
    expect(lines.join(" ")).not.toMatch(/[\u2192\u2264\u2265\u4e2d]/);
  });
});

describe("readiness PDF helpers", () => {
  it("wraps identifiers without spaces and keeps every character", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const id = `synthetic_bench_${"segment_".repeat(20)}end`;
    const lines = wrapText(doc, id, 40, 7);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe(id);
    expect(wrapText(doc, id, 40, 7, "normal", 2)[1]).toMatch(/\.\.\.$/);
  });

  it("shows readable values and never a secret", () => {
    const instance = (value: object) => value as RecordJson;
    expect(valueText(instance(choice("synthetic_bench_alpha", "1")))).toBe("1");
    expect(
      valueText(instance(simpleInteger("synthetic_bench_length", 14))),
    ).toBe("14");
    expect(
      valueText(instance(simpleSecret("synthetic_bench_secret", "hidden"))),
    ).toBe("Not readable");
    expect(valueText(null)).toBe("Not set");
  });
});

describe("readiness PDF: a nested setting and its parents", () => {
  const ENABLED = "synthetic_bench_pdf_enabled";
  const LIMIT = "synthetic_bench_pdf_limit";
  const recommendations = [
    {
      id: "1.1",
      title: "Synthetic limit",
      level: 1 as const,
      settings: [LIMIT],
    },
  ];
  const detail = (
    packRoot: Record<string, unknown>,
    tenantRoot: Record<string, unknown>,
  ) => {
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            name: "Synthetic tenant lock",
            settings: [tenantRoot],
          }),
        ],
      }),
      pack([{ settings: [packRoot] }], recommendations),
      { now: NOW },
    );
    return pageTexts(render(assessment, { exceptions: [] })).join(" ");
  };

  it("names a parent with another option, without the child's value", () => {
    const text = detail(
      choice(ENABLED, "0", [simpleInteger(LIMIT, 5)]),
      choice(ENABLED, "1", [simpleInteger(LIMIT, 5)]),
    );
    expect(text).toContain(
      "Synthetic tenant lock Assigned All Users Parent has another option 5 Parent differs",
    );
  });

  it("shows a recommended value below an unreadable pack parent as not readable", () => {
    const child = simpleInteger(LIMIT, 5);
    const text = detail(
      {
        ...choice(ENABLED, "0", [child]),
        choiceSettingValue: { children: [child] },
      },
      choice(ENABLED, "1", [simpleInteger(LIMIT, 9)]),
    );
    expect(text).toContain(
      "Synthetic tenant lock Assigned All Users 9 Not readable Not readable",
    );
    expect(text).not.toMatch(/All Users 9 5 /);
  });
});

describe("readiness PDF: detail cards and page breaks", () => {
  const holders = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      tenantPolicy({
        name: `Synthetic unassigned holder ${index + 1}`,
        settings: [choice("synthetic_bench_alpha", "1")],
        assignments: [],
      }),
    );
  const assessmentWith = (count: number) =>
    assessBenchmark(
      collection({ policies: holders(count) }),
      pack(
        [{ settings: [choice("synthetic_bench_alpha", "1")] }],
        [
          {
            id: "1.1",
            title: "Synthetic alpha is on",
            level: 1,
            settings: ["synthetic_bench_alpha"],
          },
        ],
      ),
      { now: NOW },
    );

  it("continues a card taller than a page with a caption and its table header", () => {
    const pages = pageTexts(render(assessmentWith(60), { exceptions: [] }));
    const start = pages.findIndex((text) =>
      text.startsWith("05 RESULT DETAIL"),
    );
    const next = pages[start + 1]!;
    expect(
      next.startsWith(
        "1.1 (continued) POLICY ASSIGNMENT CURRENT RECOMMENDED RESULT",
      ),
    ).toBe(true);
    const all = pages.join(" ");
    for (const index of [1, 30, 60])
      expect(all).toContain(
        `Synthetic unassigned holder ${index} Not assigned`,
      );
  });

  it("keeps a card that fits a page in one piece", () => {
    const pages = pageTexts(render(assessmentWith(6), { exceptions: [] }));
    expect(pages.join(" ")).not.toContain("(continued)");
  });
});

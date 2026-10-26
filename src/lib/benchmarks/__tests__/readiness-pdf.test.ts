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
import {
  continuesOnPage,
  fittedFindings,
  headlineHero,
  headlineValue,
  packCoverageText,
  renderReadinessPdf,
  valueText,
  wrapText,
} from "../readiness-pdf";
import jsPDF from "jspdf";
import {
  EXCEPTIONS,
  PACK_POLICY,
  TENANT_POLICY,
  UNASSIGNED_POLICY,
  UNASSIGNED_MATCH,
  UNASSIGNED_OTHER,
  UNASSIGNED_UNREADABLE,
  levelsAssessment,
  richAssessment,
  unassessedAssessment,
  unassignedAssessment,
} from "./export-fixtures";
import { assessBenchmark, combineLevelAssessments } from "../assessment";
import { exceptionsForLevel, type BenchmarkException } from "../exceptions";
import {
  choice,
  collection,
  deviceConfiguration,
  NOW,
  pack,
  simpleInteger,
  simpleSecret,
  tenantPolicy,
} from "./fixtures";
import type { RecordJson } from "../policies";
import { benchmarkCsv, benchmarkSummary } from "../export";
import { buildFixPlan } from "../fix-plan";

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

/** The rows of a CSV, with quoted fields read as one. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      rows.push([...row, field.replace(/\r$/, "")]);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
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
    const manualPage = rich.findIndex((text) =>
      text.includes("APPENDIX Manual Recommendations"),
    );
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
      /Table of Contents Summary 3 What to Do 4 Results 5 Data Basis 6 Result Detail 7 Differs and Not configured 7 Needs review, by step \d+ Appendix: Manual Recommendations, Exceptions and Method \d+/,
    );
    const pdf = Buffer.from(render()).toString("latin1");
    expect(pdf).toContain("/Outlines");
    expect(pdf).toMatch(/\/Title \(Result Detail\)/);
    // The bookmarks hold what the contents page lists.
    for (const title of [
      "Differs and Not configured",
      "Needs review, by step",
      "Method",
    ])
      expect(pdf).toContain(`/Title (${title})`);
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
      "What to do first 6 steps in total 1. Change 1 setting in policy",
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
      "4. Add 1 setting to any assigned Settings Catalog policy for this platform (none holds these settings today)",
      "5. Configure 1 setting in the matching template policy",
      `6. Add 1 setting to policy ${TENANT_POLICY} (assigned to All Users), which already holds settings of the same benchmark area`,
    ].map((text) => steps.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(steps).toContain("Helps with: 1.5");
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

  it("details each result that differs as a card and groups those that need review by step", () => {
    expect(detail).toContain(
      `1.2 Synthetic beta is on synthetic_bench_beta Differs POLICY ASSIGNMENT CURRENT RECOMMENDED RESULT ${TENANT_POLICY} Assigned All Users false true Differs`,
    );
    expect(detail).toContain(
      "No collected policy holds this setting. Not configured 14 Not configured",
    );
    expect(detail).toContain(
      "NEXT STEP Change synthetic_bench_beta in policy Synthetic tenant baseline from false to true.",
    );
    // Not configured names the candidate policy to add the setting to.
    expect(detail).toContain(
      `NEXT STEP Add synthetic_bench_length with the recommended value 14 to policy ${TENANT_POLICY}, which is assigned and already holds settings of the same benchmark area.`,
    );
    // Needs review: one card per step with its policy, its assignment and a
    // row per result (id, name, current, recommended, short reason).
    expect(detail).toContain(
      `Needs review, by step 2 results Step 2 Assign policy ${UNASSIGNED_POLICY}, which would let 1 result be judged: 1 would match. Assign it to a pilot group first. 1 result Policy ${UNASSIGNED_POLICY} Not assigned ID RECOMMENDATION CURRENT RECOMMENDED REASON 2.1 Synthetic gamma is on synthetic_bench_gamma 1 1 Only on unassigned policies The matching value is only on policies that are not assigned.`,
    );
    expect(all).toContain(
      `Step 3 Check 1 setting by hand: the delivered pack holds values that cannot be compared. 1 result ID RECOMMENDATION CURRENT RECOMMENDED REASON 2.2 Synthetic secret value synthetic_bench_secret Held by: ${TENANT_POLICY} (assigned) Not readable Not readable Pack value not comparable`,
    );
    // A result needing review has no card of its own.
    expect(detail).not.toMatch(
      /2\.1 Synthetic gamma is on synthetic_bench_gamma Needs review POLICY/,
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
    // Both results the matching policy would let match are under its step,
    // each with its short reason; the other policies of the mixed result
    // are named with their values and their steps.
    expect(detail).toContain(
      `Step 1 Assign policy ${UNASSIGNED_MATCH}, which would let 2 results be judged: 2 would match. Assign it to a pilot group first. 2 results Policy ${UNASSIGNED_MATCH} Not assigned`,
    );
    expect(detail).toContain(
      "1.1 Synthetic alpha is on synthetic_bench_alpha 1 1 Only on unassigned policies",
    );
    expect(detail).toContain(
      `1.3 Synthetic gamma is on synthetic_bench_gamma In other policies: ${UNASSIGNED_OTHER} (not assigned): 2; ${UNASSIGNED_UNREADABLE} (not assigned): Not readable 1 1 Mixed values, unassigned only Also steps 2, 3`,
    );
    // The full reasons and the unreadable cause close the card once each.
    expect(detail).toContain(
      "The matching value is only on policies that are not assigned. Only policies that are not assigned hold this setting: some match the recommended value and some hold another value. The value is a secret, which Microsoft Graph never returns in a readable form.",
    );
    // A step whose other results sit under an earlier step says so.
    expect(detail).toContain(
      `Step 2 Change 2 settings in policy ${UNASSIGNED_OTHER} to the recommended values before assigning it. 1 of 2 results Policy ${UNASSIGNED_OTHER} Not assigned The other 1 result is listed under an earlier step.`,
    );
    expect(detail).toContain(
      "1.2 Synthetic length is 14 synthetic_bench_length 9 14 Other value, unassigned only Only policies that are not assigned hold this setting, and none of them matches the recommended value.",
    );
    // Once in the reason key and once in the card.
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

  it("names each setting once in its detail card or row", () => {
    expect(detail.split(`${SPACED} Not configured POLICY`).length - 1).toBe(1);
    expect(detail.split("synthetic_bench_gamma").length - 1).toBe(1);
    expect(detail).toContain(
      "SETTING CURRENT RECOMMENDED REASON synthetic_bench_gamma 1 1 Only on unassigned policies The matching value is only on policies that are not assigned.",
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

  it("shows a recommended value next to an unreadable pack value the same way in the PDF, CSV, JSON and fix plan", () => {
    const cases = [
      {
        // A readable child below a parent whose own value cannot be read.
        packRoot: {
          ...choice(ENABLED, "0", [simpleInteger(LIMIT, 5)]),
          choiceSettingValue: { children: [simpleInteger(LIMIT, 5)] },
        },
        target: LIMIT,
        shown: "5 (parent not readable)",
        row: "1.1 Synthetic limit synthetic_bench_pdf_limit Held by: Synthetic tenant lock (assigned) 9 5 (parent not readable) Pack value not comparable",
      },
      {
        // A readable parent above a child that cannot be read.
        packRoot: choice(ENABLED, "0", [simpleSecret(LIMIT)]),
        target: ENABLED,
        shown: "0 (a setting below it is not readable)",
        row: "Synthetic tenant lock Assigned All Users 1 0 (a setting below it is not readable) Differs",
      },
    ];
    for (const { packRoot, target, shown, row } of cases) {
      const assessment = assessBenchmark(
        collection({
          policies: [
            tenantPolicy({
              name: "Synthetic tenant lock",
              settings: [choice(ENABLED, "1", [simpleInteger(LIMIT, 9)])],
            }),
          ],
        }),
        pack(
          [{ settings: [packRoot] }],
          [
            {
              id: "1.1",
              title: "Synthetic limit",
              level: 1,
              settings: [target],
            },
          ],
        ),
        { now: NOW },
      );
      const plan = buildFixPlan(assessment);
      const pdf = pageTexts(render(assessment, { exceptions: [] })).join(" ");
      expect(pdf).toContain(row);
      const csv = parseCsv(benchmarkCsv(assessment, plan));
      expect(csv[1]![csv[0]!.indexOf("Recommended value")]).toBe(shown);
      const [result] = benchmarkSummary(assessment, { plan }).results;
      expect(
        result!.settings.map((setting) => setting.recommendedValue),
      ).toEqual([[shown]]);
      // The plan's step is about the pack root: the same words for the
      // same setting, Not readable for a parent that cannot be read.
      const steps = plan.actions.flatMap((action) => action.settings);
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps)
        expect(step.recommended).toBe(
          step.settingId === target ? shown : "Not readable",
        );
      // No output shows the value without saying what cannot be read.
      expect(pdf).not.toMatch(/ 9 5 (?!\()/);
      expect(JSON.stringify(plan)).not.toMatch(/"recommended":"[05]"/);
    }
  });
});

describe("readiness PDF: detail cards and page breaks", () => {
  // count assigned policies hold another value of one setting: one Differs card.
  const assessmentWith = (count: number) =>
    assessBenchmark(
      collection({
        policies: Array.from({ length: count }, (_, index) =>
          tenantPolicy({
            name: `Synthetic assigned holder ${index + 1}`,
            settings: [choice("synthetic_bench_alpha", "0")],
          }),
        ),
      }),
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
  // One unassigned policy holds the value of count recommendations: one step.
  const waiting = (count: number) => {
    const ids = Array.from(
      { length: count },
      (_, index) => `synthetic_bench_waiting_${index + 1}`,
    );
    return assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            name: "Synthetic waiting policy",
            settings: ids.map((id) => choice(id, "1")),
            assignments: [],
          }),
        ],
      }),
      pack(
        [{ settings: ids.map((id) => choice(id, "1")) }],
        ids.map((id, index) => ({
          id: `1.${index + 1}`,
          title: `Synthetic waiting value ${index + 1}`,
          level: 1 as const,
          settings: [id],
        })),
      ),
      { now: NOW },
    );
  };

  it("continues a card taller than a page with a caption and its table header", () => {
    const pages = pageTexts(render(assessmentWith(60), { exceptions: [] }));
    const start = pages.findIndex((text) =>
      text.startsWith("05 RESULT DETAIL"),
    );
    expect(
      pages[start + 1]!.startsWith(
        "1.1 (continued) POLICY ASSIGNMENT CURRENT RECOMMENDED RESULT",
      ),
    ).toBe(true);
    const all = pages.join(" ");
    for (const index of [1, 30, 60])
      expect(all).toContain(
        `Synthetic assigned holder ${index} Assigned All Users 0 1 Differs`,
      );
  });

  it("continues a step card across pages with a caption and its table header, a row per result", () => {
    const pages = pageTexts(render(waiting(80), { exceptions: [] }));
    const start = pages.findIndex((text) => text.includes("05 RESULT DETAIL"));
    expect(pages[start]).toContain(
      "Needs review, by step 80 results Step 1 Assign policy Synthetic waiting policy, which would let 80 results be judged: 80 would match.",
    );
    expect(
      pages[start + 1]!.startsWith(
        "Step 1, policy Synthetic waiting policy (continued) ID RECOMMENDATION CURRENT RECOMMENDED REASON",
      ),
    ).toBe(true);
    const all = pages.join(" ");
    for (const index of [1, 40, 80])
      expect(all).toContain(
        `1.${index} Synthetic waiting value ${index} synthetic_bench_waiting_${index} 1 1 Only on unassigned policies`,
      );
    // Every row is one result: the step is named once per page, not per row.
    expect(
      all.split("Assign policy Synthetic waiting policy,").length - 1,
    ).toBe(3);
    // The results table points to the page of each row: the last row's page
    // is the last number written on its results page.
    const row = pages.findIndex((entry) =>
      entry.includes(
        "1.80 Synthetic waiting value 80 synthetic_bench_waiting_80",
      ),
    );
    expect(row).toBeGreaterThan(start + 1);
    expect(
      pageWith(pages, "1.80 Synthetic waiting value 80 Needs review"),
    ).toContain(` ${row + 1} Synthetic Bench 1.0.0, Level 1`);
  });

  it("keeps a card that fits a page in one piece", () => {
    const pages = pageTexts(render(assessmentWith(6), { exceptions: [] }));
    expect(pages.join(" ")).not.toContain("(continued)");
  });

  it("puts results without a step into one card per reason", () => {
    const assessment = richAssessment();
    const pages = pageTexts(
      render(assessment, {
        fixPlan: { actions: [], byResult: {}, advice: {}, withoutAction: 2 },
      }),
    );
    const all = pages.join(" ");
    expect(all).toContain(
      "No step Only on unassigned policies 1 result The matching value is only on policies that are not assigned. The plan has no step for these results. ID RECOMMENDATION CURRENT RECOMMENDED REASON 2.1 Synthetic gamma is on",
    );
    expect(all).toContain(
      "No step Pack value not comparable 1 result The delivered pack holds a value for this setting, or a platform list for its policy, that cannot be compared. The plan has no step for these results.",
    );
  });
});

describe("readiness PDF exceptions of a Level 1 with Level 2 comparison", () => {
  const SHARED = "synthetic_bench_shared";
  const levelPack = (level: 1 | 2) =>
    pack(
      [{ settings: [choice(SHARED, "1")] }],
      [
        {
          id: `${level}.1`,
          title: `Synthetic shared at Level ${level}`,
          level,
          settings: [SHARED],
        },
      ],
      level,
    );
  const exception = (
    id: string,
    level: 1 | 2,
    extra: Partial<BenchmarkException> = {},
  ): BenchmarkException => ({
    id,
    benchmark: "synthetic-bench",
    version: "1.0.0",
    level,
    settingId: SHARED,
    owner: `Synthetic owner ${id}`,
    reason: "Synthetic reason",
    expiresOn: "2999-12-31",
    createdAt: "2026-10-01T09:00:00.000Z",
    ...extra,
  });
  const appendix = (exceptions: BenchmarkException[]) => {
    const assessment = combineLevelAssessments(
      ([1, 2] as const).map((level) =>
        assessBenchmark(
          collection({
            policies: [tenantPolicy({ settings: [choice(SHARED, "0")] })],
          }),
          levelPack(level),
          { now: NOW, exceptions: exceptionsForLevel(exceptions, level, 2) },
        ),
      ),
    );
    const pages = pageTexts(render(assessment, { exceptions }));
    return pages[pages.length - 1]!;
  };

  it("names the Level of each exception and the headlines that counted it", () => {
    // Level 1 has its own expired exception, so the Level 2 one is not used there.
    const blocked = appendix([
      exception("one", 1, {
        expiresOn: "2026-10-01",
        createdAt: "2026-09-01T09:00:00.000Z",
      }),
      exception("two", 2),
    ]);
    expect(blocked).toContain("Exceptions 2 recorded");
    expect(blocked).toMatch(
      /SETTING LEVEL OWNER REASON EXPIRES STATUS synthetic_bench_shared 1 Synthetic owner one .* Not in effect synthetic_bench_shared 2 Synthetic owner two .* Applied to Level 2 /,
    );
    expect(blocked).not.toContain("Applied to Level 1");
    // Without its own, Level 1 uses the Level 2 exception too.
    expect(appendix([exception("two", 2)])).toContain(
      "Applied to Level 1 and 2",
    );
  });
});

// Round 47: Level 2 compares both Levels, so the cover leads with both.
describe("readiness PDF: Level 1 and Level 2 compared together", () => {
  const assessment = levelsAssessment();
  const pages = pageTexts(render(assessment, { exceptions: [] }));
  const cover = pages[0]!;

  it("leads the cover with the headline of each Level and what each pack covers", () => {
    expect(assessment.levels.map((level) => level.level)).toEqual([1, 2]);
    expect(cover).toContain(
      "91.7% of 12 assessed Level 1 91.7% of 12 assessed, 3 need review 0 of 3 match Level 2 Nothing was assessed as Matches or Differs",
    );
    expect(cover).toContain("Matching settings, Levels 1 and 2");
    expect(cover).toContain(
      "The Level 1 pack covers 15 settings and the Level 2 pack covers 3 settings.",
    );
    expect(cover).not.toContain("This pack covers");
    expect(cover).not.toContain("Matching settings, Level 2");
  });

  it("names the settings a step helps with, their ids beneath", () => {
    const steps = pageWith(pages, "02 WHAT TO DO");
    expect(steps).toContain(
      "Helps with: Synthetic level 1 setting 12 (Level 1) Setting id: synthetic_bench_level1_12",
    );
    expect(steps).toContain(
      "Helps with: Synthetic level 1 setting 14 (Level 1), Synthetic level 1 setting 15 (Level 1), Synthetic level 2 setting 1 (Level 2)",
    );
    expect(steps).not.toMatch(/Helps with: synthetic_bench/);
  });

  it("counts a step of both Levels in each Level's card as the step's text does", () => {
    const all = pages.join(" ");
    expect(all).toContain(
      "Check device configuration profiles (Windows) for 5 settings not found in the Settings Catalog. 2 of 5 results 3 results of this step are at Level 2, listed with that Level.",
    );
    expect(all).toContain(
      "Check device configuration profiles (Windows) for 5 settings not found in the Settings Catalog. 3 of 5 results 2 results of this step are at Level 1, listed with that Level.",
    );
  });

  it("states what each pack covers in words", () => {
    expect(packCoverageText(assessment.levels)).toBe(
      "The Level 1 pack covers 15 settings and the Level 2 pack covers 3 settings. The full benchmark also has manual and other recommendations; coverage of the full benchmark will be shown once its list is published.",
    );
    const [first] = richAssessment().levels;
    expect(packCoverageText([first!])).toContain("Coverage: 77.8%");
  });
});

describe("readiness PDF: the cover ring", () => {
  it("draws the measure its centre states: the rate of the assessed results, or the matches of all", () => {
    const [first, second] = levelsAssessment().levels;
    const hero = headlineHero(first!.headline.states, first!.headline.rate);
    expect(hero.value).toBe("91.7%");
    expect(hero.fraction).toBe(first!.headline.rate);
    expect(hero.value).toBe(headlineValue(hero.fraction));
    expect(hero.count).toBe("of 12 assessed");
    // Not enough assessed for the rate to lead: matches out of all results.
    const rich = richAssessment().levels[0]!;
    const counts = headlineHero(rich.headline.states, rich.headline.rate);
    expect(counts).toEqual({
      value: "1",
      count: "of 8 match",
      fraction: 1 / 8,
    });
    expect(
      headlineHero(second!.headline.states, second!.headline.rate),
    ).toEqual({ value: "0", count: "of 3 match", fraction: 0 });
  });
});

describe("readiness PDF: no page holding only a spilled block", () => {
  it("decides when a section continues below a spilled block", () => {
    expect(continuesOnPage(true, 40, 255)).toBe(true);
    expect(continuesOnPage(true, 127, 255)).toBe(true);
    expect(continuesOnPage(true, 140, 255)).toBe(false);
    expect(continuesOnPage(false, 10, 255)).toBe(false);
  });

  it("shows fewer key findings rather than move them alone to a page", () => {
    const rows = [7.4, 7.4, 7.4, 7.4];
    expect(fittedFindings(rows, 6, 100)).toEqual({ count: 4, height: 44.1 });
    expect(fittedFindings(rows, 6, 40).count).toBe(3);
    expect(fittedFindings(rows, 6, 10).count).toBe(2);
    expect(fittedFindings([], 0, 100).height).toBe(17.5);
  });

  // differs results that differ and waiting results that need review, in
  // many sections, so the summary and the results table end at every height.
  const sized = (differs: number, waiting: number) => {
    const diff = Array.from(
      { length: differs },
      (_, index) => `synthetic_bench_differs_${index + 1}`,
    );
    const wait = Array.from(
      { length: waiting },
      (_, index) => `synthetic_bench_waiting_${index + 1}`,
    );
    return assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            name: "Synthetic assigned holder",
            settings: diff.map((id) => choice(id, "0")),
          }),
          tenantPolicy({
            name: "Synthetic waiting policy",
            settings: wait.map((id) => choice(id, "1")),
            assignments: [],
          }),
        ],
      }),
      pack(
        [{ settings: [...diff, ...wait].map((id) => choice(id, "1")) }],
        [...diff, ...wait].map((id, index) => ({
          id: `${(index % 6) + 1}.${index + 1}`,
          title: `Synthetic ${id.replace("synthetic_bench_", "").replace("_", " value ")}`,
          level: 1 as const,
          settings: [id],
        })),
      ),
      { now: NOW },
    );
  };

  it("never leaves the key findings or the boxes after the results table alone on a page", () => {
    const spilled: string[] = [];
    for (const differs of [4, 6])
      for (let waiting = 10; waiting <= 36; waiting += 1) {
        const pages = pageTexts(
          render(sized(differs, waiting), { exceptions: [] }),
        );
        pages.forEach((text, index) => {
          const alone =
            (text.includes("Key findings") &&
              !text.includes("01 SUMMARY") &&
              !text.includes("02 WHAT TO DO")) ||
            (text.includes("HOW TO READ THIS REPORT") &&
              !text.includes("03 RESULTS") &&
              !text.includes("(continued)") &&
              !text.includes("04 DATA BASIS"));
          if (alone) spilled.push(`${differs}/${waiting} page ${index + 1}`);
        });
      }
    expect(spilled).toEqual([]);
  }, 30_000);

  // Two Levels judged by settings with every reason: a summary without a
  // sections table that leaves little room for the key findings.
  const fullSummary = (differs: number, nameLength: number) => {
    const name = `Synthetic holder ${"n".repeat(nameLength)}`;
    const diff = Array.from(
      { length: differs },
      (_, index) => `synthetic_bench_differs_${index + 1}`,
    );
    const tenant = collection({
      policies: [
        tenantPolicy({ name, settings: diff.map((id) => choice(id, "0")) }),
        tenantPolicy({
          name: `${name} waiting`,
          settings: [choice("synthetic_bench_waiting_1", "1")],
          assignments: [],
        }),
        tenantPolicy({
          name: `${name} waiting two`,
          settings: [
            choice("synthetic_bench_waiting_2", "1"),
            choice("synthetic_bench_differs_1", "5"),
          ],
          assignments: [],
        }),
        tenantPolicy({
          name: `${name} unknown`,
          settings: [choice("synthetic_bench_unknown", "1")],
          assignmentsStatus: "incomplete",
        }),
        tenantPolicy({
          name: `${name} secret`,
          settings: [
            simpleSecret("synthetic_bench_secret"),
            choice("synthetic_bench_level2_2", "0"),
          ],
        }),
        tenantPolicy({
          name: `${name} other`,
          settings: [choice("synthetic_bench_other", "0")],
          assignments: [],
        }),
      ],
      other: {
        deviceConfigurations: [
          deviceConfiguration("windows10GeneralConfiguration"),
        ],
      },
    });
    const level1 = [
      ...diff,
      "synthetic_bench_waiting_1",
      "synthetic_bench_waiting_2",
      "synthetic_bench_missing_1",
      "synthetic_bench_unknown",
      "synthetic_bench_other",
      "synthetic_bench_missing_2",
    ];
    return combineLevelAssessments([
      assessBenchmark(
        tenant,
        pack([
          {
            settings: [
              ...level1.map((id) => choice(id, "1")),
              simpleSecret("synthetic_bench_secret", "synthetic"),
            ],
          },
        ]),
        { now: NOW },
      ),
      assessBenchmark(
        tenant,
        pack(
          [
            {
              settings: [
                "synthetic_bench_level2_1",
                "synthetic_bench_level2_2",
              ].map((id) => choice(id, "1")),
            },
          ],
          undefined,
          2,
        ),
        { now: NOW },
      ),
    ]);
  };

  it("keeps the key findings on the summary, or the next section below them", () => {
    const alone: string[] = [];
    for (const differs of [4, 5, 6, 7])
      for (const nameLength of [0, 30, 60, 90]) {
        const pages = pageTexts(
          render(fullSummary(differs, nameLength), { exceptions: [] }),
        );
        pages.forEach((text, index) => {
          if (
            text.includes("Key findings") &&
            !text.includes("01 SUMMARY") &&
            !text.includes("02 WHAT TO DO")
          )
            alone.push(`${differs}/${nameLength} page ${index + 1}`);
        });
        // The summary shows at least two findings and names the rest.
        const summary = pageWith(pages, "01 SUMMARY");
        if (summary.includes("Key findings"))
          expect(summary).toMatch(
            /Key findings results that differ, by Level and id Differs synthetic_bench_differs_\d+ Differs synthetic_bench_differs_\d+/,
          );
      }
    expect(alone).toEqual([]);
  }, 30_000);
});

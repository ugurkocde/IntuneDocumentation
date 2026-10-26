import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { READINESS_DISCLAIMER } from "../display";
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

describe("benchmark readiness PDF", () => {
  const rich = pageTexts(render());
  const all = rich.join(" ");

  it("states the disclaimer on the cover and in the footer of every page", () => {
    expect(rich.length).toBeGreaterThan(3);
    for (const [index, text] of rich.entries())
      expect(text, `page ${index + 1}`).toContain(
        `Intune Documentation. ${READINESS_DISCLAIMER}.`,
      );
    expect(rich[0]).toContain(`${READINESS_DISCLAIMER}. The delivered pack`);
  });

  it("carries the manual notice and its URL on every page and next to the manual items", () => {
    for (const [index, text] of rich.entries()) {
      expect(text, `page ${index + 1}`).toContain(
        MANUAL_RECOMMENDATIONS_NOTICE,
      );
      expect(text, `page ${index + 1}`).toContain(MANUAL_RECOMMENDATIONS_URL);
    }
    const manualPage = rich.find((text) =>
      text.includes("Recommendations to check manually"),
    )!;
    expect(manualPage).toContain("Synthetic manual review item");
    // Above the footer as well: the notice card on the manual page.
    expect(manualPage.split(MANUAL_RECOMMENDATIONS_NOTICE).length).toBe(3);
  });

  it("names every Level the results cover on the cover", () => {
    const base = richAssessment();
    const [first] = base.levels;
    const both = {
      ...base,
      levels: [first!, { ...first!, level: 2 as const }],
    };
    const cover = pageTexts(render(both))[0]!;
    expect(cover).toContain("Levels 1 and 2");
  });

  it("shows the cover title, Level, tenant and assessed date", () => {
    const cover = pageTexts(
      render(richAssessment(), { benchmarkName: "Synthetic Workstation" }),
    )[0]!;
    expect(cover).toContain("Synthetic Workstation 1.0.0");
    expect(cover).toContain("Level 1");
    expect(cover).toContain("Synthetic Tenant");
    expect(cover).toContain("2026-10-21 10:00 UTC");
    expect(rich[0]).toContain("Synthetic Bench 1.0.0");
  });

  it("shows the headline with its base on the cover and in the summary", () => {
    expect(rich[0]).toContain("20% of 5 assessed, 2 need review");
    expect(rich[1]).toContain("20% of 5 assessed, 2 need review");
    expect(rich[1]).toContain("40% with 1 exclusion");
  });

  it("shows n/a when nothing is assessed as Matches or Differs", () => {
    const pages = pageTexts(render(unassessedAssessment()));
    expect(pages[0]).toContain("n/a");
    expect(pages[0]).toContain("Nothing was assessed as Matches or Differs");
    expect(pages[0]).not.toMatch(/\b0%/);
    expect(pages[1]).toContain(
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
    expect(without).toContain("Coverage of the full benchmark is not shown");
    expect(without).not.toContain("Coverage: ");
  });

  it("lists every recommendation with its id, delivered title, label and reason", () => {
    for (const id of ["1.1", "1.2", "1.3", "2.1", "2.2", "3.1"])
      expect(all).toContain(id);
    for (const title of ["Synthetic alpha is on", "Synthetic gamma is on"])
      expect(all).toContain(title);
    for (const label of ["Matches", "Differs", "Needs review", "Not assessed"])
      expect(all).toContain(label);
    expect(all).toContain(
      "The matching value is only on policies that are not assigned.",
    );
    expect(all).toContain(
      "The recommendation names a setting outside the pack, so it is not assessed here.",
    );
  });

  it("details the settings behind Differs and Needs review with the tenant policies", () => {
    const detail = rich.find((text) =>
      text.includes("Differs and Needs review"),
    )!;
    expect(detail).toContain(
      `Policy ${TENANT_POLICY}: Assigned, Differs, value false.`,
    );
    expect(detail).toContain(
      `Policy ${UNASSIGNED_POLICY}: Not assigned, Matches, value 1.`,
    );
    expect(detail).toContain("No collected policy holds this setting.");
    expect(detail).not.toContain("Synthetic alpha is on");
  });

  it("lists exceptions with owner, reason, expiry and whether they apply", () => {
    expect(all).toContain("Synthetic Owner");
    expect(all).toContain("Synthetic accepted difference for a pilot.");
    expect(all).toContain("2027-01-31");
    expect(all).toContain("Applied to the headline");
    expect(all).toContain("Not in effect");
  });

  it("never claims compliance, a score or certification and names no pack policy", () => {
    for (const text of [all, ...pageTexts(render(unassessedAssessment()))]) {
      expect(text).not.toMatch(/\bcompliant\b|\bscore\b|\bcertified\b/i);
      expect(text).not.toMatch(/[–—]| - /);
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
    const detail = pages.find((text) =>
      text.includes("Differs and Needs review"),
    )!;
    // The setting's own status says why a match needs review.
    expect(detail).toContain(
      "Matches, on an unassigned policy. The matching value is only on policies that are not assigned.",
    );
    expect(detail).not.toContain("Matches. The matching value");
    expect(detail).toContain(
      "Needs review. Only policies that are not assigned hold this setting, and none of them matches the recommended value.",
    );
    expect(detail).toContain(
      "Needs review. Only policies that are not assigned hold this setting: some match the recommended value and some hold another value.",
    );
    expect(detail).toContain(
      `Policy ${UNASSIGNED_OTHER}: Not assigned, Differs, value 9.`,
    );
    expect(detail).toContain(
      `Policy ${UNASSIGNED_MATCH}: Not assigned, Matches`,
    );
    // Once in the summary reasons, the table and the detail: only for 1.1.
    expect(
      count("The matching value is only on policies that are not assigned."),
    ).toBe(3);
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
  const detail = pages.find((text) =>
    text.includes("Differs and Needs review"),
  )!;

  it("counts settings, not recommendations, in the automatic check summary", () => {
    expect(assessment.basis).toBe("settings");
    const summary = pages[1]!;
    expect(summary).toContain(
      "Level 1: Intune Documentation checks 3 settings of this pack automatically.",
    );
    expect(summary).not.toMatch(/checks \d+ recommendations? of this pack/);
  });

  it("names each setting once in its detail entry", () => {
    expect(detail.split(SPACED).length - 1).toBe(1);
    expect(detail.split("synthetic_bench_gamma").length - 1).toBe(1);
    expect(detail).toContain(
      "synthetic_bench_gamma Needs review Matches, on an unassigned policy.",
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
      "Policy Synthetic tenant lock: Assigned, Parent setting differs.",
    );
    expect(text).toContain("Recommended value: 5");
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
    expect(text).toContain("Recommended value: Not readable");
    expect(text).not.toContain("Recommended value: 5");
    expect(text).toContain(
      "Policy Synthetic tenant lock: Assigned, Not readable.",
    );
  });
});

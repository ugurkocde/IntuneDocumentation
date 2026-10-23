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
  richAssessment,
  unassessedAssessment,
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

  it("shows the headline as Matches out of Matches plus Differs", () => {
    expect(rich[0]).toContain("20%");
    expect(rich[0]).toContain("Matches 1 of 5 (Matches plus Differs)");
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

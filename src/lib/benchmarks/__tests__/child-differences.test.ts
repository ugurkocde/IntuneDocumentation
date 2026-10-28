import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  assessBenchmark,
  withSettingNames,
  type BenchmarkAssessment,
  type Observation,
} from "../assessment";
import {
  assessmentResults,
  type AssessmentResult,
} from "../assessment";
import { holderValueText, resultSettingDetails } from "../display";
import { benchmarkCsv, benchmarkSummary } from "../export";
import { differingSettings } from "../policies";
import { renderReadinessPdf } from "../readiness-pdf";
import { buildFixPlan } from "../fix-plan";
import type { SettingNames } from "../tenant-settings";
import { differenceStates, differenceText } from "../values";
import {
  choice,
  collection,
  groupCollection,
  NOW,
  pack,
  simpleInteger,
  simpleSecret,
  tenantPolicy,
} from "./fixtures";

// Synthetic ids; a root whose own value can match while a child below it differs.
const ROOT = "synthetic_bench_cd_root";
const A = "synthetic_bench_cd_a";
const B = "synthetic_bench_cd_b";
const C = "synthetic_bench_cd_c";
const D = "synthetic_bench_cd_d";
const E = "synthetic_bench_cd_e";
const GROUP = "synthetic_bench_cd_group";
const RULE_1 = "synthetic_bench_cd_rule_1";
const RULE_2 = "synthetic_bench_cd_rule_2";

const NAMES: SettingNames = {
  [ROOT]: {
    name: "Synthetic root",
    options: { [`${ROOT}_1`]: "Enabled", [`${ROOT}_0`]: "Disabled" },
  },
  [A]: {
    name: "Synthetic child A",
    options: { [`${A}_1`]: "On", [`${A}_0`]: "Off" },
  },
  [B]: { name: "Synthetic child B", options: {} },
  [C]: { name: "Synthetic child C", options: {} },
  [D]: { name: "Synthetic child D", options: {} },
  [E]: { name: "Synthetic child E", options: {} },
  [RULE_2]: { name: "Synthetic rule 2", options: {} },
};

const POLICY = "Synthetic tenant policy";

function assess(
  packRoot: Record<string, unknown>,
  tenantRoot: Record<string, unknown>,
  options: { assigned?: boolean; names?: SettingNames; settings?: string[] } = {},
): BenchmarkAssessment {
  return assessBenchmark(
    collection({
      policies: [
        tenantPolicy({
          name: POLICY,
          settings: [tenantRoot],
          ...(options.assigned === false ? { assignments: [] } : {}),
        }),
      ],
    }),
    pack(
      [{ settings: [packRoot] }],
      [
        {
          id: "1.1",
          title: "Synthetic child difference",
          level: 1,
          settings: options.settings ?? [
            String(packRoot.settingDefinitionId),
          ],
        },
      ],
    ),
    { now: NOW, ...(options.names === undefined ? { names: NAMES } : { names: options.names }) },
  );
}

const observation = (assessment: BenchmarkAssessment): Observation =>
  assessment.settings[0]!.observations[0]!;

const result = (assessment: BenchmarkAssessment): AssessmentResult =>
  assessmentResults(assessment)[0]!;

/** Text of every page with whitespace collapsed (as readiness-pdf.test.ts reads it). */
function pdfText(assessment: BenchmarkAssessment): string {
  const bytes = renderReadinessPdf(assessment, {
    renderDate: new Date("2026-10-22T12:00:00.000Z"),
    tenantLabel: "Synthetic Tenant",
    exceptions: [],
  });
  const raw = Buffer.from(bytes);
  const pdf = raw.toString("latin1");
  const pages = [
    ...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Type \/Page\b(?!s)([\s\S]*?)endobj/g),
  ];
  return pages
    .map((match) => {
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
        .join(" ");
    })
    .join(" ")
    .replace(/\s+/g, " ");
}

const ONE_CHILD = {
  pack: choice(ROOT, "1", [choice(A, "1"), simpleInteger(B, 5)]),
  tenant: choice(ROOT, "1", [choice(A, "0"), simpleInteger(B, 5)]),
};

describe("differences below a setting whose own value matches", () => {
  it("names the one differing child with both values", () => {
    const assessment = assess(ONE_CHILD.pack, ONE_CHILD.tenant);
    expect(assessment.settings[0]!.status).toBe("Different");
    expect(observation(assessment).current.text).toBe("Enabled");
    expect(assessment.settings[0]!.recommendedValue.text).toBe("Enabled");
    expect(observation(assessment).differences).toEqual([
      { settingId: A, current: "Off", recommended: "On" },
    ]);
    expect(differenceText(observation(assessment), assessment.settingNames)).toBe(
      "Synthetic child A from Off to On",
    );
    expect(differenceStates(observation(assessment), assessment.settingNames)).toBe(
      "Synthetic child A (current Off, recommended On)",
    );
  });

  it("names two differing children", () => {
    const assessment = assess(
      ONE_CHILD.pack,
      choice(ROOT, "1", [choice(A, "0"), simpleInteger(B, 9)]),
    );
    expect(differenceText(observation(assessment), assessment.settingNames)).toBe(
      "Synthetic child A from Off to On and Synthetic child B from 9 to 5",
    );
  });

  it("names the first three of many and counts the rest", () => {
    const ids = [A, B, C, D, E];
    const assessment = assess(
      choice(
        ROOT,
        "1",
        ids.map((id) => simpleInteger(id, 2)),
      ),
      choice(
        ROOT,
        "1",
        ids.map((id) => simpleInteger(id, 1)),
      ),
    );
    expect(observation(assessment).differences).toHaveLength(5);
    expect(differenceText(observation(assessment), assessment.settingNames)).toBe(
      "Synthetic child A from 1 to 2, Synthetic child B from 1 to 2, Synthetic child C from 1 to 2 and 2 more settings",
    );
    expect(differenceStates(observation(assessment), assessment.settingNames)).toBe(
      "Synthetic child A (current 1, recommended 2); Synthetic child B (current 1, recommended 2); Synthetic child C (current 1, recommended 2); and 2 more settings",
    );
    expect(differenceText(observation(assessment), assessment.settingNames, 4)).toBe(
      "Synthetic child A from 1 to 2, Synthetic child B from 1 to 2, Synthetic child C from 1 to 2, Synthetic child D from 1 to 2 and 1 more setting",
    );
  });

  it("names only the readable differing child next to an unreadable one", () => {
    const assessment = assess(
      ONE_CHILD.pack,
      choice(ROOT, "1", [choice(A, "0"), simpleSecret(B)]),
    );
    expect(assessment.settings[0]!.status).toBe("Different");
    expect(observation(assessment).differences).toEqual([
      { settingId: A, current: "Off", recommended: "On" },
    ]);
    // Without a readable difference nothing is named, and the result needs review.
    const unknown = assess(
      ONE_CHILD.pack,
      choice(ROOT, "1", [choice(A, "1"), simpleSecret(B)]),
    );
    expect(unknown.settings[0]!.result).toBe("Review");
    expect(observation(unknown).differences).toBeUndefined();
  });

  it("says Not configured for a child the policy does not hold", () => {
    const assessment = assess(
      ONE_CHILD.pack,
      choice(ROOT, "1", [simpleInteger(B, 5)]),
    );
    expect(observation(assessment).differences).toEqual([
      { settingId: A, current: "Not configured", recommended: "On" },
    ]);
  });

  it("names nothing below a setting whose own value differs", () => {
    const assessment = assess(
      ONE_CHILD.pack,
      choice(ROOT, "0", [choice(A, "0"), simpleInteger(B, 9)]),
    );
    expect(observation(assessment).current.text).toBe("Disabled");
    expect(observation(assessment).differences).toBeUndefined();
    expect(differenceText(observation(assessment), assessment.settingNames)).toBeNull();
  });

  it("names a differing setting in a group setting collection with one entry", () => {
    const assessment = assess(
      groupCollection(GROUP, [[choice(RULE_1, "1"), choice(RULE_2, "1")]]),
      groupCollection(GROUP, [[choice(RULE_1, "1"), choice(RULE_2, "2")]]),
    );
    expect(assessment.settings[0]!.status).toBe("Different");
    expect(observation(assessment).current.text).toBe("1 entry");
    expect(differenceText(observation(assessment), assessment.settingNames)).toBe(
      "Synthetic rule 2 from 2 to 1",
    );
  });

  it("names no entry of a collection with several, but still says a setting below differs", () => {
    const assessment = assess(
      groupCollection(GROUP, [
        [choice(RULE_1, "1"), choice(RULE_2, "1")],
        [choice(RULE_1, "2"), choice(RULE_2, "2")],
      ]),
      groupCollection(GROUP, [
        [choice(RULE_1, "1"), choice(RULE_2, "2")],
        [choice(RULE_1, "2"), choice(RULE_2, "1")],
      ]),
    );
    expect(assessment.settings[0]!.status).toBe("Different");
    expect(observation(assessment).differences).toBeUndefined();
    const [detail] = resultSettingDetails(assessment, result(assessment));
    expect(holderValueText(detail!.holders[0]!, detail!.recommended)).toBe(
      "2 entries (a setting below differs)",
    );
  });

  it("names a differing child below a nested setting of a recommendation", () => {
    const assessment = assess(
      choice(ROOT, "1", [choice(A, "1", [simpleInteger(B, 5)])]),
      choice(ROOT, "1", [choice(A, "1", [simpleInteger(B, 9)])]),
      { settings: [A] },
    );
    const [detail] = resultSettingDetails(assessment, result(assessment));
    expect(detail!.holders[0]!.current.text).toBe("On");
    expect(detail!.holders[0]!.differences).toEqual([
      { settingId: B, current: "9", recommended: "5" },
    ]);
    expect(
      differingSettings(
        choice(ROOT, "1", [choice(A, "1", [simpleInteger(B, 5)])]) as never,
        choice(ROOT, "0", [choice(A, "1", [simpleInteger(B, 9)])]) as never,
        A,
      ),
    ).toEqual([]);
  });

  it("writes the texts again when names arrive", () => {
    const assessment = assess(ONE_CHILD.pack, ONE_CHILD.tenant, { names: {} });
    expect(observation(assessment).differences).toEqual([
      { settingId: A, current: "0", recommended: "1" },
    ]);
    expect(differenceText(observation(assessment), assessment.settingNames)).toBe(
      `${A} from 0 to 1`,
    );
    const named = withSettingNames(assessment, NAMES);
    expect(differenceText(observation(named), named.settingNames)).toBe(
      "Synthetic child A from Off to On",
    );
  });
});

describe("differences below a setting in the exports", () => {
  it("shows the differing child in the PDF Differs card instead of the same value twice", () => {
    const text = pdfText(assess(ONE_CHILD.pack, ONE_CHILD.tenant));
    expect(text).toContain("Enabled (a setting below differs)");
    expect(text).toContain(
      "Settings below that differ: Synthetic child A (current Off, recommended On).",
    );
    expect(text).not.toMatch(/Enabled Enabled Differs/);
  });

  it("shows the differing child in the PDF review group of an unassigned policy", () => {
    const assessment = assess(ONE_CHILD.pack, ONE_CHILD.tenant, { assigned: false });
    expect(assessment.settings[0]!.reason).toBe("notAssignedDiffers");
    const text = pdfText(assessment);
    expect(text).toContain(
      "Settings below that differ: Synthetic child A (current Off, recommended On).",
    );
    expect(text).toContain("Enabled (a setting below differs)");
    expect(text).not.toMatch(/Enabled Enabled Differs/);
  });

  it("names the differing child with both values in the CSV and the JSON", () => {
    const assessment = assess(
      ONE_CHILD.pack,
      choice(ROOT, "1", [choice(A, "0"), simpleInteger(B, 9)]),
    );
    const csv = benchmarkCsv(assessment);
    expect(csv).toContain(
      `${POLICY}: Enabled (settings below that differ: Synthetic child A (current Off, recommended On); Synthetic child B (current 9, recommended 5))`,
    );
    const json = benchmarkSummary(assessment);
    const policy = json.results[0]!.settings[0]!.policies[0]!;
    expect(policy.comparison).toBe("Differs");
    expect(policy.currentValue).toBe("Enabled (a setting below differs)");
    expect(policy.differences).toEqual([
      { id: A, name: "Synthetic child A", currentValue: "Off", recommendedValue: "On" },
      { id: B, name: "Synthetic child B", currentValue: "9", recommendedValue: "5" },
    ]);
  });

  it("keeps the value of a holder whose own value differs as it is", () => {
    const assessment = assess(
      ONE_CHILD.pack,
      choice(ROOT, "0", [choice(A, "0"), simpleInteger(B, 9)]),
    );
    const policy = benchmarkSummary(assessment).results[0]!.settings[0]!.policies[0]!;
    expect(policy.currentValue).toBe("Disabled");
    expect("differences" in policy).toBe(false);
  });
});

// Round 47 review: a pack root with an unreadable setting below it is shown
// as "Enabled (a setting below it is not readable)"; the step still names
// the differing child instead of "from Enabled to Enabled".
describe("fix plan step for a pack root with an unreadable setting below it", () => {
  it("names the readable differing child", () => {
    const assessment = assess(
      choice(ROOT, "1", [choice(A, "1"), simpleSecret(B)]),
      choice(ROOT, "1", [choice(A, "0")]),
    );
    expect(assessment.settings[0]!.status).toBe("Different");
    expect(assessment.settings[0]!.recommendedValue.text).toBe("Enabled (a setting below it is not readable)");
    const [change] = buildFixPlan(assessment).actions.filter((action) => action.kind === "changeValue");
    expect(change!.settings[0]!.text).toBe(
      `Change the settings below Synthetic root in policy ${POLICY} to the recommended values: Synthetic child A from Off to On.`,
    );
    const detail = resultSettingDetails(assessment, result(assessment))[0]!;
    expect(holderValueText(detail.holders[0]!, detail.recommended)).toBe("Enabled (a setting below differs)");
  });
});

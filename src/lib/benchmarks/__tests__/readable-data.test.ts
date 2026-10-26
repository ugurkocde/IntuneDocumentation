import { describe, expect, it } from "vitest";
import {
  assessBenchmark,
  assessmentResults,
  combineLevelAssessments,
  unnamedSettingIds,
  withSettingNames,
} from "../assessment";
import {
  HERO_MIN_ASSESSED,
  benchmarkName,
  bySeverity,
  coverageStatement,
  headlineLabel,
  matchReachText,
  rateIsHero,
  reachText,
  resultLabel,
  resultSettingDetails,
  stateCountsText,
} from "../display";
import { generateBenchmarkDrafts } from "../drafts";
import { benchmarkCsv, benchmarkSummary } from "../export";
import { summarizeRuns } from "../history";
import { definitionNames } from "../tenant-settings";
import { NOT_CONFIGURED, settingValue, unreadableCause } from "../values";
import {
  NOW,
  choice,
  collection,
  groupCollection,
  pack,
  simpleInteger,
  simpleSecret,
  tenantPolicy,
} from "./fixtures";
import { richAssessment } from "./export-fixtures";

const ALPHA = "synthetic_data_alpha";
const BETA = "synthetic_data_beta";
const GAMMA = "synthetic_data_gamma";
const GROUP_ID = "00000000-0000-0000-0000-0000000000bb";
const EXCLUDED_ID = "00000000-0000-0000-0000-0000000000cc";

// A settings row as Graph returns it with $expand=settingDefinitions.
function withDefinitions(item: Record<string, unknown>, definitions: unknown[]) {
  const settings = item.settings as Array<Record<string, unknown>>;
  return { ...item, settings: settings.map((row) => ({ ...row, settingDefinitions: definitions })) };
}

const ALPHA_DEFINITION = {
  id: ALPHA,
  displayName: "Synthetic alpha toggle",
  options: [
    { itemId: `${ALPHA}_0`, displayName: "Synthetic off" },
    { itemId: `${ALPHA}_1`, displayName: "Synthetic on" },
  ],
};

function namedAssessment() {
  const data = collection({
    policies: [
      withDefinitions(
        tenantPolicy({
          name: "Synthetic named baseline",
          settings: [choice(ALPHA, "0")],
          assignments: [
            { id: "a1", target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: GROUP_ID } },
            { id: "a2", target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: EXCLUDED_ID } },
          ],
        }),
        [ALPHA_DEFINITION],
      ),
      tenantPolicy({ name: "Synthetic matching baseline", settings: [simpleInteger(BETA, 5)] }),
    ],
  });
  data.groupNames = new Map([
    [GROUP_ID, "Synthetic pilot"],
    [EXCLUDED_ID, "Synthetic kiosks"],
  ]);
  return assessBenchmark(
    data,
    pack(
      [{ settings: [choice(ALPHA, "1"), simpleInteger(BETA, 5), choice(GAMMA, "1")] }],
      [
        { id: "1.1", title: "Synthetic recommendation one", level: 1, settings: [ALPHA] },
        { id: "1.2", title: "Synthetic recommendation two", level: 1, settings: [BETA] },
        { id: "1.3", title: "Synthetic recommendation three", level: 1, settings: [GAMMA] },
      ],
    ),
    { now: NOW },
  );
}

describe("readable setting names", () => {
  it("reads names and option names from the collected settingDefinitions", () => {
    const assessment = namedAssessment();
    expect(assessment.settingNames[ALPHA]).toEqual({
      name: "Synthetic alpha toggle",
      options: { [`${ALPHA}_0`]: "Synthetic off", [`${ALPHA}_1`]: "Synthetic on" },
    });
    // Settings the tenant does not hold, or holds without definitions, wait for Graph.
    expect(unnamedSettingIds(assessment)).toEqual([BETA, GAMMA]);
  });

  it("adds names from the Graph lookup without changing a verdict, and falls back to the id", () => {
    const assessment = namedAssessment();
    const named = withSettingNames(
      assessment,
      definitionNames([{ id: GAMMA, displayName: "Synthetic gamma", options: [{ itemId: `${GAMMA}_1`, displayName: "Synthetic enabled" }] }]),
    );
    expect(named.recommendations.map((item) => item.result)).toEqual(
      assessment.recommendations.map((item) => item.result),
    );
    expect(unnamedSettingIds(named)).toEqual([BETA]);
    const gamma = named.settings.find((finding) => finding.settingId === GAMMA)!;
    expect(gamma.recommendedValue.text).toBe("Synthetic enabled");
    const details = resultSettingDetails(named, assessmentResults(named)[1]!);
    expect(details[0]!.name).toBe(BETA);
  });

  it("ignores definitions without an id or a display name", () => {
    expect(definitionNames([{ id: ALPHA }, { displayName: "Synthetic orphan" }, null, "text"])).toEqual({});
  });
});

describe("current against recommended values", () => {
  it("shows the tenant's option by its display name next to the recommended one", () => {
    const finding = namedAssessment().settings.find((item) => item.settingId === ALPHA)!;
    expect(finding.recommendedValue.text).toBe("Synthetic on");
    expect(finding.observations[0]!.current).toMatchObject({ text: "Synthetic off" });
    expect(finding.observations[0]!.current.raw).toMatchObject({ settingDefinitionId: ALPHA });
  });

  it("reads Not configured for an absent setting and labels a Missing result so", () => {
    const assessment = namedAssessment();
    const gamma = assessment.settings.find((item) => item.settingId === GAMMA)!;
    expect(gamma.status).toBe("Missing");
    expect(resultLabel(gamma)).toBe(NOT_CONFIGURED);
    expect(resultLabel(assessment.recommendations[2]!)).toBe(NOT_CONFIGURED);
    expect(resultLabel(assessment.recommendations[0]!)).toBe("Differs");
    const [details] = resultSettingDetails(assessment, assessmentResults(assessment)[2]!);
    expect(details!.holders).toEqual([]);
  });

  it("names the unreadable cause where the engine knows it", () => {
    expect(unreadableCause(simpleSecret(ALPHA) as never)).toBe("secret");
    expect(unreadableCause(simpleInteger(ALPHA, "[Redacted]") as never)).toBe("redacted");
    expect(unreadableCause(simpleInteger(ALPHA, "five") as never)).toBe("wrongType");
    expect(unreadableCause({ "@odata.type": "#microsoft.graph.syntheticUnknownInstance", settingDefinitionId: ALPHA })).toBe(
      "undocumented",
    );
    expect(unreadableCause(choice(ALPHA, "1") as never)).toBeNull();
    expect(settingValue(simpleSecret(ALPHA) as never, ALPHA)).toMatchObject({ text: "Not readable", cause: "secret" });
    // A nested value inside a group collection is found below its root.
    const root = groupCollection("synthetic_data_group", [[simpleInteger(BETA, 3)]]);
    expect(settingValue(root as never, BETA).text).toBe("3");
    expect(settingValue(root as never, GAMMA).text).toBe(NOT_CONFIGURED);
    // A root with a child that cannot be read may hold the setting unseen.
    const hidden = groupCollection("synthetic_data_group", [[simpleSecret(BETA)]]);
    expect(settingValue(hidden as never, GAMMA)).toMatchObject({ text: "Not readable", cause: "secret" });
  });
});

describe("assignment reach", () => {
  it("carries resolved targets and exclusions, so a match says where it applies", () => {
    const assessment = namedAssessment();
    const alpha = assessment.settings.find((item) => item.settingId === ALPHA)!;
    expect(alpha.observations[0]!.reach).toEqual({
      targets: ["Group: Synthetic pilot"],
      exclusions: ["Group: Synthetic kiosks"],
      removals: [],
      filters: 0,
    });
    const beta = assessment.settings.find((item) => item.settingId === BETA)!;
    expect(matchReachText(beta, BETA, beta.result)).toBe(
      "Matches, policy Synthetic matching baseline, assigned to All Users",
    );
    // Only a Matches result says where it applies.
    expect(matchReachText(beta, BETA, "Review")).toBeNull();
    expect(matchReachText(alpha, ALPHA, "Pass")).toBeNull();
    const [details] = resultSettingDetails(assessment, assessmentResults(assessment)[0]!);
    expect(details!.holders[0]!.assignedTo).toBe(
      "assigned to Group: Synthetic pilot, excluding Group: Synthetic kiosks",
    );
  });
});

describe("reach text", () => {
  it("never names an excluded group as a target", () => {
    const both = "00000000-0000-0000-0000-0000000000b0";
    const data = collection({
      policies: [
        tenantPolicy({
          name: "Synthetic reach",
          settings: [choice(ALPHA, "1")],
          assignments: [
            { id: "a1", target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: both } },
            {
              id: "a2",
              target: {
                "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
                deviceAndAppManagementAssignmentFilterId: "00000000-0000-0000-0000-0000000000f1",
                deviceAndAppManagementAssignmentFilterType: "include",
              },
            },
            { id: "a3", target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: both } },
          ],
        }),
      ],
    });
    data.groupNames = new Map([[both, "Synthetic both"]]);
    const [observation] = assessBenchmark(data, pack([{ settings: [choice(ALPHA, "1")] }]), { now: NOW }).settings[0]!
      .observations;
    expect(reachText(observation!)).toBe("assigned to All Devices, excluding Group: Synthetic both, 1 assignment filter");
    expect(reachText({ assignment: "unknown", reach: { targets: [], exclusions: [], removals: [], filters: 0, uncertainty: "unresolved" } })).toBe(
      "assignment unknown: effective targeting could not be resolved",
    );
  });
});

describe("honest headline data", () => {
  it("counts every state and the assessed base", () => {
    const [level] = richAssessment().levels;
    expect(level!.headline.states).toEqual({
      matches: 1,
      differs: 1,
      notConfigured: 3,
      needsReview: 2,
      notAssessed: 1,
      assessed: 5,
      total: 8,
    });
    expect(stateCountsText(level!.headline.states)).toBe(
      "1 matches, 1 differs, 3 not configured, 2 needs review, 1 not assessed",
    );
  });

  it("lets a percentage lead only with enough assessed results", () => {
    const states = (assessed: number, total: number) => ({ assessed, total });
    expect(rateIsHero(states(1, 88))).toBe(false);
    expect(rateIsHero(states(HERO_MIN_ASSESSED - 1, HERO_MIN_ASSESSED))).toBe(false);
    expect(rateIsHero(states(HERO_MIN_ASSESSED, 100))).toBe(false);
    expect(rateIsHero(states(25, 100))).toBe(true);
    expect(rateIsHero(states(0, 0))).toBe(false);
  });
});

describe("Level 2 together with Level 1", () => {
  const level1 = () =>
    pack(
      [{ settings: [choice(ALPHA, "1"), simpleInteger(BETA, 5)] }],
      [
        { id: "1.1", title: "Synthetic level one alpha", level: 1, settings: [ALPHA] },
        { id: "1.2", title: "Synthetic level one beta", level: 1, settings: [BETA] },
      ],
      1,
    );
  // A delta pack without recommendations: judged by settings.
  const level2 = () => pack([{ settings: [choice(GAMMA, "1")] }], undefined, 2);
  const data = () =>
    collection({ policies: [tenantPolicy({ settings: [choice(ALPHA, "1"), simpleInteger(BETA, 4)] })] });

  it("shows both Levels, each with its own basis, keys kept unique", () => {
    const parts = [level1(), level2()].map((part) => assessBenchmark(data(), part, { now: NOW }));
    const combined = combineLevelAssessments(parts);
    expect(combined.level).toBe(2);
    expect(combined.basis).toBe("mixed");
    expect(headlineLabel(combined.basis)).toBe("Matching results");
    expect(combined.levels.map((level) => [level.level, level.headline.basis])).toEqual([
      [1, "recommendations"],
      [2, "settings"],
    ]);
    expect(new Set(combined.settings.map((finding) => finding.key)).size).toBe(combined.settings.length);
    expect(combined.settings.map((finding) => [finding.key, finding.packLevel])).toEqual([
      ["L1/0:0", 1],
      ["L1/0:1", 1],
      ["L2/0:0", 2],
    ]);
    expect(assessmentResults(combined).map((item) => [item.level, item.kind, item.id, item.result])).toEqual([
      [1, "recommendation", "1.1", "Pass"],
      [1, "recommendation", "1.2", "Fail"],
      [2, "setting", GAMMA, "Fail"],
    ]);
    // Stored runs are those of each Level compared alone, with its own digest.
    const runs = summarizeRuns(combined, (level) => `sha256:${String(level).repeat(64)}`);
    expect(runs.map((run) => [run.level, run.basis, run.packDigest.slice(-1), run.results])).toEqual([
      [1, "recommendations", "1", [["1.1", "pass", []], ["1.2", "fail", [BETA]]]],
      [2, "settings", "2", [[GAMMA, "fail", [GAMMA]]]],
    ]);
    expect(summarizeRuns(parts[0]!, "sha256:x")).toEqual(
      summarizeRuns(combined, "sha256:x").filter((run) => run.level === 1),
    );
    // Drafts name each pack's Level; the CSV lists both Levels.
    const drafts = generateBenchmarkDrafts(combined, [level1(), level2()]);
    expect(drafts.drafts.map((draft) => draft.fileName)).toEqual(["01-synthetic-bench-1.0.0-L2-draft-1.json"]);
    const csv = benchmarkCsv(combined).split("\r\n");
    expect(csv.filter((line) => line.startsWith("synthetic-bench,1.0.0,2,2,Setting,"))).toHaveLength(1);
    expect(benchmarkSummary(combined).results.map((item) => item.level)).toEqual([1, 1, 2]);
  });

  it("refuses parts of another benchmark version or two parts of one Level", () => {
    const one = assessBenchmark(data(), level1(), { now: NOW });
    expect(() => combineLevelAssessments([one, one])).toThrow(/Level 1/);
    expect(() => combineLevelAssessments([one, { ...one, version: "9.9.9" }])).toThrow(/one benchmark version/);
    expect(combineLevelAssessments([one])).toBe(one);
  });
});

describe("severity order and copy", () => {
  it("lists Differs first, then Needs review, Not assessed and Matches, by id within", () => {
    const rows = [
      { result: "Pass" as const, id: "1.10" },
      { result: "Review" as const, id: "1.2" },
      { result: "Fail" as const, id: "1.9" },
      { result: "Not assessed" as const, id: "1.1" },
      { result: "Fail" as const, id: "1.10" },
    ];
    expect([...rows].sort(bySeverity).map((row) => `${row.result} ${row.id}`)).toEqual([
      "Fail 1.9",
      "Fail 1.10",
      "Review 1.2",
      "Not assessed 1.1",
      "Pass 1.10",
    ]);
  });

  it("normalises benchmark names and states pack coverage without a list", () => {
    expect(benchmarkName("CIS Synthetic Bench Benchmark")).toBe("Synthetic Bench");
    expect(benchmarkName("Synthetic Bench")).toBe("Synthetic Bench");
    expect(benchmarkName("CIS Benchmark")).toBe("CIS Benchmark");
    const [level] = richAssessment({ list: false }).levels;
    expect(coverageStatement(level!)).toBe(
      "This pack covers 8 recommendations. The full benchmark also has manual and other recommendations; coverage of the full benchmark will be shown once its list is published.",
    );
  });
});

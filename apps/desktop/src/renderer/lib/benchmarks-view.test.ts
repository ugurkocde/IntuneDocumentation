import { describe, expect, it } from "vitest";
import { SYNTHETIC_CATALOG, syntheticAssessment } from "../__fixtures__/benchmarks";
import {
  catalogChoices,
  differingSettingIds,
  filterRows,
  levelsLabel,
  missingSettings,
  reasonCounts,
  resolveSelection,
  reviewRows,
  toAssessment,
} from "./benchmarks-view";

describe("toAssessment", () => {
  it("accepts the engine's assessment and refuses anything without its lists", () => {
    const assessment = syntheticAssessment();
    expect(toAssessment(JSON.parse(JSON.stringify(assessment)))).toEqual(assessment);
    const { recommendations: _omit, ...partial } = assessment;
    expect(() => toAssessment(partial)).toThrow("could not be read");
    expect(() => toAssessment({ ...assessment, level: 3 })).toThrow("could not be read");
    expect(() => toAssessment(null)).toThrow("could not be read");
  });
});

describe("catalog selection", () => {
  it("groups versions per benchmark, newest first, and keeps the selection valid", () => {
    const choices = catalogChoices(SYNTHETIC_CATALOG);
    expect(choices.map((choice) => choice.id)).toEqual(["synthetic-bench", "synthetic-bench-mobile"]);
    expect(choices[0]!.versions.map((item) => item.version)).toEqual(["2.0.0", "1.0.0"]);
    expect(resolveSelection(choices, {})).toEqual({ benchmark: "synthetic-bench", version: "2.0.0", level: 1 });
    expect(resolveSelection(choices, { benchmark: "synthetic-bench", version: "2.0.0", level: 2 })?.level).toBe(2);
    // A Level the version does not have falls back to its first Level.
    expect(resolveSelection(choices, { benchmark: "synthetic-bench", version: "1.0.0", level: 2 })).toEqual({
      benchmark: "synthetic-bench",
      version: "1.0.0",
      level: 1,
    });
    expect(resolveSelection([], {})).toBeNull();
  });

  it("sorts versions numerically", () => {
    const choices = catalogChoices({
      benchmarks: ["1.2.0", "1.10.0", "1.9.1"].map((version) => ({
        id: "synthetic-bench",
        name: "Synthetic",
        version,
        levels: [1 as const],
      })),
    });
    expect(choices[0]!.versions.map((item) => item.version)).toEqual(["1.10.0", "1.9.1", "1.2.0"]);
  });
});

describe("review rows", () => {
  it("lists recommendations in id order with their findings", () => {
    const rows = reviewRows(syntheticAssessment({ count: 12 }));
    expect(rows.slice(0, 3).map((row) => row.id)).toEqual(["1.1.1", "1.2.10", "2.1.2"]);
    const differs = rows.find((row) => row.id === "2.1.2")!;
    expect(differs.result).toBe("Fail");
    expect(differs.findings.map((finding) => finding.settingId)).toEqual([
      "device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2",
    ]);
  });

  it("lists settings when the pack carries no recommendations", () => {
    const rows = reviewRows(syntheticAssessment({ count: 6, basis: "settings" }));
    // The Not assessed recommendation has no finding, so five settings remain.
    expect(rows).toHaveLength(5);
    expect(rows[0]!.title).toBe(rows[0]!.id);
    expect(rows[0]!.context).toBe("Synthetic pack policy");
  });

  it("filters by result, Level and search over ids, titles and setting ids", () => {
    const rows = reviewRows(syntheticAssessment({ count: 12, levels: [1, 2] }));
    expect(filterRows(rows, { result: "Fail", level: "all", query: "" })).toHaveLength(4);
    expect(filterRows(rows, { result: "Fail", level: 2, query: "" })).toHaveLength(2);
    expect(filterRows(rows, { result: "all", level: "all", query: "SETTING_11" }).map((row) => row.id)).toEqual([
      "2.2.11",
    ]);
    expect(filterRows(rows, { result: "all", level: "all", query: "recommendation 3" }).map((row) => row.id)).toEqual([
      "3.1.3",
    ]);
  });

  it("counts the reasons of results outside the headline", () => {
    const rows = reviewRows(syntheticAssessment({ count: 12, complete: false }));
    expect(reasonCounts(rows, "Review")).toEqual([
      { reason: "collectionIncomplete", count: 2 },
      { reason: "notAssigned", count: 1 },
      { reason: "unreadableValue", count: 1 },
    ]);
    expect(reasonCounts(rows, "Not assessed")).toEqual([{ reason: "settingOutsidePack", count: 2 }]);
  });
});

describe("drafts and exceptions", () => {
  it("counts missing settings only for a complete collection", () => {
    expect(missingSettings(syntheticAssessment({ count: 12 }))).toBe(2);
    const stale = syntheticAssessment({ count: 12 });
    stale.collection = { ...stale.collection, complete: false };
    expect(missingSettings(stale)).toBe(0);
  });

  it("offers exceptions for settings whose result is Differs", () => {
    expect(differingSettingIds(syntheticAssessment({ count: 12 })).map((id) => id.split("_").pop())).toEqual([
      "2",
      "3",
      "8",
      "9",
    ]);
    expect(
      differingSettingIds(syntheticAssessment({ count: 12, basis: "settings" })).map((id) => id.split("_").pop()),
    ).toEqual(["2", "3", "8", "9"]);
  });

  it("offers the nested child a recommendation checks, not its root, in recommendation mode", () => {
    const assessment = syntheticAssessment({ count: 2 });
    const differs = assessment.recommendations.find((item) => item.result === "Fail")!;
    const root = assessment.settings.find((finding) => finding.key === differs.findingKeys[0])!.settingId;
    const child = `${root}_synthetic_child`;
    differs.settings = differs.settings.map((setting) => ({ ...setting, id: child }));
    expect(differingSettingIds(assessment)).toEqual([child]);
    expect(differingSettingIds({ ...assessment, basis: "settings" })).toEqual([root]);
  });
});

describe("levelsLabel", () => {
  it("names the Levels the results show, or the compared Level", () => {
    expect(levelsLabel(syntheticAssessment())).toBe("Level 1");
    expect(levelsLabel(syntheticAssessment({ levels: [2] }))).toBe("Level 2");
    expect(levelsLabel(syntheticAssessment({ levels: [1, 2], level: 2 }))).toBe("Levels 1 and 2");
    expect(levelsLabel({ ...syntheticAssessment({ level: 2 }), levels: [] })).toBe("Level 2");
  });
});

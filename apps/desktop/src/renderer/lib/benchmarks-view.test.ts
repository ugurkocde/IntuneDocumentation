import { describe, expect, it } from "vitest";
import { SYNTHETIC_CATALOG, syntheticAssessment, withExceptionUses } from "../__fixtures__/benchmarks";
import {
  catalogChoices,
  exceptionChoiceLabel,
  exceptionChoiceSetting,
  exceptionChoices,
  exceptionReaches,
  filterRows,
  formatDay,
  levelsLabel,
  missingSettings,
  reasonCounts,
  resolveSelection,
  reviewRows,
  rowExceptionBadge,
  sortRows,
  stateCountsOf,
  toAssessment,
  withMinusSign,
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

  it("refuses a view without its fix plan", () => {
    const { fixPlan: _plan, ...withoutPlan } = syntheticAssessment();
    expect(() => toAssessment(withoutPlan)).toThrow("could not be read");
    expect(() => toAssessment({ ...syntheticAssessment(), fixPlan: { actions: "none", byResult: {} } })).toThrow(
      "could not be read",
    );
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
  it("lists recommendations most severe first, in id order within a result, with their findings", () => {
    const rows = reviewRows(syntheticAssessment({ count: 12 }));
    // Differs, then Not configured, Needs review, Not assessed and Matches.
    expect(rows.slice(0, 4).map((row) => row.id)).toEqual(["2.1.2", "8.1.8", "3.1.3", "9.1.9"]);
    expect([...new Set(rows.map((row) => row.result))]).toEqual(["Fail", "Review", "Not assessed", "Pass"]);
    const differs = rows.find((row) => row.id === "2.1.2")!;
    expect(differs.result).toBe("Fail");
    expect(differs.findings.map((finding) => finding.settingId)).toEqual([
      "device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2",
    ]);
  });

  it("lists settings by their display name when the pack carries no recommendations", () => {
    const rows = reviewRows(syntheticAssessment({ count: 7, basis: "settings" }));
    // The Not assessed recommendation has no finding, so six settings remain.
    expect(rows).toHaveLength(6);
    const named = rows.find((row) => row.id.endsWith("_setting_2"))!;
    expect(named.title).toBe("Synthetic setting 2");
    expect(named.context).toBe("Synthetic pack policy");
    // Without a delivered or collected name, the title is the setting id.
    const unnamed = rows.find((row) => row.id.endsWith("_setting_7"))!;
    expect(unnamed.title).toBe(unnamed.id);
  });

  it("labels each row with its headline state, Not configured for missing settings", () => {
    const rows = reviewRows(syntheticAssessment({ count: 12 }));
    const byId = (id: string) => rows.find((row) => row.id === id)!;
    expect([byId("2.1.2").state, byId("2.1.2").label]).toEqual(["differs", "Differs"]);
    expect([byId("3.1.3").state, byId("3.1.3").label]).toEqual(["notConfigured", "Not configured"]);
    expect([byId("4.1.4").state, byId("4.1.4").label]).toEqual(["needsReview", "Needs review"]);
    expect([byId("5.1.5").state, byId("5.1.5").label]).toEqual(["notAssessed", "Not assessed"]);
    expect([byId("1.1.1").state, byId("1.1.1").label]).toEqual(["matches", "Matches"]);
    // The counts agree with the engine's headline states.
    const { states } = syntheticAssessment({ count: 12 }).levels[0]!.headline;
    expect(stateCountsOf(rows)).toEqual({
      matches: states.matches,
      differs: states.differs,
      notConfigured: states.notConfigured,
      needsReview: states.needsReview,
      notAssessed: states.notAssessed,
    });
  });

  it("filters by state, Level, fix plan step and search over names, ids and setting ids", () => {
    const rows = reviewRows(syntheticAssessment({ count: 12, levels: [1, 2] }));
    const all = { state: "all", level: "all", query: "" } as const;
    expect(filterRows(rows, { ...all, state: "differs" })).toHaveLength(2);
    expect(filterRows(rows, { ...all, state: "notConfigured" })).toHaveLength(2);
    // Settings 2 and 8 differ, both on Level 2.
    expect(filterRows(rows, { ...all, state: "differs", level: 2 })).toHaveLength(2);
    expect(filterRows(rows, { ...all, state: "differs", level: 1 })).toHaveLength(0);
    expect(filterRows(rows, { ...all, query: "SETTING_11" }).map((row) => row.id)).toEqual(["2.2.11"]);
    expect(filterRows(rows, { ...all, query: "recommendation 3" }).map((row) => row.id)).toEqual(["3.1.3"]);
    // Setting display names are searched too.
    expect(filterRows(rows, { ...all, query: "synthetic setting 5" }).map((row) => row.id)).toEqual(["5.1.5"]);
    const keys = new Set(rows.filter((row) => row.state === "notConfigured").map((row) => row.key));
    expect(filterRows(rows, { ...all, keys }).map((row) => row.id)).toEqual(["3.1.3", "9.1.9"]);
  });

  it("sorts by severity by default and by id on request", () => {
    const rows = reviewRows(syntheticAssessment({ count: 12 }));
    expect(sortRows(rows, "id").map((row) => row.id).slice(0, 4)).toEqual(["1.1.1", "1.2.10", "2.1.2", "2.2.11"]);
    // Differs and Not configured stay grouped inside the Differs result.
    expect(sortRows(rows, "severity").map((row) => row.state).slice(0, 4)).toEqual([
      "differs",
      "differs",
      "notConfigured",
      "notConfigured",
    ]);
    expect(sortRows(sortRows(rows, "id"), "severity").map((row) => row.key)).toEqual(rows.map((row) => row.key));
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

  it("offers exceptions for settings whose result is Differs, by recommendation id and name", () => {
    const choices = exceptionChoices(syntheticAssessment({ count: 12 }));
    expect(choices.map((choice) => choice.settingId.split("_").pop())).toEqual(["2", "3", "8", "9"]);
    // Labelled by recommendation id and title, the setting on the second line.
    expect(choices.map(exceptionChoiceLabel)).toEqual([
      "2.1.2 Synthetic recommendation 2",
      "3.1.3 Synthetic recommendation 3",
      "8.1.8 Synthetic recommendation 8",
      "9.1.9 Synthetic recommendation 9",
    ]);
    expect(exceptionChoiceSetting(choices[0]!)).toBe(
      "Synthetic setting 2 (device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2)",
    );
    // A setting without a name is shown by its id once.
    const unnamed = exceptionChoices(syntheticAssessment({ count: 24 })).find((choice) => choice.settingId.endsWith("_21"))!;
    expect(exceptionChoiceSetting(unnamed)).toBe(unnamed.settingId);
    // Several recommendations checking one setting.
    expect(
      exceptionChoiceLabel({ ...choices[0]!, recommendationIds: ["1.1", "1.2"], recommendationTitles: ["Synthetic A", "Synthetic B"] }),
    ).toBe("1.1 Synthetic A and 1 more");
    const bySettings = exceptionChoices(syntheticAssessment({ count: 12, basis: "settings" }));
    expect(bySettings.map((choice) => choice.settingId.split("_").pop())).toEqual(["2", "3", "8", "9"]);
    // Without recommendation ids the name alone labels the setting.
    expect(exceptionChoiceLabel(bySettings[0]!)).toBe("Synthetic setting 2");
  });

  it("offers the nested child a recommendation checks, not its root, in recommendation mode", () => {
    const assessment = syntheticAssessment({ count: 2 });
    const differs = assessment.recommendations.find((item) => item.result === "Fail")!;
    const root = assessment.settings.find((finding) => finding.key === differs.findingKeys[0])!.settingId;
    const child = `${root}_synthetic_child`;
    differs.settings = differs.settings.map((setting) => ({ ...setting, id: child }));
    expect(exceptionChoices(assessment).map((choice) => choice.settingId)).toEqual([child]);
    const bySettings = {
      ...assessment,
      basis: "settings" as const,
      levels: assessment.levels.map((level) => ({ ...level, headline: { ...level.headline, basis: "settings" as const } })),
    };
    expect(exceptionChoices(bySettings).map((choice) => choice.settingId)).toEqual([root]);
  });
});

describe("display text", () => {
  it("formats exception dates and writes true minus signs", () => {
    expect(formatDay("2027-03-31")).toBe(new Date(2027, 2, 31).toLocaleDateString(undefined, { dateStyle: "medium" }));
    expect(formatDay("not a date")).toBe("not a date");
    expect(withMinusSign("-43.0 pp")).toBe("\u221243.0 pp");
    expect(withMinusSign("+2.0 pp")).toBe("+2.0 pp");
    expect(withMinusSign("First comparison")).toBe("First comparison");
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

describe("exception badges", () => {
  const setting = (n: number) => `device_vendor_msft_policy_config_synthetic_area_synthetic_setting_${n}`;
  const stored = (id: string, n: number, extra: Record<string, unknown> = {}) => ({
    id,
    benchmark: "synthetic-bench",
    version: "2.0.0",
    level: 1 as const,
    settingId: setting(n),
    owner: "Synthetic Owner",
    reason: "Synthetic reason",
    expiresOn: "2999-12-31",
    createdAt: "2026-10-01T09:00:00.000Z",
    ...extra,
  });
  const rowOf = (view: ReturnType<typeof syntheticAssessment>, id: string) =>
    reviewRows(view).find((row) => row.settings[0]!.id === setting(Number(id)))!;

  it("says accepted only for a result the engine credited, and names the reason otherwise", () => {
    const exceptions = [stored("e2", 2), stored("e8", 8, { expiresOn: "2026-10-01" }), stored("e4", 4)];
    const byId = new Map(exceptions.map((item) => [item.id, item]));
    const view = withExceptionUses(syntheticAssessment(), {
      [setting(2)]: { id: "e2", applies: true },
      [setting(8)]: { id: "e8", applies: false },
      // Setting 4 needs review: an applying exception is not counted.
      [setting(4)]: { id: "e4", applies: true },
    });
    const at = view.assessedAt;
    expect(rowExceptionBadge(rowOf(view, "2"), byId, at)).toMatchObject({
      label: `Accepted until ${formatDay("2999-12-31")}`,
      tone: "info",
      accepted: true,
    });
    expect(rowExceptionBadge(rowOf(view, "8"), byId, at)).toMatchObject({
      label: `Exception expired ${formatDay("2026-10-01")}`,
      accepted: false,
    });
    expect(rowExceptionBadge(rowOf(view, "4"), byId, at)).toMatchObject({
      label: `Exception until ${formatDay("2999-12-31")}, not counted`,
      tone: "warning",
      accepted: false,
    });
    // Recorded after the comparison: not yet applied.
    const later = withExceptionUses(syntheticAssessment(), { [setting(2)]: { id: "e2", applies: false } });
    expect(rowExceptionBadge(rowOf(later, "2"), byId, at)!.label).toBe("Exception recorded after this comparison");
    // Nothing while the list does not hold the exception yet.
    expect(rowExceptionBadge(rowOf(view, "2"), new Map(), at)).toBeNull();
    // Nothing without an exception in effect.
    expect(rowExceptionBadge(rowOf(view, "3"), byId, at)).toBeNull();
  });

  it("says where an exception from another Level was recorded", () => {
    const two = { ...stored("t", 2), level: 2 as const };
    const view = withExceptionUses(syntheticAssessment(), { [setting(2)]: { id: "t", applies: true } });
    expect(rowExceptionBadge(rowOf(view, "2"), new Map([["t", two]]), view.assessedAt)!.title).toContain(
      "Recorded at Level 2.",
    );
  });

  it("offers a setting at a Level only where the engine applies an exception of that Level", () => {
    expect(exceptionReaches(1, 1, 2)).toBe(true);
    expect(exceptionReaches(2, 1, 2)).toBe(true);
    expect(exceptionReaches(1, 2, 2)).toBe(false);
    expect(exceptionReaches(2, 2, 2)).toBe(true);
    expect(exceptionReaches(1, 1, 1)).toBe(true);
    const choices = exceptionChoices(syntheticAssessment({ count: 12, levels: [1, 2] }));
    expect(new Set(choices.flatMap((choice) => choice.packLevels))).toEqual(new Set([1]));
  });
});

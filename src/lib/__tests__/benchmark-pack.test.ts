import { describe, expect, it } from "vitest";
import {
  parseBenchmarkIdentity,
  parseCatalog,
  parsePack,
  parseRecommendationList,
} from "../benchmarks/pack";

// Ported from TenuVault's content validator tests. Synthetic data only: no
// benchmark text, titles or policy names from any real benchmark.

const type =
  "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance";
const policy = (value = "enabled") => ({
  name: "Synthetic baseline",
  platforms: "windows10",
  technologies: "mdm",
  description: "Synthetic profile",
  settings: [
    {
      settingInstance: {
        "@odata.type": type,
        settingDefinitionId: "synthetic_password",
        choiceSettingValue: { value, children: [] },
      },
    },
  ],
});

const expected = {
  benchmark: "synthetic-bench",
  version: "9.9.9",
  level: 1 as const,
};
const validCatalog = {
  benchmarks: [
    {
      id: "synthetic-bench",
      name: "Synthetic Bench",
      version: "9.9.9",
      levels: [1, 2],
    },
  ],
};
const validPack = { ...expected, policies: [policy()] };
const validList = () => ({
  benchmark: "synthetic-bench",
  version: "9.9.9",
  items: [
    {
      identifier: "7.1.1",
      level: 1,
      automated: true,
      title: "Invented automated title",
    },
    {
      identifier: "7.1.4",
      level: 1,
      automated: false,
      title: "Invented manual title",
      description: "Invented description text.",
      impact: "Invented impact text.",
      audit: "Invented audit text.",
      remediation: "Invented remediation text.",
    },
    { identifier: "7.1.5", level: 1, automated: false },
    { identifier: "7.2.4", level: 2, automated: false, title: "  " },
  ],
});

describe("parseCatalog", () => {
  it("accepts a valid catalog and sorts levels", () => {
    expect(
      parseCatalog({
        benchmarks: [{ ...validCatalog.benchmarks[0], levels: [2, 1] }],
      }),
    ).toEqual(validCatalog);
    expect(parseCatalog(validCatalog)).toEqual(validCatalog);
  });

  it("rejects more than 50 benchmarks", () => {
    const benchmarks = Array.from({ length: 51 }, (_, i) => ({
      id: `synthetic-${i}`,
      name: "Synthetic Bench",
      version: "9.9.9",
      levels: [1],
    }));
    expect(() => parseCatalog({ benchmarks })).toThrow("at most 50");
  });

  it("rejects a bad level", () => {
    const entry = validCatalog.benchmarks[0]!;
    expect(() =>
      parseCatalog({ benchmarks: [{ ...entry, levels: [3] }] }),
    ).toThrow("only 1 or 2");
    expect(() =>
      parseCatalog({ benchmarks: [{ ...entry, levels: [] }] }),
    ).toThrow("at least one");
    expect(() =>
      parseCatalog({ benchmarks: [{ ...entry, levels: [1, 1] }] }),
    ).toThrow("not repeat");
  });

  it("rejects a bad slug, version shape, long name and duplicate", () => {
    const entry = validCatalog.benchmarks[0]!;
    expect(() =>
      parseCatalog({ benchmarks: [{ ...entry, id: "Synthetic Bench" }] }),
    ).toThrow("lowercase");
    expect(() =>
      parseCatalog({ benchmarks: [{ ...entry, version: "9.9" }] }),
    ).toThrow("1.2.3");
    expect(() =>
      parseCatalog({ benchmarks: [{ ...entry, name: "x".repeat(201) }] }),
    ).toThrow("at most 200");
    expect(() => parseCatalog({ benchmarks: [entry, entry] })).toThrow(
      "duplicate benchmark",
    );
  });

  it("rejects unknown fields and non-object input", () => {
    expect(() => parseCatalog({ benchmarks: [], extra: true })).toThrow(
      "unknown field",
    );
    expect(() =>
      parseCatalog({
        benchmarks: [{ ...validCatalog.benchmarks[0], extra: 1 }],
      }),
    ).toThrow("unknown field: extra");
    expect(() => parseCatalog(null)).toThrow("JSON object");
    expect(() => parseCatalog({ benchmarks: {} })).toThrow("must be an array");
  });
});

describe("parsePack", () => {
  it("accepts a valid pack matching the request", () => {
    const pack = parsePack(validPack, expected);
    expect(pack).toMatchObject(expected);
    expect(pack.policies).toHaveLength(1);
  });

  it("rejects identity mismatch", () => {
    expect(() => parsePack(validPack, { ...expected, level: 2 })).toThrow(
      "does not match",
    );
    expect(() =>
      parsePack({ ...validPack, version: "1.0.0" }, expected),
    ).toThrow("does not match");
    expect(() =>
      parsePack({ ...validPack, benchmark: "other-bench" }, expected),
    ).toThrow("does not match");
  });

  it("rejects an oversized pack list before parsing", () => {
    const policies = Array.from({ length: 65 }, () => policy());
    expect(() => parsePack({ ...validPack, policies }, expected)).toThrow(
      "at most 64",
    );
  });

  it("accepts an optional recommendation list and validates it strictly", () => {
    const recommendation = {
      id: "7.1.1",
      title: "Synthetic recommendation",
      level: 1,
      settings: ["synthetic_minlength"],
    };
    expect(parsePack(validPack, expected)).not.toHaveProperty(
      "recommendations",
    );
    expect(
      parsePack({ ...validPack, recommendations: [recommendation] }, expected)
        .recommendations,
    ).toEqual([recommendation]);
    const bad = (entry: unknown, message: string) =>
      expect(() =>
        parsePack({ ...validPack, recommendations: [entry] }, expected),
      ).toThrow(message);
    bad({ ...recommendation, id: "7" }, "dotted numeric");
    bad({ ...recommendation, id: "7.1.a" }, "dotted numeric");
    bad({ ...recommendation, title: "x".repeat(301) }, "at most 300");
    bad({ ...recommendation, title: " " }, "non-empty");
    bad({ ...recommendation, level: 3 }, "level must be 1 or 2");
    bad({ ...recommendation, settings: [] }, "settings must list");
    bad({ ...recommendation, settings: [7] }, "settings must list");
    bad(
      { ...recommendation, settings: ["x".repeat(501)] },
      "settings must list",
    );
    bad({ ...recommendation, extra: true }, "unknown field: extra");
    bad(
      {
        ...recommendation,
        settings: [
          "synthetic_minlength",
          "synthetic_password",
          "synthetic_minlength",
        ],
      },
      "setting synthetic_minlength is listed twice",
    );
    bad("7.1.1", "expected an object");
    expect(() =>
      parsePack(
        { ...validPack, recommendations: [recommendation, recommendation] },
        expected,
      ),
    ).toThrow("duplicate recommendation 7.1.1");
    expect(() =>
      parsePack({ ...validPack, recommendations: {} }, expected),
    ).toThrow("must be an array");
    const many = Array.from({ length: 2001 }, (_, index) => ({
      ...recommendation,
      id: `7.${index}.1`,
    }));
    expect(() =>
      parsePack({ ...validPack, recommendations: many }, expected),
    ).toThrow("at most 2000");
  });

  it("rejects empty policies, bad level, unknown fields and non-object input", () => {
    expect(() => parsePack({ ...validPack, policies: [] }, expected)).toThrow(
      "at least one",
    );
    expect(() => parsePack({ ...validPack, policies: {} }, expected)).toThrow(
      "must be an array",
    );
    expect(() => parsePack({ ...validPack, level: 3 }, expected)).toThrow(
      "level must be 1 or 2",
    );
    expect(() => parsePack({ ...validPack, extra: true }, expected)).toThrow(
      "unknown field: extra",
    );
    expect(() => parsePack([], expected)).toThrow("JSON object");
  });
});

describe("parseRecommendationList", () => {
  it("accepts the documented shape with optional text fields", () => {
    const list = parseRecommendationList(validList(), {
      benchmark: "synthetic-bench",
      version: "9.9.9",
    });
    expect(list.benchmark).toBe("synthetic-bench");
    expect(list.version).toBe("9.9.9");
    expect(list.items).toHaveLength(4);
    expect(list.items[0]?.automated).toBe(true);
    expect(list.items[1]).toMatchObject({
      identifier: "7.1.4",
      level: 1,
      automated: false,
      title: "Invented manual title",
      description: "Invented description text.",
    });
    // A blank text field is dropped, not kept as an empty string.
    expect(list.items[3]).toEqual({
      identifier: "7.2.4",
      level: 2,
      automated: false,
    });
  });

  it("rejects a list for another benchmark or version", () => {
    expect(() =>
      parseRecommendationList(validList(), {
        benchmark: "other-bench",
        version: "9.9.9",
      }),
    ).toThrow("does not match");
    expect(() =>
      parseRecommendationList(validList(), {
        benchmark: "synthetic-bench",
        version: "1.0.0",
      }),
    ).toThrow("does not match");
  });

  it("rejects malformed lists naming the problem", () => {
    const items = validList().items;
    const list = (value: Record<string, unknown>) => () =>
      parseRecommendationList(value);
    const one = (item: Record<string, unknown>) =>
      list({ benchmark: "synthetic-bench", version: "9.9.9", items: [item] });
    expect(() => parseRecommendationList([])).toThrow(
      /JSON object with benchmark, version and items/,
    );
    expect(list({ version: "9.9.9", items })).toThrow(/benchmark/);
    expect(
      list({ benchmark: "Synthetic Bench", version: "9.9.9", items }),
    ).toThrow(/benchmark/);
    expect(list({ benchmark: "synthetic-bench", version: "", items })).toThrow(
      /version/,
    );
    expect(
      list({ benchmark: "synthetic-bench", version: "9.9.9", items: {} }),
    ).toThrow(/items must be an array/);
    expect(
      list({ benchmark: "synthetic-bench", version: "9.9.9", items: [] }),
    ).toThrow(/at least one item/);
    expect(
      list({ benchmarkId: "synthetic-bench", version: "9.9.9", items }),
    ).toThrow(/unknown field: benchmarkId/);
    expect(one({ identifier: "7.1.1", level: 3, automated: true })).toThrow(
      /item 1: level must be 1 or 2/,
    );
    expect(one({ identifier: "7.1.1", level: 1, automated: "yes" })).toThrow(
      /item 1: automated/,
    );
    expect(one({ identifier: "7 1", level: 1, automated: true })).toThrow(
      /without spaces/,
    );
    expect(
      one({ identifier: "7.1.1", level: 1, automated: true, description: 4 }),
    ).toThrow(/item 1: description must be a string/);
    expect(
      one({ identifier: "7.1.1", level: 1, automated: true, bogus: "x" }),
    ).toThrow(/unknown field: bogus/);
    expect(
      list({
        benchmark: "synthetic-bench",
        version: "9.9.9",
        items: [
          { identifier: "7.1.1", level: 1, automated: true },
          { identifier: "7.1.1", level: 1, automated: false },
        ],
      }),
    ).toThrow(/duplicate identifier 7\.1\.1/);
  });
});

describe("parseBenchmarkIdentity", () => {
  it("accepts a well formed identity and drops other fields", () => {
    expect(parseBenchmarkIdentity({ ...expected, extra: "x" })).toEqual(
      expected,
    );
  });

  it("rejects traversal and malformed benchmark, version and level inputs", () => {
    const bad: unknown[] = [
      null,
      { ...expected, benchmark: ".." },
      { ...expected, benchmark: "../synthetic-bench" },
      { ...expected, benchmark: "synthetic/bench" },
      { ...expected, benchmark: "a".repeat(101) },
      { ...expected, version: "../9.9.9" },
      { ...expected, version: "9.9" },
      { ...expected, level: 3 },
      { ...expected, level: "1" },
    ];
    for (const input of bad) {
      expect(() => parseBenchmarkIdentity(input)).toThrow(
        "Select a benchmark, version and level.",
      );
    }
  });
});

import { describe, expect, it } from "vitest";
import { assessBenchmark } from "../assessment";
import {
  canonicalJson,
  packDigest,
  storedRunHeadline,
  MAX_STORED_RESULTS,
  summarizeRuns,
  validateStoredRun,
} from "../history";
import { NOW, choice, collection, pack, tenantPolicy } from "./fixtures";

const target = pack(
  [
    {
      name: "Synthetic pack policy name",
      settings: [choice("synthetic_a", "on"), choice("synthetic_b", "on")],
    },
  ],
  [
    {
      id: "1.1",
      title: "Synthetic title one",
      level: 1,
      settings: ["synthetic_a"],
    },
    {
      id: "1.2",
      title: "Synthetic title two",
      level: 1,
      settings: ["synthetic_b"],
    },
    {
      id: "1.3",
      title: "Synthetic title three",
      level: 1,
      settings: ["synthetic_c"],
    },
  ],
);
const DIGEST = `sha256:${"a".repeat(64)}`;

describe("stored benchmark runs", () => {
  const assessment = assessBenchmark(
    collection({
      policies: [
        tenantPolicy({
          settings: [choice("synthetic_a", "on"), choice("synthetic_b", "off")],
        }),
      ],
    }),
    target,
    { now: NOW },
  );

  it("keeps ids, result codes and open setting ids only", () => {
    const runs = summarizeRuns(assessment, DIGEST);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run).toEqual({
      benchmark: "synthetic-bench",
      version: "1.0.0",
      level: 1,
      assessedAt: NOW,
      packDigest: DIGEST,
      basis: "recommendations",
      results: [
        ["1.1", "pass", []],
        ["1.2", "fail", ["synthetic_b"]],
        ["1.3", "notAssessed", ["synthetic_c"]],
      ],
    });
    const text = JSON.stringify(run);
    expect(text).not.toMatch(
      /Synthetic title|Synthetic pack policy|Tenant policy|synthetic_b_off/,
    );
    expect(validateStoredRun(JSON.parse(text))).toEqual(run);
  });

  it("gives the same headline as the live assessment", () => {
    expect(storedRunHeadline(summarizeRuns(assessment, DIGEST)[0]!)).toEqual({
      counts: assessment.levels[0]!.headline.counts,
      rate: assessment.levels[0]!.headline.rate,
    });
  });

  it("stores setting ids on the settings basis", () => {
    const settingsOnly = assessBenchmark(
      collection({
        policies: [tenantPolicy({ settings: [choice("synthetic_a", "on")] })],
      }),
      pack([
        {
          settings: [choice("synthetic_a", "on"), choice("synthetic_b", "on")],
        },
      ]),
      { now: NOW },
    );
    expect(
      summarizeRuns(settingsOnly, DIGEST).map((run) => run.results),
    ).toEqual([
      [
        ["synthetic_a", "pass", []],
        ["synthetic_b", "fail", ["synthetic_b"]],
      ],
    ]);
  });

  it("names why a run exceeds the stored schema: too many results or an id history cannot store", () => {
    const [run] = summarizeRuns(assessment, DIGEST);
    const many = Array.from(
      { length: MAX_STORED_RESULTS + 1 },
      (_, index): [string, "pass", string[]] => [`1.${index + 1}`, "pass", []],
    );
    expect(() => validateStoredRun({ ...run!, results: many })).toThrow(
      `holds more than ${MAX_STORED_RESULTS} results`,
    );
    for (const id of [
      "",
      "x".repeat(501),
      " synthetic_leading",
      "synthetic_trailing ",
      "synthetic\u0007bell",
      "synthetic\nline",
      "synthetic\u202eoverride",
      "synthetic\u200bzero width",
      "synthetic\u{e0041}tag",
      "synthetic\ufe0fselector",
      "synthetic\u3164filler",
      "synthetic\ud800lone",
    ])
      expect(() =>
        validateStoredRun({ ...run!, results: [["1.1", "fail", [id]]] }),
      ).toThrow("invalid result 1: a setting id is empty, longer than 500");
    expect(() =>
      validateStoredRun({ ...run!, results: [["synthetic_a", "pass", []]] }),
    ).toThrow("its id is not a recommendation id such as 1.2.3");
  });

  it("stores setting ids with spaces and other punctuation, as Graph names Apple settings", () => {
    const ids = [
      "com.synthetic.energysaver.desktop.acpower_display sleep timer",
      "com.synthetic.preferences_applications_synthetic app (work).app_lcid",
      "com.synthetic.extensiblesso_ignored_$typepicker",
      "x".repeat(500),
    ];
    const settingsOnly = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            settings: [choice(ids[0]!, "on"), choice(ids[1]!, "off")],
          }),
        ],
      }),
      pack([
        {
          name: "Synthetic pack policy name",
          settings: ids.map((id) => choice(id, "on")),
        },
      ]),
      { now: NOW },
    );
    const runs = summarizeRuns(settingsOnly, DIGEST);
    expect(runs).toHaveLength(1);
    const stored = validateStoredRun(JSON.parse(JSON.stringify(runs[0])));
    expect(stored.results.map((entry) => entry[0])).toEqual(ids);
    expect(stored.results[1]).toEqual([ids[1], "fail", [ids[1]]]);
    const byRecommendation = validateStoredRun({
      ...summarizeRuns(assessment, DIGEST)[0]!,
      results: [["1.1", "fail", [ids[0]!, ids[2]!]]],
    });
    expect(byRecommendation.results[0]![2]).toEqual([ids[0], ids[2]]);
  });

  it("rejects extra fields, free text and unknown codes", () => {
    const [run] = summarizeRuns(assessment, DIGEST) as [
      ReturnType<typeof summarizeRuns>[number],
    ];
    expect(() =>
      validateStoredRun({ ...run, title: "Synthetic title one" }),
    ).toThrow("unknown field: title");
    expect(() =>
      validateStoredRun({
        ...run,
        results: [["1.1", "pass", [], "Synthetic title"]],
      }),
    ).toThrow("invalid result 1");
    expect(() =>
      validateStoredRun({
        ...run,
        results: [["Synthetic title one", "pass", []]],
      }),
    ).toThrow("invalid result 1");
    expect(() =>
      validateStoredRun({ ...run, results: [["1.1", "compliant", []]] }),
    ).toThrow("invalid result 1");
    expect(() => validateStoredRun({ ...run, packDigest: "abc" })).toThrow(
      "pack digest",
    );
    expect(() =>
      validateStoredRun({ ...run, assessedAt: "Synthetic tenant note 1" }),
    ).toThrow("invalid time");
    expect(() =>
      validateStoredRun({ ...run, benchmark: "Synthetic Bench" }),
    ).toThrow("benchmark id");
  });
});

describe("pack digest", () => {
  it("hashes the delivered bytes, and canonical JSON for an object", async () => {
    const text = JSON.stringify(target);
    const fromText = await packDigest(text);
    expect(fromText).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await packDigest(new TextEncoder().encode(text))).toBe(fromText);
    const reordered = {
      level: target.level,
      policies: target.policies,
      recommendations: target.recommendations,
      version: target.version,
      benchmark: target.benchmark,
    };
    expect(await packDigest(reordered)).toBe(await packDigest(target));
    expect(await packDigest(target)).toBe(
      await packDigest(canonicalJson(target)),
    );
    expect(await packDigest({ ...target, version: "1.0.1" })).not.toBe(
      await packDigest(target),
    );
  });
});

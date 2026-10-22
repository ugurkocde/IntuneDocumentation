import { describe, expect, it } from "vitest";
import { assessBenchmark } from "../assessment";
import {
  canonicalJson,
  packDigest,
  storedRunHeadline,
  summarizeRun,
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
    const run = summarizeRun(assessment, DIGEST);
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
    expect(storedRunHeadline(summarizeRun(assessment, DIGEST))).toEqual({
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
    expect(summarizeRun(settingsOnly, DIGEST).results).toEqual([
      ["synthetic_a", "pass", []],
      ["synthetic_b", "fail", ["synthetic_b"]],
    ]);
  });

  it("rejects extra fields, free text and unknown codes", () => {
    const run = summarizeRun(assessment, DIGEST);
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

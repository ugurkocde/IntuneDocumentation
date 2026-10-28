import { describe, expect, it } from "vitest";
import { assessBenchmark } from "../assessment";
import { compareDefinition, definitionIds } from "../policies";
import { REDACTED_VALUE } from "../../intune-policy-registry";
import type { BenchmarkException } from "../exceptions";
import {
  BENCH,
  NOW,
  VERSION,
  choice,
  collection,
  groupCollection,
  pack,
  tenantPolicy,
} from "./fixtures";

const PAYLOAD = "synthetic_payload";
const leaf = (id: string, value: string) => choice(`${PAYLOAD}_${id}`, value);
const payload = (children: Record<string, unknown>[]) =>
  groupCollection(PAYLOAD, [children]);

const recommendations = [
  {
    id: "1.1.1",
    title: "Synthetic leaf one",
    level: 1 as const,
    settings: [`${PAYLOAD}_one`],
  },
  {
    id: "1.1.2",
    title: "Synthetic leaf two",
    level: 1 as const,
    settings: [`${PAYLOAD}_two`],
  },
  {
    id: "1.1.10",
    title: "Synthetic leaf three and alpha",
    level: 1 as const,
    settings: [`${PAYLOAD}_three`, "synthetic_alpha"],
  },
  {
    id: "1.2.1",
    title: "Synthetic beta",
    level: 1 as const,
    settings: ["synthetic_beta"],
  },
  {
    id: "1.3.1",
    title: "Synthetic not in pack",
    level: 1 as const,
    settings: ["synthetic_absent"],
  },
];

const target = pack(
  [
    {
      platforms: "windows10",
      settings: [
        choice("synthetic_alpha", "on"),
        choice("synthetic_beta", "on"),
      ],
    },
    {
      platforms: "macOS",
      settings: [
        payload([leaf("one", "on"), leaf("two", "on"), leaf("three", "on")]),
      ],
    },
  ],
  recommendations,
);

// Two tenant payloads each hold part of the payload: the root finding is
// Different, but leaf by leaf one and three hold the recommended value, two
// differs, and beta is absent.
const tenant = () => [
  tenantPolicy({
    platforms: "macOS",
    settings: [
      payload([leaf("one", "on"), leaf("two", "off"), leaf("extra", "kept")]),
    ],
  }),
  tenantPolicy({
    platforms: "macOS",
    settings: [payload([leaf("three", "on"), leaf("one", "on")])],
  }),
  tenantPolicy({
    platforms: "windows10",
    settings: [choice("synthetic_alpha", "on")],
  }),
];

const run = (
  policies = tenant(),
  exceptions: BenchmarkException[] = [],
  level: 1 | 2 = 1,
) =>
  assessBenchmark(
    collection({ policies }),
    level === 1 ? target : { ...target, level },
    { now: NOW, exceptions },
  );

const rows = (assessment: ReturnType<typeof run>) =>
  assessment.recommendations.map((item) => [
    item.id,
    item.result,
    item.settings
      .map((setting) => `${setting.id} ${setting.status}`)
      .join(", "),
  ]);

describe("pack recommendations", () => {
  it("lists every definition of a root, including grouped leaf children", () => {
    expect(
      definitionIds(payload([leaf("one", "on"), leaf("two", "on")]) as never),
    ).toEqual([PAYLOAD, `${PAYLOAD}_one`, `${PAYLOAD}_two`]);
  });

  it("judges one leaf against each tenant root with the comparison leaf rule", () => {
    const recommended = payload([
      leaf("one", "on"),
      leaf("two", "on"),
    ]) as never;
    const first = payload([leaf("one", "on"), leaf("two", "off")]) as never;
    const second = payload([leaf("one", "on")]) as never;
    expect(compareDefinition(recommended, first, `${PAYLOAD}_one`)).toEqual({
      holds: "yes",
      comparison: "match",
    });
    expect(compareDefinition(recommended, first, `${PAYLOAD}_two`)).toEqual({
      holds: "yes",
      comparison: "differ",
    });
    expect(
      compareDefinition(recommended, second, `${PAYLOAD}_two`)?.holds,
    ).toBe("no");
    expect(compareDefinition(recommended, first, PAYLOAD)).toEqual({
      holds: "yes",
      comparison: "differ",
    });
    expect(
      compareDefinition(recommended, first, `${PAYLOAD}_extra`),
    ).toBeNull();
  });

  it("passes a recommendation only when every mapped leaf passes, even when its grouped root is Different", () => {
    const assessment = run();
    expect(assessment.basis).toBe("recommendations");
    expect(assessment.settings.map((finding) => finding.status)).toEqual([
      "Present",
      "Missing",
      "Different",
    ]);
    expect(rows(assessment)).toEqual([
      ["1.1.1", "Pass", `${PAYLOAD}_one Present`],
      ["1.1.2", "Fail", `${PAYLOAD}_two Different`],
      ["1.1.10", "Pass", `${PAYLOAD}_three Present, synthetic_alpha Present`],
      ["1.2.1", "Fail", "synthetic_beta Missing"],
      ["1.3.1", "Not assessed", "synthetic_absent Unmapped"],
    ]);
    const conflicting = [
      ...tenant(),
      tenantPolicy({
        platforms: "macOS",
        settings: [payload([leaf("one", "off")])],
      }),
    ];
    expect(
      run(conflicting).recommendations.find((item) => item.id === "1.1.1")
        ?.result,
    ).toBe("Fail");
  });

  it("makes the recommendation rate the headline: Pass / (Pass + Fail)", () => {
    const level = run().levels[0]!;
    expect(level.headline.basis).toBe("recommendations");
    expect(level.headline.counts).toEqual({
      pass: 2,
      fail: 2,
      review: 0,
      notAssessed: 1,
    });
    expect(level.headline.rate).toBe(0.5);
  });

  it("is Not assessed when a declared setting is outside the pack, even when another setting fails", () => {
    const outside = pack(
      [{ settings: [choice("synthetic_alpha", "on")] }],
      [
        {
          id: "2.1.1",
          title: "Synthetic mixed",
          level: 1,
          settings: ["synthetic_alpha", "synthetic_outside"],
        },
      ],
    );
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ settings: [choice("synthetic_alpha", "off")] }),
        ],
      }),
      outside,
      { now: NOW },
    );
    const result = assessment.recommendations[0]!;
    expect([result.result, result.reason]).toEqual([
      "Not assessed",
      "settingOutsidePack",
    ]);
    expect(result.settings.map((setting) => setting.status)).toEqual([
      "Different",
      "Unmapped",
    ]);
    expect(assessment.levels[0]!.headline.rate).toBeNull();
  });

  it("is Review when a leaf is unreadable, and leaves unrelated leaves of the same root definite", () => {
    const unreadable = {
      ...leaf("two", "on"),
      choiceSettingValue: { value: REDACTED_VALUE, children: [] },
    };
    const assessment = run([
      tenantPolicy({
        platforms: "macOS",
        settings: [
          payload([leaf("one", "on"), unreadable, leaf("three", "on")]),
        ],
      }),
      tenantPolicy({
        platforms: "windows10",
        settings: [
          choice("synthetic_alpha", "on"),
          choice("synthetic_beta", "on"),
        ],
      }),
    ]);
    expect(rows(assessment).slice(0, 4)).toEqual([
      ["1.1.1", "Pass", `${PAYLOAD}_one Present`],
      ["1.1.2", "Review", `${PAYLOAD}_two Review`],
      ["1.1.10", "Pass", `${PAYLOAD}_three Present, synthetic_alpha Present`],
      ["1.2.1", "Pass", "synthetic_beta Present"],
    ]);
    expect(assessment.recommendations[1]!.reason).toBe("unreadableValue");
  });

  it("is Review notAssigned when the matching leaves sit only on unassigned policies", () => {
    const assessment = run([
      tenantPolicy({
        platforms: "macOS",
        settings: [payload([leaf("one", "on")])],
        assignments: [],
      }),
    ]);
    const result = assessment.recommendations.find(
      (item) => item.id === "1.1.1",
    )!;
    expect([result.result, result.reason, result.openSettingIds]).toEqual([
      "Review",
      "notAssigned",
      [`${PAYLOAD}_one`],
    ]);
  });

  it("is Review collectionIncomplete instead of Missing when the collection is incomplete", () => {
    const assessment = assessBenchmark(
      collection({ policies: tenant(), sectionError: "Request failed" }),
      target,
      { now: NOW },
    );
    expect(rows(assessment).map(([id, result]) => [id, result])).toEqual([
      ["1.1.1", "Review"],
      ["1.1.2", "Fail"],
      ["1.1.10", "Review"],
      ["1.2.1", "Review"],
      ["1.3.1", "Not assessed"],
    ]);
    expect(assessment.recommendations[3]!.reason).toBe("collectionIncomplete");
  });

  it("credits an exception against the recommendation's own failing settings only", () => {
    const exception = (
      settingId: string,
      extra: Partial<BenchmarkException> = {},
    ): BenchmarkException => ({
      id: `exception-${settingId}`,
      benchmark: BENCH,
      version: VERSION,
      level: 1,
      settingId,
      owner: "Synthetic owner",
      reason: "Synthetic reason",
      expiresOn: "2026-12-31",
      createdAt: "2026-10-01T09:00:00.000Z",
      ...extra,
    });
    const credited = run(tenant(), [exception(`${PAYLOAD}_two`)]).levels[0]!
      .headline;
    expect([credited.rate, credited.adjusted, credited.exceptionIds]).toEqual([
      0.5,
      0.75,
      [`exception-${PAYLOAD}_two`],
    ]);
    // The root id of a shared payload does not credit a leaf recommendation.
    const root = run(tenant(), [exception(PAYLOAD)]).levels[0]!.headline;
    expect([root.adjusted, root.exceptionIds]).toEqual([null, []]);
    // Expired, created later, another version or another Level: not used.
    for (const extra of [
      { expiresOn: "2026-10-20" },
      { createdAt: "2026-10-22T09:00:00.000Z" },
      { version: "2.0.0" },
      { level: 2 as const },
    ])
      expect(
        run(tenant(), [exception(`${PAYLOAD}_two`, extra)]).levels[0]!.headline
          .adjusted,
      ).toBeNull();
    // A recommendation outside the pack is never credited.
    expect(
      run(tenant(), [exception("synthetic_absent")]).levels[0]!.headline
        .adjusted,
    ).toBeNull();
  });
});

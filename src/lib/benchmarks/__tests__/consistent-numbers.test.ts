import { describe, expect, it } from "vitest";
import { assessBenchmark } from "../assessment";
import { exclusionsText, formatRate, headlineLabel } from "../display";
import { storedRunHeadline, summarizeRun } from "../history";
import { portfolioRows } from "../portfolio";
import { tenantSettings } from "../tenant-settings";
import { benchmarkTrend } from "../trend";
import { REDACTED_VALUE } from "../../intune-policy-registry";
import {
  BENCH,
  DIGEST_A,
  NOW,
  VERSION,
  choice,
  collection,
  pack,
  simpleInteger,
  tenantPolicy,
} from "./fixtures";

const target = pack(
  [
    {
      settings: [
        choice("synthetic_a", "on"),
        choice("synthetic_b", "on"),
        choice("synthetic_c", "on"),
        simpleInteger("synthetic_d", 5),
      ],
    },
  ],
  [
    { id: "1.1", title: "Synthetic one", level: 1, settings: ["synthetic_a"] },
    { id: "1.2", title: "Synthetic two", level: 1, settings: ["synthetic_b"] },
    {
      id: "1.3",
      title: "Synthetic three",
      level: 1,
      settings: ["synthetic_c"],
    },
    { id: "1.4", title: "Synthetic four", level: 1, settings: ["synthetic_d"] },
    {
      id: "1.5",
      title: "Synthetic five",
      level: 1,
      settings: ["synthetic_outside"],
    },
  ],
);

describe("one benchmark rate in every view", () => {
  const assessment = assessBenchmark(
    collection({
      policies: [
        tenantPolicy({
          settings: [
            choice("synthetic_a", "on"),
            choice("synthetic_b", "off"),
            simpleInteger("synthetic_d", REDACTED_VALUE),
          ],
        }),
        tenantPolicy({
          settings: [choice("synthetic_c", "on")],
          assignments: [],
        }),
      ],
    }),
    target,
    {
      now: NOW,
      exceptions: [
        {
          id: "exception-b",
          benchmark: BENCH,
          version: VERSION,
          level: 1,
          settingId: "synthetic_b",
          owner: "Synthetic owner",
          reason: "Synthetic reason",
          expiresOn: "2026-12-31",
          createdAt: "2026-10-01T09:00:00.000Z",
        },
      ],
    },
  );
  const headline = assessment.levels[0]!.headline;

  it("counts Matches, Differs, Needs review and Not assessed, and rates Pass / (Pass + Fail)", () => {
    expect(
      assessment.recommendations.map((item) => [
        item.id,
        item.result,
        item.reason ?? null,
      ]),
    ).toEqual([
      ["1.1", "Pass", null],
      ["1.2", "Fail", null],
      ["1.3", "Review", "notAssigned"],
      ["1.4", "Review", "unreadableValue"],
      ["1.5", "Not assessed", "settingOutsidePack"],
    ]);
    expect(headline.counts).toEqual({
      pass: 1,
      fail: 1,
      review: 2,
      notAssessed: 1,
    });
    expect(headline.rate).toBe(0.5);
    expect(headline.adjusted).toBe(1);
    expect(headlineLabel(headline.basis)).toBe("Matching recommendations");
    expect(exclusionsText(headline)).toBe("100% with 1 exclusion");
  });

  it("shows the same raw rate in the stored run, the trend and the portfolio", () => {
    const run = summarizeRun(assessment, DIGEST_A);
    const stored = storedRunHeadline(run);
    const trend = benchmarkTrend([run])[0]!;
    const portfolio = portfolioRows([
      { tenantId: "00000000-0000-0000-0000-000000000001", runs: [run] },
    ])[0]!.levels[0]!;
    expect([stored.rate, trend.rate, portfolio.rate]).toEqual([
      headline.rate,
      headline.rate,
      headline.rate,
    ]);
    expect([stored.counts, trend.counts, portfolio.counts]).toEqual([
      headline.counts,
      headline.counts,
      headline.counts,
    ]);
    expect(formatRate(trend.rate)).toBe(formatRate(headline.rate));
    expect(formatRate(null)).toBe("Not available");
  });

  it("never changes the raw rate through exceptions", () => {
    const without = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            settings: [
              choice("synthetic_a", "on"),
              choice("synthetic_b", "off"),
              simpleInteger("synthetic_d", REDACTED_VALUE),
            ],
          }),
          tenantPolicy({
            settings: [choice("synthetic_c", "on")],
            assignments: [],
          }),
        ],
      }),
      target,
      { now: NOW },
    ).levels[0]!.headline;
    expect([without.rate, without.adjusted, without.exceptionIds]).toEqual([
      headline.rate,
      null,
      [],
    ]);
  });
});

describe("collection markers the adapter reads", () => {
  it("reads platforms, templates, assignments and completeness from the collected item", () => {
    const tenant = tenantSettings(
      collection({
        policies: [
          tenantPolicy({
            name: "Synthetic plain",
            settings: [choice("synthetic_a", "on")],
          }),
          tenantPolicy({
            name: "Synthetic template",
            platforms: "macOS",
            templateId: "00000000-0000-0000-0000-00000000b001_1",
            settings: [],
            assignments: [],
          }),
        ],
      }),
    );
    expect(tenant.complete).toBe(true);
    expect(tenant.gaps).toEqual([]);
    expect(
      tenant.policies.map((policy) => [
        policy.name,
        policy.platforms,
        policy.templated,
        policy.assignment,
        policy.settingsComplete,
      ]),
    ).toEqual([
      ["Synthetic plain", "windows10", false, "assigned", true],
      ["Synthetic template", "macOS", true, "notAssigned", true],
    ]);
  });

  it("reads the legacy settingsCatalog array when the collection has no sections", () => {
    const data = collection({
      policies: [tenantPolicy({ settings: [choice("synthetic_a", "on")] })],
    });
    const legacy = { ...data, sections: undefined };
    expect(tenantSettings(legacy).complete).toBe(true);
    expect(
      tenantSettings({
        ...data,
        sections: [
          { ...data.sections![0]!, familyKey: "deviceConfigurations" },
        ],
      }).complete,
    ).toBe(false);
  });

  it("treats a skipped Settings Catalog family as not collected", () => {
    const data = {
      ...collection({ policies: [] }),
      collectionSkippedFamilies: ["settingsCatalog"],
    };
    expect(tenantSettings(data).complete).toBe(false);
  });
});

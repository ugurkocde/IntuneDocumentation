import { describe, expect, it } from "vitest";
import { canonicalEdmValue, EDM_TYPES } from "../compliance/graph-rows";
import { evaluatePolicyCheck } from "../compliance/policy-checks";
import { policyCheckObservation } from "../compliance/policy-check-observation";
import type { ComplianceAssessment } from "../compliance/types";
import type { ConfigurationSectionData } from "../configuration-sections";
import { diffSnapshots } from "../snapshots/diff";
import {
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import {
  compareSettings,
  createReference,
  parseReference,
  projectionSettings,
  referenceSettings,
  serializeReference,
} from "../snapshots/reference";
import { canonicalTypedValues, comparedRows } from "../snapshots/typed-values";

// Round 39 review finding 2: a typed value Graph may write in several texts
// is one value. OData JSON (v4.01 section 7.1) writes TimeOfDay,
// DateTimeOffset, Duration, Guid and Binary as strings of the OData ABNF,
// which allows several texts per value, and Single and Double as numbers.
// Compare and History compare the canonical form, which is the text Graph
// returns ("02:00:00.0000000"; "2024-08-01T12:44:11.08861Z" and "PT0S" in
// the lab tenant, 23 October 2026), and show the text Graph returned.
// Names, ids and values are synthetic.

const same = (type: string, a: unknown, b: unknown) =>
  JSON.stringify(canonicalEdmValue(type, a)) ===
  JSON.stringify(canonicalEdmValue(type, b));

// Per type: texts of one value, the text Graph returns, and pairs of
// different values that must stay different.
const CASES: Array<{
  type: string;
  equal: unknown[][];
  graph: unknown[];
  different: unknown[][];
}> = [
  {
    type: "TimeOfDay",
    equal: [
      ["02:00", "02:00:00", "02:00:00.0000000", "02:00:00.000"],
      ["02:00:00.5", "02:00:00.5000000", "02:00:00.500000000000"],
      ["23:59:59.00000001", "23:59:59.000000010000"],
    ],
    graph: ["02:00:00.0000000", "12:00:00.0000000", "02:00:00.1234567"],
    different: [
      ["02:00", "02:30"],
      ["02:00:00", "02:00:01"],
      ["02:00:00", "02:00:00.0000001"],
      ["02:00:00.0000000", "02:00:00.000000000001"],
    ],
  },
  {
    type: "DateTimeOffset",
    equal: [
      [
        "2026-10-23T10:00Z",
        "2026-10-23T10:00:00Z",
        "2026-10-23T10:00:00.0000000Z",
        "2026-10-23T10:00:00+00:00",
        "2026-10-23T10:00:00-00:00",
      ],
      ["2026-10-23T12:00:00.5+02:00", "2026-10-23T12:00:00.50+02:00"],
    ],
    graph: [
      "2024-08-01T12:44:11.08861Z",
      "2026-10-23T10:00:00Z",
      "2016-12-31T23:58:16.1180489-08:00",
    ],
    different: [
      ["2026-10-23T10:00:00Z", "2026-10-23T10:00:01Z"],
      ["2026-10-23T10:00:00Z", "2026-10-24T10:00:00Z"],
      // The offset is part of the value.
      ["2026-10-23T10:00:00Z", "2026-10-23T12:00:00+02:00"],
    ],
  },
  {
    type: "Duration",
    equal: [
      ["PT1H", "PT60M", "PT3600S", "+PT1H", "PT0H60M"],
      ["P1D", "PT24H", "PT1440M", "PT86400S"],
      ["PT0S", "P0D", "-PT0S", "PT0.000S", "PT0M"],
      ["P1DT1H30M", "PT25H30M", "PT91800S"],
      ["PT1.5S", "PT1.50S"],
      ["-PT90M", "-PT1H30M"],
    ],
    graph: ["PT0S", "P1D", "PT1H30M", "-PT1H", "PT0.5S"],
    different: [
      ["PT1H", "PT2H"],
      ["PT1H", "-PT1H"],
      ["P1D", "PT23H"],
      ["PT1S", "PT1.5S"],
    ],
  },
  {
    type: "Guid",
    equal: [
      [
        "0000000a-000b-000c-000d-00000000000e",
        "0000000A-000B-000C-000D-00000000000E",
      ],
    ],
    graph: ["0000000a-000b-000c-000d-00000000000e"],
    different: [
      [
        "0000000a-000b-000c-000d-00000000000e",
        "0000000a-000b-000c-000d-00000000000f",
      ],
    ],
  },
  {
    type: "Binary",
    equal: [
      ["PFN5bnRoZXRpYy8+", "PFN5bnRoZXRpYy8-"],
      ["PFN5bnRoZXRpYzIvPg==", "PFN5bnRoZXRpYzIvPg"],
      ["U3ludGhldGljPz8_", "U3ludGhldGljPz8/"],
    ],
    graph: ["PFN5bnRoZXRpYy8+", "PFN5bnRoZXRpYzIvPg=="],
    different: [["PFN5bnRoZXRpYy8+", "PFN5bnRoZXRpYzIvPg=="]],
  },
  {
    type: "Single",
    equal: [
      [0.1, 0.10000000149011612],
      [1, 1.0],
      [0, -0],
    ],
    graph: ["NaN", "INF"],
    different: [
      [0.1, 0.2],
      [1, 1.0000001],
    ],
  },
  {
    type: "Double",
    equal: [[0, -0]],
    graph: [0.1, 1.5, "-INF"],
    different: [[0.1, 0.10000000149011612]],
  },
];

describe("finding 2: one canonical form per value of a typed property", () => {
  for (const { type, equal, graph, different } of CASES) {
    it(`reads equal ${type} texts as one value`, () => {
      for (const forms of equal)
        for (const form of forms) {
          expect(EDM_TYPES[type]!(form), `${type} ${String(form)}`).toBe(true);
          expect(same(type, forms[0], form), `${type} ${String(form)}`).toBe(
            true,
          );
        }
    });

    it(`keeps the ${type} text Graph returns`, () => {
      for (const form of graph)
        expect(canonicalEdmValue(type, form)).toBe(form);
    });

    it(`keeps different ${type} values different`, () => {
      for (const [a, b] of different)
        expect(same(type, a, b), `${type} ${String(a)} ${String(b)}`).toBe(
          false,
        );
    });
  }

  it("keeps values of other types and unreadable values as they are", () => {
    for (const [type, value] of [
      ["Boolean", true],
      ["Int32", 15],
      ["String", "02:00"],
      ["Date", "2026-10-23"],
      ["TimeOfDay", "garbage"],
      ["TimeOfDay", null],
      ["Duration", "P1Y"],
      ["Guid", "not-a-guid"],
      ["defenderScanType", "quick"],
    ] as const)
      expect(canonicalEdmValue(type, value)).toBe(value);
    expect(
      canonicalEdmValue("Collection(Guid)", [
        "0000000A-000B-000C-000D-00000000000E",
      ]),
    ).toEqual(["0000000a-000b-000c-000d-00000000000e"]);
  });
});

// --- Compare and History ------------------------------------------------------

const ASSESSMENT = {
  provenance: { rulesetVersion: "synthetic" },
  generatedAt: "2026-10-23T09:00:00Z",
  scope: {},
  capabilities: [],
  frameworks: [],
} as unknown as ComplianceAssessment;

interface Family {
  key: string;
  familyKey: string;
}

function project(at: Family, item: unknown): SnapshotProjection {
  const section = {
    key: at.key,
    familyKey: at.familyKey,
    label: at.key,
    selectionPrefix: at.key,
    items: [item],
  } as ConfigurationSectionData;
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(
        { collectedAt: "2026-10-23T09:00:00Z", sections: [section] },
        ASSESSMENT,
        new Map(),
        (digest) => `synthetic:${digest}`,
      ),
    ),
  );
}

const compareRows = (at: Family, reference: unknown, current: unknown) =>
  compareSettings(
    projectionSettings(project(at, reference)),
    projectionSettings(project(at, current)),
  ).groups.flatMap((group) => group.rows);

const statusOf = (
  at: Family,
  setting: string,
  reference: unknown,
  current: unknown,
) =>
  compareRows(at, reference, current).find((row) => row.setting === setting)
    ?.status;

const changes = (at: Family, from: unknown, to: unknown) =>
  diffSnapshots(project(at, from), project(at, to)).policies.flatMap((policy) =>
    policy.settings.map((row) => [
      row.definitionId ?? row.name,
      row.change,
      row.before,
      row.after,
    ]),
  );

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

const DEVICE: Family = {
  key: "deviceConfigurations",
  familyKey: "deviceConfigurations",
};
const SCRIPTS: Family = { key: "macOSScripts", familyKey: "scripts" };

const general = (time: unknown) => ({
  "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
  id: "device-1",
  displayName: "Synthetic restrictions",
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
  defenderSystemScanSchedule: "everyday",
  defenderScanType: "quick",
  defenderScheduledScanTime: time,
});

const script = (executionFrequency: unknown) => ({
  "@odata.type": "#microsoft.graph.deviceShellScript",
  id: "script-1",
  displayName: "Synthetic shell script",
  fileName: "synthetic.sh",
  executionFrequency,
  retryCount: 0,
  blockExecutionNotifications: true,
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
});

const URI = "./Device/Vendor/MSFT/Policy/Config/Synthetic/Value";
const custom = (type: string, value: unknown) => ({
  "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
  id: "device-oma",
  displayName: "Synthetic custom profile",
  assignments: assigned,
  collectionStatus: { assignments: "complete" },
  omaSettings: [
    {
      "@odata.type": `#microsoft.graph.${type}`,
      displayName: "Synthetic value",
      omaUri: URI,
      isEncrypted: false,
      value,
    },
  ],
});

// Kept properties of each type with a canonical form, by the item builder
// and setting id Compare and History name them by. Guid, Double and Binary
// properties are not kept as plain properties (graph-property-types.ts),
// and custom OMA-URI date and time and XML values are not stored, so
// History compares those by fingerprint and Compare not at all.
const STORED: Array<{
  label: string;
  at: Family;
  build: (value: unknown) => unknown;
  setting: string;
  equal: unknown[];
  different: unknown;
}> = [
  {
    label: "a TimeOfDay property",
    at: DEVICE,
    build: general,
    setting: "defenderScheduledScanTime",
    equal: ["02:00:00.0000000", "02:00:00", "02:00"],
    different: "02:30:00.0000000",
  },
  {
    label: "a Duration property",
    at: SCRIPTS,
    build: script,
    setting: "executionFrequency",
    equal: ["PT1H", "PT60M", "PT3600S"],
    different: "PT2H",
  },
  {
    label: "a Duration property of a day",
    at: SCRIPTS,
    build: script,
    setting: "executionFrequency",
    equal: ["P1D", "PT24H"],
    different: "PT23H",
  },
  {
    label: "a Single custom OMA-URI value",
    at: DEVICE,
    build: (value) => custom("omaSettingFloatingPoint", value),
    setting: URI,
    equal: [0.1, 0.10000000149011612],
    different: 0.2,
  },
];

describe("finding 2: Compare and History read equal typed values as unchanged", () => {
  for (const { label, at, build, setting, equal, different } of STORED) {
    it(`compares and diffs every form of ${label} as the same value`, () => {
      for (const a of equal)
        for (const b of equal) {
          expect(
            statusOf(at, setting, build(a), build(b)),
            `${String(a)} ${String(b)}`,
          ).toBe("matching");
          expect(
            changes(at, build(a), build(b)),
            `${String(a)} ${String(b)}`,
          ).toEqual([]);
        }
    });

    it(`still reports a different value of ${label}`, () => {
      for (const a of equal) {
        expect(statusOf(at, setting, build(a), build(different))).toBe(
          "different",
        );
        expect(statusOf(at, setting, build(different), build(a))).toBe(
          "different",
        );
        const [change] = changes(at, build(a), build(different));
        expect(change?.slice(0, 2)).toEqual([setting, "changed"]);
      }
    });
  }

  it("shows the values as Graph returned them", () => {
    expect(
      changes(DEVICE, general("02:00"), general("02:30:00.0000000")),
    ).toEqual([
      ["defenderScheduledScanTime", "changed", "02:00", "02:30:00.0000000"],
    ]);
    const [row] = compareRows(SCRIPTS, script("PT60M"), script("PT1H")).filter(
      (entry) => entry.setting === "executionFrequency",
    );
    expect(row!.status).toBe("matching");
    expect(row!.expected.map((entry) => entry.value)).toEqual(["PT60M"]);
    expect(row!.actual.map((entry) => entry.value)).toEqual(["PT1H"]);
  });

  it("matches a reference file written from another form of the value", async () => {
    const file = await createReference(project(DEVICE, general("02:00")), {
      createdAt: "2026-10-23T09:00:00Z",
      sourceLabel: "Synthetic tenant",
    });
    const parsed = await parseReference(serializeReference(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const status = (current: unknown) =>
      compareSettings(
        referenceSettings(parsed.file),
        projectionSettings(project(DEVICE, current)),
      )
        .groups.flatMap((group) => group.rows)
        .find((row) => row.setting === "defenderScheduledScanTime")?.status;
    expect(status(general("02:00:00.0000000"))).toBe("matching");
    expect(status(general("02:30:00.0000000"))).toBe("different");
  });

  it("diffs the fingerprints of custom OMA-URI dates and XML by their canonical form", () => {
    const cases: Array<[string, unknown[], unknown]> = [
      [
        "omaSettingDateTime",
        [
          "2026-10-23T10:00:00Z",
          "2026-10-23T10:00:00.0000000Z",
          "2026-10-23T10:00:00+00:00",
        ],
        "2026-10-24T10:00:00Z",
      ],
      [
        "omaSettingStringXml",
        ["PFN5bnRoZXRpYy8+", "PFN5bnRoZXRpYy8-"],
        "PFN5bnRoZXRpYzIvPg==",
      ],
    ];
    for (const [type, equal, different] of cases) {
      for (const a of equal)
        for (const b of equal)
          expect(
            diffSnapshots(
              project(DEVICE, custom(type, a)),
              project(DEVICE, custom(type, b)),
            ).policies,
            `${type} ${String(a)} ${String(b)}`,
          ).toEqual([]);
      expect(
        diffSnapshots(
          project(DEVICE, custom(type, equal[0])),
          project(DEVICE, custom(type, different)),
        ).policies,
        type,
      ).toHaveLength(1);
    }
  });
});

describe("finding 2: the scheduled scan check reads the time by its value", () => {
  const config = (time: unknown) => ({
    defenderScanType: "quick",
    defenderSystemScanSchedule: "everyday",
    defenderScheduledScanTime: time,
  });
  const observed = (time: unknown) =>
    evaluatePolicyCheck(
      {
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
        ...config(time),
      },
      "scheduledAntivirusScan",
    )?.observed;

  it("states the same evidence for every form of one time, in the form Graph returns", () => {
    for (const time of ["02:00", "02:00:00", "02:00:00.0000000"])
      expect(observed(time)).toBe("quick; everyday; 02:00:00.0000000");
    expect(observed("12:00:00.0000000")).toBe(
      "quick; everyday; 12:00:00.0000000",
    );
    expect(observed("02:30")).toBe("quick; everyday; 02:30:00.0000000");
  });

  it("states the same actual value for every form when the check is not met", () => {
    const actual = (time: unknown) =>
      policyCheckObservation(
        {
          "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
          ...config(time),
          defenderScanType: "userDefined",
        },
        "scheduledAntivirusScan",
      )?.actual;
    expect(actual("02:00")).toBe(actual("02:00:00.0000000"));
    expect(actual("02:00")).not.toBe(actual("03:00"));
  });
});

describe("finding 2: typed-values.ts", () => {
  it("canonicalizes typed properties and custom OMA-URI values without changing the item", () => {
    const item = {
      ...general("02:00"),
      omaSettings: [
        {
          "@odata.type": "#microsoft.graph.omaSettingDateTime",
          omaUri: URI,
          value: "2026-10-23T10:00:00+00:00",
        },
      ],
    };
    const before = structuredClone(item);
    const canonical = canonicalTypedValues("deviceConfigurations", item);
    expect(item).toEqual(before);
    expect(canonical.defenderScheduledScanTime).toBe("02:00:00.0000000");
    expect((canonical.omaSettings as Array<{ value: unknown }>)[0]!.value).toBe(
      "2026-10-23T10:00:00Z",
    );
    const graph = general("02:00:00.0000000");
    expect(canonicalTypedValues("deviceConfigurations", graph)).toBe(graph);
  });

  it("shows the value as Graph returned it and compares the canonical one", () => {
    const rows = comparedRows(
      "deviceConfigurations",
      "deviceConfigurations",
      general("02:00"),
    ).filter((row) => row.definitionId === "defenderScheduledScanTime");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe("02:00");
    expect(rows[0]!.token).toBe("02:00:00.0000000");
    const graph = comparedRows(
      "deviceConfigurations",
      "deviceConfigurations",
      general("02:00:00.0000000"),
    ).find((row) => row.definitionId === "defenderScheduledScanTime");
    expect(graph!.token).toBeUndefined();
  });
});

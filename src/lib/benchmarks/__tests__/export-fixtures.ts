/**
 * Synthetic assessments for the export, PDF and draft tests: benchmark id
 * "synthetic-bench", invented setting ids and titles marked Synthetic.
 */
import {
  assessBenchmark,
  combineLevelAssessments,
  type BenchmarkAssessment,
} from "../assessment";
import type { BenchmarkException } from "../exceptions";
import type { BenchmarkPack } from "../pack";
import {
  ASSIGNED,
  NOW,
  choice,
  collection,
  deviceConfiguration,
  list,
  pack,
  simpleInteger,
  simpleSecret,
  tenantPolicy,
} from "./fixtures";

export const ALPHA = "synthetic_bench_alpha";
export const BETA = "synthetic_bench_beta";
export const LENGTH = "synthetic_bench_length";
export const GAMMA = "synthetic_bench_gamma";
export const SECRET = "synthetic_bench_secret";
export const TEMPLATED = "synthetic_bench_templated";
export const MAC = "synthetic_bench_mac";
export const OUTSIDE = "synthetic_bench_outside";

export const TENANT_POLICY = "Synthetic tenant baseline";
export const UNASSIGNED_POLICY = "Synthetic unassigned profile";
export const PACK_POLICY = "Synthetic pack policy for Windows";

const LONG_TITLE =
  "Synthetic recommendation with a deliberately long title that has to wrap over several lines in the recommendation table without overlapping the result pill or the reason column beside it";

export function richPack(): BenchmarkPack {
  const value = pack(
    [
      {
        name: PACK_POLICY,
        description: "Synthetic policy covering 1.1, 1.2 and 1.3",
        settings: [
          choice(ALPHA, "1"),
          choice(BETA, "true"),
          simpleInteger(LENGTH, 14),
          choice(GAMMA, "1"),
          simpleSecret(SECRET),
        ],
      },
      {
        name: "Synthetic templated pack policy",
        settings: [choice(TEMPLATED, "1")],
      },
      {
        name: "Synthetic pack policy for macOS",
        platforms: "macOS",
        settings: [choice(MAC, "true")],
      },
    ],
    [
      {
        id: "1.1",
        title: "Synthetic alpha is on",
        level: 1,
        settings: [ALPHA],
      },
      { id: "1.2", title: "Synthetic beta is on", level: 1, settings: [BETA] },
      { id: "1.3", title: LONG_TITLE, level: 1, settings: [LENGTH] },
      {
        id: "1.4",
        title: "Synthetic templated value",
        level: 1,
        settings: [TEMPLATED],
      },
      { id: "1.5", title: "Synthetic macOS value", level: 1, settings: [MAC] },
      {
        id: "2.1",
        title: "Synthetic gamma is on",
        level: 1,
        settings: [GAMMA],
      },
      {
        id: "2.2",
        title: "Synthetic secret value",
        level: 1,
        settings: [SECRET],
      },
      {
        id: "3.1",
        title: "Synthetic setting outside the pack",
        level: 1,
        settings: [OUTSIDE],
      },
    ],
  );
  const policies = value.policies as Array<Record<string, unknown>>;
  policies[1]!.templateReference = {
    templateId: "00000000-0000-0000-0000-00000000c001_1",
  };
  policies[2]!.technologies = "mdm,appleRemoteManagement";
  return value;
}

export const RICH_LIST = list([
  ...["1.1", "1.2", "1.3", "1.4", "1.5", "2.1", "2.2", "3.1", "4.2"].map(
    (identifier) => ({ identifier, level: 1 as const, automated: true }),
  ),
  {
    identifier: "4.1",
    level: 1,
    automated: false,
    title: "Synthetic manual review item",
  },
]);

export const EXCEPTIONS: BenchmarkException[] = [
  {
    id: "exception-1",
    benchmark: "synthetic-bench",
    version: "1.0.0",
    level: 1,
    settingId: BETA,
    owner: "Synthetic Owner",
    reason: "Synthetic accepted difference for a pilot.",
    expiresOn: "2027-01-31",
    createdAt: "2026-10-01T09:00:00.000Z",
  },
  {
    id: "exception-2",
    benchmark: "synthetic-bench",
    version: "1.0.0",
    level: 1,
    settingId: GAMMA,
    owner: "Synthetic Owner",
    reason: "Synthetic expired exception.",
    expiresOn: "2026-01-31",
    createdAt: "2025-12-01T09:00:00.000Z",
  },
];

/** Every result: Matches, Differs (different and missing), Needs review, Not assessed. */
export function richAssessment(
  extra: {
    list?: boolean;
    complete?: boolean;
    other?: Parameters<typeof collection>[0]["other"];
  } = {},
): BenchmarkAssessment {
  return assessBenchmark(
    collection({
      policies: [
        tenantPolicy({
          name: TENANT_POLICY,
          settings: [
            choice(ALPHA, "1"),
            choice(BETA, "false"),
            simpleSecret(SECRET),
          ],
        }),
        tenantPolicy({
          name: UNASSIGNED_POLICY,
          settings: [choice(GAMMA, "1")],
          assignments: [],
        }),
        tenantPolicy({
          name: "Synthetic macOS profile",
          platforms: "macOS",
          settings: [],
          assignments: ASSIGNED,
        }),
      ],
      ...(extra.complete === false ? { collectedAt: null } : {}),
      ...(extra.other ? { other: extra.other } : {}),
    }),
    richPack(),
    {
      now: NOW,
      exceptions: EXCEPTIONS,
      ...(extra.list === false ? {} : { list: RICH_LIST }),
    },
  );
}

/** Nothing assessed as Matches or Differs: an incomplete collection without a list. */
export function unassessedAssessment(): BenchmarkAssessment {
  return assessBenchmark(
    collection({
      policies: [tenantPolicy({ settings: [choice(ALPHA, "1")] })],
      collectedAt: null,
    }),
    pack(
      [{ settings: [choice(ALPHA, "1"), choice(BETA, "true")] }],
      [
        {
          id: "1.1",
          title: "Synthetic alpha is on",
          level: 1,
          settings: [ALPHA],
        },
        {
          id: "1.2",
          title: "Synthetic beta is on",
          level: 1,
          settings: [BETA],
        },
      ],
    ),
    { now: NOW },
  );
}

export const UNASSIGNED_MATCH = "Synthetic unassigned match";
export const UNASSIGNED_OTHER = "Synthetic unassigned other value";
export const UNASSIGNED_UNREADABLE = "Synthetic unassigned unreadable";

export function unassignedPack(): BenchmarkPack {
  return pack(
    [
      {
        name: PACK_POLICY,
        settings: [
          choice(ALPHA, "1"),
          simpleInteger(LENGTH, 14),
          choice(GAMMA, "1"),
        ],
      },
    ],
    [
      {
        id: "1.1",
        title: "Synthetic alpha is on",
        level: 1,
        settings: [ALPHA],
      },
      {
        id: "1.2",
        title: "Synthetic length is 14",
        level: 1,
        settings: [LENGTH],
      },
      {
        id: "1.3",
        title: "Synthetic gamma is on",
        level: 1,
        settings: [GAMMA],
      },
    ],
  );
}

/**
 * Only unassigned policies hold the settings of unassignedPack: ALPHA with
 * the recommended value (notAssigned), LENGTH with another value
 * (notAssignedDiffers), GAMMA with the recommended value, another value and
 * a secret that cannot be read (notAssignedMixed).
 */
export function unassignedAssessment(
  extra: { complete?: boolean } = {},
): BenchmarkAssessment {
  return assessBenchmark(
    collection({
      policies: [
        tenantPolicy({
          name: UNASSIGNED_MATCH,
          settings: [choice(ALPHA, "1"), choice(GAMMA, "1")],
          assignments: [],
        }),
        tenantPolicy({
          name: UNASSIGNED_OTHER,
          settings: [simpleInteger(LENGTH, 9), choice(GAMMA, "2")],
          assignments: [],
        }),
        tenantPolicy({
          name: UNASSIGNED_UNREADABLE,
          settings: [simpleSecret(GAMMA)],
          assignments: [],
        }),
      ],
      ...(extra.complete === false ? { collectedAt: null } : {}),
    }),
    unassignedPack(),
    { now: NOW },
  );
}

/**
 * Level 1 and Level 2 packs judged by settings, combined as choosing Level 2
 * does. Level 1: 11 settings match, 1 differs, 1 only on an unassigned
 * policy, 2 absent; Level 2: 3 absent. A device configuration exists for the
 * platform, so the absent settings need review (otherProfiles) under one
 * step of both Levels. Every setting has a display name.
 */
export function levelsAssessment(): BenchmarkAssessment {
  const l1 = Array.from(
    { length: 15 },
    (_, index) => `synthetic_bench_level1_${index + 1}`,
  );
  const l2 = Array.from(
    { length: 3 },
    (_, index) => `synthetic_bench_level2_${index + 1}`,
  );
  const names = Object.fromEntries(
    [...l1, ...l2].map((id) => [
      id,
      {
        name: `Synthetic ${id.replace(/^synthetic_bench_level(\d)_/, "level $1 setting ")}`,
        options: {},
      },
    ]),
  );
  const tenant = collection({
    policies: [
      tenantPolicy({
        name: TENANT_POLICY,
        settings: [
          ...l1.slice(0, 11).map((id) => choice(id, "1")),
          choice(l1[11]!, "0"),
        ],
      }),
      tenantPolicy({
        name: UNASSIGNED_POLICY,
        settings: [choice(l1[12]!, "1")],
        assignments: [],
      }),
    ],
    other: {
      deviceConfigurations: [
        deviceConfiguration("windows10GeneralConfiguration"),
      ],
    },
  });
  const options = { now: NOW, names };
  return combineLevelAssessments([
    assessBenchmark(
      tenant,
      pack([{ settings: l1.map((id) => choice(id, "1")) }]),
      options,
    ),
    assessBenchmark(
      tenant,
      pack([{ settings: l2.map((id) => choice(id, "1")) }], undefined, 2),
      options,
    ),
  ]);
}

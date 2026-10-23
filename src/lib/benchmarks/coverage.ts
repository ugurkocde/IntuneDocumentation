/**
 * Coverage of the full benchmark, adapted from TenuVault (cis-coverage.ts,
 * computeCoverage and extractRecommendationIds only). The denominator is the
 * delivered recommendation list: every identifier of a Level that the list
 * marks automated. Without a list there is no denominator and coverage is
 * not shown; it is never estimated.
 */
import type { RecommendationList } from "./pack";

// A whole dotted-decimal token: never the tail of a word such as v1.0.0 and
// never cut short before more letters or digits.
const IDENTIFIER_PATTERN = /(?<![\w.])\d+(?:\.\d+)+(?!\.?\w)/g;
const DATE_LIKE = /^\d{4}\.\d{1,2}\.\d{1,2}(?:\.\d+)?$/;

/**
 * Distinct dotted-decimal identifiers in one text, sorted. The pack version
 * token and date-like export timestamps are never identifiers.
 */
export function extractRecommendationIds(
  text: string,
  options?: { packVersion?: string },
): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(IDENTIFIER_PATTERN)) {
    const token = match[0];
    if (options?.packVersion && token === options.packVersion) continue;
    if (DATE_LIKE.test(token)) continue;
    found.add(token);
  }
  return [...found].sort();
}

type Level = RecommendationList["items"][number]["level"];

export interface LevelCoverage {
  level: Level;
  source: "list" | "none";
  /** Automated identifiers of this Level in the list; null without a list. */
  denominator: number | null;
  numerator: number;
  /** numerator / denominator; null without a list or when it marks none automated. */
  coverage: number | null;
  /** Automated identifiers the pack checks. */
  coveredIds: string[];
  /** Automated identifiers the pack does not check: they need a manual check. */
  notCoveredIds: string[];
  /** Identifiers the pack checks that the list does not mark automated for this Level. */
  outsideListIds: string[];
  /** Identifiers named in the pack policy descriptions. */
  enumeratedIds: string[];
}

const sorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

/**
 * Coverage of one Level. The pack checks an identifier when one of its
 * recommendations was assessed (any result but Not assessed) or a policy
 * description names it, unless its pack recommendation could not be
 * assessed.
 */
export function computeCoverage(input: {
  level: Level;
  version: string;
  descriptions: readonly string[];
  assessedIds: readonly string[];
  unassessedIds: readonly string[];
  list?: RecommendationList;
}): LevelCoverage {
  const enumerated = sorted(
    input.descriptions.flatMap((text) =>
      extractRecommendationIds(text, { packVersion: input.version }),
    ),
  );
  const unassessed = new Set(input.unassessedIds);
  const checked = new Set(
    [...input.assessedIds, ...enumerated].filter((id) => !unassessed.has(id)),
  );
  if (!input.list)
    return {
      level: input.level,
      source: "none",
      denominator: null,
      numerator: 0,
      coverage: null,
      coveredIds: [],
      notCoveredIds: [],
      outsideListIds: sorted(checked),
      enumeratedIds: enumerated,
    };
  const automated = new Set(
    input.list.items
      .filter((item) => item.level === input.level && item.automated)
      .map((item) => item.identifier),
  );
  const covered = sorted([...checked].filter((id) => automated.has(id)));
  return {
    level: input.level,
    source: "list",
    denominator: automated.size,
    numerator: covered.length,
    coverage: automated.size ? covered.length / automated.size : null,
    coveredIds: covered,
    notCoveredIds: sorted([...automated].filter((id) => !checked.has(id))),
    outsideListIds: sorted([...checked].filter((id) => !automated.has(id))),
    enumeratedIds: enumerated,
  };
}

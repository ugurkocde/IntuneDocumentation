import {
  capControlChanges,
  capSnapshotDiff,
  diffAssessments,
  diffSnapshots,
  type AssessmentDiff,
  type SnapshotDiff,
} from "../../../../src/lib/snapshots/diff";
import type { SnapshotProjection } from "../../../../src/lib/snapshots/projection";
import type {
  HistoryDiffRequest,
  HistoryDiffView,
  HistoryEntry,
} from "../shared/ipc-types";

export const SNAPSHOT_ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{8}$/;
const FRAMEWORK_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

export const NEEDS_TWO_SNAPSHOTS =
  "Two snapshots are needed to compare. Collect again to add one.";

export function parseSnapshotId(input: unknown): string {
  if (typeof input !== "string" || !SNAPSHOT_ID_PATTERN.test(input)) {
    throw new Error("Unknown snapshot.");
  }
  return input;
}

// The renderer only picks from known values.
export function parseHistoryDiffRequest(input: unknown): HistoryDiffRequest {
  if (input !== undefined && input !== null && typeof input !== "object") {
    throw new Error("Refused an unexpected comparison.");
  }
  const raw = (input ?? {}) as Record<string, unknown>;
  const request: HistoryDiffRequest = {};
  if (raw.fromId !== undefined) request.fromId = parseSnapshotId(raw.fromId);
  if (raw.toId !== undefined) request.toId = parseSnapshotId(raw.toId);
  if (raw.frameworkId !== undefined) {
    if (
      typeof raw.frameworkId !== "string" ||
      !FRAMEWORK_ID_PATTERN.test(raw.frameworkId)
    ) {
      throw new Error("Unknown compliance framework.");
    }
    request.frameworkId = raw.frameworkId;
  }
  return request;
}

// Older first. Defaults to the previous and the latest snapshot; entries are
// newest first, as history:list returns them.
export function pickPair(
  entries: readonly HistoryEntry[],
  request: HistoryDiffRequest,
): { from: HistoryEntry; to: HistoryEntry } {
  if (entries.length < 2) throw new Error(NEEDS_TWO_SNAPSHOTS);
  const find = (id: string) => {
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) {
      throw new Error("This snapshot is not in the history of the signed in tenant.");
    }
    return entry;
  };
  const to = request.toId ? find(request.toId) : entries[0]!;
  const from = request.fromId
    ? find(request.fromId)
    : (entries.find((entry) => entry.id !== to.id && entry.collectedAt <= to.collectedAt) ??
      entries.find((entry) => entry.id !== to.id)!);
  if (from.id === to.id) throw new Error("Choose two different snapshots.");
  return from.collectedAt > to.collectedAt ? { from: to, to: from } : { from, to };
}

export interface ComparedSnapshots {
  snapshots: SnapshotDiff;
  assessments: AssessmentDiff;
}

export function compareProjections(
  from: SnapshotProjection,
  to: SnapshotProjection,
): ComparedSnapshots {
  return {
    snapshots: diffSnapshots(from, to),
    assessments: diffAssessments(from.assessment, to.assessment),
  };
}

// What leaves main: capped rows for the policies and the selected framework.
export function historyDiffView(
  from: HistoryEntry,
  to: HistoryEntry,
  compared: ComparedSnapshots,
  frameworkId?: string,
): HistoryDiffView {
  const capped = capSnapshotDiff(compared.snapshots);
  const frameworks = compared.assessments.frameworks;
  const selected =
    frameworks.find((framework) => framework.id === frameworkId) ??
    frameworks.find((framework) => framework.changes.length > 0) ??
    frameworks[0];
  return {
    from,
    to,
    policies: capped.policies,
    totals: capped.totals,
    notCompared: capped.notCompared,
    notComparedItems: capped.notComparedItems,
    controls: {
      fromRuleset: compared.assessments.fromRuleset,
      toRuleset: compared.assessments.toRuleset,
      rulesetChanged: compared.assessments.rulesetChanged,
      frameworks: frameworks.map((framework) => ({
        id: framework.id,
        name: framework.name,
        changed: framework.changes.length,
      })),
      frameworkId: selected?.id ?? null,
      changes: capControlChanges(selected?.changes ?? []),
      total: selected?.changes.length ?? 0,
    },
  };
}

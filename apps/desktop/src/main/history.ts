import type { ControlStatus } from "../../../../src/lib/compliance/types";
import {
  capControlChanges,
  capSnapshotDiff,
  definitionLabels,
  diffAssessments,
  diffSnapshots,
  labelControlChanges,
  type AssessmentDiff,
  type DefinitionLabels,
  type SnapshotDiff,
} from "../../../../src/lib/snapshots/diff";
import type { SnapshotProjection } from "../../../../src/lib/snapshots/projection";
import type {
  HistoryDiffRequest,
  HistoryDiffView,
  HistoryEntry,
  ManagementReportChanges,
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
  // Setting and option names for the control evidence lines.
  labels?: DefinitionLabels;
}

export function compareProjections(
  from: SnapshotProjection,
  to: SnapshotProjection,
): ComparedSnapshots {
  return {
    snapshots: diffSnapshots(from, to),
    assessments: diffAssessments(from.assessment, to.assessment),
    labels: definitionLabels(from, to),
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
    identity: capped.identity,
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
      changes: labelControlChanges(
        capControlChanges(selected?.changes ?? []),
        compared.labels ?? { settings: new Map(), options: new Map() },
      ),
      total: selected?.changes.length ?? 0,
    },
  };
}

// The newest snapshot collected before the given time: the earlier side of
// the management report's change section. Entries are newest first.
export function previousSnapshot(
  entries: readonly HistoryEntry[],
  collectedAt: string,
): HistoryEntry | null {
  const current = Date.parse(collectedAt);
  if (Number.isNaN(current)) return null;
  return entries.find((entry) => Date.parse(entry.collectedAt) < current) ?? null;
}

const HAS_EVIDENCE: ReadonlySet<ControlStatus | null> = new Set<ControlStatus | null>([
  "evidenceFound",
  "partialEvidence",
]);

// Counts and control status changes of one framework for the management
// panel and report. No policy names or values, like the rest of the report.
export function managementChanges(
  from: Pick<SnapshotProjection, "collectedAt" | "partial">,
  to: Pick<SnapshotProjection, "collectedAt" | "partial">,
  compared: ComparedSnapshots,
  frameworkId: string,
): ManagementReportChanges {
  const { totals } = compared.snapshots;
  const framework = compared.assessments.frameworks.find(
    (entry) => entry.id === frameworkId,
  );
  const controls = (framework?.changes ?? []).map((change) => ({
    id: change.controlId,
    before: change.before,
    after: change.after,
  }));
  return {
    since: from.collectedAt,
    until: to.collectedAt,
    policies: {
      added: totals.added,
      removed: totals.removed,
      renamed: totals.renamed,
      changed: totals.changed,
      settingChanges: totals.settingChanges,
      assignmentChanges: totals.assignmentChanges,
      notComparedFamilies: totals.notComparedFamilies,
      notComparedItems: totals.notComparedItems,
    },
    controls,
    improved: controls.filter(
      (control) => !HAS_EVIDENCE.has(control.before) && HAS_EVIDENCE.has(control.after),
    ).length,
    regressed: controls.filter(
      (control) => HAS_EVIDENCE.has(control.before) && !HAS_EVIDENCE.has(control.after),
    ).length,
    rulesetChanged: compared.assessments.rulesetChanged,
    fromRuleset: compared.assessments.fromRuleset,
    toRuleset: compared.assessments.toRuleset,
    partial: from.partial || to.partial,
  };
}


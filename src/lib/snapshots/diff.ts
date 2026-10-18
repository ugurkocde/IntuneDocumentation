// Pure comparison of two stored snapshots of one tenant: configuration
// changes per policy and control status changes from the stored assessments.
import { flattenItemSettings } from "../settings-flatten";
import type { CapabilityStatus, ControlStatus } from "../compliance/types";
import {
  FINGERPRINT_LABELS,
  snapshotItemLabel,
  type SnapshotItem,
  type SnapshotProjection,
  type SnapshotSection,
  type StoredAssessment,
  type StoredCapability,
  type StoredCheck,
  type StoredEvidence,
} from "./projection";

export interface SettingChange {
  // Definition id or property path, parents and occurrence.
  key: string;
  name: string;
  path: string[];
  definitionId: string | null;
  change: "added" | "removed" | "changed";
  before: string | null;
  after: string | null;
  // The content itself is not stored, only whether it changed.
  notStored?: true;
}

export interface AssignmentChange {
  change: "added" | "removed";
  label: string;
}

export interface PolicyChange {
  sectionKey: string;
  sectionLabel: string;
  familyKey: string;
  id: string;
  kind: "added" | "removed" | "changed";
  displayName: string;
  // Set when the same policy id has a new name.
  previousName?: string;
  settings: SettingChange[];
  assignments: AssignmentChange[];
  // Counts before capping; equal to the list lengths until then.
  settingsTotal: number;
  assignmentsTotal: number;
}

export interface NotComparedFamily {
  sectionKey: string;
  label: string;
  reason: "failed" | "skipped" | "missing";
  // Which snapshot lacks complete data.
  side: "from" | "to" | "both";
}

export interface NotComparedItem {
  sectionKey: string;
  sectionLabel: string;
  id: string;
  displayName: string;
}

export interface SnapshotDiffTotals {
  // Policies with any change, before capping.
  policies: number;
  added: number;
  removed: number;
  renamed: number;
  changed: number;
  settingChanges: number;
  assignmentChanges: number;
  notComparedFamilies: number;
  notComparedItems: number;
}

export interface SnapshotDiff {
  policies: PolicyChange[];
  notCompared: NotComparedFamily[];
  notComparedItems: NotComparedItem[];
  totals: SnapshotDiffTotals;
}

const OCCURRENCE = "\u0000";

function settingRows(
  sectionKey: string,
  item: SnapshotItem,
): Map<
  string,
  { name: string; path: string[]; definitionId: string | null; value: string }
> {
  const rows = new Map<
    string,
    { name: string; path: string[]; definitionId: string | null; value: string }
  >();
  const seen = new Map<string, number>();
  for (const row of flattenItemSettings(sectionKey, item.data)) {
    const base = [row.definitionId ?? row.name, ...row.path].join(OCCURRENCE);
    // Repeated rows with the same id and parents are told apart by position.
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    rows.set(`${base}${OCCURRENCE}${occurrence}`, {
      name: row.name,
      path: row.path,
      definitionId: row.definitionId ?? null,
      value: row.value,
    });
  }
  return rows;
}

function settingChanges(
  sectionKey: string,
  before: SnapshotItem,
  after: SnapshotItem,
): SettingChange[] {
  const a = settingRows(sectionKey, before);
  const b = settingRows(sectionKey, after);
  const changes: SettingChange[] = [];
  for (const [key, row] of b) {
    const old = a.get(key);
    if (!old)
      changes.push({
        key,
        ...row,
        change: "added",
        before: null,
        after: row.value,
      });
    else if (old.value !== row.value)
      changes.push({
        key,
        ...row,
        change: "changed",
        before: old.value,
        after: row.value,
      });
  }
  for (const [key, row] of a) {
    if (!b.has(key))
      changes.push({
        key,
        ...row,
        change: "removed",
        before: row.value,
        after: null,
      });
  }
  for (const [property, label] of Object.entries(FINGERPRINT_LABELS)) {
    const old = before.fingerprints?.[property];
    const next = after.fingerprints?.[property];
    if (old === next) continue;
    changes.push({
      key: `fingerprint${OCCURRENCE}${property}`,
      name: label,
      path: [],
      definitionId: property,
      change: !old ? "added" : !next ? "removed" : "changed",
      before: null,
      after: null,
      notStored: true,
    });
  }
  return changes;
}

type AssignmentState = Map<string, string> | null;

function targetLabel(
  target: Record<string, unknown>,
  groupNames: Readonly<Record<string, string>>,
): string {
  const odataType = target["@odata.type"];
  const type = (typeof odataType === "string" ? odataType : "")
    .replace(/^#?(microsoft\.graph\.)?/, "")
    .toLowerCase();
  const groupId = typeof target.groupId === "string" ? target.groupId : "";
  const group = groupId
    ? `group ${groupNames[groupId] ?? (typeof target.groupName === "string" ? target.groupName : groupId)}`
    : "";
  if (type === "alldevicesassignmenttarget") return "All devices";
  if (
    type === "alllicensedusersassignmenttarget" ||
    type === "allusersassignmenttarget"
  )
    return "All users";
  if (type === "exclusiongroupassignmenttarget") return `Excluded ${group}`;
  if (type === "groupassignmenttarget")
    return group.charAt(0).toUpperCase() + group.slice(1);
  return type || "Unknown target";
}

// Null when assignments were not collected completely, so they are not
// compared.
function assignmentsOf(
  item: SnapshotItem,
  groupNames: Readonly<Record<string, string>>,
): AssignmentState {
  const list = item.data.assignments;
  const status = item.data.collectionStatus as
    | Record<string, unknown>
    | undefined;
  if (!Array.isArray(list) || status?.assignments === "incomplete") return null;
  const result = new Map<string, string>();
  for (const entry of list as Array<Record<string, unknown>>) {
    const target = (entry.target ?? {}) as Record<string, unknown>;
    const filterId = target.deviceAndAppManagementAssignmentFilterId;
    const filterType = target.deviceAndAppManagementAssignmentFilterType;
    const filter =
      typeof filterId === "string" && filterId && filterType !== "none"
        ? `, filter ${typeof filterType === "string" ? filterType : "unknown"} ${filterId}`
        : "";
    const intent = typeof entry.intent === "string" ? `${entry.intent}: ` : "";
    const key = [
      target["@odata.type"],
      target.groupId,
      filterId,
      filterType,
      entry.intent,
    ]
      .map((part) => (typeof part === "string" ? part : ""))
      .join("|");
    result.set(key, `${intent}${targetLabel(target, groupNames)}${filter}`);
  }
  return result;
}

function assignmentChanges(
  before: AssignmentState,
  after: AssignmentState,
): AssignmentChange[] {
  if (!before || !after) return [];
  const changes: AssignmentChange[] = [];
  for (const [key, label] of after)
    if (!before.has(key)) changes.push({ change: "added", label });
  for (const [key, label] of before)
    if (!after.has(key)) changes.push({ change: "removed", label });
  return changes;
}

function byId(section: SnapshotSection): Map<string, SnapshotItem> {
  return new Map(section.items.map((item) => [item.id, item]));
}

export function diffSnapshots(
  from: SnapshotProjection,
  to: SnapshotProjection,
): SnapshotDiff {
  const policies: PolicyChange[] = [];
  const notCompared: NotComparedFamily[] = [];
  const notComparedItems: NotComparedItem[] = [];
  const fromSections = new Map(
    from.sections.map((section) => [section.key, section]),
  );
  const toSections = new Map(
    to.sections.map((section) => [section.key, section]),
  );
  // Names resolved in the newer snapshot win; the older ones fill gaps.
  const groupNames = { ...from.groupNames, ...to.groupNames };
  const keys = [
    ...to.sections.map((section) => section.key),
    ...from.sections
      .map((section) => section.key)
      .filter((key) => !toSections.has(key)),
  ];

  for (const key of keys) {
    const a = fromSections.get(key);
    const b = toSections.get(key);
    const label = (b ?? a)!.label;
    if (!a || !b) {
      notCompared.push({
        sectionKey: key,
        label,
        reason: "missing",
        side: a ? "to" : "from",
      });
      continue;
    }
    if (a.status !== "complete" || b.status !== "complete") {
      const failed = a.status === "failed" || b.status === "failed";
      notCompared.push({
        sectionKey: key,
        label,
        reason: failed ? "failed" : "skipped",
        side:
          a.status !== "complete" && b.status !== "complete"
            ? "both"
            : a.status !== "complete"
              ? "from"
              : "to",
      });
      continue;
    }
    const before = byId(a);
    const after = byId(b);
    const change = (
      item: SnapshotItem,
      kind: PolicyChange["kind"],
      extra: Partial<PolicyChange> = {},
    ): PolicyChange => ({
      sectionKey: key,
      sectionLabel: label,
      familyKey: b.familyKey,
      id: item.id,
      kind,
      displayName: snapshotItemLabel(b, item),
      settings: [],
      assignments: [],
      settingsTotal: 0,
      assignmentsTotal: 0,
      ...extra,
    });
    for (const item of b.items) {
      const old = before.get(item.id);
      if (!old) {
        policies.push(change(item, "added"));
        continue;
      }
      if (old.incomplete || item.incomplete) {
        notComparedItems.push({
          sectionKey: key,
          sectionLabel: label,
          id: item.id,
          displayName: snapshotItemLabel(b, item),
        });
        continue;
      }
      const previousName = snapshotItemLabel(a, old);
      const renamed = previousName !== snapshotItemLabel(b, item);
      const settings = settingChanges(key, old, item);
      const assignments = assignmentChanges(
        assignmentsOf(old, groupNames),
        assignmentsOf(item, groupNames),
      );
      if (!renamed && !settings.length && !assignments.length) continue;
      policies.push(
        change(item, "changed", {
          ...(renamed ? { previousName } : {}),
          settings,
          assignments,
          settingsTotal: settings.length,
          assignmentsTotal: assignments.length,
        }),
      );
    }
    for (const item of a.items) {
      if (!after.has(item.id))
        policies.push({
          ...change(item, "removed"),
          displayName: snapshotItemLabel(a, item),
        });
    }
  }

  return {
    policies,
    notCompared,
    notComparedItems,
    totals: {
      policies: policies.length,
      added: policies.filter((policy) => policy.kind === "added").length,
      removed: policies.filter((policy) => policy.kind === "removed").length,
      renamed: policies.filter((policy) => policy.previousName !== undefined)
        .length,
      changed: policies.filter(
        (policy) =>
          policy.kind === "changed" &&
          (policy.settingsTotal > 0 || policy.assignmentsTotal > 0),
      ).length,
      settingChanges: policies.reduce(
        (sum, policy) => sum + policy.settingsTotal,
        0,
      ),
      assignmentChanges: policies.reduce(
        (sum, policy) => sum + policy.assignmentsTotal,
        0,
      ),
      notComparedFamilies: notCompared.length,
      notComparedItems: notComparedItems.length,
    },
  };
}

export interface DiffLimits {
  maxPolicies: number;
  maxSettingsPerPolicy: number;
  maxAssignmentsPerPolicy: number;
  maxValueLength: number;
  maxNotComparedItems: number;
}

export const DEFAULT_DIFF_LIMITS: DiffLimits = {
  maxPolicies: 200,
  maxSettingsPerPolicy: 50,
  maxAssignmentsPerPolicy: 50,
  maxValueLength: 2000,
  maxNotComparedItems: 50,
};

function clip(value: string | null, max: number): string | null {
  return value !== null && value.length > max
    ? `${value.slice(0, max)}...`
    : value;
}

// What leaves the main process: at most the limits, totals unchanged.
export function capSnapshotDiff(
  diff: SnapshotDiff,
  limits: DiffLimits = DEFAULT_DIFF_LIMITS,
): SnapshotDiff {
  return {
    ...diff,
    policies: diff.policies.slice(0, limits.maxPolicies).map((policy) => ({
      ...policy,
      settings: policy.settings
        .slice(0, limits.maxSettingsPerPolicy)
        .map((setting) => ({
          ...setting,
          before: clip(setting.before, limits.maxValueLength),
          after: clip(setting.after, limits.maxValueLength),
        })),
      assignments: policy.assignments.slice(0, limits.maxAssignmentsPerPolicy),
    })),
    notComparedItems: diff.notComparedItems.slice(
      0,
      limits.maxNotComparedItems,
    ),
  };
}

// --- Assessments --------------------------------------------------------------

export interface EvidenceRef {
  policyName: string;
  settingId: string;
  observedValue: string;
  verdict: StoredEvidence["verdict"];
  assignment: StoredEvidence["assignment"];
  // Readable names from the setting definitions stored with the snapshots,
  // when the values are Settings Catalog ids.
  settingName?: string;
  valueLabel?: string;
}

export interface CheckChange {
  settingId: string;
  policyName: string | null;
  before: StoredCheck["result"] | "absent";
  after: StoredCheck["result"] | "absent";
  beforeValue: string | null;
  afterValue: string | null;
}

export interface CapabilityChange {
  capabilityId: string;
  name: string;
  before: CapabilityStatus | null;
  after: CapabilityStatus | null;
  evidenceAdded: EvidenceRef[];
  evidenceRemoved: EvidenceRef[];
  checksChanged: CheckChange[];
}

export interface ControlStatusChange {
  controlId: string;
  title: string;
  // Null when the control is mapped in one assessment only.
  before: ControlStatus | null;
  after: ControlStatus | null;
  causes: CapabilityChange[];
  // The capabilities mapped to the control differ, as after a ruleset update.
  mappingChanged: boolean;
}

export interface FrameworkChanges {
  id: string;
  name: string;
  changes: ControlStatusChange[];
}

export interface AssessmentDiff {
  fromRuleset: string;
  toRuleset: string;
  rulesetChanged: boolean;
  frameworks: FrameworkChanges[];
}

function evidenceKey(evidence: StoredEvidence): string {
  return [
    evidence.policyId,
    evidence.settingId,
    evidence.verdict,
    evidence.observedValue,
    evidence.assignment,
  ].join(OCCURRENCE);
}

function evidenceRef(evidence: StoredEvidence): EvidenceRef {
  return {
    policyName: evidence.policyName,
    settingId: evidence.settingId,
    observedValue: evidence.observedValue,
    verdict: evidence.verdict,
    assignment: evidence.assignment,
  };
}

function checkKey(check: StoredCheck): string {
  return [check.settingId, check.policyId ?? ""].join(OCCURRENCE);
}

function capabilityChange(
  id: string,
  a: StoredCapability | undefined,
  b: StoredCapability | undefined,
): CapabilityChange | null {
  const fromEvidence = new Map(
    (a?.evidence ?? []).map((item) => [evidenceKey(item), item]),
  );
  const toEvidence = new Map(
    (b?.evidence ?? []).map((item) => [evidenceKey(item), item]),
  );
  const evidenceAdded = [...toEvidence]
    .filter(([key]) => !fromEvidence.has(key))
    .map(([, item]) => evidenceRef(item));
  const evidenceRemoved = [...fromEvidence]
    .filter(([key]) => !toEvidence.has(key))
    .map(([, item]) => evidenceRef(item));
  const fromChecks = new Map(
    (a?.checks ?? []).map((check) => [checkKey(check), check]),
  );
  const toChecks = new Map(
    (b?.checks ?? []).map((check) => [checkKey(check), check]),
  );
  const checksChanged: CheckChange[] = [];
  for (const key of new Set([...fromChecks.keys(), ...toChecks.keys()])) {
    const old = fromChecks.get(key);
    const next = toChecks.get(key);
    if (
      old &&
      next &&
      old.result === next.result &&
      old.actualValue === next.actualValue
    )
      continue;
    checksChanged.push({
      settingId: (next ?? old)!.settingId,
      policyName: (next ?? old)!.policyName ?? null,
      before: old ? old.result : "absent",
      after: next ? next.result : "absent",
      beforeValue: old?.actualValue ?? null,
      afterValue: next?.actualValue ?? null,
    });
  }
  const before = a?.status ?? null;
  const after = b?.status ?? null;
  if (
    before === after &&
    !evidenceAdded.length &&
    !evidenceRemoved.length &&
    !checksChanged.length
  )
    return null;
  return {
    capabilityId: id,
    name: (b ?? a)?.name ?? id,
    before,
    after,
    evidenceAdded,
    evidenceRemoved,
    checksChanged,
  };
}

export function diffAssessments(
  from: StoredAssessment,
  to: StoredAssessment,
): AssessmentDiff {
  const fromCapabilities = new Map(
    from.capabilities.map((item) => [item.id, item]),
  );
  const toCapabilities = new Map(
    to.capabilities.map((item) => [item.id, item]),
  );
  const fromFrameworks = new Map(
    from.frameworks.map((item) => [item.id, item]),
  );
  const causes = new Map<string, CapabilityChange | null>();
  const causeOf = (id: string) => {
    if (!causes.has(id))
      causes.set(
        id,
        capabilityChange(id, fromCapabilities.get(id), toCapabilities.get(id)),
      );
    return causes.get(id)!;
  };
  // Frameworks of the newer assessment, then any it no longer has.
  const frameworks = [
    ...to.frameworks,
    ...from.frameworks.filter(
      (framework) => !to.frameworks.some((next) => next.id === framework.id),
    ),
  ];
  return {
    fromRuleset: from.rulesetVersion,
    toRuleset: to.rulesetVersion,
    rulesetChanged: from.rulesetVersion !== to.rulesetVersion,
    frameworks: frameworks.map((framework) => {
      const old = fromFrameworks.get(framework.id);
      const next = to.frameworks.find((item) => item.id === framework.id);
      const oldControls = new Map(
        (old?.controls ?? []).map((control) => [control.id, control]),
      );
      const nextControls = new Map(
        (next?.controls ?? []).map((control) => [control.id, control]),
      );
      const ids = [
        ...(next?.controls ?? []).map((control) => control.id),
        ...(old?.controls ?? [])
          .map((control) => control.id)
          .filter((id) => !nextControls.has(id)),
      ];
      const changes: ControlStatusChange[] = [];
      for (const id of ids) {
        const a = oldControls.get(id);
        const b = nextControls.get(id);
        if (a && b && a.status === b.status) continue;
        const mapped = new Set([
          ...(a?.capabilityIds ?? []),
          ...(b?.capabilityIds ?? []),
        ]);
        const fromIds = [...(a?.capabilityIds ?? [])].sort().join(OCCURRENCE);
        const toIds = [...(b?.capabilityIds ?? [])].sort().join(OCCURRENCE);
        changes.push({
          controlId: id,
          title: (b ?? a)!.title,
          before: a?.status ?? null,
          after: b?.status ?? null,
          causes: [...mapped]
            .sort()
            .map(causeOf)
            .filter((cause): cause is CapabilityChange => cause !== null),
          mappingChanged: fromIds !== toIds,
        });
      }
      return { id: framework.id, name: framework.name, changes };
    }),
  };
}

export interface ControlLimits {
  maxControls: number;
  maxCauses: number;
  maxRowsPerCause: number;
  maxValueLength: number;
}

export const DEFAULT_CONTROL_LIMITS: ControlLimits = {
  maxControls: 300,
  maxCauses: 10,
  maxRowsPerCause: 10,
  maxValueLength: 500,
};

export function capControlChanges(
  changes: readonly ControlStatusChange[],
  limits: ControlLimits = DEFAULT_CONTROL_LIMITS,
): ControlStatusChange[] {
  const value = (text: string) =>
    text.length > limits.maxValueLength
      ? `${text.slice(0, limits.maxValueLength)}...`
      : text;
  return changes.slice(0, limits.maxControls).map((change) => ({
    ...change,
    causes: change.causes.slice(0, limits.maxCauses).map((cause) => ({
      ...cause,
      evidenceAdded: cause.evidenceAdded
        .slice(0, limits.maxRowsPerCause)
        .map((ref) => ({ ...ref, observedValue: value(ref.observedValue) })),
      evidenceRemoved: cause.evidenceRemoved
        .slice(0, limits.maxRowsPerCause)
        .map((ref) => ({ ...ref, observedValue: value(ref.observedValue) })),
      checksChanged: cause.checksChanged
        .slice(0, limits.maxRowsPerCause)
        .map((check) => ({
          ...check,
          beforeValue:
            check.beforeValue === null ? null : value(check.beforeValue),
          afterValue:
            check.afterValue === null ? null : value(check.afterValue),
        })),
    })),
  }));
}

// --- Readable names -----------------------------------------------------------

export interface DefinitionLabels {
  settings: Map<string, string>;
  options: Map<string, string>;
}

function collectDefinitions(value: unknown, labels: DefinitionLabels): void {
  if (!Array.isArray(value)) return;
  for (const setting of value) {
    if (!setting || typeof setting !== "object") continue;
    const record = setting as Record<string, unknown>;
    for (const definition of Array.isArray(record.settingDefinitions)
      ? record.settingDefinitions
      : []) {
      if (!definition || typeof definition !== "object") continue;
      const entry = definition as Record<string, unknown>;
      if (typeof entry.id === "string" && typeof entry.displayName === "string")
        labels.settings.set(entry.id, entry.displayName);
      for (const option of Array.isArray(entry.options) ? entry.options : []) {
        const item = (option ?? {}) as Record<string, unknown>;
        const name = item.displayName ?? item.name;
        if (typeof item.itemId === "string" && typeof name === "string" && name)
          labels.options.set(item.itemId, name);
      }
    }
  }
}

// Setting and option names from the Settings Catalog definitions stored with
// the snapshots; later snapshots win.
export function definitionLabels(
  ...projections: readonly SnapshotProjection[]
): DefinitionLabels {
  const labels: DefinitionLabels = { settings: new Map(), options: new Map() };
  for (const projection of projections)
    for (const section of projection.sections)
      for (const item of section.items) {
        collectDefinitions(item.data.settings, labels);
        for (const category of Array.isArray(item.data.categories)
          ? item.data.categories
          : [])
          collectDefinitions(
            (category as Record<string, unknown> | null)?.settings,
            labels,
          );
      }
  return labels;
}

function labelRef(ref: EvidenceRef, labels: DefinitionLabels): EvidenceRef {
  const settingName = labels.settings.get(ref.settingId);
  const valueLabel = labels.options.get(ref.observedValue);
  return {
    ...ref,
    ...(settingName ? { settingName } : {}),
    ...(valueLabel ? { valueLabel } : {}),
  };
}

// Adds readable names to the evidence lines of control changes, the way the
// policy changes show option names instead of option ids.
export function labelControlChanges(
  changes: readonly ControlStatusChange[],
  labels: DefinitionLabels,
): ControlStatusChange[] {
  return changes.map((change) => ({
    ...change,
    causes: change.causes.map((cause) => ({
      ...cause,
      evidenceAdded: cause.evidenceAdded.map((ref) => labelRef(ref, labels)),
      evidenceRemoved: cause.evidenceRemoved.map((ref) =>
        labelRef(ref, labels),
      ),
    })),
  }));
}


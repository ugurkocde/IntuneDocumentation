/**
 * Reads the Settings Catalog policies of one collection (DetailedExportData)
 * for a benchmark comparison, with what the collection can prove about them.
 *
 * Shapes (verified live in WP0, tasks/briefs/cis-wp0-graph-shapes.md): the
 * collector lists /deviceManagement/configurationPolicies (beta) with
 * platforms, technologies and templateReference, so Endpoint security and
 * security baseline policies created from templates are in the same family;
 * settings[] holds { id, settingInstance, settingDefinitions? } as
 * /configurationPolicies/{id}/settings returns them; assignments[] holds the
 * policy assignments; collectionStatus.settings and .assignments are
 * "complete" or "incomplete", and failures are listed in fetchErrors with
 * familyKey "settingsCatalog" (per policy) or a collection entry.
 *
 * A failure that concerns only a policy's assignments leaves its settings
 * proven: the family stays complete and that policy's assignment is unknown.
 */
import type { DetailedExportData } from "../configuration-analyzer";
import { summarizeAssignments } from "../compliance/assignments";
import { buildCollectionCoverage } from "../compliance/coverage";
import { record, type RecordJson } from "./policies";

export type AssignmentState = "assigned" | "notAssigned" | "unknown";

export interface TenantPolicy {
  id: string;
  name: string;
  /** Null when Graph did not return a readable platforms value. */
  platforms: string | null;
  technologies: string | null;
  /** True for policies created from a template (Endpoint security, baselines). */
  templated: boolean;
  /** Root setting instances as collected. */
  settings: RecordJson[];
  /** Every setting of the policy was read. */
  settingsComplete: boolean;
  assignment: AssignmentState;
}

export interface TenantSettings {
  collectedAt: string | null;
  policies: TenantPolicy[];
  /**
   * True only when absence can be proven: the collection finished, the
   * Settings Catalog family has no error and every policy was read whole
   * with a readable platform. Missing needs it, and so does Present, because
   * an unread policy may hold another value.
   */
  complete: boolean;
  /** Plain reasons the family is not complete, for display. */
  gaps: string[];
}

export type BenchmarkCollection = Omit<DetailedExportData, "groupNames"> & {
  groupNames?: ReadonlyMap<string, string>;
};

type FetchError = NonNullable<BenchmarkCollection["fetchErrors"]>[number];

const FAMILY = "settingsCatalog";

// The collector joins its per policy step warnings with "; ", each starting
// with its step ("Settings:" or "Assignments:"), and names the policy (not
// the relation) as the endpoint.
const assignmentStepsOnly = (message: unknown) =>
  typeof message === "string" &&
  message.split("; ").every((step) => step.startsWith("Assignments:"));
const POLICY_ENDPOINT = /\/configurationPolicies\('[^/]*'\)(?:\/assignments)?$/;

function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function sectionItems(data: BenchmarkCollection): unknown[] | null {
  if (data.sections?.length) {
    const sections = data.sections.filter(
      (section) => section.familyKey === FAMILY,
    );
    return sections.length
      ? sections.flatMap((section) => section.items)
      : null;
  }
  return Array.isArray(data.settingsCatalog) ? data.settingsCatalog : null;
}

const familyError = (error: FetchError) =>
  error.familyKey === FAMILY ||
  (!error.familyKey && error.policyType === "Settings Catalog");

/**
 * The items whose only collection failure is their assignments, by the
 * collector's markers: settings "complete", assignments "incomplete", no
 * other part incomplete, and every fetch error message and fetchErrors
 * entry of the policy made of "Assignments:" steps on the policy endpoint.
 * A missing or ambiguous marker keeps the failure family wide.
 */
function assignmentOnlyItems(
  items: readonly unknown[],
  errors: readonly FetchError[],
): Set<RecordJson> {
  const only = new Set<RecordJson>();
  for (const item of items) {
    if (!record(item) || !record(item.collectionStatus)) continue;
    const id = text(item.id);
    const status = item.collectionStatus;
    if (
      id &&
      status.settings === "complete" &&
      status.assignments === "incomplete" &&
      Object.entries(status).every(
        ([part, value]) => part === "assignments" || value === "complete",
      ) &&
      (item.hasFetchError !== true ||
        assignmentStepsOnly(item.fetchErrorMessage)) &&
      errors
        .filter((error) => error.policyId === id)
        .every(
          (error) =>
            assignmentStepsOnly(error.error) &&
            (error.endpoint === undefined ||
              POLICY_ENDPOINT.test(error.endpoint)),
        )
    )
      only.add(item);
  }
  return only;
}

/**
 * The collection as its settings stand: assignment only failures removed,
 * so the family coverage row judges settings alone. Assignment state is
 * read per policy from the original item.
 */
function settingsView(
  data: BenchmarkCollection,
  only: ReadonlySet<RecordJson>,
): BenchmarkCollection {
  if (!only.size) return data;
  const ids = new Set([...only].map((item) => item.id));
  const settle = (items: unknown[]) =>
    items.map((item) => {
      if (!record(item) || !only.has(item)) return item;
      const status = { ...(item.collectionStatus as RecordJson) };
      delete status.assignments;
      const settled: RecordJson = {
        ...item,
        hasFetchError: false,
        collectionStatus: status,
      };
      delete settled.fetchErrorMessage;
      return settled;
    });
  return {
    ...data,
    sections: data.sections?.map((section) =>
      section.familyKey === FAMILY
        ? { ...section, items: settle(section.items) }
        : section,
    ),
    settingsCatalog: Array.isArray(data.settingsCatalog)
      ? settle(data.settingsCatalog)
      : data.settingsCatalog,
    fetchErrors: data.fetchErrors?.filter(
      (error) => !(familyError(error) && ids.has(error.policyId)),
    ),
  };
}

export function tenantSettings(data: BenchmarkCollection): TenantSettings {
  const gaps: string[] = [];
  const collectedAt = text(data.collectedAt);
  if (!collectedAt) gaps.push("The collection has no completion time.");
  const items = sectionItems(data);
  if (!items) gaps.push("Settings Catalog policies were not collected.");
  const errors = (data.fetchErrors ?? []).filter(familyError);
  const assignmentOnly = assignmentOnlyItems(items ?? [], errors);
  const row = buildCollectionCoverage(
    settingsView(data, assignmentOnly),
    [],
    true,
  ).find((entry) => entry.family === FAMILY);
  if (row && row.status !== "complete")
    gaps.push(
      ...(row.errors.length
        ? row.errors
        : [`Settings Catalog collection is ${row.status}.`]),
    );
  const policies: TenantPolicy[] = [];
  for (const item of items ?? []) {
    if (!record(item)) {
      gaps.push("A Settings Catalog entry could not be read.");
      continue;
    }
    const id = text(item.id) ?? "";
    const name = text(item.displayName) ?? text(item.name) ?? "Unnamed policy";
    const status = record(item.collectionStatus) ? item.collectionStatus : {};
    const policyErrors = errors.filter((error) => id && error.policyId === id);
    const settings = Array.isArray(item.settings)
      ? item.settings
          .map((setting) =>
            record(setting) && record(setting.settingInstance)
              ? setting.settingInstance
              : null,
          )
          .filter((instance): instance is RecordJson => instance !== null)
      : [];
    const settingsComplete =
      status.settings === "complete" &&
      Array.isArray(item.settings) &&
      settings.length === item.settings.length &&
      (assignmentOnly.has(item) ||
        (!policyErrors.length && item.hasFetchError !== true));
    const platforms = text(item.platforms);
    if (!settingsComplete)
      gaps.push(`${name}: settings were not read completely.`);
    if (!platforms) gaps.push(`${name}: the platform was not returned.`);
    const assignmentsIncomplete =
      status.assignments !== "complete" ||
      policyErrors.some((error) =>
        /assignments/i.test(`${error.endpoint ?? ""} ${error.error}`),
      );
    const assignment = summarizeAssignments(
      item.assignments,
      data.groupNames ?? new Map(),
      assignmentsIncomplete,
    ).state;
    const reference = record(item.templateReference)
      ? item.templateReference
      : {};
    policies.push({
      id,
      name,
      platforms,
      technologies: text(item.technologies),
      templated: Boolean(text(reference.templateId)),
      settings,
      settingsComplete,
      assignment,
    });
  }
  return {
    collectedAt,
    policies,
    complete: gaps.length === 0,
    gaps: [...new Set(gaps)],
  };
}

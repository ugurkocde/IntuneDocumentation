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
 *
 * Owner decision (2026-10-22): the comparison reads Settings Catalog policies
 * only, and profiles of older types can carry equivalent settings. Their
 * platforms are read from the collection (verified with Lokka on 2026-10-22):
 * device configurations and update rings by their @odata.type prefix
 * (windows..., macOS..., ios..., android..., aosp...) or, for the Windows
 * only sharedPCConfiguration and editionUpgradeConfiguration, by name;
 * administrative templates are Windows, and security baseline and endpoint
 * security intents carry only a templateId, whose platform the collector
 * does not read (the lab tenant holds a macOS intent), so an intent may be
 * on any platform. A family that was not collected completely, or a type of
 * unknown platform, may also hold profiles for any platform.
 */
import type { DetailedExportData } from "../configuration-analyzer";
import {
  assignmentsIncomplete,
  resolveAssignments,
  type LabelledTarget,
  type ResolvedAssignments,
} from "../compliance/assignments";
import { buildCollectionCoverage } from "../compliance/coverage";
import { canonicalPlatforms, catalogRoot } from "../compliance/graph-rows";
import { record, type RecordJson } from "./policies";

export type AssignmentState = "assigned" | "notAssigned" | "unknown";

/**
 * The reach of resolved assignments (AssignmentReach): a label that
 * distinct targets share gets the start of the target's id, as much as tells
 * them apart, so no output names two groups alike.
 */
function assignmentReach(summary: ResolvedAssignments): AssignmentReach {
  const { targets, exclusions } = summary.labelled;
  const entries: LabelledTarget[] = [...targets, ...exclusions];
  const shown = (entry: LabelledTarget) => {
    const others = entries.filter(
      (other) => other.label === entry.label && other.key !== entry.key,
    );
    const id = entry.id;
    if (!others.length || !id) return entry.label;
    const start = (value: string | undefined, length: number) =>
      (value ?? "").slice(0, length).toLowerCase();
    let length = 8;
    while (
      length < id.length &&
      others.some((other) => start(other.id, length) === start(id, length))
    )
      length += 1;
    return `${entry.label} (${id.slice(0, length)})`;
  };
  return {
    targets: targets.filter((target) => !target.excluded).map(shown),
    exclusions: exclusions.map(shown),
    removals: [...(summary.removals ?? [])],
    filters: summary.filters.length,
    ...(summary.uncertainty ? { uncertainty: summary.uncertainty } : {}),
  };
}

/**
 * What a policy's assignments reach, as resolveAssignments reads them:
 * target labels ("All Users", "All Devices", "Group: <name or id>"), with
 * group ids named where the collection resolved them, without the targets
 * an exclusion takes away (matched by identity), exclusions and removals,
 * the number of assignment filters, and why the state is unknown. Two
 * distinct targets of one name carry the start of their id
 * ("Group: Pilot (a1b2c3d4)"). Group memberships are not read, so this
 * names targets, not devices.
 */
export interface AssignmentReach {
  targets: string[];
  exclusions: string[];
  removals: string[];
  filters: number;
  uncertainty?: "incomplete" | "unresolved";
}

/** The display name of one setting definition and of its choice options. */
export interface SettingDefinitionName {
  name: string;
  /** Option display names by option id (itemId). */
  options: Record<string, string>;
  /**
   * For a definition Graph gives no display name (a setting below another,
   * such as the value of an administrative template setting): the id of the
   * root definition it belongs to, and name is its Graph name. Views name it
   * within that root (values.ts settingName).
   */
  within?: string;
}

/** Display names by setting definition id. */
export type SettingNames = Record<string, SettingDefinitionName>;

/** Families of older profile types that can carry Settings Catalog equivalents. */
export type OtherProfileFamilyKey =
  | "deviceConfigurations"
  | "windowsUpdatePolicies"
  | "administrativeTemplates"
  | "securityBaselines";

/** What the collection holds of one older profile family. */
export interface OtherProfileFamily {
  family: OtherProfileFamilyKey;
  /** False when the family was not collected completely: it may hold profiles for any platform. */
  complete: boolean;
  /** Profiles collected. */
  count: number;
  /** Platforms of its profiles; null when a profile's platform is not known. */
  platforms: string[] | null;
}

export interface TenantPolicy {
  id: string;
  name: string;
  /**
   * The platforms in canonical form (graph-rows.ts canonicalPlatforms), or
   * null when Graph did not return a set of documented members.
   */
  platforms: string | null;
  technologies: string | null;
  /** True for policies created from a template (Endpoint security, baselines). */
  templated: boolean;
  /** Root setting instances as collected. */
  settings: RecordJson[];
  /** Every setting of the policy was read. */
  settingsComplete: boolean;
  assignment: AssignmentState;
  reach: AssignmentReach;
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
  /**
   * Platforms (windows, macos, ios, android) with profiles outside the
   * Settings Catalog that may set the same settings; null when that cannot
   * be ruled out for any platform. An absent setting there is never Missing.
   */
  otherProfilePlatforms: string[] | null;
  /** The older profile families, for naming what to check (otherProfiles). */
  otherProfiles: OtherProfileFamily[];
  /** Display names from the settingDefinitions the collector expanded. */
  definitions: SettingNames;
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

// Families of older profile types that can carry Settings Catalog equivalents.
const OTHER_FAMILIES: readonly OtherProfileFamilyKey[] = [
  "deviceConfigurations",
  "windowsUpdatePolicies",
  "administrativeTemplates",
  "securityBaselines",
];

const PLATFORM_PREFIXES: ReadonlyArray<[string, string]> = [
  ["windows", "windows"],
  ["macos", "macos"],
  ["ios", "ios"],
  ["android", "android"],
  ["aosp", "android"],
  ["linux", "linux"],
];

// Windows only device configuration types without a platform prefix: Shared
// PC and Windows 10 edition upgrade, from the Graph schema and accepted by
// isof() on /deviceManagement/deviceConfigurations (beta, verified with Lokka
// on 2026-10-22). Other unprefixed types (the Apple, VPN and email bases,
// unsupportedDeviceConfiguration) stay of unknown platform.
const WINDOWS_TYPES: ReadonlySet<string> = new Set([
  "sharedpcconfiguration",
  "editionupgradeconfiguration",
]);

/** The platform family of a Settings Catalog platforms token or a device configuration type name. */
function platformFamily(value: string): string | null {
  const name = value
    .trim()
    .replace(/^#/, "")
    .replace(/^microsoft\.graph\./, "")
    .toLowerCase();
  if (WINDOWS_TYPES.has(name)) return "windows";
  return (
    PLATFORM_PREFIXES.find(([prefix]) => name.startsWith(prefix))?.[1] ?? null
  );
}

/** The platforms of a Settings Catalog platforms value, for example "windows10" or "iOS,macOS". */
export function platformFamilies(platforms: string): string[] {
  return [
    ...new Set(
      platforms
        .split(",")
        .map((token) => platformFamily(token) ?? token.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/**
 * The older profile families of the collection: complete or not, how many
 * profiles and on which platforms. Administrative templates are Windows;
 * intents (securityBaselines) and device configuration types of unknown
 * platform leave the platforms unknown.
 */
function otherProfileFamilies(data: BenchmarkCollection): OtherProfileFamily[] {
  const rows = buildCollectionCoverage(data, [], true);
  return OTHER_FAMILIES.map((family): OtherProfileFamily => {
    const row = rows.find((entry) => entry.family === family);
    const items = data.sections?.length
      ? data.sections
          .filter((section) => section.familyKey === family)
          .flatMap((section) => section.items)
      : (((data as unknown as Record<string, unknown>)[family] as unknown[]) ??
        []);
    const found = new Set<string>();
    let known = true;
    for (const item of items) {
      if (family === "administrativeTemplates") {
        found.add("windows");
        continue;
      }
      if (family === "securityBaselines") {
        known = false;
        continue;
      }
      const type = record(item) ? text(item["@odata.type"]) : null;
      const platform = type ? platformFamily(type) : null;
      if (platform) found.add(platform);
      else known = false;
    }
    return {
      family,
      complete: Boolean(row && row.status === "complete"),
      count: items.length,
      platforms: known ? [...found].sort() : null,
    };
  });
}

/** Platforms with profiles of older types, or null when any platform may have one. */
function otherProfilePlatforms(
  families: readonly OtherProfileFamily[],
): string[] | null {
  const found = new Set<string>();
  for (const family of families) {
    if (!family.complete || !family.platforms) return null;
    for (const platform of family.platforms) found.add(platform);
  }
  return [...found].sort();
}

/**
 * The older profile families that may set a setting of a pack platforms
 * value: those not collected completely, those of unknown platform and
 * those with profiles on one of its platforms.
 */
export function otherProfilesFor(
  families: readonly OtherProfileFamily[],
  platforms: string,
): OtherProfileFamily[] {
  const wanted = platformFamilies(platforms);
  return families.filter(
    (family) =>
      !family.complete ||
      family.platforms === null ||
      family.platforms.some((platform) => wanted.includes(platform)),
  );
}

const MAX_NAME = 300;
const nameText = (value: unknown): string | null =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, MAX_NAME)
    : null;

/**
 * Display names of the settingDefinitions on Graph's Settings Catalog
 * settings rows ($expand=settingDefinitions): displayName and the options'
 * itemId and displayName (deviceManagementConfigurationChoiceSettingDefinition,
 * verified with Lokka on 2026-10-26). A definition below another may have an
 * empty displayName (the value of an administrative template setting, for
 * example); it keeps its Graph name with the root definition it belongs to
 * (rootDefinitionId), so views name it within that root (verified with
 * Lokka on 2026-10-26, both on the expanded rows and on GET
 * /beta/deviceManagement/configurationSettings/{id}). Anything else is
 * ignored.
 */
export function definitionNames(definitions: unknown, into: SettingNames = {}): SettingNames {
  if (!Array.isArray(definitions)) return into;
  for (const definition of definitions) {
    if (!record(definition)) continue;
    const id = nameText(definition.id);
    const own = nameText(definition.displayName);
    const root = nameText(definition.rootDefinitionId);
    const within = !own && root && root !== id ? root : null;
    const name = own ?? (within ? nameText(definition.name) : null);
    if (!id || !name || Object.hasOwn(into, id)) continue;
    const options: Record<string, string> = {};
    if (Array.isArray(definition.options))
      for (const option of definition.options) {
        if (!record(option)) continue;
        const itemId = nameText(option.itemId);
        const label = nameText(option.displayName);
        if (itemId && label) options[itemId] = label;
      }
    into[id] = { name, options, ...(within ? { within } : {}) };
  }
  return into;
}

/** Whether a setting of a pack platforms value may be set outside the Settings Catalog. */
export function mayBeSetElsewhere(
  tenant: Pick<TenantSettings, "otherProfilePlatforms">,
  platforms: string,
): boolean {
  const other = tenant.otherProfilePlatforms;
  return (
    other === null ||
    platformFamilies(platforms).some((platform) => other.includes(platform))
  );
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
  const definitions: SettingNames = {};
  for (const item of items ?? []) {
    if (!record(item)) {
      gaps.push("A Settings Catalog entry could not be read.");
      continue;
    }
    const id = text(item.id) ?? "";
    const name = text(item.displayName) ?? text(item.name) ?? "Unnamed policy";
    const status = record(item.collectionStatus) ? item.collectionStatus : {};
    const policyErrors = errors.filter((error) => id && error.policyId === id);
    // A root without a definition id cannot be compared, so the policy was
    // not read whole: it may hold any recommended setting unseen.
    const settings = Array.isArray(item.settings)
      ? item.settings
          .map(catalogRoot)
          .filter((instance): instance is RecordJson => instance !== null)
      : [];
    const settingsComplete =
      status.settings === "complete" &&
      Array.isArray(item.settings) &&
      settings.length === item.settings.length &&
      (assignmentOnly.has(item) ||
        (!policyErrors.length && item.hasFetchError !== true));
    // A policy of unknown platforms may hold any setting of any platform,
    // so no absence is proven while it is in the collection. The member
    // none ("no platform type specified") names no platform either.
    const read = canonicalPlatforms(item.platforms);
    const platforms = read === "none" ? null : read;
    if (!settingsComplete)
      gaps.push(`${name}: settings were not read completely.`);
    if (!platforms)
      gaps.push(`${name}: the platform was not returned readably.`);
    // The Settings Catalog collector always records a collection status,
    // so a policy without one was not read whole.
    const summary = resolveAssignments(
      item.assignments,
      data.groupNames ?? new Map(),
      !record(item.collectionStatus) ||
        assignmentsIncomplete(item, policyErrors),
    );
    if (Array.isArray(item.settings))
      for (const row of item.settings)
        if (record(row)) definitionNames(row.settingDefinitions, definitions);
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
      assignment: summary.state,
      reach: assignmentReach(summary),
    });
  }
  const otherProfiles = otherProfileFamilies(data);
  return {
    collectedAt,
    policies,
    complete: gaps.length === 0,
    gaps: [...new Set(gaps)],
    otherProfilePlatforms: otherProfilePlatforms(otherProfiles),
    otherProfiles,
    definitions,
  };
}

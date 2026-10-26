/**
 * Settings Catalog comparison for benchmark packs, ported from TenuVault
 * (policies.ts) without the remediation payload: this module never builds
 * anything that writes to a tenant.
 *
 * Unlike the TenuVault original, every comparison is tri-state. A tenant
 * value is readable only when its instance and value records have the
 * documented Graph beta shape (see tasks/briefs/cis-wp0-graph-shapes.md): a
 * secret value, a value the collector redacted, a value of the wrong type or
 * an undocumented instance or value type is unknown, and unknown is never a
 * difference.
 */
import {
  canonicalPlatforms,
  childLists,
  MAX_SETTING_DEPTH,
  unreadableCatalogValue,
  unreadableSimpleValue,
} from "../compliance/graph-rows";
import { isRedactedValue } from "../intune-policy-registry";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
export type RecordJson = Record<string, Json>;
/** A setting instance: a record with its definition id. */
export type SettingInstance = RecordJson & { settingDefinitionId: string };

export interface BaselinePolicy {
  name: string;
  platforms: string;
  technologies: string;
  description: string;
  settings: Array<{ settingInstance: SettingInstance }>;
  provenance?: Record<string, string | number>;
  templateReference?: { templateId: string };
}

export function record(value: unknown): value is RecordJson {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Remove export annotations, retaining the derived type discriminators. */
export function clean(value: Json): Json {
  if (Array.isArray(value)) return value.map(clean);
  if (!record(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, v]) =>
          v !== null &&
          key !== "id" &&
          key !== "auditRuleInformation" &&
          (!key.includes("@odata.") || key === "@odata.type"),
      )
      .map(([key, v]) => [key, clean(v)]),
  );
}

/**
 * Validates the Settings Catalog policies of a delivered pack. The pack
 * level recommendation list is the only recommendation source, so a
 * recommendations field on a policy is not read.
 */
export function parsePolicies(input: unknown): BaselinePolicy[] {
  const values = Array.isArray(input) ? input : [input];
  if (!values.length || values.length > 200)
    throw new Error(
      "A benchmark pack holds between 1 and 200 Settings Catalog policies.",
    );
  if (JSON.stringify(values).length > 8_000_000)
    throw new Error("The benchmark pack exceeds 8 MB.");
  return values.map((value, index) => {
    if (
      !record(value) ||
      typeof value.name !== "string" ||
      !value.name.trim() ||
      value.name.length > 200 ||
      typeof value.platforms !== "string" ||
      !value.platforms ||
      typeof value.technologies !== "string" ||
      !value.technologies ||
      !Array.isArray(value.settings) ||
      !value.settings.length ||
      value.settings.length > 1000
    ) {
      throw new Error(
        `Policy ${index + 1}: expected a Settings Catalog policy with name, platforms, technologies and settings.`,
      );
    }
    const seen = new Set<string>();
    const settings = value.settings.map((setting) => {
      if (
        !record(setting) ||
        !record(setting.settingInstance) ||
        typeof setting.settingInstance.settingDefinitionId !== "string" ||
        typeof setting.settingInstance["@odata.type"] !== "string"
      )
        throw new Error(
          `Policy ${index + 1}: settingInstance requires a definition ID and derived @odata.type.`,
        );
      const id = setting.settingInstance.settingDefinitionId;
      if (seen.has(id))
        throw new Error(`Policy ${index + 1}: duplicate root setting ${id}.`);
      seen.add(id);
      return {
        settingInstance: clean(setting.settingInstance) as SettingInstance,
      };
    });
    const template =
      record(value.templateReference) &&
      typeof value.templateReference.templateId === "string" &&
      value.templateReference.templateId
        ? { templateId: value.templateReference.templateId }
        : undefined;
    if (
      value.provenance !== undefined &&
      (!record(value.provenance) ||
        Object.values(value.provenance).some(
          (item) => typeof item !== "string" && typeof item !== "number",
        ))
    )
      throw new Error(`Policy ${index + 1}: invalid pack provenance.`);
    return {
      ...(record(value.provenance)
        ? {
            provenance: value.provenance as Record<string, string | number>,
          }
        : {}),
      name: value.name.trim(),
      // Packs carry platforms as Graph returns them; the canonical form is
      // the one tenant policies are keyed by. A value that is no set of
      // documented members is kept as delivered and never compared.
      platforms: canonicalPlatforms(value.platforms) ?? value.platforms,
      technologies: value.technologies,
      description:
        typeof value.description === "string"
          ? value.description.slice(0, 1500)
          : "",
      settings,
      ...(template ? { templateReference: template } : {}),
    };
  });
}

/** Configuration content without export and template metadata. Array order is kept. */
export function comparable(value: Json): Json {
  if (Array.isArray(value)) return value.map(comparable);
  if (!record(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(
        ([key, v]) =>
          v !== null &&
          key !== "id" &&
          key !== "auditRuleInformation" &&
          !key.includes("@odata.") &&
          !key.endsWith("TemplateReference"),
      )
      .map(([key, v]) => [key, comparable(v)]),
  );
}

function isInstance(value: unknown): value is SettingInstance {
  return (
    record(value) &&
    typeof value.settingDefinitionId === "string" &&
    value.settingDefinitionId !== ""
  );
}

/**
 * True when a setting instance nests child setting instances, as group setting
 * collections do, in the child lists its type documents (graph-rows.ts
 * childLists).
 */
export function hasChildInstances(value: Json): boolean {
  return (childLists(value) ?? []).some((children) =>
    children.some(isInstance),
  );
}

/** The definition ID of a setting instance and of every child instance nested in it. */
export function definitionIds(instance: Json | undefined): string[] {
  const ids = new Set<string>();
  const walk = (value: Json | undefined): void => {
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (!record(value)) return;
    if (typeof value.settingDefinitionId === "string")
      ids.add(value.settingDefinitionId);
    for (const child of Object.values(value)) walk(child);
  };
  walk(instance);
  return [...ids];
}

// --- Readability (Graph beta shapes, verified in WP0) ------------------------

function typeName(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/^#/, "")
        .replace(/^microsoft\.graph\./, "")
        .toLowerCase()
    : "";
}

// Only the forms the collector writes are redacted (isRedactedValue).
const isRedacted = isRedactedValue;

// Every child entry must be a setting instance: a malformed entry has no
// definition path, so its parent is unreadable instead of the child absent.
const readableChildList = (children: unknown) =>
  Array.isArray(children) && children.every(isInstance);

function readableChildren(value: RecordJson): boolean {
  return value.children === undefined || readableChildList(value.children);
}

function readableChoice(value: unknown): boolean {
  return (
    record(value) &&
    typeof value.value === "string" &&
    value.value.length > 0 &&
    !isRedacted(value.value) &&
    readableChildren(value)
  );
}

// A simple value has a documented Settings Catalog simple value type and a
// value of that type (graph-rows.ts unreadableSimpleValue). Secret values
// are never readable here: Graph returns an encrypted token or nothing, and
// the collector never keeps them. Redacted values are not readable either.
function readableSimple(value: unknown): boolean {
  return (
    record(value) &&
    !isRedacted(value.value) &&
    typeName(value["@odata.type"]) !==
      "devicemanagementconfigurationsecretsettingvalue" &&
    !unreadableSimpleValue(value)
  );
}

const readableGroup = (value: unknown) =>
  record(value) && readableChildList(value.children);

const everyEntry = (value: unknown, check: (entry: unknown) => boolean) =>
  Array.isArray(value) && value.every(check);

/**
 * Whether the own value of one setting instance (without its child instances)
 * has the documented shape for its instance type. The shared instance rules
 * come first (graph-rows.ts unreadableCatalogValue): an undocumented type, or
 * a value in a property another type documents, is unreadable. The checks
 * below add what a benchmark comparison cannot read, such as secret and
 * redacted values.
 */
export function readableOwnValue(instance: RecordJson): boolean {
  if (unreadableCatalogValue(instance)) return false;
  switch (typeName(instance["@odata.type"])) {
    case "devicemanagementconfigurationchoicesettinginstance":
      return readableChoice(instance.choiceSettingValue);
    case "devicemanagementconfigurationchoicesettingcollectioninstance":
      return everyEntry(instance.choiceSettingCollectionValue, readableChoice);
    case "devicemanagementconfigurationsimplesettinginstance":
      return readableSimple(instance.simpleSettingValue);
    case "devicemanagementconfigurationsimplesettingcollectioninstance":
      return everyEntry(instance.simpleSettingCollectionValue, readableSimple);
    case "devicemanagementconfigurationgroupsettinginstance":
      return readableGroup(instance.groupSettingValue);
    case "devicemanagementconfigurationgroupsettingcollectioninstance":
      return everyEntry(instance.groupSettingCollectionValue, readableGroup);
    default:
      return false;
  }
}

// --- Leaf comparison ---------------------------------------------------------

/** Marks a leaf whose tenant value is not readable. Never equal to a JSON text. */
const UNREADABLE = "\u0000unreadable";

// Path separators that never occur in a definition id: ":" before a value
// key, "/" before a child, "#" for an occurrence and "[" for an entry.
const SUBTREE_NEXT = [":", "/", "#", "["];
const inSubtree = (path: string, anchor: string) =>
  path === anchor ||
  SUBTREE_NEXT.some((next) => path.startsWith(`${anchor}${next}`));

/**
 * Leaf values of one setting instance, keyed by the settingDefinitionId path
 * from the root. Child instances are taken out of their parent's own value and
 * keyed below it; a repeated child definition in one children list is keyed by
 * its occurrence, and entries of a collection by position (compareLeaves
 * matches group and choice collection entries regardless of it). A leaf whose
 * own value is not readable maps to UNREADABLE. The instance must still carry
 * its @odata.type (clean, not comparable). instances, when given, receives
 * the instance of every own leaf by its path.
 */
function leafValues(
  instance: SettingInstance,
  path: string,
  out: Map<string, string>,
  depth = 0,
  instances?: Map<string, SettingInstance>,
): Map<string, string> {
  const own = `${path}/${instance.settingDefinitionId}`;
  instances?.set(own, instance);
  // An instance below the depth limit, or one whose children cannot be
  // read by the shared rules (graph-rows.ts childLists), such as one of an
  // undocumented type or with a value in another type's property, is
  // unreadable with everything below it: its subtree is unknown, never
  // absent or different.
  const lists = childLists(instance);
  if (depth > MAX_SETTING_DEPTH || lists === null) {
    out.set(own, UNREADABLE);
    return out;
  }
  // Only these child lists hold child instances; a children list anywhere
  // else is part of the own value.
  const childArrays = new Set<unknown>(lists);
  const readable = readableOwnValue(instance);
  const strip = (value: Json, at: string): Json => {
    if (
      Array.isArray(value) &&
      value.length &&
      // Choice values may omit children, so a choice collection is known by its key.
      (at.endsWith(":choiceSettingCollectionValue") ||
        value.every((entry) => record(entry) && Array.isArray(entry.children)))
    ) {
      value.forEach((entry, index) =>
        out.set(
          `${own}${at}[${index}]`,
          // Entries belong to the own value: unreadable when it is.
          readable
            ? JSON.stringify(comparable(strip(entry, `${at}[${index}]`)))
            : UNREADABLE,
        ),
      );
      return null;
    }
    if (Array.isArray(value))
      return value.map((entry, index) => strip(entry, `${at}[${index}]`));
    if (!record(value)) return value;
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, v]): Array<[string, Json]> => {
        if (key !== "children" || !Array.isArray(v) || !childArrays.has(v))
          return [[key, strip(v, `${at}:${key}`)]];
        const seen = new Map<string, number>();
        for (const child of v.filter(isInstance)) {
          const id = child.settingDefinitionId;
          const occurrence = seen.get(id) ?? 0;
          seen.set(id, occurrence + 1);
          leafValues(
            child,
            `${own}${at}${occurrence ? `#${occurrence}` : ""}`,
            out,
            depth + 1,
            instances,
          );
        }
        // A child list is never part of the own value: its instances are
        // keyed above, and a list Graph returned empty, null or not at all
        // holds the same nothing (graph-rows.ts childLists). A list with an
        // entry that is no instance makes the own value unreadable instead.
        return [];
      }),
    );
  };
  const value = JSON.stringify(comparable(strip(instance, "")));
  out.set(own, readable ? value : UNREADABLE);
  return out;
}

export type Comparison = "match" | "differ" | "unknown";

// A group or choice setting collection entry in a leaf path. The first one is
// the outermost: an entry path always extends the path of its collection.
const ENTRY = /^(.*?:(?:group|choice)SettingCollectionValue)\[(\d+)\](.*)$/;
const entryless = (path: string) =>
  path.replace(/(:(?:group|choice)SettingCollectionValue)\[\d+\]/g, "$1[]");

/**
 * Leaves outside any collection entry, and the leaves of each entry keyed by
 * its collection path, relative to the entry.
 */
function splitEntries(leaves: Iterable<[string, string]>) {
  const direct: Array<[string, string]> = [];
  const collections = new Map<string, Map<string, Array<[string, string]>>>();
  for (const [path, value] of leaves) {
    const match = ENTRY.exec(path);
    if (!match) {
      direct.push([path, value]);
      continue;
    }
    const [, at = "", index = "", rest = ""] = match;
    const entries = collections.get(at) ?? new Map();
    entries.set(index, [...(entries.get(index) ?? []), [rest, value]]);
    collections.set(at, entries);
  }
  return { direct, collections };
}

/** Whether every row gets its own column through an allowed cell (bipartite matching). */
function assignable(
  grid: Comparison[][],
  allowed: (cell: Comparison) => boolean,
): boolean {
  const owner: number[] = [];
  const place = (row: number, seen: Set<number>): boolean =>
    (grid[row] ?? []).some((cell, column) => {
      if (!allowed(cell) || seen.has(column)) return false;
      seen.add(column);
      const current = owner[column];
      if (current !== undefined && !place(current, seen)) return false;
      owner[column] = row;
      return true;
    });
  return grid.every((_, row) => place(row, new Set()));
}

/**
 * Compares the recommended leaves with one tenant root. A readable leaf that
 * differs or is absent below readable parents is a difference, and a definite
 * difference wins. A leaf that is unreadable on either side, or below a
 * parent that is unreadable on either side, is unknown, held or not: which
 * option the parent selects is not certain, so whether the leaf applies is
 * not either. Group and choice collection entries compare as
 * multisets: each recommended entry needs its own tenant entry, in any order,
 * and extra tenant entries are ignored (a root without child instances is
 * still compared whole, so there the entry count must match too). A recommended entry no tenant entry can match
 * is a difference when every candidate differs readably, and unknown when one
 * might match or the collection itself is not readable.
 */
function compareLeaves(
  wanted: Iterable<[string, string]>,
  have: Map<string, string>,
): Comparison {
  let unknown = false;
  const wantedLeaves = [...wanted];
  // Unreadable leaves of both sides: the tenant's and the pack's.
  const unreadable = [...have, ...wantedLeaves]
    .filter(([, value]) => value === UNREADABLE)
    .map(([at]) => at);
  const shadowed = (path: string) =>
    unreadable.some((at) => inSubtree(path, at));
  const want = splitEntries(wantedLeaves);
  for (const [path, value] of want.direct) {
    const observed = have.get(path);
    // A pack value this app cannot read is never compared, and a leaf below
    // a parent unreadable on either side is unknown, like the parent.
    if (value === UNREADABLE || shadowed(path)) unknown = true;
    else if (observed === undefined || observed !== value) return "differ";
  }
  const held = splitEntries(have).collections;
  for (const [at, entries] of want.collections) {
    // A collection below an unreadable parent is unknown with its entries.
    if (shadowed(at)) {
      unknown = true;
      continue;
    }
    const candidates = [...(held.get(at)?.values() ?? [])].map(
      (entry) => new Map(entry),
    );
    const grid = [...entries.values()].map((entry) =>
      candidates.map((candidate) => compareLeaves(entry, candidate)),
    );
    if (assignable(grid, (cell) => cell === "match")) continue;
    if (assignable(grid, (cell) => cell !== "differ") || shadowed(`${at}[0]`))
      unknown = true;
    else return "differ";
  }
  return unknown ? "unknown" : "match";
}

/**
 * Whether an observed root satisfies a recommended root. A root without child
 * setting instances must match exactly. A grouped root matches when every
 * recommended leaf exists at the same definition path with an equal value,
 * group and choice collection entries in any order; extra tenant children and
 * entries are ignored. A choice collection without child instances is a root
 * of the first kind: the same entries in any order.
 */
export function compareRoot(recommended: Json, observed: Json): Comparison {
  const want = clean(recommended);
  const have = clean(observed);
  if (!isInstance(want) || !isInstance(have)) return "unknown";
  if (have.settingDefinitionId !== want.settingDefinitionId) return "differ";
  const haveLeaves = leafValues(have, "", new Map());
  if (!hasChildInstances(want)) {
    // A root without child instances is compared whole: its own value, and
    // a tenant child below it (readable or not) is a difference by itself.
    const wanted = leafValues(want, "", new Map());
    const own = `/${want.settingDefinitionId}`;
    const observedRoot = haveLeaves.get(own);
    if (observedRoot === UNREADABLE || wanted.get(own) === UNREADABLE)
      return "unknown";
    if (observedRoot !== wanted.get(own)) return "differ";
    if (hasChildInstances(have) || haveLeaves.size !== wanted.size)
      return "differ";
    return compareLeaves([...wanted], haveLeaves);
  }
  return compareLeaves([...leafValues(want, "", new Map())], haveLeaves);
}

/**
 * Whether the recommended value of a definition, everything below it and
 * every parent above it has the documented shape. parsePolicies accepts any
 * instance with a definition id and a type, so a pack may hold a value this
 * app cannot read (a secret, a wrong type or an undocumented type); it is
 * never compared. A definition with no leaf, such as one inside a child entry
 * without a definition id, is not readable either.
 */
export function readableRecommendation(
  recommended: Json,
  definitionId: string,
): boolean {
  return unreadableRecommendationPart(recommended, definitionId) === null;
}

/**
 * Which part of a recommended value makes it unreadable (readableRecommendation):
 * the value itself, a parent above it or a setting below it; null when all
 * of it is readable. The value itself decides first, then a parent.
 */
export function unreadableRecommendationPart(
  recommended: Json,
  definitionId: string,
): "value" | "parent" | "child" | null {
  const want = clean(recommended);
  if (!isInstance(want)) return "value";
  const leaves = [...leafValues(want, "", new Map())];
  const anchors = leaves
    .map(([path]) => path)
    .filter((path) => path.endsWith(`/${definitionId}`));
  if (!anchors.length) return "value";
  const unreadable = leaves
    .filter(([, value]) => value === UNREADABLE)
    .map(([path]) => path);
  const any = (test: (path: string, anchor: string) => boolean) =>
    unreadable.some((path) => anchors.some((anchor) => test(path, anchor)));
  if (any((path, anchor) => path === anchor)) return "value";
  if (any((path, anchor) => inSubtree(anchor, path))) return "parent";
  if (any((path, anchor) => inSubtree(path, anchor))) return "child";
  return null;
}

/**
 * What of a parent leaf selects the branch below it: the option of a choice
 * or of a choice collection entry. A group, a group entry or a choice
 * collection as a whole selects nothing, so only its readability counts;
 * other properties of a parent never decide for its descendants.
 */
function branchSelector(value: string): string {
  if (value === UNREADABLE) return value;
  const parsed: unknown = JSON.parse(value);
  if (record(parsed) && record(parsed.choiceSettingValue))
    return JSON.stringify(parsed.choiceSettingValue.value ?? null);
  if (record(parsed) && typeof parsed.value === "string")
    return JSON.stringify(parsed.value);
  return "readable";
}

/**
 * Whether a tenant root holds a definition: yes (also when it holds a parent
 * of it with another option, see compareDefinition), no, or maybe below an
 * unreadable parent.
 */
export type Holding = "yes" | "no" | "maybe";

export interface DefinitionComparison {
  holds: Holding;
  comparison: Comparison;
  /** The difference is in a parent's option, not in the definition itself. */
  parentDiffers?: true;
}

/**
 * One setting definition inside a recommended root, judged against one
 * observed tenant root of the same root definition. For the root definition
 * itself this is compareRoot. A nested definition applies only below the
 * options its parents select, so it is judged with them: the instances on
 * the path from the root to it, and the collection entries holding it,
 * compared by what selects the branch (branchSelector), never by their
 * other properties or children. The leaf and everything below it must equal
 * the recommendation. A tenant root that holds a parent with another option
 * differs (Different, never Missing), also when it does not hold the
 * definition below it; a parent it does not hold, such as an entry of an
 * empty collection, leaves the definition absent. Null when the recommended
 * root does not contain the definition.
 */
export function compareDefinition(
  recommended: Json,
  observed: Json,
  definitionId: string,
): DefinitionComparison | null {
  const want = clean(recommended);
  if (!isInstance(want)) return null;
  if (want.settingDefinitionId === definitionId)
    return { holds: "yes", comparison: compareRoot(want, observed) };
  const wanted = [...leafValues(want, "", new Map())];
  const anchors = wanted
    .map(([path]) => path)
    .filter((path) => path.endsWith(`/${definitionId}`));
  if (!anchors.length) return null;
  const have = clean(observed);
  if (
    !isInstance(have) ||
    have.settingDefinitionId !== want.settingDefinitionId
  )
    return { holds: "maybe", comparison: "unknown" };
  // Parents on both sides compare by what selects the branch only. Pack
  // paths are exact; a tenant parent is one in any entry, as entries are
  // matched, not paired.
  const above = (path: string, anchor: string) =>
    !inSubtree(path, anchor) && inSubtree(anchor, path);
  const subtree = wanted.filter(([path]) =>
    anchors.some((anchor) => inSubtree(path, anchor)),
  );
  const parents = wanted
    .filter(([path]) => anchors.some((anchor) => above(path, anchor)))
    .map(([path, value]): [string, string] => [path, branchSelector(value)]);
  const haveLeaves = new Map(
    [...leafValues(have, "", new Map())].map(([path, value]) => [
      path,
      anchors.some((anchor) => above(entryless(path), entryless(anchor)))
        ? branchSelector(value)
        : value,
    ]),
  );
  // Held in any entry of a collection: entries are matched, not paired.
  const heldPaths = new Set([...haveLeaves.keys()].map(entryless));
  if (!anchors.some((anchor) => heldPaths.has(entryless(anchor)))) {
    // A parent the tenant holds with another option decides; a parent it
    // does not hold leaves the definition absent.
    const heldParents = parents.filter(([path]) =>
      heldPaths.has(entryless(path)),
    );
    if (compareLeaves(heldParents, haveLeaves) === "differ")
      return { holds: "yes", comparison: "differ", parentDiffers: true };
    const shadowed = [...haveLeaves].some(
      ([at, value]) =>
        value === UNREADABLE &&
        anchors.some((anchor) => inSubtree(entryless(anchor), entryless(at))),
    );
    return shadowed
      ? { holds: "maybe", comparison: "unknown" }
      : { holds: "no", comparison: "differ" };
  }
  const comparison = compareLeaves([...parents, ...subtree], haveLeaves);
  return comparison === "differ" &&
    compareLeaves(subtree, haveLeaves) !== "differ"
    ? { holds: "yes", comparison, parentDiffers: true }
    : { holds: "yes", comparison };
}

/** A leaf that definitely differs: its path in the recommended and in the tenant root. */
interface LeafDifference {
  wanted: string;
  observed: string;
}

/**
 * The leaves where a tenant root definitely differs from the recommended one,
 * as compareLeaves finds them: readable leaves below parents readable on both
 * sides. A collection is entered only when it pairs one recommended entry
 * with one tenant entry; with more, which entry should change is not certain
 * (entries are matched, not paired), so none of them is named.
 */
function leafDifferences(
  wanted: Iterable<[string, string]>,
  have: Map<string, string>,
): LeafDifference[] {
  const wantedLeaves = [...wanted];
  const unreadable = [...have, ...wantedLeaves]
    .filter(([, value]) => value === UNREADABLE)
    .map(([at]) => at);
  const shadowed = (path: string) =>
    unreadable.some((at) => inSubtree(path, at));
  const want = splitEntries(wantedLeaves);
  const found = want.direct
    .filter(
      ([path, value]) =>
        value !== UNREADABLE && !shadowed(path) && have.get(path) !== value,
    )
    .map(([path]): LeafDifference => ({ wanted: path, observed: path }));
  const held = splitEntries(have).collections;
  for (const [at, entries] of want.collections) {
    const candidates = [...(held.get(at)?.entries() ?? [])];
    const [pair] = [...entries];
    const [candidate] = candidates;
    if (
      shadowed(at) ||
      shadowed(`${at}[0]`) ||
      entries.size !== 1 ||
      candidates.length !== 1 ||
      !pair ||
      !candidate
    )
      continue;
    for (const difference of leafDifferences(pair[1], new Map(candidate[1])))
      found.push({
        wanted: `${at}[${pair[0]}]${difference.wanted}`,
        observed: `${at}[${candidate[0]}]${difference.observed}`,
      });
  }
  return found;
}

/** A setting below a recommended one whose tenant value definitely differs. */
export interface DifferingSetting {
  settingId: string;
  /** The recommended instance, cleaned of export annotations. */
  recommended: SettingInstance;
  /** The tenant instance; null when the tenant root does not hold it. */
  observed: SettingInstance | null;
}

/**
 * Where one definition of a tenant root definitely differs from the
 * recommended one (compareDefinition): in a parent option, in its own value
 * (the instance without the settings below it, compared as the leaves are),
 * or only below it, with the settings below it that differ (in the order of
 * the recommended root, none below one already named, none whose value or a
 * parent's cannot be read on either side). Null when it does not definitely
 * differ.
 */
function definitionDifference(
  recommended: Json,
  observed: Json,
  definitionId: string,
): { place: "parent" | "own" | "below"; below: DifferingSetting[] } | null {
  const state = compareDefinition(recommended, observed, definitionId);
  if (state?.holds !== "yes" || state.comparison !== "differ") return null;
  if (state.parentDiffers) return { place: "parent", below: [] };
  const want = clean(recommended);
  const have = clean(observed);
  if (!isInstance(want) || !isInstance(have)) return null;
  const wantedInstances = new Map<string, SettingInstance>();
  const heldInstances = new Map<string, SettingInstance>();
  const wanted = leafValues(want, "", new Map(), 0, wantedInstances);
  const held = leafValues(have, "", new Map(), 0, heldInstances);
  const anchors = [...wanted.keys()].filter((path) =>
    path.endsWith(`/${definitionId}`),
  );
  const differences = leafDifferences(wanted, held);
  // A differing parent value above it decides, then a differing own value;
  // either is the difference itself.
  const at = (test: (path: string, anchor: string) => boolean) =>
    differences.some(({ wanted: path }) =>
      anchors.some((anchor) => test(path, anchor)),
    );
  if (at((path, anchor) => path !== anchor && inSubtree(anchor, path)))
    return { place: "parent", below: [] };
  if (at((path, anchor) => path === anchor)) return { place: "own", below: [] };
  const below = differences.filter(
    ({ wanted: path }) =>
      wantedInstances.has(path) &&
      anchors.some((anchor) => path !== anchor && inSubtree(path, anchor)),
  );
  const order = [...wantedInstances.keys()];
  return {
    place: "below",
    below: below
      .filter(
        ({ wanted: path }) =>
          !below.some(
            (other) => other.wanted !== path && inSubtree(path, other.wanted),
          ),
      )
      .sort((a, b) => order.indexOf(a.wanted) - order.indexOf(b.wanted))
      .map(({ wanted: path, observed: at }) => {
        const instance = wantedInstances.get(path)!;
        return {
          settingId: instance.settingDefinitionId,
          recommended: instance,
          observed: heldInstances.get(at) ?? null,
        };
      }),
  };
}

/**
 * Where a definition that definitely differs differs, from the raw values,
 * never from their text: "parent" (a parent holds another option), "own"
 * (its own value) or "below" (only settings below it, named or not). Null
 * when it does not definitely differ.
 */
export function differencePlace(
  recommended: Json,
  observed: Json,
  definitionId: string,
): "parent" | "own" | "below" | null {
  return (
    definitionDifference(recommended, observed, definitionId)?.place ?? null
  );
}

/**
 * The settings below one definition whose tenant value definitely differs
 * while the definition's own value matches: what a Differs result changes
 * when its own value reads like the recommended one. Empty unless the
 * definition differs (compareDefinition) without a parent option or its own
 * value differing. A setting whose value, or a parent's, cannot be read on
 * either side is never named, and neither is one below a setting already
 * named. In the order of the recommended root.
 */
export function differingSettings(
  recommended: Json,
  observed: Json,
  definitionId: string,
): DifferingSetting[] {
  return definitionDifference(recommended, observed, definitionId)?.below ?? [];
}

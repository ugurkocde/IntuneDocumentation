// Shape checks for the rows of collected Graph data, one per row family.
// Every engine reads collected policies through these checks: the
// compliance engine and its fix packs, the benchmark comparison, the
// snapshot projection, the history diff and the reference comparison. A row
// that fails its check is unidentified or unreadable, so each consumer treats
// what it may hold as unknown, never as a pass, a difference, a missing
// setting or a draft. Normal Graph rows always pass.

/** An identifier Graph returned: a nonempty string. An empty one names nothing. */
export const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

export type IdentifiedSource =
  | "settingsCatalog"
  | "securityBaseline"
  | "omaUri"
  | "administrativeTemplate";

/** Settings Catalog rows hold an instance, intent rows a definition id. */
export type SettingsLayout = "settingsCatalog" | "intent";

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// Families whose settings rows have one layout, whatever the rows show, so a
// row without its instance or definition id is still a row of that layout.
// Settings Catalog policies come from /configurationPolicies/{id}/settings,
// security baseline and endpoint security intents from
// /intents/{id}/settings. App configuration keys and values carry no
// identifier read here.
const FAMILY_LAYOUTS: Readonly<Record<string, SettingsLayout | null>> = {
  settingsCatalog: "settingsCatalog",
  securityBaselines: "intent",
  appConfigurations: null,
};

/**
 * The layout of a settings list: fixed by the policy family where it has
 * one, otherwise read from its rows.
 */
export function settingsLayout(
  family: unknown,
  rows: readonly unknown[],
): SettingsLayout | undefined {
  if (typeof family === "string" && Object.hasOwn(FAMILY_LAYOUTS, family))
    return FAMILY_LAYOUTS[family] ?? undefined;
  const has = (key: string) => rows.some((row) => isObject(row) && key in row);
  if (has("settingInstance")) return "settingsCatalog";
  if (has("definitionId")) return "intent";
  return undefined;
}

// A Settings Catalog instance, or one of its child instances, without a
// definition id.
function unidentifiedInstance(instance: unknown, depth = 0): boolean {
  if (!isObject(instance) || !isIdentifier(instance.settingDefinitionId))
    return true;
  if (depth > 16) return false;
  return [
    instance.choiceSettingValue?.children,
    ...list(instance.choiceSettingCollectionValue).map(
      (entry) => (entry as any)?.children,
    ),
    instance.groupSettingValue?.children,
    ...list(instance.groupSettingCollectionValue).map(
      (entry) => (entry as any)?.children,
    ),
  ].some(
    (children) =>
      Array.isArray(children) &&
      children.some((child) => unidentifiedInstance(child, depth + 1)),
  );
}

/**
 * The root instance of a Settings Catalog row, or null for a row without
 * an instance or one whose root has no definition id.
 */
export function catalogRoot(row: unknown): Record<string, any> | null {
  return isObject(row) &&
    isObject(row.settingInstance) &&
    isIdentifier(row.settingInstance.settingDefinitionId)
    ? row.settingInstance
    : null;
}

/** A Settings Catalog row whose instance or a child of it has no definition id. */
export const unidentifiedCatalogRow = (row: unknown): boolean =>
  !isObject(row) || unidentifiedInstance(row.settingInstance);

/** An intent setting row without its definition id. */
export const unidentifiedIntentRow = (row: unknown): boolean =>
  !isObject(row) || !isIdentifier(row.definitionId);

/** A custom OMA-URI row without its URI. */
export const unidentifiedOmaRow = (row: unknown): boolean =>
  !isObject(row) || !isIdentifier(row.omaUri);

/** An administrative template value without its definition id. */
export const unidentifiedDefinitionValue = (row: unknown): boolean =>
  !isObject(row) || !isIdentifier(row.definition?.id);

/**
 * The setting sources of a configuration that hold a row Graph returned
 * without its identifier: a Settings Catalog instance without a definition
 * id, an intent setting without a definition id, a custom OMA-URI row
 * without a URI or an administrative template value without a definition.
 * Such a row may be any setting of its source, so a setting the
 * configuration does not show is unknown there, never missing. The family
 * is the collection family of the configuration (collectConfigurations sets
 * it as __evidenceFamily); without one the layout is read from the rows.
 */
export function unidentifiedSources(
  config: Record<string, unknown>,
  family: unknown = config.__evidenceFamily,
): Set<IdentifiedSource> {
  const found = new Set<IdentifiedSource>();
  for (const rows of [
    list(config.settings),
    ...list(config.categories).map((category) =>
      list(isObject(category) ? category.settings : undefined),
    ),
  ]) {
    const layout = settingsLayout(family, rows);
    if (layout === "settingsCatalog" && rows.some(unidentifiedCatalogRow))
      found.add("settingsCatalog");
    else if (layout === "intent" && rows.some(unidentifiedIntentRow))
      found.add("securityBaseline");
  }
  if (list(config.omaSettings).some(unidentifiedOmaRow)) found.add("omaUri");
  if (list(config.definitionValues).some(unidentifiedDefinitionValue))
    found.add("administrativeTemplate");
  return found;
}

const normalizeType = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/^#?(microsoft\.graph\.)?/, "").toLowerCase()
    : "";

// The documented deviceAndAppManagementAssignmentFilterType values that
// apply a filter.
const FILTER_MODES = ["include", "exclude"];

/**
 * An assignment Graph returned without what tells it apart: a target with
 * its type, the group id of a group target, a filter type Graph documents
 * (none, include or exclude, or no filter at all) with the filter id of a
 * filter that applies, and an intent that is not empty. Such an assignment
 * may target anyone, so its policy's targeting is unknown and two
 * snapshots of it are not compared.
 */
export function unreadableAssignment(entry: unknown): boolean {
  if (!isObject(entry) || !isObject(entry.target)) return true;
  const target = entry.target;
  const type = normalizeType(target["@odata.type"]);
  if (!type) return true;
  if (type.endsWith("groupassignmenttarget") && !isIdentifier(target.groupId))
    return true;
  const filterId = target.deviceAndAppManagementAssignmentFilterId;
  const filterType = target.deviceAndAppManagementAssignmentFilterType;
  const filtered = FILTER_MODES.includes(filterType);
  if (
    filterType !== undefined &&
    filterType !== null &&
    filterType !== "none" &&
    !filtered
  )
    return true;
  // A filter id needs the type that says how it applies, and a filter that
  // applies needs its id.
  if (
    filtered
      ? !isIdentifier(filterId)
      : filterType !== "none" && isIdentifier(filterId)
  )
    return true;
  return entry.intent === "";
}

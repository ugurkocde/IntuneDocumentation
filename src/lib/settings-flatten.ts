import {
  MAX_SETTING_DEPTH,
  METADATA_KEYS,
  unreadableCatalogValue,
  unreadableIntentValue,
  unreadableOmaValue,
  unreadableProperties,
  unreadableTemplateValue,
} from "./compliance/graph-rows";
import {
  extractAppConfigurationSettings,
  extractSettingValue,
  formatValue,
  parseAdministrativeTemplate,
  parseComplianceRules,
  parseDeviceConfiguration,
  parseDocumentableProperties,
  parseSecurityBaseline,
  UNREADABLE_VALUE,
} from "./configuration-parser";
import type {
  ConfigurationSettingDefinition,
  ConfigurationSettingInstance,
} from "./intune-detailed-client";

/** One documented setting of a collected item, flattened for search. */
export interface FlatSettingRow {
  /** Display name as the exports show it. */
  name: string;
  /** Formatted value as the exports show it. */
  value: string;
  /** Raw technical id: a Settings Catalog definition id, an OMA-URI or a Graph property name. */
  definitionId?: string;
  /** Parent settings or properties, outermost first. */
  path: string[];
  /**
   * What tells the row apart from the others of its item instead of path,
   * when path holds display names: the definition ids of the parent
   * Settings Catalog settings, with the entry of a repeated group, or none
   * for an administrative template value, which its definition id names.
   */
  identity?: string[];
  /**
   * The value as Graph returned it, when value shows it by name: the option
   * ids of a Settings Catalog choice, or the state and the values by
   * presentation id of an administrative template value. History and
   * Compare compare it instead of value, which is display only.
   */
  token?: string;
  category?: string;
  /**
   * Graph did not return the setting's value readably
   * (compliance/graph-rows.ts); value says so. Comparisons treat it as
   * unknown, never as a value.
   */
  unreadable?: true;
}

const flag = (unreadable: boolean) =>
  unreadable ? { unreadable: true as const } : {};

const NOT_CONFIGURED = "Not configured";

// Item level metadata the documentation never lists as a setting.
export { METADATA_KEYS };

// Stands in for a plain property value Graph did not return readably while
// the rows of an item are built; never shown.
const UNREADABLE_MARK = "\u0000unreadable\u0000";

// The item with every plain property whose value contradicts its documented
// type (compliance/graph-rows.ts) replaced by the mark: the property itself
// for the layouts that list one row per property, otherwise the value at its
// path, so the other values of a record stay readable.
function markUnreadable(
  item: Record<string, unknown>,
  family: string,
  topLevel: boolean,
): Record<string, unknown> {
  const unreadable = unreadableProperties(item, family);
  if (!unreadable.length) return item;
  const copy = structuredClone(item);
  for (const { path } of unreadable) {
    const segments = topLevel ? path.slice(0, 1) : path;
    let current = copy;
    for (const segment of segments.slice(0, -1))
      current = current[segment] as Record<string, unknown>;
    current[segments[segments.length - 1]!] = UNREADABLE_MARK;
  }
  return copy;
}

// A row built from a marked value reads as unreadable.
function unmark(row: FlatSettingRow): FlatSettingRow {
  return row.value === UNREADABLE_MARK
    ? { ...row, value: UNREADABLE_VALUE, unreadable: true }
    : row;
}

function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const definitionIdOf = textOf;

// The value as Graph returned it, for a value the formatted text cannot
// tell apart from another one: a list whose entries are records or text
// holding the separators formatValue joins entries with (["a, b"] and
// ["a", "b"] both read "a, b"), or a record with a value, which formatValue
// shows by its name and value only. Other values read the same as their
// text, so they need no token.
function rawToken(value: unknown): string | undefined {
  const ambiguous = Array.isArray(value)
    ? value.some(
        (entry) =>
          (entry !== null && typeof entry === "object") ||
          (typeof entry === "string" && /, |\n/.test(entry)),
      )
    : value !== null &&
      typeof value === "object" &&
      Object.hasOwn(value, "value");
  return ambiguous ? JSON.stringify(value) : undefined;
}

// --- Settings Catalog -------------------------------------------------------

// The instance without its children, so extractSettingValue resolves only
// this level; children are walked separately to keep their ids and path.
function withoutChildren(
  instance: ConfigurationSettingInstance,
): ConfigurationSettingInstance {
  const copy = { ...instance };
  if (copy.choiceSettingValue) {
    copy.choiceSettingValue = { value: copy.choiceSettingValue.value };
  }
  if (copy.choiceSettingCollectionValue) {
    copy.choiceSettingCollectionValue = copy.choiceSettingCollectionValue.map(
      (choice) => ({ value: choice?.value }),
    );
  }
  if (copy.groupSettingValue) copy.groupSettingValue = { children: [] };
  if (copy.groupSettingCollectionValue) copy.groupSettingCollectionValue = [];
  return copy;
}

// The child lists of an instance, with the entry of a group collection each
// list belongs to.
function childGroups(
  instance: ConfigurationSettingInstance,
): Array<{ children: ConfigurationSettingInstance[]; entry?: number }> {
  const groups: Array<{ children: unknown; entry?: number }> = [
    { children: instance.choiceSettingValue?.children },
    ...(Array.isArray(instance.choiceSettingCollectionValue)
      ? instance.choiceSettingCollectionValue.map((choice) => ({
          children: choice?.children,
        }))
      : []),
    { children: instance.groupSettingValue?.children },
    ...(Array.isArray(instance.groupSettingCollectionValue)
      ? instance.groupSettingCollectionValue.map((group, entry) => ({
          children: group?.children,
          entry,
        }))
      : []),
  ];
  return groups.filter(
    (
      group,
    ): group is { children: ConfigurationSettingInstance[]; entry?: number } =>
      Array.isArray(group.children) && group.children.length > 0,
  );
}

function walkCatalogInstance(
  instance: ConfigurationSettingInstance | undefined,
  definitions: ConfigurationSettingDefinition[],
  path: string[],
  rows: FlatSettingRow[],
  depth: number,
  identity: string[] = [],
): void {
  if (!instance || typeof instance !== "object") return;
  // A child below the depth limit is not kept (compliance/graph-rows.ts),
  // so it reads as unknown, never as no setting.
  if (depth > MAX_SETTING_DEPTH) {
    rows.push({
      name: "Setting below the depth limit",
      value: UNREADABLE_VALUE,
      path,
      ...(path.length ? { identity } : {}),
      unreadable: true,
    });
    return;
  }
  const own = withoutChildren(instance);
  const extracted = extractSettingValue({
    id: instance.settingDefinitionId ?? "",
    settingInstance: own,
    settingDefinitions: definitions,
  });
  const isGroup = Boolean(
    instance.groupSettingValue || instance.groupSettingCollectionValue,
  );
  const definitionId = definitionIdOf(instance.settingDefinitionId);
  if (!isGroup && extracted.value !== NOT_CONFIGURED) {
    const choice = Boolean(
      instance.choiceSettingValue || instance.choiceSettingCollectionValue,
    );
    const collection = Array.isArray(instance.simpleSettingCollectionValue)
      ? rawToken(
          instance.simpleSettingCollectionValue.map((entry) => entry?.value),
        )
      : undefined;
    rows.push({
      name: extracted.name,
      value: String(extracted.value),
      ...(definitionId ? { definitionId } : {}),
      path,
      ...(path.length ? { identity } : {}),
      ...(choice
        ? {
            token: String(
              extractSettingValue({
                id: instance.settingDefinitionId ?? "",
                settingInstance: own,
                settingDefinitions: [],
              }).value,
            ),
          }
        : collection !== undefined
          ? { token: collection }
          : {}),
      ...flag(unreadableCatalogValue(instance)),
    });
  }
  // Repeated groups (for example firewall rules) are numbered so rows of
  // different entries stay apart.
  const repeated =
    Array.isArray(instance.groupSettingCollectionValue) &&
    instance.groupSettingCollectionValue.length > 1;
  childGroups(instance).forEach(({ children, entry }, index) => {
    const childPath = [
      ...path,
      repeated ? `${extracted.name} ${index + 1}` : extracted.name,
    ];
    // Every entry of a group collection is numbered by its position, also
    // a single one, so adding an entry never renames the others.
    const id = instance.settingDefinitionId ?? extracted.name;
    const childIdentity = [
      ...identity,
      entry === undefined ? id : `${id} ${entry + 1}`,
    ];
    for (const child of children) {
      walkCatalogInstance(
        child,
        definitions,
        childPath,
        rows,
        depth + 1,
        childIdentity,
      );
    }
  });
}

function isCatalogSettings(settings: unknown): settings is Array<{
  settingInstance?: ConfigurationSettingInstance;
  settingDefinitions?: ConfigurationSettingDefinition[];
}> {
  return (
    Array.isArray(settings) &&
    settings.some(
      (setting) =>
        setting && typeof setting === "object" && "settingInstance" in setting,
    )
  );
}

function catalogRows(
  settings: Array<{
    settingInstance?: ConfigurationSettingInstance;
    settingDefinitions?: ConfigurationSettingDefinition[];
  }>,
): FlatSettingRow[] {
  const rows: FlatSettingRow[] = [];
  for (const setting of settings) {
    if (!setting || typeof setting !== "object") continue;
    walkCatalogInstance(
      setting.settingInstance,
      Array.isArray(setting.settingDefinitions)
        ? setting.settingDefinitions
        : [],
      [],
      rows,
      0,
    );
  }
  return rows;
}

// --- Property based layouts -------------------------------------------------

function propertyEntries(item: Record<string, unknown>, skip: Set<string>) {
  return Object.entries(item).filter(
    ([key, value]) =>
      !METADATA_KEYS.has(key) &&
      !skip.has(key) &&
      value !== null &&
      value !== undefined,
  );
}

// Splits a parseDocumentableProperties name ("Conditions › Users › Include
// Users") into the setting name and its parents.
function splitDocumentedName(name: string): { name: string; path: string[] } {
  const parts = name.split(" › ");
  return { name: parts[parts.length - 1] ?? name, path: parts.slice(0, -1) };
}

function genericRows(
  item: Record<string, unknown>,
  skip = new Set<string>(),
): FlatSettingRow[] {
  const rows: FlatSettingRow[] = [];
  for (const [key, value] of propertyEntries(item, skip)) {
    for (const row of parseDocumentableProperties({ [key]: value })) {
      const split = splitDocumentedName(row.name);
      // Only a top level property name is the technical id of its row.
      rows.push({
        ...split,
        value: row.value,
        ...(split.path.length === 0 ? { definitionId: key } : {}),
      });
    }
  }
  return rows;
}

function omaRows(omaSettings: unknown): FlatSettingRow[] {
  if (!Array.isArray(omaSettings)) return [];
  return omaSettings.flatMap((setting) => {
    if (!setting || typeof setting !== "object") return [];
    const record = setting as Record<string, unknown>;
    // A row without a value holds one that is not stored; it is compared
    // by fingerprint.
    const unreadable = unreadableOmaValue(record);
    const value = unreadable
      ? UNREADABLE_VALUE
      : formatValue(record.value ?? record.omaSettingStringValue);
    if (value === NOT_CONFIGURED) return [];
    const omaUri = definitionIdOf(record.omaUri);
    return [
      {
        name: textOf(record.displayName) ?? omaUri ?? "Custom setting",
        value,
        ...(omaUri ? { definitionId: omaUri } : {}),
        path: [],
        category: "Custom OMA-URI",
        ...flag(unreadable),
      },
    ];
  });
}

function deviceConfigurationRows(
  item: Record<string, unknown>,
): FlatSettingRow[] {
  const rows = omaRows(item.omaSettings);
  for (const [key, value] of propertyEntries(item, new Set(["omaSettings"]))) {
    for (const category of parseDeviceConfiguration({ [key]: value })) {
      for (const setting of category.settings) {
        rows.push({
          name: setting.name,
          value: setting.value,
          definitionId: key,
          path: [],
          category: category.category,
        });
      }
    }
  }
  return rows;
}

function complianceRows(item: Record<string, unknown>): FlatSettingRow[] {
  const rows: FlatSettingRow[] = [];
  const skip = new Set(["scheduledActionsForRule"]);
  for (const [key, value] of propertyEntries(item, skip)) {
    for (const rule of parseComplianceRules({ [key]: value })) {
      rows.push({
        name: rule.rule,
        value: rule.value,
        definitionId: key,
        path: [],
        category: rule.category,
      });
    }
  }
  return rows;
}

function administrativeTemplateRows(
  item: Record<string, unknown>,
): FlatSettingRow[] {
  const values = Array.isArray(item.definitionValues)
    ? item.definitionValues
    : [];
  const parsed = parseAdministrativeTemplate(values);
  return parsed.map((setting, index) => {
    const raw = values[index] as Record<string, any> | undefined;
    const definition = raw?.definition as Record<string, unknown> | undefined;
    const definitionId = definitionIdOf(definition?.id);
    // What is compared: the state and each presentation's value by the
    // presentation id, never its label. Presentations are told apart by
    // their ids, so their order is no change.
    const presentations = (
      Array.isArray(raw?.presentationValues) ? raw.presentationValues : []
    )
      .map((entry: any) =>
        JSON.stringify([
          entry?.presentation?.id ?? null,
          entry?.value ?? null,
          entry?.values ?? null,
        ]),
      )
      .sort();
    return {
      name: setting.name,
      value:
        setting.value === NOT_CONFIGURED
          ? setting.state
          : `${setting.state}: ${setting.value}`,
      token: JSON.stringify([raw?.enabled ?? null, presentations]),
      ...(definitionId ? { definitionId } : {}),
      path:
        setting.category && setting.category !== "General"
          ? setting.category.split("\\").filter(Boolean)
          : [],
      ...(definitionId ? { identity: [] } : {}),
      category: setting.category,
      ...flag(unreadableTemplateValue(values[index])),
    };
  });
}

function parsedJson(text: unknown): unknown {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Security baseline intents keep their settings as definitionId and
// valueJson pairs; each one goes through parseSecurityBaseline so the id
// stays attached to its row.
function securityBaselineRows(item: Record<string, unknown>): FlatSettingRow[] {
  const flat = Array.isArray(item.settings) ? item.settings : null;
  const sources: Array<{ category: string; settings: unknown[] }> = flat
    ? [{ category: "Baseline settings", settings: flat }]
    : (Array.isArray(item.categories) ? item.categories : []).map(
        (category) => ({
          category:
            textOf((category as Record<string, unknown>)?.displayName) ??
            "General",
          settings: Array.isArray(
            (category as Record<string, unknown>)?.settings,
          )
            ? ((category as Record<string, unknown>).settings as unknown[])
            : [],
        }),
      );
  const rows: FlatSettingRow[] = [];
  for (const source of sources) {
    for (const setting of source.settings) {
      const [parsed] = parseSecurityBaseline([], [setting]);
      const row = parsed?.settings[0];
      if (!row) continue;
      const record = (setting ?? {}) as Record<string, unknown>;
      const definitionId = definitionIdOf(record.definitionId);
      const unreadable = unreadableIntentValue(setting);
      const token = unreadable
        ? undefined
        : rawToken(
            record.value !== undefined && record.value !== null
              ? record.value
              : parsedJson(record.valueJson),
          );
      rows.push({
        name: row.name,
        value: row.value,
        ...(token !== undefined ? { token } : {}),
        ...(definitionId ? { definitionId } : {}),
        path: [],
        category: source.category,
        ...flag(unreadable),
      });
    }
  }
  return rows;
}

function appConfigurationRows(item: Record<string, unknown>): FlatSettingRow[] {
  const rows: FlatSettingRow[] = extractAppConfigurationSettings(item).map(
    (setting: { name: string; value: string }) => ({
      name: setting.name,
      value: setting.value,
      definitionId: setting.name,
      path: [],
    }),
  );
  return [...rows, ...genericRows(item, new Set(["settings"]))];
}

/**
 * Flattens one collected item into searchable setting rows, with the same
 * parser the exports use for its section. Settings Catalog style items
 * (including Endpoint security and Settings Catalog compliance) are detected
 * by shape in any section; everything else falls back to the generic
 * property walk. The data is expected to be sanitized already.
 */
export function flattenItemSettings(
  sectionKey: string,
  item: unknown,
): FlatSettingRow[] {
  if (!item || typeof item !== "object") return [];
  const record = item as Record<string, unknown>;
  if (isCatalogSettings(record.settings)) return catalogRows(record.settings);
  // Reusable policy settings are a single catalog instance.
  if (record.settingInstance && typeof record.settingInstance === "object") {
    const rows: FlatSettingRow[] = [];
    walkCatalogInstance(
      record.settingInstance as ConfigurationSettingInstance,
      Array.isArray(record.settingDefinitions)
        ? (record.settingDefinitions as ConfigurationSettingDefinition[])
        : [],
      [],
      rows,
      0,
    );
    return [
      ...rows,
      ...genericRows(
        markUnreadable(record, sectionKey, false),
        new Set([
          "settingInstance",
          "settingDefinitions",
          "settingDefinitionId",
        ]),
      ).map(unmark),
    ];
  }
  // Plain properties whose value Graph did not return readably read as
  // unreadable rows, never as their value.
  const marked = (topLevel: boolean) =>
    markUnreadable(record, sectionKey, topLevel);
  switch (sectionKey) {
    case "deviceConfigurations":
    case "windowsUpdatePolicies":
      return deviceConfigurationRows(marked(true)).map(unmark);
    case "administrativeTemplates":
      return administrativeTemplateRows(record);
    case "compliancePolicies":
      return complianceRows(marked(true)).map(unmark);
    case "securityBaselines":
      return securityBaselineRows(record);
    case "appConfigurations":
      return appConfigurationRows(marked(false)).map(unmark);
    default:
      return genericRows(marked(false)).map(unmark);
  }
}

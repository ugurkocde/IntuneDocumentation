import { canonicalJson } from "./canonical-json";
import {
  childLists,
  MAX_SETTING_DEPTH,
  METADATA_KEYS,
  normalizeTargetType,
  shownOmaValue,
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
  isUnsetValue,
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
   * The value as Graph returned it, when value shows it by name or without
   * its type: the option ids of a Settings Catalog choice, the state and the
   * typed values by presentation id of an administrative template value, or
   * a typed value (typed). History and Compare compare it instead of value,
   * which is display only.
   */
  token?: string;
  /**
   * The token holds the value with its documented Graph type (typedToken),
   * so a value whose type changed is a change even where both read alike.
   */
  typed?: true;
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

// What a value of a typed Graph record is compared by: the record's
// normalized @odata.type with the value as Graph returned it. Graph types the
// value of every custom OMA-URI row, Settings Catalog simple value, intent
// setting instance and administrative template presentation value
// (graph-rows.ts VALUE_TYPES), and the type is part of the setting a CSP
// processes, so an integer 1 that became the text "1", or the boolean true
// that became the text "Enabled", is a change although both read the same.
// Values of one type keep their own form, so equal values stay equal.
const typedValue = (record: Record<string, unknown>, value: unknown) => [
  normalizeTargetType(record["@odata.type"]),
  value ?? null,
];

// The members of a JSON object are unordered, so a parsed complex value is
// serialized with its keys sorted (canonical-json.ts): the same object in
// another key order is the same value.
const typedToken = (token: unknown) => ({
  token: canonicalJson(token),
  typed: true as const,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// --- Settings Catalog -------------------------------------------------------

// The typed token of the simple value or value collection of a readable
// Settings Catalog instance, entry by entry in order; none for other
// instances.
function simpleToken(instance: ConfigurationSettingInstance) {
  const entry = (value: unknown) =>
    isRecord(value) ? typedValue(value, value.value) : null;
  if (isRecord(instance.simpleSettingValue))
    return typedToken(entry(instance.simpleSettingValue));
  if (Array.isArray(instance.simpleSettingCollectionValue))
    return typedToken(instance.simpleSettingCollectionValue.map(entry));
  return {};
}

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
  shadowed = false,
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
  // The shared instance rules (compliance/graph-rows.ts): an instance
  // without its definition id, or whose own value or child lists cannot be
  // read, is one unreadable row, also a group. Children of unknown lists are
  // not read; children below such an instance, or below an unreadable
  // ancestor (shadowed), are kept as unreadable rows, so nothing below it
  // reads as configured, as a value or as no setting (as the compliance
  // engine's collectCatalogValues reads them).
  const unknownChildren = childLists(instance) === null;
  const unreadable =
    shadowed ||
    !definitionId ||
    unknownChildren ||
    unreadableCatalogValue(instance);
  // A row is kept by the value Graph returned (extractSettingValue
  // configured), never by its display text, so a text value that reads
  // "Not configured" is a setting like any other.
  if (unreadable || (!isGroup && extracted.configured)) {
    const choice = Boolean(
      instance.choiceSettingValue || instance.choiceSettingCollectionValue,
    );
    rows.push({
      name: extracted.name,
      value: unreadable ? UNREADABLE_VALUE : String(extracted.value),
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
        : unreadable
          ? {}
          : simpleToken(instance)),
      ...flag(unreadable),
    });
  }
  if (unknownChildren) return;
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
        unreadable,
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
    const raw = record.value ?? record.omaSettingStringValue;
    // Told by the value Graph returned, never by its display text.
    if (!unreadable && isUnsetValue(raw)) return [];
    // An XML value is shown as its text (graph-rows.ts shownOmaValue).
    const value = unreadable
      ? UNREADABLE_VALUE
      : formatValue(record.value != null ? shownOmaValue(record) : raw);
    const omaUri = definitionIdOf(record.omaUri);
    return [
      {
        name: textOf(record.displayName) ?? omaUri ?? "Custom setting",
        value,
        ...(unreadable
          ? {}
          : typedToken(
              typedValue(record, record.value ?? record.omaSettingStringValue),
            )),
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
    // What is compared: the state and each presentation's typed value by
    // the presentation id, never its label. Presentations are told apart by
    // their ids, so their order is no change.
    const presentations = (
      Array.isArray(raw?.presentationValues) ? raw.presentationValues : []
    )
      .map((entry: any) =>
        canonicalJson([
          entry?.presentation?.id ?? null,
          ...typedValue(isRecord(entry) ? entry : {}, entry?.value),
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
      ...typedToken([raw?.enabled ?? null, presentations]),
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
      rows.push({
        name: row.name,
        value: row.value,
        ...(unreadable
          ? {}
          : typedToken(
              typedValue(
                record,
                record.value !== undefined && record.value !== null
                  ? record.value
                  : parsedJson(record.valueJson),
              ),
            )),
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

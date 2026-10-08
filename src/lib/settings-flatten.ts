import {
  extractAppConfigurationSettings,
  extractSettingValue,
  formatValue,
  parseAdministrativeTemplate,
  parseComplianceRules,
  parseDeviceConfiguration,
  parseDocumentableProperties,
  parseSecurityBaseline,
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
  category?: string;
}

const NOT_CONFIGURED = "Not configured";

// Item level metadata the documentation never lists as a setting.
const METADATA_KEYS = new Set([
  "@odata.type",
  "@odata.context",
  "id",
  "name",
  "displayName",
  "description",
  "createdDateTime",
  "lastModifiedDateTime",
  "modifiedDateTime",
  "assignments",
  "roleScopeTagIds",
  "supportsScopeTags",
  "version",
  "configType",
  "collectionStatus",
  "settingCount",
  "platforms",
  "technologies",
  "templateReference",
  "hasFetchError",
  "fetchErrorMessage",
  "creationSource",
  "isAssigned",
]);

function textOf(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const definitionIdOf = textOf;

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

function childGroups(
  instance: ConfigurationSettingInstance,
): ConfigurationSettingInstance[][] {
  const groups: Array<ConfigurationSettingInstance[] | undefined> = [
    instance.choiceSettingValue?.children,
    ...(Array.isArray(instance.choiceSettingCollectionValue)
      ? instance.choiceSettingCollectionValue.map((choice) => choice?.children)
      : []),
    instance.groupSettingValue?.children,
    ...(Array.isArray(instance.groupSettingCollectionValue)
      ? instance.groupSettingCollectionValue.map((group) => group?.children)
      : []),
  ];
  return groups.filter(
    (children): children is ConfigurationSettingInstance[] =>
      Array.isArray(children) && children.length > 0,
  );
}

function walkCatalogInstance(
  instance: ConfigurationSettingInstance | undefined,
  definitions: ConfigurationSettingDefinition[],
  path: string[],
  rows: FlatSettingRow[],
  depth: number,
): void {
  if (!instance || typeof instance !== "object" || depth > 12) return;
  const extracted = extractSettingValue({
    id: instance.settingDefinitionId ?? "",
    settingInstance: withoutChildren(instance),
    settingDefinitions: definitions,
  });
  const isGroup = Boolean(
    instance.groupSettingValue || instance.groupSettingCollectionValue,
  );
  const definitionId = definitionIdOf(instance.settingDefinitionId);
  if (!isGroup && extracted.value !== NOT_CONFIGURED) {
    rows.push({
      name: extracted.name,
      value: String(extracted.value),
      ...(definitionId ? { definitionId } : {}),
      path,
    });
  }
  // Repeated groups (for example firewall rules) are numbered so rows of
  // different entries stay apart.
  const repeated =
    Array.isArray(instance.groupSettingCollectionValue) &&
    instance.groupSettingCollectionValue.length > 1;
  childGroups(instance).forEach((children, index) => {
    const childPath = [
      ...path,
      repeated ? `${extracted.name} ${index + 1}` : extracted.name,
    ];
    for (const child of children) {
      walkCatalogInstance(child, definitions, childPath, rows, depth + 1);
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
    const value = formatValue(record.value ?? record.omaSettingStringValue);
    if (value === NOT_CONFIGURED) return [];
    const omaUri = definitionIdOf(record.omaUri);
    return [
      {
        name: textOf(record.displayName) ?? omaUri ?? "Custom setting",
        value,
        ...(omaUri ? { definitionId: omaUri } : {}),
        path: [],
        category: "Custom OMA-URI",
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
    const definition = (
      values[index] as { definition?: Record<string, unknown> }
    )?.definition;
    const definitionId = definitionIdOf(definition?.id);
    return {
      name: setting.name,
      value:
        setting.value === NOT_CONFIGURED
          ? setting.state
          : `${setting.state}: ${setting.value}`,
      ...(definitionId ? { definitionId } : {}),
      path:
        setting.category && setting.category !== "General"
          ? setting.category.split("\\").filter(Boolean)
          : [],
      category: setting.category,
    };
  });
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
      const definitionId = definitionIdOf(
        (setting as Record<string, unknown>)?.definitionId,
      );
      rows.push({
        name: row.name,
        value: row.value,
        ...(definitionId ? { definitionId } : {}),
        path: [],
        category: source.category,
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
        record,
        new Set([
          "settingInstance",
          "settingDefinitions",
          "settingDefinitionId",
        ]),
      ),
    ];
  }
  switch (sectionKey) {
    case "deviceConfigurations":
    case "windowsUpdatePolicies":
      return deviceConfigurationRows(record);
    case "administrativeTemplates":
      return administrativeTemplateRows(record);
    case "compliancePolicies":
      return complianceRows(record);
    case "securityBaselines":
      return securityBaselineRows(record);
    case "appConfigurations":
      return appConfigurationRows(record);
    default:
      return genericRows(record);
  }
}

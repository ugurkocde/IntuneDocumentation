import type {
  ConfigurationSetting,
  ConfigurationSettingDefinition,
  ConfigurationSettingInstance,
} from "./intune-detailed-client";
import {
  childLists,
  isInt32,
  MAX_SETTING_DEPTH,
  normalizeTargetType,
  unlistedSources,
  unreadableAssignment,
  unreadableCatalogValue,
  unreadableIntentValue,
  unreadableOmaValue,
  unreadablePresentationValue,
} from "./compliance/graph-rows";

/**
 * The value shown for an identified setting whose value Graph did not
 * return readably (compliance/graph-rows.ts): it is unknown, never "Not
 * configured" or the malformed value.
 */
export const UNREADABLE_VALUE = "Value could not be read";

function collectDefinitionIdsFromInstance(
  instance: ConfigurationSettingInstance | undefined,
  definitionIds: Set<string>,
) {
  if (!instance || typeof instance !== "object") return;

  if (typeof instance.settingDefinitionId === "string") {
    definitionIds.add(instance.settingDefinitionId);
  }

  const childCollections = [
    instance.choiceSettingValue?.children,
    instance.groupSettingValue?.children,
    ...(Array.isArray(instance.choiceSettingCollectionValue)
      ? instance.choiceSettingCollectionValue.map((value) => value.children)
      : []),
    ...(Array.isArray(instance.groupSettingCollectionValue)
      ? instance.groupSettingCollectionValue.map((value) => value.children)
      : []),
  ];

  for (const children of childCollections) {
    if (!Array.isArray(children)) continue;
    for (const child of children) {
      collectDefinitionIdsFromInstance(child, definitionIds);
    }
  }
}

export function collectConfiguredSettingDefinitionIds(
  settings: ConfigurationSetting[],
): string[] {
  const definitionIds = new Set<string>();
  for (const setting of settings) {
    collectDefinitionIdsFromInstance(setting.settingInstance, definitionIds);
  }
  return [...definitionIds];
}

export function associateConfigurationSettingDefinitions(
  settings: ConfigurationSetting[],
  supplementalDefinitions: ConfigurationSettingDefinition[] = [],
): ConfigurationSetting[] {
  const definitionsById = new Map<string, ConfigurationSettingDefinition>();

  for (const setting of settings) {
    for (const definition of setting.settingDefinitions || []) {
      definitionsById.set(definition.id, definition);
    }
  }
  for (const definition of supplementalDefinitions) {
    definitionsById.set(definition.id, definition);
  }

  return settings.map((setting) => {
    const definitionIds = new Set<string>();
    collectDefinitionIdsFromInstance(setting.settingInstance, definitionIds);
    const matchingDefinitions = [...definitionIds]
      .map((definitionId) => definitionsById.get(definitionId))
      .filter((definition): definition is ConfigurationSettingDefinition =>
        Boolean(definition),
      );

    return {
      ...setting,
      settingDefinitions:
        definitionIds.size > 0
          ? matchingDefinitions
          : setting.settingDefinitions,
    };
  });
}

function resolveChoiceDisplayValue(
  value: string | undefined,
  settingDefinition?: ConfigurationSettingDefinition,
): string | undefined {
  if (!settingDefinition?.options) return value;

  const optionByItemId =
    value !== null && value !== undefined
      ? settingDefinition.options.find(
          (option) =>
            option.itemId !== null &&
            option.itemId !== undefined &&
            option.itemId === value,
        )
      : undefined;
  const optionByValue =
    value !== null && value !== undefined
      ? settingDefinition.options.find(
          (option) =>
            option.optionValue?.value !== null &&
            option.optionValue?.value !== undefined &&
            String(option.optionValue.value) === value,
        )
      : undefined;
  const optionByName = settingDefinition.options.find(
    (option) => option.name === value,
  );

  return (
    optionByItemId?.displayName ||
    optionByValue?.displayName ||
    optionByName?.displayName ||
    value
  );
}

// Helper to recursively extract nested settings
// Note: children in collections are raw settingInstance objects, not ConfigurationSetting objects
function extractNestedSettings(
  children: ConfigurationSettingInstance[],
  depth: number = 0,
  parentDefinitions?: ConfigurationSettingDefinition[],
): Array<{ name: string; value: string; description?: string }> {
  const results: Array<{ name: string; value: string; description?: string }> =
    [];
  const indent = "  ".repeat(depth);

  // Safety check: ensure children is an array
  if (!Array.isArray(children)) {
    return results;
  }
  // Settings below the depth limit are not read (compliance/graph-rows.ts),
  // so they show as unknown, never as no setting.
  if (depth > MAX_SETTING_DEPTH) {
    return children.length
      ? [
          {
            name: `${indent}Setting below the depth limit`,
            value: UNREADABLE_VALUE,
          },
        ]
      : results;
  }

  for (const child of children) {
    // A child Graph returned as no record has no identifier, so it shows as
    // an unknown setting, never as no setting.
    if (!child || typeof child !== "object" || Array.isArray(child)) {
      results.push({
        name: `${indent}Setting without its identifier`,
        value: UNREADABLE_VALUE,
      });
      continue;
    }

    try {
      // Children in collections are raw settingInstance objects
      // They have settingDefinitionId but no settingInstance wrapper
      const settingDefinitionId = child.settingDefinitionId;

      // Create a proper ConfigurationSetting structure
      const configSetting: ConfigurationSetting = {
        id: settingDefinitionId || "",
        settingInstance: child, // The child IS the settingInstance
        settingDefinitions: parentDefinitions || [],
      };

      const childResult = extractSettingValue(configSetting, depth);

      // Skip unconfigured settings
      if (!childResult || childResult.value === "Not configured") {
        continue;
      }

      // Add the main setting with indentation
      results.push({
        name: indent + childResult.name,
        value: childResult.value,
        description: childResult.description,
      });

      // If this setting has nested children, add them recursively
      if (childResult.nestedSettings && childResult.nestedSettings.length > 0) {
        results.push(...childResult.nestedSettings);
      }
    } catch (error) {
      // A child that cannot be processed is unknown, never left out.
      console.warn("Error processing nested setting:", error);
      results.push({
        name: `${indent}${
          typeof child.settingDefinitionId === "string"
            ? child.settingDefinitionId
            : "Setting without its identifier"
        }`,
        value: UNREADABLE_VALUE,
      });
    }
  }

  return results;
}

// A list Graph returned, or none for a value of another shape.
const list = <T>(value: T[] | undefined): T[] =>
  Array.isArray(value) ? value : [];

// Helper to extract setting value from complex structures
export function extractSettingValue(
  setting: ConfigurationSetting,
  depth: number = 0,
): {
  name: string;
  value: any;
  type: string;
  description?: string;
  nestedSettings?: Array<{ name: string; value: string; description?: string }>;
} {
  const instance = setting.settingInstance;
  const settingDef =
    setting.settingDefinitions?.find(
      (definition) => definition.id === instance?.settingDefinitionId,
    ) ||
    (!instance?.settingDefinitionId && setting.settingDefinitions?.length === 1
      ? setting.settingDefinitions[0]
      : undefined);

  let value: any = "Not configured";
  let type = "Unknown";
  let nestedSettings:
    | Array<{ name: string; value: string; description?: string }>
    | undefined;

  // Safety check: if settingInstance is missing or undefined, return early
  if (!instance) {
    return {
      name: settingDef?.displayName || setting.id || "Unknown Setting",
      value: "Not configured",
      type: "Unknown",
      description: settingDef?.description,
    };
  }

  // Extract value based on setting type
  if (instance.simpleSettingValue) {
    value = instance.simpleSettingValue.value;
    type = "Simple";
  } else if (instance.simpleSettingCollectionValue) {
    // Handle array of simple values (strings, numbers, booleans). A
    // collection or an entry Graph returned in another shape is unreadable
    // (unreadableCatalogValue below), so it is read without throwing.
    type = "Simple Collection";
    const values = list(instance.simpleSettingCollectionValue).map(
      (item) => item?.value,
    );
    value = values; // formatValue will handle array formatting
  } else if (instance.choiceSettingValue) {
    value = resolveChoiceDisplayValue(
      instance.choiceSettingValue.value,
      settingDef,
    );
    type = "Choice";

    // Handle nested children in choice settings
    if (
      instance.choiceSettingValue.children &&
      instance.choiceSettingValue.children.length > 0
    ) {
      nestedSettings = extractNestedSettings(
        instance.choiceSettingValue.children,
        depth + 1,
        setting.settingDefinitions,
      );
    }
  } else if (instance.choiceSettingCollectionValue) {
    value = list(instance.choiceSettingCollectionValue).map((choice) =>
      resolveChoiceDisplayValue(choice?.value, settingDef),
    );
    type = "Choice Collection";
    const allNestedSettings = list(
      instance.choiceSettingCollectionValue,
    ).flatMap((choice) =>
      choice?.children?.length
        ? extractNestedSettings(
            choice.children,
            depth + 1,
            setting.settingDefinitions,
          )
        : [],
    );
    if (allNestedSettings.length > 0) nestedSettings = allNestedSettings;
  } else if (instance.groupSettingValue) {
    // Handle single group setting (not a collection)
    type = "Group";
    if (
      instance.groupSettingValue.children &&
      instance.groupSettingValue.children.length > 0
    ) {
      nestedSettings = extractNestedSettings(
        instance.groupSettingValue.children,
        depth + 1,
        setting.settingDefinitions,
      );
      value = `${nestedSettings.length} setting(s) in group`;
    } else {
      value = "Group setting (no children)";
    }
  } else if (instance.groupSettingCollectionValue) {
    // Instead of just showing "Collection (X items)", extract the nested settings
    type = "Group Collection";
    const allNestedSettings: Array<{
      name: string;
      value: string;
      description?: string;
    }> = [];

    for (const group of list(instance.groupSettingCollectionValue)) {
      if (group?.children && group.children.length > 0) {
        allNestedSettings.push(
          ...extractNestedSettings(
            group.children,
            depth + 1,
            setting.settingDefinitions,
          ),
        );
      }
    }

    if (allNestedSettings.length > 0) {
      nestedSettings = allNestedSettings;
      value = `${allNestedSettings.length} setting(s) configured`;
    } else {
      value = `Collection (${list(instance.groupSettingCollectionValue).length} items)`;
    }
  }

  // Children are read only through the value the instance's type
  // documents (compliance/graph-rows.ts childLists). When they cannot be
  // read, such as on an instance of an undocumented type or with a value
  // in another type's property, the setting and what it holds are unknown.
  // Below an unreadable own value, whether the children apply is unknown
  // too, so they show as unreadable, never with their values.
  const unknownChildren = childLists(instance) === null;
  const unreadable = unknownChildren || unreadableCatalogValue(instance);
  return {
    name:
      settingDef?.displayName ||
      instance.settingDefinitionId ||
      "Unknown Setting",
    value: unreadable ? UNREADABLE_VALUE : formatValue(value),
    type,
    description: settingDef?.description,
    nestedSettings: unknownChildren
      ? undefined
      : unreadable
        ? nestedSettings?.map((nested) => ({
            ...nested,
            value: UNREADABLE_VALUE,
          }))
        : nestedSettings,
  };
}

// Format values for display
export function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return "Not configured";
  }

  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }

  if (typeof value === "number") {
    return value.toString();
  }

  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    if (value.length === 0) return "Not configured";
    return value
      .map(formatValue)
      .join(
        value.length > 3 ||
          value.some((item) => item !== null && typeof item === "object")
          ? "\n"
          : ", ",
      );
  }

  if (typeof value === "object") {
    // Preserve name/value pairs and falsy values instead of discarding payloads.
    if (Object.hasOwn(value, "value")) {
      const label = value.displayName ?? value.name;
      return label !== undefined && label !== null
        ? `${String(label)}: ${formatValue(value.value)}`
        : formatValue(value.value);
    }
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

const DOCUMENT_METADATA_KEYS = new Set([
  "id",
  "@odata.type",
  "@odata.context",
  "displayName",
  "name",
  "description",
  "createdDateTime",
  "lastModifiedDateTime",
  "modifiedDateTime",
  "assignments",
  "configType",
  "registryKey",
  "sourceEndpoint",
  "collectionStatus",
  "presentationFetchError",
]);

export function humanizePropertyName(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function parseDocumentableProperties(
  value: Record<string, any>,
  maxDepth = 5,
): Array<{ name: string; value: string }> {
  const settings: Array<{ name: string; value: string }> = [];

  if (typeof value["@odata.type"] === "string") {
    settings.push({
      name: "Resource Type",
      value: value["@odata.type"].replace("#microsoft.graph.", ""),
    });
  }

  const visit = (current: unknown, path: string[], depth: number) => {
    if (current === null || current === undefined) return;
    if (
      depth < maxDepth &&
      Array.isArray(current) &&
      current.every((item) => item && typeof item === "object")
    ) {
      current.forEach((item, index) => {
        const record = item as Record<string, unknown>;
        const candidate =
          record.displayName ??
          record.name ??
          record.title ??
          record.id ??
          `Item ${index + 1}`;
        const label =
          typeof candidate === "string" || typeof candidate === "number"
            ? String(candidate)
            : `Item ${index + 1}`;
        visit(item, [...path, label], depth + 1);
      });
      return;
    }
    if (
      depth < maxDepth &&
      !Array.isArray(current) &&
      typeof current === "object"
    ) {
      for (const [key, nested] of Object.entries(
        current as Record<string, unknown>,
      )) {
        if (DOCUMENT_METADATA_KEYS.has(key)) continue;
        visit(nested, [...path, humanizePropertyName(key)], depth + 1);
      }
      return;
    }

    const formatted = formatValue(current);
    if (formatted !== "Not configured" && path.length > 0) {
      settings.push({ name: path.join(" › "), value: formatted });
    }
  };

  visit(value, [], 0);
  return settings;
}

export function extractAppConfigurationSettings(config: Record<string, any>) {
  if (!Array.isArray(config.settings)) return [];
  return config.settings
    .map((setting: Record<string, any>) => ({
      name:
        setting.appConfigKey ||
        setting.settingName ||
        setting.name ||
        setting.key ||
        "Setting",
      value: formatValue(
        setting.appConfigKeyValue ??
          setting.settingValue ??
          setting.value ??
          setting.valueJson,
      ),
      type: setting.appConfigKeyType,
    }))
    .filter((setting) => setting.value !== "Not configured");
}

// Custom OMA-URI rows as formatValue shows them, with a value Graph did not
// return readably shown as unreadable. Graph returns the value on every row
// (compliance/graph-rows.ts), so a collected row without one is unreadable
// too, unless it is encrypted.
function formatOmaSettings(rows: unknown[]): string {
  return formatValue(
    rows.map((row: any) =>
      row &&
      typeof row === "object" &&
      (unreadableOmaValue(row) ||
        (!Object.hasOwn(row, "value") && row.isEncrypted !== true))
        ? { ...row, value: UNREADABLE_VALUE }
        : row,
    ),
  );
}

// Parse device configuration properties
export function parseDeviceConfiguration(config: any): Array<{
  category: string;
  settings: Array<{
    name: string;
    value: string;
    description?: string;
  }>;
}> {
  const categories: Record<string, any[]> = {};
  const ignoredKeys = [
    "id",
    "@odata.type",
    "@odata.context",
    "displayName",
    "description",
    "createdDateTime",
    "lastModifiedDateTime",
    "version",
    "assignments",
    "configType",
    "roleScopeTagIds",
    "supportsScopeTags",
  ];

  // Group settings by category
  Object.keys(config).forEach((key) => {
    if (
      !ignoredKeys.includes(key) &&
      !DOCUMENT_METADATA_KEYS.has(key) &&
      config[key] !== null &&
      config[key] !== undefined
    ) {
      const formattedValue =
        key === "omaSettings" && Array.isArray(config[key])
          ? formatOmaSettings(config[key])
          : formatValue(config[key]);

      // Skip unconfigured settings
      if (formattedValue === "Not configured") {
        return;
      }

      const category = getCategoryFromKey(key);
      if (!categories[category]) {
        categories[category] = [];
      }

      categories[category].push({
        name: formatKeyName(key),
        value: formattedValue,
        description: getPropertyDescription(key),
      });
    }
  });

  return Object.keys(categories).map((category) => ({
    category,
    settings: categories[category] || [],
  }));
}

// Parse administrative template definition values
export function parseAdministrativeTemplate(definitionValues: any[]): Array<{
  name: string;
  value: string;
  state: string;
  category: string;
}> {
  return definitionValues.map((dv) => {
    const definition = dv.definition || {};
    const presentationValues = dv.presentationValues || [];

    let value = dv.presentationFetchError
      ? "Unavailable (Microsoft Graph did not return presentation values)"
      : "Not configured";
    const state =
      dv.enabled === true
        ? "Enabled"
        : dv.enabled === false
          ? "Disabled"
          : "Unknown";

    // Extract values from presentation values
    if (presentationValues.length > 0) {
      const values = presentationValues
        .map((pv: any) => {
          if (unreadablePresentationValue(pv)) {
            return `${pv?.presentation?.label || "Value"}: ${UNREADABLE_VALUE}`;
          }
          if (Array.isArray(pv.values)) {
            return `${pv.presentation?.label || "Values"}: ${formatValue(pv.values)}`;
          }
          if (pv.value !== undefined && pv.value !== null) {
            return `${pv.presentation?.label || "Value"}: ${formatValue(pv.value)}`;
          }
          return null;
        })
        .filter(Boolean);

      if (values.length > 0) {
        value = values.join(", ");
      }
    }

    return {
      name: definition.displayName || "Unknown Setting",
      value,
      state,
      category: definition.categoryPath || "General",
    };
  });
}

// Parse compliance policy rules - dynamic enumeration based on policy type
export function parseComplianceRules(policy: any): Array<{
  category: string;
  rule: string;
  value: string;
  action: string;
}> {
  const rules: any[] = [];

  // Properties to ignore (metadata, not actual compliance settings)
  const ignoredKeys = [
    "id",
    "@odata.type",
    "@odata.context",
    "displayName",
    "description",
    "createdDateTime",
    "lastModifiedDateTime",
    "version",
    "assignments",
    "roleScopeTagIds",
    "scheduledActionsForRule",
  ];

  // Enumerate all properties dynamically
  Object.keys(policy).forEach((key) => {
    if (
      !ignoredKeys.includes(key) &&
      !DOCUMENT_METADATA_KEYS.has(key) &&
      policy[key] !== undefined &&
      policy[key] !== null
    ) {
      const formattedValue = formatValue(policy[key]);

      // Skip unconfigured settings
      if (formattedValue === "Not configured") {
        return;
      }

      rules.push({
        category: getCategoryFromKey(key),
        rule: formatKeyName(key),
        value: formattedValue,
        action: getComplianceAction(
          policy.scheduledActionsForRule,
          policy.collectionStatus?.scheduledActionsForRule,
        ),
      });
    }
  });

  return rules;
}

// Helper to parse security baseline setting name from definitionId
function parseSecurityBaselineSettingName(
  definitionId: string | undefined,
): string {
  if (!definitionId) return "Unknown Setting";

  // Example: "device_vendor_msft_defender_configuration_enablenetworkprotection"
  // Should become: "Defender Configuration › Enable Network Protection"

  const parts = definitionId.split("_");

  // Remove common prefixes
  if (parts[0] === "device" || parts[0] === "user") parts.shift();
  if (parts[0] === "vendor") parts.shift();
  if (parts[0] === "msft") parts.shift();

  // Find category (usually the first capitalized part or before "configuration")
  let categoryEndIndex = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "configuration" || parts[i] === "settings") {
      categoryEndIndex = i;
      break;
    }
  }

  if (categoryEndIndex > 0) {
    const category = parts.slice(0, categoryEndIndex).join(" ");
    const settingName = parts.slice(categoryEndIndex + 1).join(" ");

    // Format both parts
    const formattedCategory = formatKeyName(category);
    const formattedSetting = formatKeyName(settingName);

    return `${formattedCategory} › ${formattedSetting}`;
  }

  // Fallback: just format the whole thing
  return formatKeyName(parts.join(" "));
}

// Parse security baseline categories and settings
export function parseSecurityBaseline(
  categories: any[],
  flatSettings?: any[],
): Array<{
  category: string;
  settings: Array<{
    name: string;
    value: string;
    description?: string;
  }>;
}> {
  const sourceCategories = Array.isArray(flatSettings)
    ? [{ displayName: "Baseline settings", settings: flatSettings }]
    : categories;
  return sourceCategories.map((category) => {
    const settings = (category.settings || [])
      .map((setting: any) => {
        let value = "Not configured";

        if (unreadableIntentValue(setting)) {
          value = UNREADABLE_VALUE;
        } else if (setting.value !== undefined && setting.value !== null) {
          value = formatValue(setting.value);
        } else if (typeof setting.valueJson === "string") {
          value = formatValue(JSON.parse(setting.valueJson));
        }

        return {
          name: parseSecurityBaselineSettingName(setting.definitionId),
          value,
          description: setting.description,
        };
      })
      .filter(
        (setting: { name: string; value: string; description?: string }) =>
          setting.value !== "Not configured",
      ); // Filter out unconfigured settings

    return {
      category: category.displayName || "General",
      settings,
    };
  });
}

/** The line of a policy whose settings Graph did not return. */
export const SETTINGS_UNAVAILABLE = "Settings unavailable";

/**
 * Whether a policy's settings are unknown, so the documentation says they
 * are unavailable instead of not configured: Graph did not return its
 * setting list as a list (compliance/graph-rows.ts), or its settings were
 * not collected completely.
 */
export const settingsUnavailable = (
  item: Record<string, any>,
  family: string,
): boolean =>
  unlistedSources(item, family).size > 0 ||
  item.collectionStatus?.settings === "incomplete";

/** The assignment line of a resource type without an assignment relationship. */
export const ASSIGNMENTS_NOT_APPLICABLE =
  "Not applicable (this resource type has no assignments)";

/** The label of an assignment whose target cannot be read. */
export const UNREADABLE_ASSIGNMENT = "Assignment could not be read";

// The label of one assignment, read by its documented target type as the
// engine reads it (compliance/graph-rows.ts): an assignment of a type Graph
// does not document, or without what its type targets, may target anyone,
// so it is marked unreadable rather than labelled.
function assignmentLabel(assignment: unknown): string {
  if (unreadableAssignment(assignment)) return UNREADABLE_ASSIGNMENT;
  const target = (assignment as { target: Record<string, any> }).target;
  const type = normalizeTargetType(target["@odata.type"]);
  let label: string;
  if (type === "groupassignmenttarget") label = `Group: ${target.groupId}`;
  else if (type === "exclusiongroupassignmenttarget")
    label = `Excluded: ${target.groupId}`;
  else if (type === "alldevicesassignmenttarget") label = "All Devices";
  else if (type === "alllicensedusersassignmenttarget") label = "All Users";
  else if (type === "configurationmanagercollectionassignmenttarget")
    label = `CM Collection: ${target.collectionId}`;
  else if (type === "organizationalunitassignmenttarget")
    label = `Organizational unit: ${target.organizationalUnitId}`;
  else if (type === "scopetaggroupassignmenttarget")
    // "Group: <id>" so the exports put the group name in its place.
    label = `${target.targetType === "device" ? "Devices" : "Users"} in Group: ${target.entraObjectId}`;
  else return UNREADABLE_ASSIGNMENT;
  const filterType = target.deviceAndAppManagementAssignmentFilterType;
  if (filterType !== "include" && filterType !== "exclude") return label;
  return `${label} [Filter (${filterType === "include" ? "Include" : "Exclude"}): ${target.deviceAndAppManagementAssignmentFilterId}]`;
}

// Parse assignment information. Assignments Graph returned as no list, or
// as a value that is not one, may hold any assignment, so they are marked
// unreadable rather than not assigned, as the engine reads them
// (compliance/assignments.ts).
export function parseAssignments(
  assignments: unknown,
  status?: string,
): string {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return status === "incomplete"
      ? "Assignments unavailable (collection incomplete)"
      : Array.isArray(assignments)
        ? "Not assigned"
        : UNREADABLE_ASSIGNMENT;
  }
  return (
    assignments.map(assignmentLabel).join(", ") +
    (status === "incomplete" ? " (collection incomplete)" : "")
  );
}

// Helper functions
function getCategoryFromKey(key: string): string {
  const categoryMap: Record<string, string> = {
    password: "Password",
    firewall: "Firewall",
    defender: "Microsoft Defender",
    bitLocker: "BitLocker",
    update: "Windows Update",
    app: "Applications",
    device: "Device",
    network: "Network",
    security: "Security",
    privacy: "Privacy",
    browser: "Browser",
  };

  const lowerKey = key.toLowerCase();
  for (const [prefix, category] of Object.entries(categoryMap)) {
    if (lowerKey.includes(prefix)) {
      return category;
    }
  }

  return "General";
}

function formatKeyName(key: string): string {
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

function getPropertyDescription(key: string): string | undefined {
  // Add common property descriptions
  const descriptions: Record<string, string> = {
    passwordMinimumLength:
      "Minimum number of characters required for device password",
    passwordRequired: "Require a password to unlock device",
    storageRequireEncryption: "Require encryption on device storage",
    firewallEnabled: "Enable Windows Firewall for all network profiles",
    defenderEnabled: "Enable Microsoft Defender Antimalware",
    bitLockerEnabled: "Require BitLocker encryption on Windows devices",
  };

  return descriptions[key];
}

function getComplianceAction(scheduledActions: any[], status?: string): string {
  const incomplete = status === "incomplete";
  const actions = (scheduledActions || [])
    .flatMap((rule) => rule?.scheduledActionConfigurations || [])
    .map((config: any) => {
      const hours = config.gracePeriodHours;
      const timing =
        !isInt32(hours) || hours < 0
          ? " (timing unavailable)"
          : hours === 0
            ? " immediately"
            : hours % 24 === 0
              ? ` after ${hours / 24} day${hours === 24 ? "" : "s"}`
              : ` after ${hours} hour${hours === 1 ? "" : "s"}`;
      const labels: Record<string, string> = {
        block: "Mark device noncompliant",
        retire: "Retire device",
        removeResourceAccessProfiles: "Remove profiles",
        notification: "Notify",
        pushNotification: "Send push notification",
        remoteLock: "Remotely lock device",
      };
      return `${labels[config.actionType] ?? `Action ${config.actionType ?? "unknown"}`}${timing}`;
    });
  if (actions.length === 0)
    return incomplete
      ? "Actions unavailable (collection incomplete)"
      : "No action configured";
  return actions.join(", ") + (incomplete ? " (collection incomplete)" : "");
}

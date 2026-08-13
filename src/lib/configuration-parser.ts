import type { ConfigurationSetting } from "./intune-detailed-client";

// Helper to recursively extract nested settings
// Note: children in collections are raw settingInstance objects, not ConfigurationSetting objects
function extractNestedSettings(
  children: any[],
  depth: number = 0,
  parentDefinitions?: Array<{
    id: string;
    displayName: string;
    description?: string;
    options?: any[];
  }>,
): Array<{ name: string; value: string; description?: string }> {
  const results: Array<{ name: string; value: string; description?: string }> =
    [];
  const indent = "  ".repeat(depth);

  // Safety check: ensure children is an array
  if (!Array.isArray(children)) {
    return results;
  }

  for (const child of children) {
    // Skip if child is null/undefined
    if (!child) continue;

    try {
      // Children in collections are raw settingInstance objects
      // They have settingDefinitionId but no settingInstance wrapper
      const settingDefinitionId = child.settingDefinitionId;

      // Find the definition from the parent's definitions array
      const settingDef = parentDefinitions?.find(
        (def) => def.id === settingDefinitionId,
      );

      // Create a proper ConfigurationSetting structure
      const configSetting: ConfigurationSetting = {
        id: settingDefinitionId || "",
        settingInstance: child, // The child IS the settingInstance
        settingDefinitions: settingDef ? [settingDef as any] : [],
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
      // If there's an error processing a child setting, log it and continue
      console.warn("Error processing nested setting:", error);
      continue;
    }
  }

  return results;
}

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
  const settingDef = setting.settingDefinitions?.[0];
  const instance = setting.settingInstance;

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
    // Handle array of simple values (strings, numbers, booleans)
    type = "Simple Collection";
    const values = instance.simpleSettingCollectionValue.map(
      (item) => item.value,
    );
    value = values; // formatValue will handle array formatting
  } else if (instance.choiceSettingValue) {
    value = instance.choiceSettingValue.value;
    type = "Choice";
    // Get the display name for the choice if available
    if (settingDef?.options) {
      const option = settingDef.options.find(
        (o) => o.name === value || o.itemId === value,
      );
      if (option) {
        value = option.displayName || value;
      }
    }

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

    for (const group of instance.groupSettingCollectionValue) {
      if (group.children && group.children.length > 0) {
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
      value = `Collection (${instance.groupSettingCollectionValue.length} items)`;
    }
  }

  return {
    name:
      settingDef?.displayName ||
      instance.settingDefinitionId ||
      "Unknown Setting",
    value: formatValue(value),
    type,
    description: settingDef?.description,
    nestedSettings,
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

  if (typeof value === "string") {
    // Clean up technical values
    if (value.startsWith("device_vendor_msft_")) {
      return value.replace(/device_vendor_msft_/g, "").replace(/_/g, " ");
    }
    return value;
  }

  if (Array.isArray(value)) {
    // Handle empty arrays
    if (value.length === 0) {
      return "Not configured";
    }

    // Handle arrays of objects - extract displayName or other meaningful fields
    if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) {
      const formattedItems = value.map((item: any) => {
        // Try to find a meaningful string representation
        if (item.displayName) return item.displayName;
        if (item.name) return item.name;
        if (item.value) return String(item.value);
        if (item.packageId) return item.packageId;
        if (item.bundleId) return item.bundleId;
        // If object has only a few keys, try to create a readable string
        const keys = Object.keys(item);
        if (keys.length === 1 && keys[0]) return String(item[keys[0]]);
        return JSON.stringify(item);
      });
      return formattedItems.join("\n");
    }

    // Handle arrays of primitives (strings, numbers, booleans)
    // Use newlines for better readability if more than 3 items
    if (value.length > 3) {
      return value.map((item: any) => String(item)).join("\n");
    }

    return value.map((item: any) => String(item)).join(", ");
  }

  if (typeof value === "object") {
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
]);

function humanizePropertyName(value: string) {
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
      config[key] !== null &&
      config[key] !== undefined
    ) {
      const formattedValue = formatValue(config[key]);

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
    const state = dv.enabled ? "Enabled" : "Disabled";

    // Extract values from presentation values
    if (presentationValues.length > 0) {
      const values = presentationValues
        .map((pv: any) => {
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
        action: getComplianceAction(policy.scheduledActionsForRule),
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
  // Should become: "Defender Configuration - Enable Network Protection"

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

    return `${formattedCategory} - ${formattedSetting}`;
  }

  // Fallback: just format the whole thing
  return formatKeyName(parts.join(" "));
}

// Parse security baseline categories and settings
export function parseSecurityBaseline(categories: any[]): Array<{
  category: string;
  settings: Array<{
    name: string;
    value: string;
    description?: string;
  }>;
}> {
  return categories.map((category) => {
    const settings = (category.settings || [])
      .map((setting: any) => {
        let value = "Not configured";

        if (setting.value !== undefined && setting.value !== null) {
          value = formatValue(setting.value);
        } else if (setting.stringValue) {
          value = setting.stringValue;
        } else if (setting.intValue !== undefined) {
          value = setting.intValue.toString();
        } else if (setting.boolValue !== undefined) {
          value = setting.boolValue ? "Enabled" : "Disabled";
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

// Parse assignment information
export function parseAssignments(assignments: any[]): string {
  if (!assignments || assignments.length === 0) {
    return "Not assigned";
  }

  const labels: string[] = [];

  for (const assn of assignments) {
    const target = assn?.target ?? assn ?? {};
    const typeRaw = target["@odata.type"] || "";
    const type = typeof typeRaw === "string" ? typeRaw.toLowerCase() : "";

    // Common group-based assignments
    if (target.groupId) {
      if (type.includes("exclusiongroup")) {
        labels.push(`Excluded: ${target.groupId}`);
      } else {
        labels.push(`Group: ${target.groupId}`);
      }
      continue;
    }

    // All Devices / All Users / All Licensed Users
    if (type.includes("alldevices")) {
      labels.push("All Devices");
      continue;
    }
    if (type.includes("alllicensedusers") || type.includes("allusers")) {
      labels.push("All Users");
      continue;
    }

    // Intune assignment filter
    if (target.deviceAndAppManagementAssignmentFilterId) {
      const fType = String(
        target.deviceAndAppManagementAssignmentFilterType || "",
      ).toLowerCase();
      const prefix = fType.includes("include")
        ? "Filter (Include)"
        : fType.includes("exclude")
          ? "Filter (Exclude)"
          : "Filter";
      labels.push(
        `${prefix}: ${target.deviceAndAppManagementAssignmentFilterId}`,
      );
      continue;
    }

    // ConfigMgr collections
    if (
      type.includes("configurationmanagercollectionassignmenttarget") &&
      target.collectionId
    ) {
      labels.push(`CM Collection: ${target.collectionId}`);
      continue;
    }

    // Fallback
    labels.push("Custom Assignment");
  }

  return labels.join(", ");
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

function getComplianceAction(scheduledActions: any[]): string {
  if (!scheduledActions || scheduledActions.length === 0) {
    return "No action configured";
  }

  const actions = scheduledActions
    .flatMap((sa) => sa.scheduledActionConfigurations || [])
    .map((config: any) => {
      const hours = config.gracePeriodHours || 0;
      const days = Math.floor(hours / 24);
      const actionType = config.actionType || "notification";

      if (actionType === "block") {
        return `Block access after ${days} days`;
      } else if (actionType === "retire") {
        return `Retire device after ${days} days`;
      } else if (actionType === "removeResourceAccessProfiles") {
        return `Remove profiles after ${days} days`;
      }

      return `Notify after ${days} days`;
    });

  return actions.join(", ");
}

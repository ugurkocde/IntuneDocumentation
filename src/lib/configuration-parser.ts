import type { ConfigurationSetting } from "./intune-detailed-client";

// Helper to extract setting value from complex structures
export function extractSettingValue(setting: ConfigurationSetting): {
  name: string;
  value: any;
  type: string;
  description?: string;
} {
  const settingDef = setting.settingDefinitions?.[0];
  const instance = setting.settingInstance;
  
  let value: any = "Not configured";
  let type = "Unknown";
  
  // Extract value based on setting type
  if (instance.simpleSettingValue) {
    value = instance.simpleSettingValue.value;
    type = "Simple";
  } else if (instance.choiceSettingValue) {
    value = instance.choiceSettingValue.value;
    type = "Choice";
    // Get the display name for the choice if available
    if (settingDef?.options) {
      const option = settingDef.options.find(o => o.name === value);
      if (option) {
        value = option.displayName || value;
      }
    }
  } else if (instance.groupSettingCollectionValue) {
    value = `Collection (${instance.groupSettingCollectionValue.length} items)`;
    type = "Collection";
  }
  
  return {
    name: settingDef?.displayName || instance.settingDefinitionId || "Unknown Setting",
    value: formatValue(value),
    type,
    description: settingDef?.description
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
    return value.join(", ");
  }
  
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  
  return String(value);
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
  const categories: { [key: string]: any[] } = {};
  const ignoredKeys = [
    "id", "@odata.type", "@odata.context", "displayName", "description",
    "createdDateTime", "lastModifiedDateTime", "version", "assignments",
    "configType", "roleScopeTagIds", "supportsScopeTags"
  ];
  
  // Group settings by category
  Object.keys(config).forEach(key => {
    if (!ignoredKeys.includes(key) && config[key] !== null && config[key] !== undefined) {
      const category = getCategoryFromKey(key);
      if (!categories[category]) {
        categories[category] = [];
      }
      
      categories[category].push({
        name: formatKeyName(key),
        value: formatValue(config[key]),
        description: getPropertyDescription(key, config["@odata.type"])
      });
    }
  });
  
  return Object.keys(categories).map(category => ({
    category,
    settings: categories[category]
  }));
}

// Parse administrative template definition values
export function parseAdministrativeTemplate(definitionValues: any[]): Array<{
  name: string;
  value: string;
  state: string;
  category: string;
}> {
  return definitionValues.map(dv => {
    const definition = dv.definition || {};
    const presentationValues = dv.presentationValues || [];
    
    let value = "Not configured";
    let state = dv.enabled ? "Enabled" : "Disabled";
    
    // Extract values from presentation values
    if (presentationValues.length > 0) {
      const values = presentationValues.map((pv: any) => {
        if (pv.value !== undefined && pv.value !== null) {
          return `${pv.presentation?.label || "Value"}: ${formatValue(pv.value)}`;
        }
        return null;
      }).filter(Boolean);
      
      if (values.length > 0) {
        value = values.join(", ");
      }
    }
    
    return {
      name: definition.displayName || "Unknown Setting",
      value,
      state,
      category: definition.categoryPath || "General"
    };
  });
}

// Parse compliance policy rules
export function parseComplianceRules(policy: any): Array<{
  category: string;
  rule: string;
  value: string;
  action: string;
}> {
  const rules: any[] = [];
  const complianceKeys = [
    "passwordRequired", "passwordMinimumLength", "passwordRequiredType",
    "osMinimumVersion", "osMaximumVersion", "storageRequireEncryption",
    "jailBroken", "deviceThreatProtectionEnabled", "deviceThreatProtectionRequiredSecurityLevel",
    "configurationManagerComplianceRequired", "systemIntegrityProtectionEnabled",
    "codeIntegrityEnabled", "firewallEnabled", "antivirusRequired",
    "antispywareRequired", "defenderEnabled", "bitLockerEnabled"
  ];
  
  complianceKeys.forEach(key => {
    if (policy[key] !== undefined && policy[key] !== null) {
      rules.push({
        category: getCategoryFromKey(key),
        rule: formatKeyName(key),
        value: formatValue(policy[key]),
        action: getComplianceAction(policy.scheduledActionsForRule)
      });
    }
  });
  
  return rules;
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
  return categories.map(category => {
    const settings = (category.settings || []).map((setting: any) => {
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
        name: setting.definitionId?.split("_").pop() || "Unknown Setting",
        value,
        description: setting.description
      };
    });
    
    return {
      category: category.displayName || "General",
      settings
    };
  });
}

// Parse assignment information
export function parseAssignments(assignments: any[]): string {
  if (!assignments || assignments.length === 0) {
    return "Not assigned";
  }
  
  const targets = assignments.map(assignment => {
    const target = assignment.target;
    if (!target) return "Unknown";
    
    const type = target["@odata.type"];
    if (type?.includes("allDevices")) return "All Devices";
    if (type?.includes("allUsers")) return "All Users";
    if (type?.includes("group")) return `Group: ${target.groupId || "Unknown"}`;
    if (type?.includes("exclusionGroup")) return `Excluded: ${target.groupId || "Unknown"}`;
    
    return "Custom Assignment";
  });
  
  return targets.join(", ");
}

// Helper functions
function getCategoryFromKey(key: string): string {
  const categoryMap: { [key: string]: string } = {
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
    browser: "Browser"
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
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function getPropertyDescription(key: string, odataType: string): string | undefined {
  // Add common property descriptions
  const descriptions: { [key: string]: string } = {
    passwordMinimumLength: "Minimum number of characters required for device password",
    passwordRequired: "Require a password to unlock device",
    storageRequireEncryption: "Require encryption on device storage",
    firewallEnabled: "Enable Windows Firewall for all network profiles",
    defenderEnabled: "Enable Microsoft Defender Antimalware",
    bitLockerEnabled: "Require BitLocker encryption on Windows devices"
  };
  
  return descriptions[key];
}

function getComplianceAction(scheduledActions: any[]): string {
  if (!scheduledActions || scheduledActions.length === 0) {
    return "No action configured";
  }
  
  const actions = scheduledActions
    .flatMap(sa => sa.scheduledActionConfigurations || [])
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
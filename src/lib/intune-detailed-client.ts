import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";

export function createGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

// Enhanced configuration types with settings
export interface ConfigurationSetting {
  id: string;
  settingInstance: {
    "@odata.type": string;
    settingDefinitionId: string;
    settingInstanceTemplateReference?: {
      settingInstanceTemplateId: string;
    };
    simpleSettingValue?: {
      value: any;
      "@odata.type": string;
    };
    groupSettingCollectionValue?: Array<{
      children: ConfigurationSetting[];
    }>;
    choiceSettingValue?: {
      value: string;
      children?: ConfigurationSetting[];
    };
  };
  settingDefinitions?: Array<{
    id: string;
    displayName: string;
    description?: string;
    documentationUrl?: string;
    baseType: string;
    offsetUri?: string;
    dependentOn?: Array<{
      dependentOn: string;
      parentSettingId: string;
    }>;
    options?: Array<{
      name: string;
      displayName: string;
      description?: string;
    }>;
  }>;
}

export interface DetailedConfiguration {
  id: string;
  name?: string;
  displayName?: string;
  description?: string;
  platforms?: string;
  technologies?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  version?: number;
  "@odata.type": string;
  settings?: ConfigurationSetting[];
  assignments?: Array<{
    id: string;
    target: {
      "@odata.type": string;
      groupId?: string;
      groupName?: string;
      deviceAndAppManagementAssignmentFilterId?: string;
      deviceAndAppManagementAssignmentFilterType?: string;
    };
  }>;
  // For traditional configs
  [key: string]: any;
}

export class DetailedIntuneService {
  private client: ReturnType<typeof createGraphClient>;

  constructor(accessToken: string) {
    this.client = createGraphClient(accessToken);
  }

  // 1. Settings Catalog with full settings
  async getConfigurationPoliciesWithSettings(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching Settings Catalog policies...");
      const policies = await this.client
        .api("/deviceManagement/configurationPolicies")
        .version("beta")
        .select("id,name,description,platforms,technologies,createdDateTime,lastModifiedDateTime,settingCount,templateReference")
        .top(999)
        .get();

      const detailedPolicies = await Promise.all(
        (policies.value || []).map(async (policy: any) => {
          try {
            // Fetch settings with expanded definitions
            const settingsResponse = await this.client
              .api(`/deviceManagement/configurationPolicies('${policy.id}')/settings`)
              .version("beta")
              .top(1000)
              .expand("settingDefinitions")
              .get();

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/configurationPolicies('${policy.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));

            return {
              ...policy,
              displayName: policy.name,
              configType: "Settings Catalog",
              settings: settingsResponse.value || [],
              assignments: assignmentsResponse.value || []
            };
          } catch (error) {
            console.error(`Error fetching details for policy ${policy.name}:`, error);
            return {
              ...policy,
              displayName: policy.name,
              configType: "Settings Catalog",
              settings: [],
              assignments: []
            };
          }
        })
      );

      return detailedPolicies;
    } catch (error) {
      console.error("Error fetching configuration policies:", error);
      return [];
    }
  }

  // 2. Device Configurations with full properties
  async getDeviceConfigurationsDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching Device Configurations...");
      const configs = await this.client
        .api("/deviceManagement/deviceConfigurations")
        .version("beta")
        .top(999)
        .get();

      const detailedConfigs = await Promise.all(
        (configs.value || []).map(async (config: any) => {
          try {
            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/deviceConfigurations('${config.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));

            // The config object already contains all settings as properties
            return {
              ...config,
              configType: this.getConfigurationType(config["@odata.type"]),
              assignments: assignmentsResponse.value || []
            };
          } catch (error) {
            console.error(`Error fetching details for config ${config.displayName}:`, error);
            return {
              ...config,
              configType: this.getConfigurationType(config["@odata.type"]),
              assignments: []
            };
          }
        })
      );

      return detailedConfigs;
    } catch (error) {
      console.error("Error fetching device configurations:", error);
      return [];
    }
  }

  // 3. Administrative Templates with definition values
  async getGroupPolicyConfigurationsDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching Administrative Templates...");
      const configs = await this.client
        .api("/deviceManagement/groupPolicyConfigurations")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,roleScopeTagIds")
        .top(999)
        .get();

      const detailedConfigs = await Promise.all(
        (configs.value || []).map(async (config: any) => {
          try {
            // Fetch definition values (actual settings)
            const definitionValues = await this.client
              .api(`/deviceManagement/groupPolicyConfigurations('${config.id}')/definitionValues`)
              .version("beta")
              .expand("definition")
              .top(999)
              .get()
              .catch(() => ({ value: [] }));

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/groupPolicyConfigurations('${config.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));

            return {
              ...config,
              configType: "Administrative Template",
              definitionValues: definitionValues.value || [],
              assignments: assignmentsResponse.value || [],
              version: 1
            };
          } catch (error) {
            console.error(`Error fetching details for group policy ${config.displayName}:`, error);
            return {
              ...config,
              configType: "Administrative Template",
              definitionValues: [],
              assignments: [],
              version: 1
            };
          }
        })
      );

      return detailedConfigs;
    } catch (error) {
      console.error("Error fetching group policy configurations:", error);
      return [];
    }
  }

  // 4. Compliance Policies with rules
  async getCompliancePoliciesDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching Compliance Policies...");
      const policies = await this.client
        .api("/deviceManagement/deviceCompliancePolicies")
        .version("beta")
        .top(999)
        .get();

      const detailedPolicies = await Promise.all(
        (policies.value || []).map(async (policy: any) => {
          try {
            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/deviceCompliancePolicies('${policy.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));

            // Fetch scheduled actions for rules
            const scheduledActions = await this.client
              .api(`/deviceManagement/deviceCompliancePolicies('${policy.id}')/scheduledActionsForRule`)
              .version("beta")
              .expand("scheduledActionConfigurations")
              .get()
              .catch(() => ({ value: [] }));

            return {
              ...policy,
              configType: "Compliance Policy",
              scheduledActionsForRule: scheduledActions.value || [],
              assignments: assignmentsResponse.value || []
            };
          } catch (error) {
            console.error(`Error fetching details for compliance policy ${policy.displayName}:`, error);
            return {
              ...policy,
              configType: "Compliance Policy",
              scheduledActionsForRule: [],
              assignments: []
            };
          }
        })
      );

      return detailedPolicies;
    } catch (error) {
      console.error("Error fetching compliance policies:", error);
      return [];
    }
  }

  // 5. Security Baselines with settings
  async getSecurityBaselinesDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching Security Baselines...");
      const intents = await this.client
        .api("/deviceManagement/intents")
        .version("beta")
        .select("id,displayName,description,lastModifiedDateTime,isAssigned,templateId")
        .top(999)
        .get();

      const detailedIntents = await Promise.all(
        (intents.value || []).map(async (intent: any) => {
          try {
            // Fetch categories with settings
            const categories = await this.client
              .api(`/deviceManagement/intents('${intent.id}')/categories`)
              .version("beta")
              .expand("settings")
              .get()
              .catch(() => ({ value: [] }));

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/intents('${intent.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));

            return {
              ...intent,
              configType: "Security Baseline",
              categories: categories.value || [],
              assignments: assignmentsResponse.value || []
            };
          } catch (error) {
            console.error(`Error fetching details for intent ${intent.displayName}:`, error);
            return {
              ...intent,
              configType: "Security Baseline",
              categories: [],
              assignments: []
            };
          }
        })
      );

      return detailedIntents;
    } catch (error) {
      console.error("Error fetching security baselines:", error);
      return [];
    }
  }

  // 6. Scripts with content
  async getScriptsDetailed(): Promise<{windows: DetailedConfiguration[], macOS: DetailedConfiguration[]}> {
    const windowsScripts = await this.getWindowsScriptsDetailed();
    const macOSScripts = await this.getMacOSScriptsDetailed();
    
    return {
      windows: windowsScripts,
      macOS: macOSScripts
    };
  }

  private async getWindowsScriptsDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching Windows PowerShell Scripts...");
      const scripts = await this.client
        .api("/deviceManagement/deviceManagementScripts")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,fileName,runAsAccount,enforceSignatureCheck,runAs32Bit")
        .top(999)
        .get();

      const detailedScripts = await Promise.all(
        (scripts.value || []).map(async (script: any) => {
          try {
            // Fetch script content
            const scriptContent = await this.client
              .api(`/deviceManagement/deviceManagementScripts('${script.id}')`)
              .version("beta")
              .select("scriptContent")
              .get()
              .catch(() => ({ scriptContent: null }));

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/deviceManagementScripts('${script.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));

            return {
              ...script,
              scriptContent: scriptContent.scriptContent ? atob(scriptContent.scriptContent) : null,
              configType: "PowerShell Script",
              platformType: "Windows",
              assignments: assignmentsResponse.value || []
            };
          } catch (error) {
            console.error(`Error fetching details for script ${script.displayName}:`, error);
            return {
              ...script,
              configType: "PowerShell Script",
              platformType: "Windows",
              assignments: []
            };
          }
        })
      );

      return detailedScripts;
    } catch (error) {
      console.error("Error fetching Windows scripts:", error);
      return [];
    }
  }

  private async getMacOSScriptsDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching macOS Shell Scripts...");
      const scripts = await this.client
        .api("/deviceManagement/deviceShellScripts")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,fileName,runAsAccount")
        .top(999)
        .get();

      const detailedScripts = await Promise.all(
        (scripts.value || []).map(async (script: any) => {
          try {
            // Fetch script content
            const scriptContent = await this.client
              .api(`/deviceManagement/deviceShellScripts('${script.id}')`)
              .version("beta")
              .select("scriptContent")
              .get()
              .catch(() => ({ scriptContent: null }));

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/deviceShellScripts('${script.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));

            return {
              ...script,
              scriptContent: scriptContent.scriptContent ? atob(scriptContent.scriptContent) : null,
              configType: "Shell Script",
              platformType: "macOS",
              assignments: assignmentsResponse.value || []
            };
          } catch (error) {
            console.error(`Error fetching details for script ${script.displayName}:`, error);
            return {
              ...script,
              configType: "Shell Script",
              platformType: "macOS",
              assignments: []
            };
          }
        })
      );

      return detailedScripts;
    } catch (error) {
      console.error("Error fetching macOS scripts:", error);
      return [];
    }
  }

  // Helper function to determine configuration type
  private getConfigurationType(odataType: string): string {
    const typeMap: { [key: string]: string } = {
      "#microsoft.graph.windows10GeneralConfiguration": "Windows 10 General Configuration",
      "#microsoft.graph.windows10EndpointProtectionConfiguration": "Windows 10 Endpoint Protection",
      "#microsoft.graph.windows10CustomConfiguration": "Windows 10 Custom Configuration",
      "#microsoft.graph.windowsUpdateForBusinessConfiguration": "Windows Update for Business",
      "#microsoft.graph.macOSGeneralConfiguration": "macOS General Configuration",
      "#microsoft.graph.macOSEndpointProtectionConfiguration": "macOS Endpoint Protection",
      "#microsoft.graph.macOSCustomConfiguration": "macOS Custom Configuration",
      "#microsoft.graph.iosGeneralConfiguration": "iOS General Configuration",
      "#microsoft.graph.iosCustomConfiguration": "iOS Custom Configuration",
      "#microsoft.graph.androidGeneralConfiguration": "Android General Configuration",
      "#microsoft.graph.androidCustomConfiguration": "Android Custom Configuration",
      "#microsoft.graph.androidWorkProfileGeneralConfiguration": "Android Work Profile Configuration"
    };

    return typeMap[odataType] || "Device Configuration";
  }

  // Get App Configurations with detailed settings
  async getAppConfigurationsDetailed() {
    try {
      // Get app configuration policies
      const response = await this.client
        .api("/deviceAppManagement/targetedManagedAppConfigurations")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,assignments,settings,apps")
        .expand("assignments,apps")
        .top(999)
        .get();

      return response.value || [];
    } catch (error) {
      console.error("Error fetching app configurations:", error);
      return [];
    }
  }

  // Get Windows Update Policies with detailed settings
  async getWindowsUpdatePoliciesDetailed() {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceConfigurations")
        .version("beta")
        .filter("isof('microsoft.graph.windowsUpdateForBusinessConfiguration')")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,assignments")
        .expand("assignments")
        .top(999)
        .get();

      // Fetch detailed settings for each policy
      const detailedPolicies = await Promise.all(
        response.value.map(async (policy: any) => {
          try {
            const detailResponse = await this.client
              .api(`/deviceManagement/deviceConfigurations/${policy.id}`)
              .version("beta")
              .get();
            
            return detailResponse;
          } catch (error) {
            console.error(`Error fetching details for Windows Update policy ${policy.id}:`, error);
            return policy;
          }
        })
      );

      return detailedPolicies;
    } catch (error) {
      console.error("Error fetching Windows Update policies:", error);
      return [];
    }
  }

  // Get Enrollment Configurations with detailed settings
  async getEnrollmentConfigurationsDetailed() {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceEnrollmentConfigurations")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,priority,assignments")
        .expand("assignments")
        .top(999)
        .get();

      return response.value || [];
    } catch (error) {
      console.error("Error fetching enrollment configurations:", error);
      return [];
    }
  }

  // Main method to get all detailed configurations
  async getAllDetailedConfigurations() {
    console.log("Fetching all detailed Intune configurations...");
    
    const [
      settingsCatalog,
      deviceConfigurations,
      administrativeTemplates,
      compliancePolicies,
      securityBaselines,
      scripts,
      appConfigurations,
      windowsUpdatePolicies,
      enrollmentConfigurations
    ] = await Promise.all([
      this.getConfigurationPoliciesWithSettings(),
      this.getDeviceConfigurationsDetailed(),
      this.getGroupPolicyConfigurationsDetailed(),
      this.getCompliancePoliciesDetailed(),
      this.getSecurityBaselinesDetailed(),
      this.getScriptsDetailed(),
      this.getAppConfigurationsDetailed(),
      this.getWindowsUpdatePoliciesDetailed(),
      this.getEnrollmentConfigurationsDetailed()
    ]);

    return {
      settingsCatalog,
      deviceConfigurations,
      administrativeTemplates,
      compliancePolicies,
      securityBaselines,
      scripts: scripts,
      appConfigurations,
      windowsUpdatePolicies,
      enrollmentConfigurations,
      summary: {
        totalConfigurations: 
          settingsCatalog.length + 
          deviceConfigurations.length + 
          administrativeTemplates.length + 
          compliancePolicies.length + 
          securityBaselines.length +
          scripts.windows.length +
          scripts.macOS.length +
          appConfigurations.length +
          windowsUpdatePolicies.length +
          enrollmentConfigurations.length,
        byType: {
          settingsCatalog: settingsCatalog.length,
          deviceConfigurations: deviceConfigurations.length,
          administrativeTemplates: administrativeTemplates.length,
          compliancePolicies: compliancePolicies.length,
          securityBaselines: securityBaselines.length,
          scripts: scripts.windows.length + scripts.macOS.length,
          appConfigurations: appConfigurations.length,
          windowsUpdatePolicies: windowsUpdatePolicies.length,
          enrollmentConfigurations: enrollmentConfigurations.length
        }
      }
    };
  }
}
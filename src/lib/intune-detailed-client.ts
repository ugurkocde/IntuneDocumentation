import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { collectAllPages } from "./graph-paging";

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
    simpleSettingCollectionValue?: Array<{
      value: any;
      "@odata.type": string;
    }>;
    groupSettingValue?: {
      children: ConfigurationSetting[];
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

export interface PermissionError {
  resource: string;
  requiredPermission: string;
  message: string;
}

export interface FetchError {
  policyId: string;
  policyName: string;
  policyType: string;
  error: string;
  errorCode?: string;
  statusCode?: number;
}

export class DetailedIntuneService {
  private client: ReturnType<typeof createGraphClient>;
  private permissionErrors: PermissionError[] = [];
  private fetchErrors: FetchError[] = [];

  constructor(accessToken: string) {
    this.client = createGraphClient(accessToken);
  }

  // Conditional Access Policies with details
  async getConditionalAccessPoliciesDetailed(): Promise<DetailedConfiguration[]> {
    try {
      const list = await this.client
        .api("/identity/conditionalAccess/policies")
        .version("v1.0")
        .top(999)
        .get();

      const all = await collectAllPages<any>(this.client as unknown as Client, list);
      return (all || []).map((p: any) => ({
        ...p,
        configType: "Conditional Access Policy",
      }));
    } catch (error: any) {
      // Often requires admin-consented permissions; fail soft
      if (error?.statusCode === 403) {
        console.log("Conditional Access policies skipped - insufficient permissions");
      } else {
        console.error("Error fetching conditional access policies:", error);
      }
      return [];
    }
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

      const allPolicies = await collectAllPages<any>(this.client as unknown as Client, policies);

      const detailedPolicies = await Promise.all(
        (allPolicies || []).map(async (policy: any) => {
          try {
            // Fetch settings with expanded definitions
            const settingsResponse = await this.client
              .api(`/deviceManagement/configurationPolicies('${policy.id}')/settings`)
              .version("beta")
              .top(1000)
              .expand("settingDefinitions")
              .get();
            const settings = await collectAllPages<any>(this.client as unknown as Client, settingsResponse);

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/configurationPolicies('${policy.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            return {
              ...policy,
              displayName: policy.name,
              configType: "Settings Catalog",
              settings: settings || [],
              assignments: assignments || []
            };
          } catch (error: any) {
            console.error(`Error fetching details for policy ${policy.name}:`, error);

            // Track the fetch error
            this.fetchErrors.push({
              policyId: policy.id,
              policyName: policy.name,
              policyType: "Settings Catalog",
              error: error?.message || "Failed to fetch policy settings",
              errorCode: error?.code,
              statusCode: error?.statusCode
            });

            return {
              ...policy,
              displayName: policy.name,
              configType: "Settings Catalog",
              settings: [],
              assignments: [],
              hasFetchError: true
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

      const allConfigs = await collectAllPages<any>(this.client as unknown as Client, configs);

      const detailedConfigs = await Promise.all(
        (allConfigs || []).map(async (config: any) => {
          try {
            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/deviceConfigurations('${config.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            // The config object already contains all settings as properties
            return {
              ...config,
              configType: this.getConfigurationType(config["@odata.type"]),
              assignments: assignments || []
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

      const allConfigs = await collectAllPages<any>(this.client as unknown as Client, configs);

      const detailedConfigs = await Promise.all(
        (allConfigs || []).map(async (config: any) => {
          try {
            // Fetch definition values (actual settings)
            const definitionValues = await this.client
              .api(`/deviceManagement/groupPolicyConfigurations('${config.id}')/definitionValues`)
              .version("beta")
              .expand("definition")
              .top(999)
              .get()
              .catch(() => ({ value: [] }));
            const definitionValuesAll = await collectAllPages<any>(this.client as unknown as Client, definitionValues);

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/groupPolicyConfigurations('${config.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            return {
              ...config,
              configType: "Administrative Template",
              definitionValues: definitionValuesAll || [],
              assignments: assignments || [],
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

      const allPolicies = await collectAllPages<any>(this.client as unknown as Client, policies);

      const detailedPolicies = await Promise.all(
        (allPolicies || []).map(async (policy: any) => {
          try {
            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/deviceCompliancePolicies('${policy.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            // Fetch scheduled actions for rules
            const scheduledActions = await this.client
              .api(`/deviceManagement/deviceCompliancePolicies('${policy.id}')/scheduledActionsForRule`)
              .version("beta")
              .expand("scheduledActionConfigurations")
              .get()
              .catch(() => ({ value: [] }));
            const scheduledActionsAll = await collectAllPages<any>(this.client as unknown as Client, scheduledActions);

            return {
              ...policy,
              configType: "Compliance Policy",
              scheduledActionsForRule: scheduledActionsAll || [],
              assignments: assignments || []
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

      const allIntents = await collectAllPages<any>(this.client as unknown as Client, intents);

      const detailedIntents = await Promise.all(
        (allIntents || []).map(async (intent: any) => {
          try {
            // Fetch categories with settings
            const categories = await this.client
              .api(`/deviceManagement/intents('${intent.id}')/categories`)
              .version("beta")
              .expand("settings")
              .get()
              .catch(() => ({ value: [] }));
            const categoriesAll = await collectAllPages<any>(this.client as unknown as Client, categories);

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(`/deviceManagement/intents('${intent.id}')/assignments`)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            return {
              ...intent,
              configType: "Security Baseline",
              categories: categoriesAll || [],
              assignments: assignments || []
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

      const allScripts = await collectAllPages<any>(this.client as unknown as Client, scripts);

      const detailedScripts = await Promise.all(
        (allScripts || []).map(async (script: any) => {
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
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            return {
              ...script,
              scriptContent: scriptContent.scriptContent ? atob(scriptContent.scriptContent) : null,
              configType: "PowerShell Script",
              platformType: "Windows",
              assignments: assignments || []
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
    } catch (error: any) {
      // Check if it's a permission error
      if (error?.statusCode === 403 || error?.code === 'Forbidden') {
        console.log("Windows PowerShell Scripts skipped - insufficient permissions");
        this.permissionErrors.push({
          resource: "Windows PowerShell Scripts",
          requiredPermission: "DeviceManagementScripts.Read.All",
          message: "Unable to fetch Windows PowerShell Scripts due to missing permissions"
        });
      } else {
        console.error("Error fetching Windows scripts:", error);
      }
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

      const allScripts = await collectAllPages<any>(this.client as unknown as Client, scripts);

      const detailedScripts = await Promise.all(
        (allScripts || []).map(async (script: any) => {
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
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            return {
              ...script,
              scriptContent: scriptContent.scriptContent ? atob(scriptContent.scriptContent) : null,
              configType: "Shell Script",
              platformType: "macOS",
              assignments: assignments || []
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
    } catch (error: any) {
      // Check if it's a permission error
      if (error?.statusCode === 403 || error?.code === 'Forbidden') {
        console.log("macOS Shell Scripts skipped - insufficient permissions");
        this.permissionErrors.push({
          resource: "macOS Shell Scripts",
          requiredPermission: "DeviceManagementScripts.Read.All",
          message: "Unable to fetch macOS Shell Scripts due to missing permissions"
        });
      } else {
        console.error("Error fetching macOS scripts:", error);
      }
      return [];
    }
  }

  // Helper function to determine configuration type
  private getConfigurationType(odataType: string): string {
    const typeMap: Record<string, string> = {
      // Windows configurations
      "#microsoft.graph.windows10GeneralConfiguration": "Windows 10 General Configuration",
      "#microsoft.graph.windows10EndpointProtectionConfiguration": "Windows 10 Endpoint Protection",
      "#microsoft.graph.windows10CustomConfiguration": "Windows 10 Custom Configuration",
      "#microsoft.graph.windows10SecureAssessmentConfiguration": "Windows 10 Secure Assessment",
      "#microsoft.graph.windows10EnterpriseModernAppManagementConfiguration": "Windows 10 Enterprise App Management",
      "#microsoft.graph.windows81GeneralConfiguration": "Windows 8.1 General Configuration",
      "#microsoft.graph.windowsUpdateForBusinessConfiguration": "Windows Update for Business",
      "#microsoft.graph.windowsDefenderAdvancedThreatProtectionConfiguration": "Windows Defender ATP",
      "#microsoft.graph.windowsIdentityProtectionConfiguration": "Windows Identity Protection",
      "#microsoft.graph.editionUpgradeConfiguration": "Windows Edition Upgrade",
      "#microsoft.graph.windowsKioskConfiguration": "Windows Kiosk Configuration",
      "#microsoft.graph.windows10TeamGeneralConfiguration": "Surface Hub Configuration",

      // macOS configurations
      "#microsoft.graph.macOSGeneralConfiguration": "macOS General Configuration",
      "#microsoft.graph.macOSEndpointProtectionConfiguration": "macOS Endpoint Protection",
      "#microsoft.graph.macOSCustomConfiguration": "macOS Custom Configuration",
      "#microsoft.graph.macOSDeviceFeaturesConfiguration": "macOS Device Features",
      "#microsoft.graph.macOSExtensionsConfiguration": "macOS Extensions",
      "#microsoft.graph.macOSSoftwareUpdateConfiguration": "macOS Software Update",

      // iOS/iPadOS configurations
      "#microsoft.graph.iosGeneralConfiguration": "iOS General Configuration",
      "#microsoft.graph.iosCustomConfiguration": "iOS Custom Configuration",
      "#microsoft.graph.iosUpdateConfiguration": "iOS Update Configuration",
      "#microsoft.graph.iosDeviceFeaturesConfiguration": "iOS Device Features",
      "#microsoft.graph.iosEndpointProtectionConfiguration": "iOS Endpoint Protection",
      "#microsoft.graph.iosCertificateProfileConfiguration": "iOS Certificate Profile",
      "#microsoft.graph.iosEasEmailProfileConfiguration": "iOS Email Profile",
      "#microsoft.graph.iosWiFiConfiguration": "iOS WiFi Profile",
      "#microsoft.graph.iosVpnConfiguration": "iOS VPN Profile",

      // Android configurations
      "#microsoft.graph.androidGeneralConfiguration": "Android General Configuration",
      "#microsoft.graph.androidCustomConfiguration": "Android Custom Configuration",
      "#microsoft.graph.androidWorkProfileGeneralConfiguration": "Android Work Profile Configuration",
      "#microsoft.graph.androidWorkProfileCustomConfiguration": "Android Work Profile Custom",
      "#microsoft.graph.androidDeviceOwnerGeneralConfiguration": "Android Device Owner Configuration",
      "#microsoft.graph.androidOMAConfiguration": "Android OMA-DM Configuration",
      "#microsoft.graph.androidEasEmailProfileConfiguration": "Android Email Profile",
      "#microsoft.graph.androidWiFiConfiguration": "Android WiFi Profile",
      "#microsoft.graph.androidVpnConfiguration": "Android VPN Profile",

      // Shared/Common configurations
      "#microsoft.graph.sharedPCConfiguration": "Shared PC Configuration",
      "#microsoft.graph.vpnConfiguration": "VPN Configuration",
      "#microsoft.graph.wiFiConfiguration": "WiFi Configuration",
      "#microsoft.graph.emailConfiguration": "Email Configuration"
    };

    // If not in map, try to extract a friendly name from the odataType
    if (!typeMap[odataType]) {
      // Remove prefix and format: "#microsoft.graph.iosGeneralConfiguration" -> "Ios General Configuration"
      const typeName = odataType.replace("#microsoft.graph.", "").replace(/([A-Z])/g, " $1").trim();
      return typeName.charAt(0).toUpperCase() + typeName.slice(1);
    }

    return typeMap[odataType];
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
      return await collectAllPages<any>(this.client as unknown as Client, response);
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
      const list = await collectAllPages<any>(this.client as unknown as Client, response);

      // Fetch detailed settings for each policy
      const detailedPolicies = await Promise.all(
        list.map(async (policy: any) => {
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
      return await collectAllPages<any>(this.client as unknown as Client, response);
    } catch (error) {
      console.error("Error fetching enrollment configurations:", error);
      return [];
    }
  }

  // Get permission errors encountered during fetch
  getPermissionErrors(): PermissionError[] {
    return this.permissionErrors;
  }

  // Get fetch errors encountered during fetch
  getFetchErrors(): FetchError[] {
    return this.fetchErrors;
  }

  // Main method to get all detailed configurations
  async getAllDetailedConfigurations() {
    console.log("Fetching all detailed Intune configurations...");
    this.permissionErrors = []; // Reset permission errors
    this.fetchErrors = []; // Reset fetch errors

    const [
      settingsCatalog,
      deviceConfigurations,
      administrativeTemplates,
      compliancePolicies,
      securityBaselines,
      scripts,
      appConfigurations,
      windowsUpdatePolicies,
      enrollmentConfigurations,
      conditionalAccessPolicies
    ] = await Promise.all([
      this.getConfigurationPoliciesWithSettings(),
      this.getDeviceConfigurationsDetailed(),
      this.getGroupPolicyConfigurationsDetailed(),
      this.getCompliancePoliciesDetailed(),
      this.getSecurityBaselinesDetailed(),
      this.getScriptsDetailed(),
      this.getAppConfigurationsDetailed(),
      this.getWindowsUpdatePoliciesDetailed(),
      this.getEnrollmentConfigurationsDetailed(),
      this.getConditionalAccessPoliciesDetailed()
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
      conditionalAccessPolicies,
      permissionErrors: this.permissionErrors,
      fetchErrors: this.fetchErrors,
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
          enrollmentConfigurations.length +
          conditionalAccessPolicies.length,
        byType: {
          settingsCatalog: settingsCatalog.length,
          deviceConfigurations: deviceConfigurations.length,
          administrativeTemplates: administrativeTemplates.length,
          compliancePolicies: compliancePolicies.length,
          securityBaselines: securityBaselines.length,
          scripts: scripts.windows.length + scripts.macOS.length,
          appConfigurations: appConfigurations.length,
          windowsUpdatePolicies: windowsUpdatePolicies.length,
          enrollmentConfigurations: enrollmentConfigurations.length,
          conditionalAccessPolicies: conditionalAccessPolicies.length
        }
      }
    };
  }
}

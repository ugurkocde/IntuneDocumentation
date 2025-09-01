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

// Generic configuration type
export interface BaseConfiguration {
  id: string;
  displayName: string;
  description?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  version?: number;
  "@odata.type": string;
  platformType?: string;
  technologies?: string;
  roleScopeTagIds?: string[];
  [key: string]: any;
}

export class IntuneConfigurationService {
  private client: ReturnType<typeof createGraphClient>;

  constructor(accessToken: string) {
    this.client = createGraphClient(accessToken);
  }

  // 1. Settings Catalog Policies (Modern approach - includes Wi-Fi, Certificates, etc.)
  async getConfigurationPolicies(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/configurationPolicies")
        .version("beta")
        .select("id,name,description,platforms,technologies,createdDateTime,lastModifiedDateTime,settingCount,roleScopeTagIds")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      // Map the response to our standard format
      return items.map((policy: any) => ({
        ...policy,
        displayName: policy.name || policy.displayName,
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationPolicy",
        platformType: policy.platforms,
        configType: "Settings Catalog"
      }));
    } catch (error) {
      console.error("Error fetching configuration policies:", error);
      return [];
    }
  }

  // Get detailed settings for a configuration policy
  async getConfigurationPolicySettings(policyId: string): Promise<any> {
    try {
      const response = await this.client
        .api(`/deviceManagement/configurationPolicies('${policyId}')?$expand=settings`)
        .version("beta")
        .get();
      return response;
    } catch (error) {
      console.error(`Error fetching settings for policy ${policyId}:`, error);
      return null;
    }
  }

  // 2. Traditional Device Configurations (Templates - Device Restrictions, etc.)
  async getDeviceConfigurations(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceConfigurations")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,version")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((config: any) => ({
        ...config,
        configType: "Device Configuration (Template)"
      }));
    } catch (error) {
      console.error("Error fetching device configurations:", error);
      return [];
    }
  }

  // 3. Group Policy Configurations (Administrative Templates)
  async getGroupPolicyConfigurations(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/groupPolicyConfigurations")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,roleScopeTagIds")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((config: any) => ({
        ...config,
        "@odata.type": "#microsoft.graph.groupPolicyConfiguration",
        configType: "Administrative Template",
        version: 1 // Group Policy configs don't have version field
      }));
    } catch (error) {
      console.error("Error fetching group policy configurations:", error);
      return [];
    }
  }

  // 4. Security Baselines and Endpoint Security (Intents)
  async getDeviceManagementIntents(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/intents")
        .version("beta")
        .select("id,displayName,description,lastModifiedDateTime,isAssigned,templateId,roleScopeTagIds")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((intent: any) => ({
        ...intent,
        "@odata.type": "#microsoft.graph.deviceManagementIntent",
        configType: "Security Baseline/Endpoint Security"
      }));
    } catch (error) {
      console.error("Error fetching device management intents:", error);
      return [];
    }
  }

  // Get intent categories and settings
  async getIntentSettings(intentId: string): Promise<any> {
    try {
      const response = await this.client
        .api(`/deviceManagement/intents/${intentId}/categories?$expand=settings`)
        .version("beta")
        .get();
      return response.value || [];
    } catch (error) {
      console.error(`Error fetching intent settings for ${intentId}:`, error);
      return [];
    }
  }

  // 5. Device Compliance Policies
  async getCompliancePolicies(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceCompliancePolicies")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,version")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((policy: any) => ({
        ...policy,
        configType: "Compliance Policy"
      }));
    } catch (error) {
      console.error("Error fetching compliance policies:", error);
      return [];
    }
  }

  // 6. macOS Custom Configuration Profiles (Shell Scripts)
  async getDeviceShellScripts(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceShellScripts")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,fileName,scriptContent,runAsAccount")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((script: any) => ({
        ...script,
        "@odata.type": "#microsoft.graph.deviceShellScript",
        configType: "Shell Script (macOS)",
        platformType: "macOS"
      }));
    } catch (error) {
      console.error("Error fetching shell scripts:", error);
      return [];
    }
  }

  // 7. Windows PowerShell Scripts
  async getDeviceManagementScripts(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceManagementScripts")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,fileName,runAsAccount,enforceSignatureCheck,runAs32Bit")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((script: any) => ({
        ...script,
        "@odata.type": "#microsoft.graph.deviceManagementScript",
        configType: "PowerShell Script (Windows)",
        platformType: "Windows"
      }));
    } catch (error) {
      console.error("Error fetching PowerShell scripts:", error);
      return [];
    }
  }

  // 8. App Configuration Policies
  async getManagedAppPolicies(): Promise<BaseConfiguration[]> {
    try {
      // Correct endpoint for app configuration policies
      const response = await this.client
        .api("/deviceAppManagement/targetedManagedAppConfigurations")
        .version("beta")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,version")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((config: any) => ({
        ...config,
        configType: "App Configuration Policy"
      }));
    } catch (error) {
      console.error("Error fetching app configuration policies:", error);
      return [];
    }
  }

  // 9. Windows Update Policies
  async getWindowsUpdatePolicies(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceConfigurations")
        .version("beta")
        .filter("isof('microsoft.graph.windowsUpdateForBusinessConfiguration')")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,version")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((policy: any) => ({
        ...policy,
        configType: "Windows Update Policy",
        platformType: "Windows"
      }));
    } catch (error) {
      console.error("Error fetching Windows Update policies:", error);
      return [];
    }
  }

  // 10. Device Enrollment Configurations
  async getEnrollmentConfigurations(): Promise<BaseConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceEnrollmentConfigurations")
        .version("beta")
        .select("id,displayName,description,priority,createdDateTime,lastModifiedDateTime,version")
        .top(999)
        .get();
      
      const items = await collectAllPages<any>(this.client as unknown as Client, response);
      return items.map((config: any) => ({
        ...config,
        configType: "Enrollment Configuration"
      }));
    } catch (error) {
      console.error("Error fetching enrollment configurations:", error);
      return [];
    }
  }

  // Get all templates available
  async getTemplates(): Promise<any[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/templates")
        .version("beta")
        .select("id,displayName,description,publishedDateTime,platformType,templateType")
        .top(999)
        .get();
      return await collectAllPages<any>(this.client as unknown as Client, response);
    } catch (error) {
      console.error("Error fetching templates:", error);
      return [];
    }
  }

  // Main method to get ALL configurations
  async getAllDeviceConfigurations() {
    console.log("Fetching all Intune device configurations...");
    
    const [
      configurationPolicies,     // Settings Catalog
      deviceConfigurations,       // Traditional templates
      groupPolicyConfigs,         // Administrative templates
      intents,                    // Security baselines & endpoint security
      compliancePolicies,        // Compliance
      shellScripts,              // macOS scripts
      powerShellScripts,         // Windows scripts
      appConfigs,                // App configuration
      windowsUpdatePolicies,     // Windows Update
      enrollmentConfigs          // Enrollment
    ] = await Promise.all([
      this.getConfigurationPolicies(),
      this.getDeviceConfigurations(),
      this.getGroupPolicyConfigurations(),
      this.getDeviceManagementIntents(),
      this.getCompliancePolicies(),
      this.getDeviceShellScripts(),
      this.getDeviceManagementScripts(),
      this.getManagedAppPolicies(),
      this.getWindowsUpdatePolicies(),
      this.getEnrollmentConfigurations()
    ]);

    // Optionally fetch detailed settings for Settings Catalog policies
    const configPoliciesWithSettings = await Promise.all(
      configurationPolicies.slice(0, 10).map(async (policy) => {
        const details = await this.getConfigurationPolicySettings(policy.id);
        return details || policy;
      })
    );

    return {
      settingsCatalog: configurationPolicies,
      deviceConfigurations,
      administrativeTemplates: groupPolicyConfigs,
      securityBaselines: intents,
      compliancePolicies,
      scripts: {
        macOS: shellScripts,
        windows: powerShellScripts
      },
      appConfigurations: appConfigs,
      windowsUpdatePolicies,
      enrollmentConfigurations: enrollmentConfigs,
      
      // Summary
      summary: {
        totalConfigurations: 
          configurationPolicies.length + 
          deviceConfigurations.length + 
          groupPolicyConfigs.length + 
          intents.length + 
          compliancePolicies.length +
          shellScripts.length +
          powerShellScripts.length +
          appConfigs.length +
          windowsUpdatePolicies.length +
          enrollmentConfigs.length,
        byType: {
          settingsCatalog: configurationPolicies.length,
          deviceConfigurations: deviceConfigurations.length,
          administrativeTemplates: groupPolicyConfigs.length,
          securityBaselines: intents.length,
          compliancePolicies: compliancePolicies.length,
          scripts: shellScripts.length + powerShellScripts.length,
          appConfigurations: appConfigs.length,
          windowsUpdatePolicies: windowsUpdatePolicies.length,
          enrollmentConfigurations: enrollmentConfigs.length
        }
      }
    };
  }

  // Get configurations by platform
  async getConfigurationsByPlatform(platform: 'Windows' | 'macOS' | 'iOS' | 'Android') {
    const allConfigs = await this.getAllDeviceConfigurations();
    
    // Filter configurations by platform
    const filteredConfigs = {
      settingsCatalog: allConfigs.settingsCatalog.filter(c => 
        c.platformType?.includes(platform) || c.platforms?.includes(platform.toLowerCase())
      ),
      deviceConfigurations: allConfigs.deviceConfigurations.filter(c => {
        const type = c["@odata.type"]?.toLowerCase() || "";
        return type.includes(platform.toLowerCase());
      }),
      // Add more filtering logic as needed
    };

    return filteredConfigs;
  }
}

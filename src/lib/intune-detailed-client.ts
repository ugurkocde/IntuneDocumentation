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

export interface ProgressCallback {
  (event: {
    step: string;
    type: 'policy-type' | 'batch-progress' | 'completed';
    current?: number;
    total?: number;
    message?: string;
  }): void;
}

export class DetailedIntuneService {
  private client: ReturnType<typeof createGraphClient>;
  private permissionErrors: PermissionError[] = [];
  private fetchErrors: FetchError[] = [];
  private progressCallback?: ProgressCallback;

  constructor(accessToken: string, progressCallback?: ProgressCallback) {
    this.client = createGraphClient(accessToken);
    this.progressCallback = progressCallback;
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

  // Helper function to add delay between requests
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Helper function to retry an API call with exponential backoff and jitter
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 5,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const statusCode = error?.statusCode || error?.response?.status;
        const errorMessage = error?.message || '';

        // Don't retry on permanent failures
        // 404 or 403 - resource doesn't exist or forbidden
        // "No OData route exists" - API endpoint not supported for this resource
        if (
          statusCode === 404 ||
          statusCode === 403 ||
          errorMessage.includes('No OData route exists')
        ) {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          throw error;
        }

        // Check if it's a rate limit error (429)
        if (statusCode === 429 || error?.code === 'TooManyRequests') {
          // Try to get Retry-After header
          const retryAfter = error?.headers?.['retry-after'] || error?.retryAfter;
          const retryDelay = retryAfter ? parseInt(retryAfter) * 1000 : 30000; // Default to 30s
          console.log(`Rate limited (429). Waiting ${retryDelay}ms before retry ${attempt + 1}/${maxRetries}`);
          await this.delay(retryDelay);
          continue;
        }

        // Wait with exponential backoff plus jitter to avoid thundering herd
        const exponentialDelay = initialDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 500; // Random jitter up to 500ms
        const delayMs = exponentialDelay + jitter;

        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms (error: ${error?.message || 'Unknown'})`);
        await this.delay(delayMs);
      }
    }
    throw lastError;
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
      console.log(`Found ${allPolicies?.length || 0} Settings Catalog policies`);

      // Process policies in batches to avoid rate limiting
      // Larger batch size for better performance, smaller for more progress updates
      const batchSize = 10;
      const detailedPolicies: DetailedConfiguration[] = [];

      for (let i = 0; i < (allPolicies || []).length; i += batchSize) {
        const batch = (allPolicies || []).slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil((allPolicies?.length || 0) / batchSize);

        console.log(`Processing batch ${batchNumber}/${totalBatches}`);

        // Emit progress callback
        this.progressCallback?.({
          step: 'Settings Catalog',
          type: 'batch-progress',
          current: batchNumber,
          total: totalBatches,
          message: `Processing Settings Catalog batch ${batchNumber}/${totalBatches}`
        });

        const batchResults = await Promise.all(
          batch.map(async (policy: any) => {
            try {
              // Try to fetch settings with expanded definitions first
              let settings: any[] = [];
              try {
                const settingsResponse = await this.retryWithBackoff(async () => {
                  return await this.client
                    .api(`/deviceManagement/configurationPolicies('${policy.id}')/settings`)
                    .version("beta")
                    .top(1000)
                    .expand("settingDefinitions")
                    .get();
                });
                settings = await collectAllPages<any>(this.client as unknown as Client, settingsResponse);
              } catch (expandError: any) {
                // If expand fails, try without it as a fallback
                console.warn(`Failed to fetch with expand for ${policy.name}, trying without expand...`);
                try {
                  const settingsResponse = await this.retryWithBackoff(async () => {
                    return await this.client
                      .api(`/deviceManagement/configurationPolicies('${policy.id}')/settings`)
                      .version("beta")
                      .top(1000)
                      .get();
                  });
                  settings = await collectAllPages<any>(this.client as unknown as Client, settingsResponse);
                } catch (fallbackError: any) {
                  throw fallbackError;
                }
              }

              // Fetch assignments with retry
              let assignmentsResponse;
              try {
                assignmentsResponse = await this.retryWithBackoff(() =>
                  this.client
                    .api(`/deviceManagement/configurationPolicies('${policy.id}')/assignments`)
                    .version("beta")
                    .get()
                );
              } catch (assignmentError: any) {
                console.warn(`Failed to fetch assignments for ${policy.name}:`, assignmentError?.message);
                assignmentsResponse = { value: [] };
              }
              const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

              return {
                ...policy,
                displayName: policy.name,
                configType: "Settings Catalog",
                settings: settings || [],
                assignments: assignments || []
              };
            } catch (error: any) {
              const errorMessage = error?.message || "Failed to fetch policy settings";
              const errorCode = error?.code || error?.error?.code;
              const statusCode = error?.statusCode || error?.response?.status;

              console.error(`Error fetching details for policy ${policy.name}:`, {
                message: errorMessage,
                code: errorCode,
                status: statusCode
              });

              // Track the fetch error with more details
              this.fetchErrors.push({
                policyId: policy.id,
                policyName: policy.name,
                policyType: "Settings Catalog",
                error: errorMessage,
                errorCode: errorCode,
                statusCode: statusCode
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

        detailedPolicies.push(...batchResults);

        // Add a small delay between batches to avoid rate limiting
        // Reduced from 500ms to 200ms for faster processing
        if (i + batchSize < (allPolicies || []).length) {
          await this.delay(200);
        }
      }

      console.log(`Successfully fetched ${detailedPolicies.filter(p => !p.hasFetchError).length}/${detailedPolicies.length} Settings Catalog policies`);
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
            // Fetch assignments with retry
            let assignmentsResponse;
            try {
              assignmentsResponse = await this.retryWithBackoff(() =>
                this.client
                  .api(`/deviceManagement/deviceConfigurations('${config.id}')/assignments`)
                  .version("beta")
                  .get()
              );
            } catch (assignmentError: any) {
              console.warn(`Failed to fetch assignments for ${config.displayName}:`, assignmentError?.message);
              assignmentsResponse = { value: [] };
            }
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
            // Fetch definition values (actual settings) with retry
            let definitionValues;
            try {
              definitionValues = await this.retryWithBackoff(() =>
                this.client
                  .api(`/deviceManagement/groupPolicyConfigurations('${config.id}')/definitionValues`)
                  .version("beta")
                  .expand("definition")
                  .top(999)
                  .get()
              );
            } catch (defError: any) {
              console.warn(`Failed to fetch definition values for ${config.displayName}:`, defError?.message);
              definitionValues = { value: [] };
            }
            const definitionValuesAll = await collectAllPages<any>(this.client as unknown as Client, definitionValues);

            // Fetch assignments with retry
            let assignmentsResponse;
            try {
              assignmentsResponse = await this.retryWithBackoff(() =>
                this.client
                  .api(`/deviceManagement/groupPolicyConfigurations('${config.id}')/assignments`)
                  .version("beta")
                  .get()
              );
            } catch (assignmentError: any) {
              console.warn(`Failed to fetch assignments for ${config.displayName}:`, assignmentError?.message);
              assignmentsResponse = { value: [] };
            }
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
            // Fetch assignments with retry
            let assignmentsResponse;
            try {
              assignmentsResponse = await this.retryWithBackoff(() =>
                this.client
                  .api(`/deviceManagement/deviceCompliancePolicies('${policy.id}')/assignments`)
                  .version("beta")
                  .get()
              );
            } catch (assignmentError: any) {
              console.warn(`Failed to fetch assignments for ${policy.displayName}:`, assignmentError?.message);
              assignmentsResponse = { value: [] };
            }
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            // Fetch scheduled actions for rules with retry
            // Note: Not all compliance policies support the scheduledActionsForRule endpoint
            let scheduledActions;
            try {
              scheduledActions = await this.retryWithBackoff(() =>
                this.client
                  .api(`/deviceManagement/deviceCompliancePolicies('${policy.id}')/scheduledActionsForRule`)
                  .version("beta")
                  .expand("scheduledActionConfigurations")
                  .get()
              );
            } catch (scheduledError: any) {
              const errorMessage = scheduledError?.message || '';
              // Don't log warnings for known API limitations (OData route not exists)
              if (!errorMessage.includes('No OData route exists')) {
                console.warn(`Failed to fetch scheduled actions for ${policy.displayName}:`, scheduledError?.message);
              }
              scheduledActions = { value: [] };
            }
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

  // 5. App Protection Policies with settings
  async getAppProtectionPoliciesDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching App Protection Policies...");

      // Fetch iOS, Android, and Windows MAM policies in parallel
      const [iosPolicies, androidPolicies, windowsPolicies] = await Promise.all([
        this.client
          .api("/deviceAppManagement/iosManagedAppProtections")
          .version("beta")
          .top(999)
          .get()
          .catch(() => ({ value: [] })),
        this.client
          .api("/deviceAppManagement/androidManagedAppProtections")
          .version("beta")
          .top(999)
          .get()
          .catch(() => ({ value: [] })),
        this.client
          .api("/deviceAppManagement/windowsManagedAppProtections")
          .version("beta")
          .top(999)
          .get()
          .catch(() => ({ value: [] }))
      ]);

      const allIosPolicies = await collectAllPages<any>(this.client as unknown as Client, iosPolicies);
      const allAndroidPolicies = await collectAllPages<any>(this.client as unknown as Client, androidPolicies);
      const allWindowsPolicies = await collectAllPages<any>(this.client as unknown as Client, windowsPolicies);

      // Combine all policies and fetch their assignments
      const allPolicies = [
        ...(allIosPolicies || []).map((p: any) => ({ ...p, platform: "iOS" })),
        ...(allAndroidPolicies || []).map((p: any) => ({ ...p, platform: "Android" })),
        ...(allWindowsPolicies || []).map((p: any) => ({ ...p, platform: "Windows" }))
      ];

      const detailedPolicies = await Promise.all(
        allPolicies.map(async (policy: any) => {
          try {
            // Determine the correct API endpoint based on platform
            let endpoint = "";
            if (policy.platform === "iOS") {
              endpoint = `/deviceAppManagement/iosManagedAppProtections('${policy.id}')/assignments`;
            } else if (policy.platform === "Android") {
              endpoint = `/deviceAppManagement/androidManagedAppProtections('${policy.id}')/assignments`;
            } else if (policy.platform === "Windows") {
              endpoint = `/deviceAppManagement/windowsManagedAppProtections('${policy.id}')/assignments`;
            }

            // Fetch assignments
            const assignmentsResponse = await this.client
              .api(endpoint)
              .version("beta")
              .get()
              .catch(() => ({ value: [] }));
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            return {
              ...policy,
              configType: "App Protection Policy",
              platformType: policy.platform,
              assignments: assignments || []
            };
          } catch (error) {
            console.error(`Error fetching details for app protection policy ${policy.displayName}:`, error);
            return {
              ...policy,
              configType: "App Protection Policy",
              platformType: policy.platform,
              assignments: []
            };
          }
        })
      );

      return detailedPolicies;
    } catch (error) {
      console.error("Error fetching app protection policies:", error);
      return [];
    }
  }

  // 6. Security Baselines with settings
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
      console.log("Fetching App Configurations...");
      // Get mobile app configuration policies
      const response = await this.client
        .api("/deviceAppManagement/mobileAppConfigurations")
        .version("beta")
        .top(999)
        .get();

      const allConfigs = await collectAllPages<any>(this.client as unknown as Client, response);

      // Fetch full details and assignments for each configuration
      const detailedConfigs = await Promise.all(
        (allConfigs || []).map(async (config: any) => {
          try {
            // Fetch full configuration details including all settings
            let fullConfig;
            try {
              fullConfig = await this.retryWithBackoff(() =>
                this.client
                  .api(`/deviceAppManagement/mobileAppConfigurations('${config.id}')`)
                  .version("beta")
                  .get()
              );
            } catch (detailsError: any) {
              console.warn(`Failed to fetch full details for ${config.displayName}:`, detailsError?.message);
              fullConfig = config; // Fallback to basic config
            }

            // Fetch assignments with retry
            let assignmentsResponse;
            try {
              assignmentsResponse = await this.retryWithBackoff(() =>
                this.client
                  .api(`/deviceAppManagement/mobileAppConfigurations('${config.id}')/assignments`)
                  .version("beta")
                  .get()
              );
            } catch (assignmentError: any) {
              console.warn(`Failed to fetch assignments for ${config.displayName}:`, assignmentError?.message);
              assignmentsResponse = { value: [] };
            }
            const assignments = await collectAllPages<any>(this.client as unknown as Client, assignmentsResponse);

            return {
              ...fullConfig, // Use full config with all settings
              configType: "App Configuration",
              assignments: assignments || []
            };
          } catch (error) {
            console.error(`Error fetching details for app configuration ${config.displayName}:`, error);
            return {
              ...config,
              configType: "App Configuration",
              assignments: []
            };
          }
        })
      );

      return detailedConfigs;
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

    // Use Promise.allSettled instead of Promise.all to prevent one failure from breaking everything
    const results = await Promise.allSettled([
      this.getConfigurationPoliciesWithSettings(),
      this.getDeviceConfigurationsDetailed(),
      this.getGroupPolicyConfigurationsDetailed(),
      this.getCompliancePoliciesDetailed(),
      this.getAppProtectionPoliciesDetailed(),
      this.getSecurityBaselinesDetailed(),
      this.getScriptsDetailed(),
      this.getAppConfigurationsDetailed(),
      this.getWindowsUpdatePoliciesDetailed(),
      this.getEnrollmentConfigurationsDetailed(),
      this.getConditionalAccessPoliciesDetailed()
    ]);

    // Extract results and track failures
    const policyTypes = [
      'Settings Catalog',
      'Device Configurations',
      'Administrative Templates',
      'Compliance Policies',
      'App Protection Policies',
      'Security Baselines',
      'Scripts',
      'App Configurations',
      'Windows Update Policies',
      'Enrollment Configurations',
      'Conditional Access Policies'
    ];

    const settingsCatalog = results[0].status === 'fulfilled' ? results[0].value : [];
    const deviceConfigurations = results[1].status === 'fulfilled' ? results[1].value : [];
    const administrativeTemplates = results[2].status === 'fulfilled' ? results[2].value : [];
    const compliancePolicies = results[3].status === 'fulfilled' ? results[3].value : [];
    const appProtectionPolicies = results[4].status === 'fulfilled' ? results[4].value : [];
    const securityBaselines = results[5].status === 'fulfilled' ? results[5].value : [];
    const scripts = results[6].status === 'fulfilled' ? results[6].value : { windows: [], macOS: [] };
    const appConfigurations = results[7].status === 'fulfilled' ? results[7].value : [];
    const windowsUpdatePolicies = results[8].status === 'fulfilled' ? results[8].value : [];
    const enrollmentConfigurations = results[9].status === 'fulfilled' ? results[9].value : [];
    const conditionalAccessPolicies = results[10].status === 'fulfilled' ? results[10].value : [];

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const policyType = policyTypes[index];
        console.error(`Failed to fetch ${policyType}:`, result.reason);

        // Track as a fetch error
        this.fetchErrors.push({
          policyId: 'N/A',
          policyName: policyType,
          policyType: policyType,
          error: result.reason?.message || 'Unknown error during policy type fetch',
          errorCode: result.reason?.code,
          statusCode: result.reason?.statusCode
        });
      }
    });

    // Log summary of what was fetched
    const successfulTypes = results.filter(r => r.status === 'fulfilled').length;
    const failedTypes = results.filter(r => r.status === 'rejected').length;
    console.log(`Successfully fetched ${successfulTypes}/${results.length} policy types. Failed: ${failedTypes}`);

    return {
      settingsCatalog,
      deviceConfigurations,
      administrativeTemplates,
      compliancePolicies,
      appProtectionPolicies,
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
          appProtectionPolicies.length +
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
          appProtectionPolicies: appProtectionPolicies.length,
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

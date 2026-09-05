import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import {
  collectAllPages,
  collectAllPagesWithStatus,
  GraphPaginationError,
} from "./graph-paging";
import type { ConfigurationSectionData } from "./configuration-sections";
import { getItemLabel, getStableItemId } from "./configuration-sections";
import {
  INTUNE_POLICY_REGISTRY,
  getRegistryPageSize,
  isExpectedRegistryUnavailableError,
  mapWithConcurrency,
  sanitizeGraphData,
} from "./intune-policy-registry";
import {
  associateConfigurationSettingDefinitions,
  collectConfiguredSettingDefinitionIds,
} from "./configuration-parser";

export function createGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

// Enhanced configuration types with settings
export interface ConfigurationSettingInstance {
  "@odata.type": string;
  settingDefinitionId: string;
  settingInstanceTemplateReference?: {
    settingInstanceTemplateId: string;
  };
  simpleSettingValue?: {
    value: any;
    "@odata.type"?: string;
  };
  simpleSettingCollectionValue?: Array<{
    value: any;
    "@odata.type"?: string;
  }>;
  groupSettingValue?: {
    children: ConfigurationSettingInstance[];
  };
  groupSettingCollectionValue?: Array<{
    children: ConfigurationSettingInstance[];
  }>;
  choiceSettingValue?: {
    value?: string;
    children?: ConfigurationSettingInstance[];
  };
  choiceSettingCollectionValue?: Array<{
    value?: string;
    children?: ConfigurationSettingInstance[];
  }>;
}

export interface ConfigurationSettingDefinition {
  id: string;
  displayName: string;
  description?: string;
  documentationUrl?: string;
  baseType?: string;
  offsetUri?: string;
  dependentOn?: Array<{
    dependentOn: string;
    parentSettingId: string;
  }>;
  options?: Array<{
    name: string;
    itemId?: string;
    displayName: string;
    description?: string;
    optionValue?: {
      value: any;
    } | null;
  }>;
}

export interface ConfigurationSetting {
  id: string;
  settingInstance: ConfigurationSettingInstance;
  settingDefinitions?: ConfigurationSettingDefinition[];
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
  familyKey?: string;
  error: string;
  errorCode?: string;
  statusCode?: number;
  endpoint?: string;
  permissionHint?: string;
  partial?: boolean;
}

const FETCH_ERROR_FAMILY_KEYS: Record<string, string> = {
  "Settings Catalog": "settingsCatalog",
  "Device Configurations": "deviceConfigurations",
  "Administrative Templates": "administrativeTemplates",
  "Administrative Template": "administrativeTemplates",
  "Compliance Policies": "compliancePolicies",
  "App Protection Policies": "appProtectionPolicies",
  "iOS App Protection Policies": "appProtectionPolicies",
  "Android App Protection Policies": "appProtectionPolicies",
  "Windows App Protection Policies": "appProtectionPolicies",
  "Security Baselines": "securityBaselines",
  Scripts: "scripts",
  "Windows PowerShell Scripts": "scripts",
  "macOS Shell Scripts": "scripts",
  "App Configurations": "appConfigurations",
  "Windows Update Policies": "windowsUpdatePolicies",
  "Enrollment Configurations": "enrollmentConfigurations",
  "Conditional Access Policies": "conditionalAccessPolicies",
};

const FETCH_ERROR_ENDPOINTS: Record<string, string> = {
  "Settings Catalog": "/deviceManagement/configurationPolicies",
  "Device Configurations": "/deviceManagement/deviceConfigurations",
  "Administrative Templates": "/deviceManagement/groupPolicyConfigurations",
  "Administrative Template": "/deviceManagement/groupPolicyConfigurations",
  "Compliance Policies": "/deviceManagement/deviceCompliancePolicies",
  "App Protection Policies": "/deviceAppManagement/managedAppProtections",
  "iOS App Protection Policies":
    "/deviceAppManagement/iosManagedAppProtections",
  "Android App Protection Policies":
    "/deviceAppManagement/androidManagedAppProtections",
  "Windows App Protection Policies":
    "/deviceAppManagement/windowsManagedAppProtections",
  "Security Baselines": "/deviceManagement/intents",
  "Windows PowerShell Scripts": "/deviceManagement/deviceManagementScripts",
  "macOS Shell Scripts": "/deviceManagement/deviceShellScripts",
  "App Configurations": "/deviceAppManagement/mobileAppConfigurations",
  "Windows Update Policies": "/deviceManagement/deviceConfigurations",
  "Enrollment Configurations":
    "/deviceManagement/deviceEnrollmentConfigurations",
  "Conditional Access Policies": "/identity/conditionalAccess/policies",
};

export type ProgressCallback = (event: {
  step: string;
  type: "policy-type" | "batch-progress" | "completed" | "error" | "section";
  current?: number;
  total?: number;
  message?: string;
  section?: ConfigurationSectionData;
}) => void;

export class DetailedIntuneService {
  private client: ReturnType<typeof createGraphClient>;
  private permissionErrors: PermissionError[] = [];
  private fetchErrors: FetchError[] = [];
  private async readComplianceScheduledActions(policy: any) {
    // Some Intune backends reject GET on the scheduledActionsForRule relation.
    // Read the parent policy with both navigation collections expanded instead.
    const endpoint = `/deviceManagement/deviceCompliancePolicies/${encodeURIComponent(policy.id)}`;
    const expand =
      "scheduledActionsForRule($expand=scheduledActionConfigurations)";
    const errors: unknown[] = [];
    let items: any[] = [];
    try {
      const response = await this.retryWithBackoff(() =>
        this.client.api(endpoint).version("beta").expand(expand).get(),
      );
      if (!Array.isArray(response?.scheduledActionsForRule))
        throw new Error(
          "Graph omitted the expanded scheduledActionsForRule collection",
        );
      const rules = await collectAllPagesWithStatus<any>(
        this.client as unknown as Client,
        {
          value: response.scheduledActionsForRule,
          "@odata.nextLink": response["scheduledActionsForRule@odata.nextLink"],
        },
      );
      if (!rules.complete) errors.push(rules.error);
      items = await Promise.all(
        rules.items.map(async (rule: any) => {
          if (!Array.isArray(rule?.scheduledActionConfigurations)) {
            errors.push(
              new Error(
                "Graph omitted an expanded scheduledActionConfigurations collection",
              ),
            );
            return rule;
          }
          const actions = await collectAllPagesWithStatus<any>(
            this.client as unknown as Client,
            {
              value: rule.scheduledActionConfigurations,
              "@odata.nextLink":
                rule["scheduledActionConfigurations@odata.nextLink"],
            },
          );
          if (!actions.complete) errors.push(actions.error);
          return { ...rule, scheduledActionConfigurations: actions.items };
        }),
      );
    } catch (error) {
      errors.push(error);
    }
    for (const error of errors) {
      const details = this.graphError(error);
      this.fetchErrors.push({
        policyId: policy.id,
        policyName: policy.displayName ?? policy.id,
        policyType: "Compliance Policies",
        familyKey: "compliancePolicies",
        endpoint: `${endpoint}?$expand=${expand}`,
        error: `Scheduled noncompliance actions could not be fully collected: ${details.message}`,
        statusCode: details.statusCode,
        errorCode: details.errorCode,
        partial: true,
      });
    }
    return { items, complete: errors.length === 0 };
  }
  private async readPolicyDetails(
    policy: any,
    familyKey: string,
    endpoint: string,
    select?: string,
  ) {
    try {
      const item = await this.retryWithBackoff(() => {
        const request = this.client.api(endpoint).version("beta");
        return (select ? request.select(select) : request).get();
      });
      return { item: { ...policy, ...item }, complete: true };
    } catch (error) {
      const details = this.graphError(error);
      this.fetchErrors.push({
        policyId: policy.id,
        policyName: policy.displayName ?? policy.name ?? policy.id,
        policyType: familyKey,
        familyKey,
        endpoint,
        error: details.message,
        statusCode: details.statusCode,
        partial: true,
      });
      return { item: policy, complete: false };
    }
  }
  private async readPolicyRelation(
    policy: any,
    familyKey: string,
    endpoint: string,
    expand?: string,
  ) {
    let items: any[] = [];
    try {
      const response = await this.retryWithBackoff(() => {
        const request = this.client.api(endpoint).version("beta");
        return (expand ? request.expand(expand) : request).get();
      });
      const pages = await collectAllPagesWithStatus<any>(
        this.client as unknown as Client,
        response,
      );
      items = pages.items;
      if (!pages.complete) throw pages.error;
      return { items, complete: true };
    } catch (error) {
      const details = this.graphError(error);
      this.fetchErrors.push({
        policyId: policy.id,
        policyName: policy.displayName ?? policy.name ?? policy.id,
        policyType: familyKey,
        familyKey,
        endpoint,
        error: details.message,
        statusCode: details.statusCode,
        partial: true,
      });
      return { items, complete: false };
    }
  }
  private progressCallback?: ProgressCallback;
  private configurationSettingDefinitionCache = new Map<
    string,
    ConfigurationSettingDefinition
  >();
  private configurationSettingDefinitionRequests = new Map<
    string,
    Promise<ConfigurationSettingDefinition | undefined>
  >();
  private configurationSettingDefinitionMisses = new Set<string>();
  private configurationSettingDefinitionRequestLanes: Promise<void>[] = [
    Promise.resolve(),
    Promise.resolve(),
    Promise.resolve(),
    Promise.resolve(),
  ];
  private nextConfigurationSettingDefinitionRequestLane = 0;

  constructor(accessToken: string, progressCallback?: ProgressCallback) {
    this.client = createGraphClient(accessToken);
    this.progressCallback = progressCallback;
  }

  // Conditional Access Policies with details
  async getConditionalAccessPoliciesDetailed(): Promise<
    DetailedConfiguration[]
  > {
    try {
      const list = await this.client
        .api("/identity/conditionalAccess/policies")
        .version("beta")
        .top(999)
        .get();

      const all = await collectAllPages<any>(
        this.client as unknown as Client,
        list,
      );
      return (all || []).map((p: any) => ({
        ...p,
        configType: "Conditional Access Policy",
      }));
    } catch (error: any) {
      // Often requires admin-consented permissions; fail soft
      if (error?.statusCode === 403) {
        console.log(
          "Conditional Access policies skipped - insufficient permissions",
        );
      } else {
        console.error("Error fetching conditional access policies:", error);
      }
      this.recordCollectionError(
        "Conditional Access Policies",
        error,
        "Policy.Read.All",
      );
      return this.partialCollectionItems(error, "Conditional Access Policy");
    }
  }

  private graphError(error: any) {
    return {
      message: error?.message || "Microsoft Graph request failed",
      errorCode: error?.code || error?.error?.code,
      statusCode: error?.statusCode || error?.response?.status,
    };
  }

  private chunkConfigurationSettingDefinitionIds(
    definitionIds: string[],
    maximumFilterLength = 1200,
  ): string[][] {
    const chunks: string[][] = [];
    let chunk: string[] = [];
    let filterLength = 0;

    for (const definitionId of definitionIds) {
      const clauseLength = `id eq '${definitionId.replace(/'/g, "''")}'`.length;
      const separatorLength = chunk.length > 0 ? " or ".length : 0;
      if (
        chunk.length > 0 &&
        filterLength + separatorLength + clauseLength > maximumFilterLength
      ) {
        chunks.push(chunk);
        chunk = [];
        filterLength = 0;
      }
      chunk.push(definitionId);
      filterLength += (chunk.length > 1 ? " or ".length : 0) + clauseLength;
    }

    if (chunk.length > 0) chunks.push(chunk);
    return chunks;
  }

  private scheduleConfigurationSettingDefinitionRequest<T>(
    request: () => Promise<T>,
  ): Promise<T> {
    const laneIndex =
      this.nextConfigurationSettingDefinitionRequestLane++ %
      this.configurationSettingDefinitionRequestLanes.length;
    const scheduled =
      this.configurationSettingDefinitionRequestLanes[laneIndex]!.then(request);
    this.configurationSettingDefinitionRequestLanes[laneIndex] = scheduled.then(
      () => undefined,
      () => undefined,
    );
    return scheduled;
  }

  private async getConfigurationSettingDefinitions(
    definitionIds: string[],
  ): Promise<ConfigurationSettingDefinition[]> {
    const uniqueDefinitionIds = [...new Set(definitionIds)];
    const unresolvedDefinitionIds = uniqueDefinitionIds.filter(
      (definitionId) =>
        !this.configurationSettingDefinitionCache.has(definitionId) &&
        !this.configurationSettingDefinitionRequests.has(definitionId) &&
        !this.configurationSettingDefinitionMisses.has(definitionId),
    );

    for (const chunk of this.chunkConfigurationSettingDefinitionIds(
      unresolvedDefinitionIds,
    )) {
      const filter = chunk
        .map((definitionId) => `id eq '${definitionId.replace(/'/g, "''")}'`)
        .join(" or ");
      const batchRequest = this.scheduleConfigurationSettingDefinitionRequest(
        async () => {
          try {
            const response = await this.retryWithBackoff(
              () =>
                this.client
                  .api("/deviceManagement/configurationSettings")
                  .version("beta")
                  .filter(filter)
                  .top(chunk.length)
                  .get(),
              2,
              300,
            );
            const pages = await collectAllPagesWithStatus<any>(
              this.client as unknown as Client,
              response,
            );
            if (!pages.complete) {
              console.warn(
                "Settings Catalog definition metadata was only partially returned:",
                this.graphError(pages.error).message,
              );
            }
            return {
              complete: pages.complete,
              definitions: pages.items as ConfigurationSettingDefinition[],
            };
          } catch (error: any) {
            console.warn(
              `Failed to fetch ${chunk.length} Settings Catalog definition(s):`,
              error?.message,
            );
            return {
              complete: false,
              definitions: [] as ConfigurationSettingDefinition[],
            };
          }
        },
      );

      for (const definitionId of chunk) {
        const definitionRequest = batchRequest
          .then((result) => {
            const definition = result.definitions.find(
              (candidate) => candidate.id === definitionId,
            );
            if (definition) {
              this.configurationSettingDefinitionCache.set(
                definitionId,
                definition,
              );
            } else if (result.complete) {
              this.configurationSettingDefinitionMisses.add(definitionId);
            }
            return definition;
          })
          .finally(() => {
            this.configurationSettingDefinitionRequests.delete(definitionId);
          });
        this.configurationSettingDefinitionRequests.set(
          definitionId,
          definitionRequest,
        );
      }
    }

    const definitions = await Promise.all(
      uniqueDefinitionIds.map(async (definitionId) => {
        const cached =
          this.configurationSettingDefinitionCache.get(definitionId);
        if (cached) return cached;
        return this.configurationSettingDefinitionRequests.get(definitionId);
      }),
    );

    return definitions.filter(
      (definition): definition is ConfigurationSettingDefinition =>
        Boolean(definition),
    );
  }

  private async enrichConfigurationSettingDefinitions(
    settings: ConfigurationSetting[],
  ): Promise<{
    settings: ConfigurationSetting[];
    missingDefinitionIds: string[];
  }> {
    const configuredDefinitionIds =
      collectConfiguredSettingDefinitionIds(settings);
    const expandedDefinitions = settings.flatMap(
      (setting) => setting.settingDefinitions || [],
    );
    const availableDefinitionIds = new Set(
      expandedDefinitions.map((definition) => definition.id),
    );
    const missingDefinitionIds = configuredDefinitionIds.filter(
      (definitionId) => !availableDefinitionIds.has(definitionId),
    );

    const fetchedDefinitions =
      await this.getConfigurationSettingDefinitions(missingDefinitionIds);

    const resolvedDefinitionIds = new Set(
      fetchedDefinitions.map((definition) => definition.id),
    );

    return {
      settings: associateConfigurationSettingDefinitions(
        settings,
        fetchedDefinitions,
      ),
      missingDefinitionIds: missingDefinitionIds.filter(
        (definitionId) => !resolvedDefinitionIds.has(definitionId),
      ),
    };
  }

  private recordCollectionError(
    policyType: string,
    error: any,
    permissionHint?: string,
  ) {
    const details = this.graphError(error);
    this.fetchErrors.push({
      policyId: `collection-${policyType}`,
      policyName: policyType,
      policyType,
      familyKey: FETCH_ERROR_FAMILY_KEYS[policyType],
      error: details.message,
      errorCode: details.errorCode,
      statusCode: details.statusCode,
      endpoint: FETCH_ERROR_ENDPOINTS[policyType],
      permissionHint,
      partial: error instanceof GraphPaginationError,
    });
  }

  private partialCollectionItems(error: unknown, configType: string) {
    if (!(error instanceof GraphPaginationError)) return [];
    const message = this.graphError(error).message;
    return error.items.map((item: any) => ({
      ...item,
      displayName: item.displayName || item.name || configType,
      configType,
      hasFetchError: true,
      fetchErrorMessage: message,
      assignments: item.assignments || [],
    }));
  }

  private async fetchRegistrySection(
    entry: (typeof INTUNE_POLICY_REGISTRY)[number],
  ): Promise<ConfigurationSectionData> {
    const base: ConfigurationSectionData = {
      key: entry.key,
      familyKey: entry.family,
      label: entry.label,
      endpoint: entry.path,
      permissionHint: entry.permissionHint,
      selectionPrefix: `additional-${entry.key}`,
      items: [],
      legacy: entry.legacy,
    };

    try {
      let request = this.client.api(entry.path).version("beta");
      if (entry.select?.length)
        request = request.select(entry.select.join(","));
      if (entry.shape !== "singleton")
        request = request.top(getRegistryPageSize(entry));
      const response = await this.retryWithBackoff(() => request.get(), 3, 500);

      let rawItems: any[];
      let pagingError: any;
      if (entry.shape === "singleton") {
        rawItems = response ? [response] : [];
      } else {
        const paged = await collectAllPagesWithStatus<any>(
          this.client as unknown as Client,
          response,
        );
        rawItems = paged.items;
        pagingError = paged.complete ? undefined : paged.error;
      }

      if (entry.childCollections?.length && rawItems.length > 0) {
        rawItems = await mapWithConcurrency(rawItems, 4, async (item: any) => {
          if (!item?.id) return item;
          const enriched = { ...item };
          const enrichmentWarnings: string[] = [];
          for (const child of entry.childCollections || []) {
            try {
              let childRequest = this.client
                .api(`${entry.path}('${item.id}')/${child.path}`)
                .version("beta");
              if (child.expand)
                childRequest = childRequest.expand(child.expand);
              if (child.shape !== "singleton")
                childRequest = childRequest.top(getRegistryPageSize(child));
              const childResponse = await this.retryWithBackoff(
                () => childRequest.get(),
                2,
                300,
              );
              if (child.shape === "singleton") {
                enriched[child.property] = childResponse;
              } else {
                const childPages = await collectAllPagesWithStatus<any>(
                  this.client as unknown as Client,
                  childResponse,
                );
                enriched[child.property] = childPages.items;
                if (!childPages.complete) {
                  enrichmentWarnings.push(
                    `${child.property}: ${this.graphError(childPages.error).message}`,
                  );
                }
              }
            } catch (error: any) {
              enrichmentWarnings.push(
                `${child.property}: ${this.graphError(error).message}`,
              );
            }
          }
          if (enrichmentWarnings.length) {
            enriched.enrichmentWarnings = enrichmentWarnings;
          }
          return enriched;
        });
      }

      base.items = rawItems.map((item, index) => {
        const sanitized = sanitizeGraphData(
          item,
          entry.sensitiveFields,
        ) as Record<string, any>;
        return {
          ...sanitized,
          id: getStableItemId(base, sanitized, index),
          displayName: getItemLabel(base, sanitized),
          configType: entry.label,
          sourceEndpoint: entry.path,
          registryKey: entry.key,
        };
      });

      const enrichmentWarnings = rawItems.flatMap((item: any) =>
        Array.isArray(item.enrichmentWarnings) ? item.enrichmentWarnings : [],
      );
      if (pagingError || enrichmentWarnings.length > 0) {
        const pagingDetails = pagingError
          ? this.graphError(pagingError)
          : undefined;
        base.error = {
          message: [pagingDetails?.message, ...new Set(enrichmentWarnings)]
            .filter(Boolean)
            .join("; "),
          errorCode: pagingDetails?.errorCode,
          statusCode: pagingDetails?.statusCode,
          permissionHint: entry.permissionHint,
          partial: true,
        };
      }
    } catch (error: any) {
      const details = this.graphError(error);
      if (
        !(details.statusCode === 404 && entry.notConfiguredOn404) &&
        !isExpectedRegistryUnavailableError(entry, error)
      ) {
        base.error = {
          ...details,
          permissionHint: entry.permissionHint,
        };
      }
    }

    this.progressCallback?.({
      step: entry.label,
      type: "section",
      section: base,
    });
    return base;
  }

  async getAdditionalConfigurationSections() {
    return mapWithConcurrency(INTUNE_POLICY_REGISTRY, 6, (entry) =>
      this.fetchRegistrySection(entry),
    );
  }

  // Helper function to add delay between requests
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Helper function to retry an API call with exponential backoff and jitter
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 5,
    initialDelay: number = 1000,
  ): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const statusCode = error?.statusCode || error?.response?.status;
        const errorMessage = error?.message || "";

        // Don't retry on permanent failures
        // 404 or 403 - resource doesn't exist or forbidden
        // "No OData route exists" - API endpoint not supported for this resource
        if (
          statusCode === 404 ||
          statusCode === 403 ||
          errorMessage.includes("No OData route exists")
        ) {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (attempt === maxRetries - 1) {
          throw error;
        }

        // Check if it's a rate limit error (429)
        if (statusCode === 429 || error?.code === "TooManyRequests") {
          // Try to get Retry-After header
          const retryAfter =
            error?.headers?.["retry-after"] || error?.retryAfter;
          const retryDelay = retryAfter ? parseInt(retryAfter) * 1000 : 30000; // Default to 30s
          console.log(
            `Rate limited (429). Waiting ${retryDelay}ms before retry ${attempt + 1}/${maxRetries}`,
          );
          await this.delay(retryDelay);
          continue;
        }

        // Wait with exponential backoff plus jitter to avoid thundering herd
        const exponentialDelay = initialDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 500; // Random jitter up to 500ms
        const delayMs = exponentialDelay + jitter;

        console.log(
          `Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delayMs)}ms (error: ${error?.message || "Unknown"})`,
        );
        await this.delay(delayMs);
      }
    }
    throw lastError;
  }

  // 1. Settings Catalog with full settings
  async getConfigurationPoliciesWithSettings(): Promise<
    DetailedConfiguration[]
  > {
    try {
      console.log("Fetching Settings Catalog policies...");
      const policies = await this.client
        .api("/deviceManagement/configurationPolicies")
        .version("beta")
        .select(
          "id,name,description,platforms,technologies,createdDateTime,lastModifiedDateTime,settingCount,templateReference",
        )
        .top(999)
        .get();

      const allPolicies = await collectAllPages<any>(
        this.client as unknown as Client,
        policies,
      );
      console.log(
        `Found ${allPolicies?.length || 0} Settings Catalog policies`,
      );

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
          step: "Settings Catalog",
          type: "batch-progress",
          current: batchNumber,
          total: totalBatches,
          message: `Processing Settings Catalog batch ${batchNumber}/${totalBatches}`,
        });

        const batchResults = await Promise.all(
          batch.map(async (policy: any) => {
            try {
              // Try to fetch settings with expanded definitions first
              let settings: any[] = [];
              const policyWarnings: string[] = [];
              try {
                const settingsResponse = await this.retryWithBackoff(
                  async () => {
                    return await this.client
                      .api(
                        `/deviceManagement/configurationPolicies('${policy.id}')/settings`,
                      )
                      .version("beta")
                      .top(1000)
                      .expand("settingDefinitions")
                      .get();
                  },
                );
                const settingsPages = await collectAllPagesWithStatus<any>(
                  this.client as unknown as Client,
                  settingsResponse,
                );
                settings = settingsPages.items;
                if (!settingsPages.complete) {
                  policyWarnings.push(
                    `Settings: ${this.graphError(settingsPages.error).message}`,
                  );
                }
              } catch {
                // If expand fails, try without it as a fallback
                console.warn(
                  `Failed to fetch with expand for ${policy.name}, trying without expand...`,
                );
                try {
                  const settingsResponse = await this.retryWithBackoff(
                    async () => {
                      return await this.client
                        .api(
                          `/deviceManagement/configurationPolicies('${policy.id}')/settings`,
                        )
                        .version("beta")
                        .top(1000)
                        .get();
                    },
                  );
                  const settingsPages = await collectAllPagesWithStatus<any>(
                    this.client as unknown as Client,
                    settingsResponse,
                  );
                  settings = settingsPages.items;
                  if (!settingsPages.complete) {
                    policyWarnings.push(
                      `Settings: ${this.graphError(settingsPages.error).message}`,
                    );
                  }
                } catch (fallbackError: any) {
                  throw fallbackError;
                }
              }

              const enrichedSettings =
                await this.enrichConfigurationSettingDefinitions(settings);
              settings = enrichedSettings.settings;
              if (enrichedSettings.missingDefinitionIds.length > 0) {
                console.warn(
                  `Setting metadata unavailable for ${enrichedSettings.missingDefinitionIds.length} definition(s) in ${policy.name}`,
                );
              }

              // Fetch assignments with retry
              let assignments: any[] = [];
              try {
                const assignmentsResponse = await this.retryWithBackoff(() =>
                  this.client
                    .api(
                      `/deviceManagement/configurationPolicies('${policy.id}')/assignments`,
                    )
                    .version("beta")
                    .get(),
                );
                const assignmentPages = await collectAllPagesWithStatus<any>(
                  this.client as unknown as Client,
                  assignmentsResponse,
                );
                assignments = assignmentPages.items;
                if (!assignmentPages.complete) {
                  policyWarnings.push(
                    `Assignments: ${this.graphError(assignmentPages.error).message}`,
                  );
                }
              } catch (assignmentError: any) {
                console.warn(
                  `Failed to fetch assignments for ${policy.name}:`,
                  assignmentError?.message,
                );
                policyWarnings.push(
                  `Assignments: ${assignmentError?.message || "request failed"}`,
                );
              }

              if (policyWarnings.length > 0) {
                this.fetchErrors.push({
                  policyId: policy.id,
                  policyName: policy.name,
                  policyType: "Settings Catalog",
                  familyKey: "settingsCatalog",
                  endpoint: `/deviceManagement/configurationPolicies('${policy.id}')`,
                  error: [...new Set(policyWarnings)].join("; "),
                  partial: true,
                });
              }

              return {
                ...policy,
                displayName: policy.name,
                configType: "Settings Catalog",
                settings: settings || [],
                assignments: assignments || [],
                collectionStatus: {
                  assignments: policyWarnings.some((warning) =>
                    warning.startsWith("Assignments:"),
                  )
                    ? "incomplete"
                    : "complete",
                  settings: policyWarnings.some((warning) =>
                    warning.startsWith("Settings:"),
                  )
                    ? "incomplete"
                    : "complete",
                },
                hasFetchError: policyWarnings.length > 0,
                fetchErrorMessage:
                  policyWarnings.length > 0
                    ? [...new Set(policyWarnings)].join("; ")
                    : undefined,
              };
            } catch (error: any) {
              const errorMessage =
                error?.message || "Failed to fetch policy settings";
              const errorCode = error?.code || error?.error?.code;
              const statusCode = error?.statusCode || error?.response?.status;

              console.error(
                `Error fetching details for policy ${policy.name}:`,
                {
                  message: errorMessage,
                  code: errorCode,
                  status: statusCode,
                },
              );

              // Track the fetch error with more details
              this.fetchErrors.push({
                policyId: policy.id,
                policyName: policy.name,
                policyType: "Settings Catalog",
                familyKey: "settingsCatalog",
                endpoint: `/deviceManagement/configurationPolicies('${policy.id}')`,
                error: errorMessage,
                errorCode: errorCode,
                statusCode: statusCode,
              });

              return {
                ...policy,
                displayName: policy.name,
                configType: "Settings Catalog",
                settings: [],
                assignments: [],
                collectionStatus: {
                  assignments: "incomplete",
                  settings: "incomplete",
                },
                hasFetchError: true,
                fetchErrorMessage: errorMessage,
              };
            }
          }),
        );

        detailedPolicies.push(...batchResults);

        // Add a small delay between batches to avoid rate limiting
        // Reduced from 500ms to 200ms for faster processing
        if (i + batchSize < (allPolicies || []).length) {
          await this.delay(200);
        }
      }

      console.log(
        `Successfully fetched ${detailedPolicies.filter((p) => !p.hasFetchError).length}/${detailedPolicies.length} Settings Catalog policies`,
      );
      return detailedPolicies;
    } catch (error) {
      console.error("Error fetching configuration policies:", error);
      this.recordCollectionError(
        "Settings Catalog",
        error,
        "DeviceManagementConfiguration.Read.All",
      );
      return this.partialCollectionItems(error, "Settings Catalog");
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

      const allConfigs = await collectAllPages<any>(
        this.client as unknown as Client,
        configs,
      );

      const nonUpdateRingConfigs = (allConfigs || []).filter(
        (config) =>
          !String(config["@odata.type"] || "").includes(
            "windowsUpdateForBusinessConfiguration",
          ),
      );

      const detailedConfigs = await Promise.all(
        nonUpdateRingConfigs.map(async (config: any) => {
          try {
            const assignmentResult = await this.readPolicyRelation(
              config,
              "deviceConfigurations",
              `/deviceManagement/deviceConfigurations('${config.id}')/assignments`,
            );
            const assignments = assignmentResult.items;

            // The config object already contains all settings as properties
            return {
              ...config,
              configType: this.getConfigurationType(config["@odata.type"]),
              assignments: assignments || [],
              collectionStatus: {
                assignments: assignmentResult.complete
                  ? "complete"
                  : "incomplete",
              },
            };
          } catch (error) {
            console.error(
              `Error fetching details for config ${config.displayName}:`,
              error,
            );
            return {
              ...config,
              configType: this.getConfigurationType(config["@odata.type"]),
              assignments: [],
            };
          }
        }),
      );

      return detailedConfigs;
    } catch (error) {
      console.error("Error fetching device configurations:", error);
      this.recordCollectionError(
        "Device Configurations",
        error,
        "DeviceManagementConfiguration.Read.All",
      );
      return this.partialCollectionItems(error, "Device Configuration").filter(
        (config) =>
          !String(config["@odata.type"] || "").includes(
            "windowsUpdateForBusinessConfiguration",
          ),
      );
    }
  }

  // 3. Administrative Templates with definition values
  async getGroupPolicyConfigurationsDetailed(): Promise<
    DetailedConfiguration[]
  > {
    try {
      console.log("Fetching Administrative Templates...");
      const configs = await this.client
        .api("/deviceManagement/groupPolicyConfigurations")
        .version("beta")
        .select(
          "id,displayName,description,createdDateTime,lastModifiedDateTime,roleScopeTagIds",
        )
        .top(999)
        .get();

      const allConfigs = await collectAllPages<any>(
        this.client as unknown as Client,
        configs,
      );

      const detailedConfigs = await mapWithConcurrency(
        allConfigs || [],
        3,
        async (config: any) => {
          const policyWarnings: string[] = [];
          try {
            // Fetch definition values (actual settings) with retry
            let definitionValuesAll: any[] = [];
            try {
              const definitionValues = await this.retryWithBackoff(() =>
                this.client
                  .api(
                    `/deviceManagement/groupPolicyConfigurations('${config.id}')/definitionValues`,
                  )
                  .version("beta")
                  .expand("definition")
                  .top(999)
                  .get(),
              );
              const definitionPages = await collectAllPagesWithStatus<any>(
                this.client as unknown as Client,
                definitionValues,
              );
              definitionValuesAll = definitionPages.items;
              if (!definitionPages.complete) {
                policyWarnings.push(
                  `Definition values: ${this.graphError(definitionPages.error).message}`,
                );
              }
            } catch (defError: any) {
              console.warn(
                `Failed to fetch definition values for ${config.displayName}:`,
                defError?.message,
              );
              policyWarnings.push(
                `Definition values: ${defError?.message || "request failed"}`,
              );
              definitionValuesAll = [];
            }

            const definitionValuesWithPresentations = await mapWithConcurrency(
              definitionValuesAll || [],
              3,
              async (definitionValue: any) => {
                try {
                  const response = await this.retryWithBackoff(
                    () =>
                      this.client
                        .api(
                          `/deviceManagement/groupPolicyConfigurations('${config.id}')/definitionValues('${definitionValue.id}')/presentationValues`,
                        )
                        .version("beta")
                        .expand("presentation")
                        .top(999)
                        .get(),
                    3,
                    500,
                  );
                  const presentationPages =
                    await collectAllPagesWithStatus<any>(
                      this.client as unknown as Client,
                      response,
                    );
                  if (!presentationPages.complete) {
                    policyWarnings.push(
                      `Presentation values: ${this.graphError(presentationPages.error).message}`,
                    );
                  }
                  return {
                    ...definitionValue,
                    presentationValues: presentationPages.items,
                    presentationFetchError: !presentationPages.complete,
                  };
                } catch (error: any) {
                  console.warn(
                    `Presentation values unavailable for ${config.displayName}:`,
                    error?.message,
                  );
                  policyWarnings.push(
                    `Presentation values: ${error?.message || "request failed"}`,
                  );
                  return {
                    ...definitionValue,
                    presentationValues: [],
                    presentationFetchError: true,
                  };
                }
              },
            );

            // Fetch assignments with retry
            let assignments: any[] = [];
            try {
              const assignmentsResponse = await this.retryWithBackoff(() =>
                this.client
                  .api(
                    `/deviceManagement/groupPolicyConfigurations('${config.id}')/assignments`,
                  )
                  .version("beta")
                  .get(),
              );
              const assignmentPages = await collectAllPagesWithStatus<any>(
                this.client as unknown as Client,
                assignmentsResponse,
              );
              assignments = assignmentPages.items;
              if (!assignmentPages.complete) {
                policyWarnings.push(
                  `Assignments: ${this.graphError(assignmentPages.error).message}`,
                );
              }
            } catch (assignmentError: any) {
              console.warn(
                `Failed to fetch assignments for ${config.displayName}:`,
                assignmentError?.message,
              );
              policyWarnings.push(
                `Assignments: ${assignmentError?.message || "request failed"}`,
              );
              assignments = [];
            }

            if (policyWarnings.length > 0) {
              this.fetchErrors.push({
                policyId: config.id,
                policyName: config.displayName,
                policyType: "Administrative Template",
                familyKey: "administrativeTemplates",
                endpoint: `/deviceManagement/groupPolicyConfigurations('${config.id}')`,
                error: [...new Set(policyWarnings)].join("; "),
                partial: true,
              });
            }

            return {
              ...config,
              configType: "Administrative Template",
              definitionValues: definitionValuesWithPresentations,
              collectionStatus: {
                assignments: policyWarnings.some((warning) =>
                  warning.startsWith("Assignments:"),
                )
                  ? "incomplete"
                  : "complete",
                settings: policyWarnings.some(
                  (warning) => !warning.startsWith("Assignments:"),
                )
                  ? "incomplete"
                  : "complete",
              },
              assignments: assignments || [],
              version: 1,
              hasFetchError: policyWarnings.length > 0,
              fetchErrorMessage:
                policyWarnings.length > 0
                  ? [...new Set(policyWarnings)].join("; ")
                  : undefined,
            };
          } catch (error) {
            console.error(
              `Error fetching details for group policy ${config.displayName}:`,
              error,
            );
            this.fetchErrors.push({
              policyId: config.id,
              policyName: config.displayName,
              policyType: "Administrative Template",
              familyKey: "administrativeTemplates",
              endpoint: `/deviceManagement/groupPolicyConfigurations('${config.id}')`,
              error:
                error instanceof Error ? error.message : "Detail fetch failed",
              partial: true,
            });
            return {
              ...config,
              configType: "Administrative Template",
              definitionValues: [],
              assignments: [],
              version: 1,
              hasFetchError: true,
              fetchErrorMessage:
                error instanceof Error ? error.message : "Detail fetch failed",
            };
          }
        },
      );

      return detailedConfigs;
    } catch (error) {
      console.error("Error fetching group policy configurations:", error);
      this.recordCollectionError(
        "Administrative Templates",
        error,
        "DeviceManagementConfiguration.Read.All",
      );
      return this.partialCollectionItems(error, "Administrative Template");
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

      const allPolicies = await collectAllPages<any>(
        this.client as unknown as Client,
        policies,
      );

      const detailedPolicies = await Promise.all(
        (allPolicies || []).map(async (policy: any) => {
          try {
            const assignmentResult = await this.readPolicyRelation(
              policy,
              "compliancePolicies",
              `/deviceManagement/deviceCompliancePolicies('${policy.id}')/assignments`,
            );
            const assignments = assignmentResult.items;

            const actionsResult =
              await this.readComplianceScheduledActions(policy);
            const scheduledActionsAll = actionsResult.items;

            return {
              ...policy,
              configType: "Compliance Policy",
              scheduledActionsForRule: scheduledActionsAll || [],
              assignments: assignments || [],
              collectionStatus: {
                scheduledActionsForRule: actionsResult.complete
                  ? "complete"
                  : "incomplete",
                assignments: assignmentResult.complete
                  ? "complete"
                  : "incomplete",
              },
            };
          } catch (error) {
            console.error(
              `Error fetching details for compliance policy ${policy.displayName}:`,
              error,
            );
            return {
              ...policy,
              configType: "Compliance Policy",
              scheduledActionsForRule: [],
              assignments: [],
            };
          }
        }),
      );

      return detailedPolicies;
    } catch (error) {
      console.error("Error fetching compliance policies:", error);
      this.recordCollectionError(
        "Compliance Policies",
        error,
        "DeviceManagementConfiguration.Read.All",
      );
      return this.partialCollectionItems(error, "Compliance Policy");
    }
  }

  // 5. App Protection Policies with settings
  async getAppProtectionPoliciesDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching App Protection Policies...");

      // Fetch iOS, Android, and Windows MAM policies in parallel
      const [iosPolicies, androidPolicies, windowsPolicies] = await Promise.all(
        [
          this.client
            .api("/deviceAppManagement/iosManagedAppProtections")
            .version("beta")
            .top(999)
            .get()
            .catch((error) => {
              this.recordCollectionError(
                "iOS App Protection Policies",
                error,
                "DeviceManagementApps.Read.All",
              );
              return { value: [] };
            }),
          this.client
            .api("/deviceAppManagement/androidManagedAppProtections")
            .version("beta")
            .top(999)
            .get()
            .catch((error) => {
              this.recordCollectionError(
                "Android App Protection Policies",
                error,
                "DeviceManagementApps.Read.All",
              );
              return { value: [] };
            }),
          this.client
            .api("/deviceAppManagement/windowsManagedAppProtections")
            .version("beta")
            .top(999)
            .get()
            .catch((error) => {
              this.recordCollectionError(
                "Windows App Protection Policies",
                error,
                "DeviceManagementApps.Read.All",
              );
              return { value: [] };
            }),
        ],
      );

      const allIosPolicies = await collectAllPages<any>(
        this.client as unknown as Client,
        iosPolicies,
      );
      const allAndroidPolicies = await collectAllPages<any>(
        this.client as unknown as Client,
        androidPolicies,
      );
      const allWindowsPolicies = await collectAllPages<any>(
        this.client as unknown as Client,
        windowsPolicies,
      );

      // Combine all policies and fetch their assignments
      const allPolicies = [
        ...(allIosPolicies || []).map((p: any) => ({ ...p, platform: "iOS" })),
        ...(allAndroidPolicies || []).map((p: any) => ({
          ...p,
          platform: "Android",
        })),
        ...(allWindowsPolicies || []).map((p: any) => ({
          ...p,
          platform: "Windows",
        })),
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

            const [assignmentResult, appsResult] = await Promise.all([
              this.readPolicyRelation(
                policy,
                "appProtectionPolicies",
                endpoint,
              ),
              this.readPolicyRelation(
                policy,
                "appProtectionPolicies",
                endpoint.replace(/\/assignments$/, "/apps"),
              ),
            ]);
            const assignments = assignmentResult.items;
            const apps = appsResult.items;

            return {
              ...policy,
              configType: "App Protection Policy",
              platformType: policy.platform,
              assignments: assignments || [],
              apps: apps || [],
              collectionStatus: {
                assignments: assignmentResult.complete
                  ? "complete"
                  : "incomplete",
                apps: appsResult.complete ? "complete" : "incomplete",
              },
            };
          } catch (error) {
            console.error(
              `Error fetching details for app protection policy ${policy.displayName}:`,
              error,
            );
            return {
              ...policy,
              configType: "App Protection Policy",
              platformType: policy.platform,
              assignments: [],
            };
          }
        }),
      );

      return detailedPolicies;
    } catch (error) {
      console.error("Error fetching app protection policies:", error);
      this.recordCollectionError(
        "App Protection Policies",
        error,
        "DeviceManagementApps.Read.All",
      );
      return this.partialCollectionItems(error, "App Protection Policy");
    }
  }

  // 6. Security Baselines with settings
  async getSecurityBaselinesDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching Security Baselines...");
      const intents = await this.client
        .api("/deviceManagement/intents")
        .version("beta")
        .select(
          "id,displayName,description,lastModifiedDateTime,isAssigned,templateId",
        )
        .top(999)
        .get();

      const allIntents = await collectAllPages<any>(
        this.client as unknown as Client,
        intents,
      );

      const detailedIntents = await Promise.all(
        (allIntents || []).map(async (intent: any) => {
          try {
            const [categoriesResult, settingsResult, assignmentResult] =
              await Promise.all([
                this.readPolicyRelation(
                  intent,
                  "securityBaselines",
                  `/deviceManagement/intents('${intent.id}')/categories`,
                ),
                this.readPolicyRelation(
                  intent,
                  "securityBaselines",
                  `/deviceManagement/intents('${intent.id}')/settings`,
                ),
                this.readPolicyRelation(
                  intent,
                  "securityBaselines",
                  `/deviceManagement/intents('${intent.id}')/assignments`,
                ),
              ]);
            const categoriesAll = categoriesResult.items;
            const assignments = assignmentResult.items;

            return {
              ...intent,
              configType: "Security Baseline",
              categories: categoriesAll || [],
              settings: settingsResult.items,
              collectionStatus: {
                assignments: assignmentResult.complete
                  ? "complete"
                  : "incomplete",
                settings: settingsResult.complete ? "complete" : "incomplete",
              },
              assignments: assignments || [],
            };
          } catch (error) {
            console.error(
              `Error fetching details for intent ${intent.displayName}:`,
              error,
            );
            return {
              ...intent,
              configType: "Security Baseline",
              categories: [],
              assignments: [],
            };
          }
        }),
      );

      return detailedIntents;
    } catch (error) {
      console.error("Error fetching security baselines:", error);
      this.recordCollectionError(
        "Security Baselines",
        error,
        "DeviceManagementConfiguration.Read.All",
      );
      return this.partialCollectionItems(error, "Security Baseline");
    }
  }

  // 6. Scripts with content
  async getScriptsDetailed(): Promise<{
    windows: DetailedConfiguration[];
    macOS: DetailedConfiguration[];
  }> {
    const windowsScripts = await this.getWindowsScriptsDetailed();
    const macOSScripts = await this.getMacOSScriptsDetailed();

    return {
      windows: windowsScripts,
      macOS: macOSScripts,
    };
  }

  private async getWindowsScriptsDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching Windows PowerShell Scripts...");
      const scripts = await this.client
        .api("/deviceManagement/deviceManagementScripts")
        .version("beta")
        .select(
          "id,displayName,description,createdDateTime,lastModifiedDateTime,fileName,runAsAccount,enforceSignatureCheck,runAs32Bit",
        )
        .top(999)
        .get();

      const allScripts = await collectAllPages<any>(
        this.client as unknown as Client,
        scripts,
      );

      const detailedScripts = await Promise.all(
        (allScripts || []).map(async (script: any) => {
          try {
            const endpoint = `/deviceManagement/deviceManagementScripts('${script.id}')`;
            const [details, assignments] = await Promise.all([
              this.readPolicyDetails(
                script,
                "scripts",
                endpoint,
                "scriptContent",
              ),
              this.readPolicyRelation(
                script,
                "scripts",
                `${endpoint}/assignments`,
              ),
            ]);
            const scriptContent = details.item;

            return {
              ...script,
              scriptContent: scriptContent.scriptContent
                ? Buffer.from(scriptContent.scriptContent, "base64").toString(
                    "utf8",
                  )
                : null,
              configType: "PowerShell Script",
              platformType: "Windows",
              assignments: assignments.items,
              collectionStatus: {
                details: details.complete ? "complete" : "incomplete",
                assignments: assignments.complete ? "complete" : "incomplete",
              },
            };
          } catch (error) {
            console.error(
              `Error fetching details for script ${script.displayName}:`,
              error,
            );
            return {
              ...script,
              configType: "PowerShell Script",
              platformType: "Windows",
              assignments: [],
            };
          }
        }),
      );

      return detailedScripts;
    } catch (error: any) {
      // Check if it's a permission error
      if (error?.statusCode === 403 || error?.code === "Forbidden") {
        console.log(
          "Windows PowerShell Scripts skipped - insufficient permissions",
        );
        this.permissionErrors.push({
          resource: "Windows PowerShell Scripts",
          requiredPermission: "DeviceManagementScripts.Read.All",
          message:
            "Unable to fetch Windows PowerShell Scripts due to missing permissions",
        });
      } else {
        console.error("Error fetching Windows scripts:", error);
      }
      this.recordCollectionError(
        "Windows PowerShell Scripts",
        error,
        "DeviceManagementScripts.Read.All",
      );
      return this.partialCollectionItems(error, "PowerShell Script");
    }
  }

  private async getMacOSScriptsDetailed(): Promise<DetailedConfiguration[]> {
    try {
      console.log("Fetching macOS Shell Scripts...");
      const scripts = await this.client
        .api("/deviceManagement/deviceShellScripts")
        .version("beta")
        .select(
          "id,displayName,description,createdDateTime,lastModifiedDateTime,fileName,runAsAccount",
        )
        .top(999)
        .get();

      const allScripts = await collectAllPages<any>(
        this.client as unknown as Client,
        scripts,
      );

      const detailedScripts = await Promise.all(
        (allScripts || []).map(async (script: any) => {
          try {
            const endpoint = `/deviceManagement/deviceShellScripts('${script.id}')`;
            const [details, assignments] = await Promise.all([
              this.readPolicyDetails(
                script,
                "scripts",
                endpoint,
                "scriptContent",
              ),
              this.readPolicyRelation(
                script,
                "scripts",
                `${endpoint}/assignments`,
              ),
            ]);
            const scriptContent = details.item;

            return {
              ...script,
              scriptContent: scriptContent.scriptContent
                ? Buffer.from(scriptContent.scriptContent, "base64").toString(
                    "utf8",
                  )
                : null,
              configType: "Shell Script",
              platformType: "macOS",
              assignments: assignments.items,
              collectionStatus: {
                details: details.complete ? "complete" : "incomplete",
                assignments: assignments.complete ? "complete" : "incomplete",
              },
            };
          } catch (error) {
            console.error(
              `Error fetching details for script ${script.displayName}:`,
              error,
            );
            return {
              ...script,
              configType: "Shell Script",
              platformType: "macOS",
              assignments: [],
            };
          }
        }),
      );

      return detailedScripts;
    } catch (error: any) {
      // Check if it's a permission error
      if (error?.statusCode === 403 || error?.code === "Forbidden") {
        console.log("macOS Shell Scripts skipped - insufficient permissions");
        this.permissionErrors.push({
          resource: "macOS Shell Scripts",
          requiredPermission: "DeviceManagementScripts.Read.All",
          message:
            "Unable to fetch macOS Shell Scripts due to missing permissions",
        });
      } else {
        console.error("Error fetching macOS scripts:", error);
      }
      this.recordCollectionError(
        "macOS Shell Scripts",
        error,
        "DeviceManagementScripts.Read.All",
      );
      return this.partialCollectionItems(error, "Shell Script");
    }
  }

  // Helper function to determine configuration type
  private getConfigurationType(odataType: string): string {
    const typeMap: Record<string, string> = {
      // Windows configurations
      "#microsoft.graph.windows10GeneralConfiguration":
        "Windows 10 General Configuration",
      "#microsoft.graph.windows10EndpointProtectionConfiguration":
        "Windows 10 Endpoint Protection",
      "#microsoft.graph.windows10CustomConfiguration":
        "Windows 10 Custom Configuration",
      "#microsoft.graph.windows10SecureAssessmentConfiguration":
        "Windows 10 Secure Assessment",
      "#microsoft.graph.windows10EnterpriseModernAppManagementConfiguration":
        "Windows 10 Enterprise App Management",
      "#microsoft.graph.windows81GeneralConfiguration":
        "Windows 8.1 General Configuration",
      "#microsoft.graph.windowsUpdateForBusinessConfiguration":
        "Windows Update for Business",
      "#microsoft.graph.windowsDefenderAdvancedThreatProtectionConfiguration":
        "Windows Defender ATP",
      "#microsoft.graph.windowsIdentityProtectionConfiguration":
        "Windows Identity Protection",
      "#microsoft.graph.editionUpgradeConfiguration": "Windows Edition Upgrade",
      "#microsoft.graph.windowsKioskConfiguration":
        "Windows Kiosk Configuration",
      "#microsoft.graph.windows10TeamGeneralConfiguration":
        "Surface Hub Configuration",

      // macOS configurations
      "#microsoft.graph.macOSGeneralConfiguration":
        "macOS General Configuration",
      "#microsoft.graph.macOSEndpointProtectionConfiguration":
        "macOS Endpoint Protection",
      "#microsoft.graph.macOSCustomConfiguration": "macOS Custom Configuration",
      "#microsoft.graph.macOSDeviceFeaturesConfiguration":
        "macOS Device Features",
      "#microsoft.graph.macOSExtensionsConfiguration": "macOS Extensions",
      "#microsoft.graph.macOSSoftwareUpdateConfiguration":
        "macOS Software Update",

      // iOS/iPadOS configurations
      "#microsoft.graph.iosGeneralConfiguration": "iOS General Configuration",
      "#microsoft.graph.iosCustomConfiguration": "iOS Custom Configuration",
      "#microsoft.graph.iosUpdateConfiguration": "iOS Update Configuration",
      "#microsoft.graph.iosDeviceFeaturesConfiguration": "iOS Device Features",
      "#microsoft.graph.iosEndpointProtectionConfiguration":
        "iOS Endpoint Protection",
      "#microsoft.graph.iosCertificateProfileConfiguration":
        "iOS Certificate Profile",
      "#microsoft.graph.iosEasEmailProfileConfiguration": "iOS Email Profile",
      "#microsoft.graph.iosWiFiConfiguration": "iOS WiFi Profile",
      "#microsoft.graph.iosVpnConfiguration": "iOS VPN Profile",

      // Android configurations
      "#microsoft.graph.androidGeneralConfiguration":
        "Android General Configuration",
      "#microsoft.graph.androidCustomConfiguration":
        "Android Custom Configuration",
      "#microsoft.graph.androidWorkProfileGeneralConfiguration":
        "Android Work Profile Configuration",
      "#microsoft.graph.androidWorkProfileCustomConfiguration":
        "Android Work Profile Custom",
      "#microsoft.graph.androidDeviceOwnerGeneralConfiguration":
        "Android Device Owner Configuration",
      "#microsoft.graph.androidOMAConfiguration":
        "Android OMA-DM Configuration",
      "#microsoft.graph.androidEasEmailProfileConfiguration":
        "Android Email Profile",
      "#microsoft.graph.androidWiFiConfiguration": "Android WiFi Profile",
      "#microsoft.graph.androidVpnConfiguration": "Android VPN Profile",

      // Shared/Common configurations
      "#microsoft.graph.sharedPCConfiguration": "Shared PC Configuration",
      "#microsoft.graph.vpnConfiguration": "VPN Configuration",
      "#microsoft.graph.wiFiConfiguration": "WiFi Configuration",
      "#microsoft.graph.emailConfiguration": "Email Configuration",
    };

    // If not in map, try to extract a friendly name from the odataType
    if (!typeMap[odataType]) {
      // Remove prefix and format: "#microsoft.graph.iosGeneralConfiguration" -> "Ios General Configuration"
      const typeName = odataType
        .replace("#microsoft.graph.", "")
        .replace(/([A-Z])/g, " $1")
        .trim();
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

      const allConfigs = await collectAllPages<any>(
        this.client as unknown as Client,
        response,
      );

      // Fetch full details and assignments for each configuration
      const detailedConfigs = await Promise.all(
        (allConfigs || []).map(async (config: any) => {
          try {
            const endpoint = `/deviceAppManagement/mobileAppConfigurations('${config.id}')`;
            const [details, assignments] = await Promise.all([
              this.readPolicyDetails(config, "appConfigurations", endpoint),
              this.readPolicyRelation(
                config,
                "appConfigurations",
                `${endpoint}/assignments`,
              ),
            ]);
            return {
              ...details.item,
              configType: "App Configuration",
              assignments: assignments.items,
              collectionStatus: {
                details: details.complete ? "complete" : "incomplete",
                assignments: assignments.complete ? "complete" : "incomplete",
              },
            };
          } catch (error) {
            console.error(
              `Error fetching details for app configuration ${config.displayName}:`,
              error,
            );
            return {
              ...config,
              configType: "App Configuration",
              assignments: [],
            };
          }
        }),
      );

      return detailedConfigs;
    } catch (error) {
      console.error("Error fetching app configurations:", error);
      this.recordCollectionError(
        "App Configurations",
        error,
        "DeviceManagementApps.Read.All",
      );
      return this.partialCollectionItems(error, "App Configuration");
    }
  }

  // Get Windows Update Policies with detailed settings
  async getWindowsUpdatePoliciesDetailed() {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceConfigurations")
        .version("beta")
        .filter("isof('microsoft.graph.windowsUpdateForBusinessConfiguration')")
        .select(
          "id,displayName,description,createdDateTime,lastModifiedDateTime,assignments",
        )
        .expand("assignments")
        .top(999)
        .get();
      const list = await collectAllPages<any>(
        this.client as unknown as Client,
        response,
      );

      // Fetch detailed settings for each policy
      const detailedPolicies = await Promise.all(
        list.map(async (policy: any) => {
          try {
            const assignmentResult = await this.readPolicyRelation(
              policy,
              "windowsUpdatePolicies",
              `/deviceManagement/deviceConfigurations('${policy.id}')/assignments`,
            );
            const detailResponse = await this.client
              .api(`/deviceManagement/deviceConfigurations/${policy.id}`)
              .version("beta")
              .get();

            return {
              ...policy,
              ...detailResponse,
              configType: "Windows Update Ring",
              assignments: assignmentResult.items,
              collectionStatus: {
                assignments: assignmentResult.complete
                  ? "complete"
                  : "incomplete",
              },
            };
          } catch (error) {
            this.fetchErrors.push({
              policyId: policy.id,
              policyName: policy.displayName ?? policy.id,
              policyType: "Windows Update Policies",
              familyKey: "windowsUpdatePolicies",
              endpoint: `/deviceManagement/deviceConfigurations/${policy.id}`,
              error: this.graphError(error).message,
              partial: true,
            });
            console.error(
              `Error fetching details for Windows Update policy ${policy.id}:`,
              error,
            );
            return {
              ...policy,
              configType: "Windows Update Ring",
            };
          }
        }),
      );

      return detailedPolicies;
    } catch (error) {
      console.error("Error fetching Windows Update policies:", error);
      this.recordCollectionError(
        "Windows Update Policies",
        error,
        "DeviceManagementConfiguration.Read.All",
      );
      return this.partialCollectionItems(error, "Windows Update Ring");
    }
  }

  // Get Enrollment Configurations with detailed settings
  async getEnrollmentConfigurationsDetailed() {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceEnrollmentConfigurations")
        .version("beta")
        .expand("assignments")
        .top(999)
        .get();
      return await collectAllPages<any>(
        this.client as unknown as Client,
        response,
      );
    } catch (error) {
      console.error("Error fetching enrollment configurations:", error);
      this.recordCollectionError(
        "Enrollment Configurations",
        error,
        "DeviceManagementServiceConfig.Read.All",
      );
      return this.partialCollectionItems(error, "Enrollment Configuration");
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
  // Emit a progress event the moment an individual policy-type fetch settles,
  // so the client can show real per-type completion instead of one big jump.
  private progressSectionsFor(
    step: string,
    value: any,
  ): ConfigurationSectionData[] {
    const make = (
      key: string,
      familyKey: string,
      label: string,
      selectionPrefix: string,
      items: any[],
    ): ConfigurationSectionData => ({
      key,
      familyKey,
      label,
      selectionPrefix,
      items: sanitizeGraphData(items || []) as any[],
    });

    switch (step) {
      case "Settings Catalog":
        return [
          make("settingsCatalog", "settingsCatalog", step, "catalog", value),
        ];
      case "Device Configurations":
        return [
          make(
            "deviceConfigurations",
            "deviceConfigurations",
            step,
            "device",
            value,
          ),
        ];
      case "Administrative Templates":
        return [
          make(
            "administrativeTemplates",
            "administrativeTemplates",
            step,
            "admx",
            value,
          ),
        ];
      case "Compliance Policies":
        return [
          make(
            "compliancePolicies",
            "compliancePolicies",
            step,
            "compliance",
            value,
          ),
        ];
      case "App Protection Policies":
        return [
          make(
            "appProtectionPolicies",
            "appProtectionPolicies",
            step,
            "app-protection",
            value,
          ),
        ];
      case "Security Baselines":
        return [
          make(
            "securityBaselines",
            "securityBaselines",
            step,
            "security",
            value,
          ),
        ];
      case "Scripts":
        return [
          make(
            "windowsScripts",
            "scripts",
            "Windows PowerShell scripts",
            "script-win",
            value?.windows,
          ),
          make(
            "macOSScripts",
            "scripts",
            "macOS shell scripts",
            "script-mac",
            value?.macOS,
          ),
        ];
      case "App Configurations":
        return [
          make("appConfigurations", "appConfigurations", step, "app", value),
        ];
      case "Windows Update Policies":
        return [
          make(
            "windowsUpdatePolicies",
            "windowsUpdatePolicies",
            "Windows update rings",
            "update",
            value,
          ),
        ];
      case "Enrollment Configurations":
        return [
          make(
            "enrollmentConfigurations",
            "enrollmentConfigurations",
            step,
            "enrollment",
            value,
          ),
        ];
      case "Conditional Access Policies":
        return [
          make(
            "conditionalAccessPolicies",
            "conditionalAccessPolicies",
            step,
            "ca",
            value,
          ),
        ];
      default:
        return [];
    }
  }

  private withCompletionEvent<T>(
    step: string,
    promise: Promise<T>,
  ): Promise<T> {
    return promise.then(
      (value) => {
        this.progressSectionsFor(step, value).forEach((section) =>
          this.progressCallback?.({ step, type: "section", section }),
        );
        this.progressCallback?.({ step, type: "completed" });
        return value;
      },
      (error: any) => {
        this.progressCallback?.({
          step,
          type: "error",
          message: error?.message || "Fetch failed",
        });
        throw error;
      },
    );
  }

  async getAllDetailedConfigurations(includeConditionalAccess = true) {
    const collectionStartedAt = new Date().toISOString();
    console.log("Fetching all detailed Intune configurations...");
    this.permissionErrors = []; // Reset permission errors
    this.fetchErrors = []; // Reset fetch errors

    // Use Promise.allSettled instead of Promise.all to prevent one failure from breaking everything
    const results = await Promise.allSettled([
      this.withCompletionEvent(
        "Settings Catalog",
        this.getConfigurationPoliciesWithSettings(),
      ),
      this.withCompletionEvent(
        "Device Configurations",
        this.getDeviceConfigurationsDetailed(),
      ),
      this.withCompletionEvent(
        "Administrative Templates",
        this.getGroupPolicyConfigurationsDetailed(),
      ),
      this.withCompletionEvent(
        "Compliance Policies",
        this.getCompliancePoliciesDetailed(),
      ),
      this.withCompletionEvent(
        "App Protection Policies",
        this.getAppProtectionPoliciesDetailed(),
      ),
      this.withCompletionEvent(
        "Security Baselines",
        this.getSecurityBaselinesDetailed(),
      ),
      this.withCompletionEvent("Scripts", this.getScriptsDetailed()),
      this.withCompletionEvent(
        "App Configurations",
        this.getAppConfigurationsDetailed(),
      ),
      this.withCompletionEvent(
        "Windows Update Policies",
        this.getWindowsUpdatePoliciesDetailed(),
      ),
      this.withCompletionEvent(
        "Enrollment Configurations",
        this.getEnrollmentConfigurationsDetailed(),
      ),
      this.withCompletionEvent(
        "Conditional Access Policies",
        includeConditionalAccess
          ? this.getConditionalAccessPoliciesDetailed()
          : Promise.resolve([]),
      ),
      this.withCompletionEvent(
        "Additional Intune coverage",
        this.getAdditionalConfigurationSections(),
      ),
    ]);

    // Extract results and track failures
    const policyTypes = [
      "Settings Catalog",
      "Device Configurations",
      "Administrative Templates",
      "Compliance Policies",
      "App Protection Policies",
      "Security Baselines",
      "Scripts",
      "App Configurations",
      "Windows Update Policies",
      "Enrollment Configurations",
      "Conditional Access Policies",
      "Additional Intune coverage",
    ];

    const settingsCatalog =
      results[0].status === "fulfilled" ? results[0].value : [];
    const deviceConfigurations =
      results[1].status === "fulfilled" ? results[1].value : [];
    const administrativeTemplates =
      results[2].status === "fulfilled" ? results[2].value : [];
    const compliancePolicies =
      results[3].status === "fulfilled" ? results[3].value : [];
    const appProtectionPolicies =
      results[4].status === "fulfilled" ? results[4].value : [];
    const securityBaselines =
      results[5].status === "fulfilled" ? results[5].value : [];
    const scripts =
      results[6].status === "fulfilled"
        ? results[6].value
        : { windows: [], macOS: [] };
    const appConfigurations =
      results[7].status === "fulfilled" ? results[7].value : [];
    const windowsUpdatePolicies =
      results[8].status === "fulfilled" ? results[8].value : [];
    const enrollmentConfigurations =
      results[9].status === "fulfilled" ? results[9].value : [];
    const conditionalAccessPolicies =
      results[10].status === "fulfilled" ? results[10].value : [];
    const additionalSections =
      results[11].status === "fulfilled" ? results[11].value : [];

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const policyType = policyTypes[index] || "Unknown Policy Type";
        console.error(`Failed to fetch ${policyType}:`, result.reason);

        // Track as a fetch error
        this.fetchErrors.push({
          policyId: "N/A",
          policyName: policyType,
          policyType: policyType,
          familyKey: FETCH_ERROR_FAMILY_KEYS[policyType],
          error:
            result.reason?.message || "Unknown error during policy type fetch",
          errorCode: result.reason?.code,
          statusCode: result.reason?.statusCode,
        });
      }
    });

    // Log summary of what was fetched
    const successfulTypes = results.filter(
      (r) => r.status === "fulfilled",
    ).length;
    const failedTypes = results.filter((r) => r.status === "rejected").length;
    console.log(
      `Successfully fetched ${successfulTypes}/${results.length} policy types. Failed: ${failedTypes}`,
    );

    const safeSettingsCatalog = sanitizeGraphData(
      settingsCatalog,
    ) as DetailedConfiguration[];
    const safeDeviceConfigurations = sanitizeGraphData(
      deviceConfigurations,
    ) as DetailedConfiguration[];
    const safeAdministrativeTemplates = sanitizeGraphData(
      administrativeTemplates,
    ) as DetailedConfiguration[];
    const safeCompliancePolicies = sanitizeGraphData(
      compliancePolicies,
    ) as DetailedConfiguration[];
    const safeAppProtectionPolicies = sanitizeGraphData(
      appProtectionPolicies,
    ) as DetailedConfiguration[];
    const safeSecurityBaselines = sanitizeGraphData(
      securityBaselines,
    ) as DetailedConfiguration[];
    const safeScripts = sanitizeGraphData(scripts) as typeof scripts;
    const safeAppConfigurations = sanitizeGraphData(
      appConfigurations,
    ) as DetailedConfiguration[];
    const safeWindowsUpdatePolicies = sanitizeGraphData(
      windowsUpdatePolicies,
    ) as DetailedConfiguration[];
    const safeEnrollmentConfigurations = sanitizeGraphData(
      enrollmentConfigurations,
    ) as DetailedConfiguration[];
    const safeConditionalAccessPolicies = sanitizeGraphData(
      conditionalAccessPolicies,
    ) as DetailedConfiguration[];

    const sections: ConfigurationSectionData[] = [
      {
        key: "settingsCatalog",
        familyKey: "settingsCatalog",
        label: "Settings Catalog",
        selectionPrefix: "catalog",
        items: safeSettingsCatalog,
      },
      {
        key: "deviceConfigurations",
        familyKey: "deviceConfigurations",
        label: "Device configurations (templates)",
        selectionPrefix: "device",
        items: safeDeviceConfigurations,
      },
      {
        key: "administrativeTemplates",
        familyKey: "administrativeTemplates",
        label: "Administrative Templates",
        selectionPrefix: "admx",
        items: safeAdministrativeTemplates,
      },
      {
        key: "securityBaselines",
        familyKey: "securityBaselines",
        label: "Security baselines & Endpoint Security",
        selectionPrefix: "security",
        items: safeSecurityBaselines,
      },
      {
        key: "compliancePolicies",
        familyKey: "compliancePolicies",
        label: "Compliance policies",
        selectionPrefix: "compliance",
        items: safeCompliancePolicies,
      },
      {
        key: "appProtectionPolicies",
        familyKey: "appProtectionPolicies",
        label: "App protection policies",
        selectionPrefix: "app-protection",
        items: safeAppProtectionPolicies,
      },
      {
        key: "windowsScripts",
        familyKey: "scripts",
        label: "Windows PowerShell scripts",
        selectionPrefix: "script-win",
        items: safeScripts.windows,
      },
      {
        key: "macOSScripts",
        familyKey: "scripts",
        label: "macOS shell scripts",
        selectionPrefix: "script-mac",
        items: safeScripts.macOS,
      },
      {
        key: "appConfigurations",
        familyKey: "appConfigurations",
        label: "App configuration policies",
        selectionPrefix: "app",
        items: safeAppConfigurations,
      },
      {
        key: "windowsUpdatePolicies",
        familyKey: "windowsUpdatePolicies",
        label: "Windows update rings",
        selectionPrefix: "update",
        items: safeWindowsUpdatePolicies,
      },
      {
        key: "enrollmentConfigurations",
        familyKey: "enrollmentConfigurations",
        label: "Enrollment configurations",
        selectionPrefix: "enrollment",
        items: safeEnrollmentConfigurations,
      },
      {
        key: "conditionalAccessPolicies",
        familyKey: "conditionalAccessPolicies",
        label: "Conditional Access policies",
        selectionPrefix: "ca",
        items: safeConditionalAccessPolicies,
      },
      ...additionalSections,
    ];

    additionalSections.forEach((section) => {
      if (section.error) {
        this.fetchErrors.push({
          policyId: section.key,
          policyName: section.label,
          policyType: section.familyKey,
          familyKey: section.familyKey,
          error: section.error.message,
          errorCode: section.error.errorCode,
          statusCode: section.error.statusCode,
          endpoint: section.endpoint,
          permissionHint: section.permissionHint,
          partial: section.error.partial,
        });
      }
    });

    const byType = sections.reduce<Record<string, number>>(
      (counts, section) => {
        counts[section.familyKey] =
          (counts[section.familyKey] || 0) + section.items.length;
        return counts;
      },
      {},
    );

    return {
      collectedAt: new Date().toISOString(),
      collectionStartedAt,
      collectionSkippedFamilies: includeConditionalAccess
        ? []
        : ["conditionalAccessPolicies"],
      settingsCatalog: safeSettingsCatalog,
      deviceConfigurations: safeDeviceConfigurations,
      administrativeTemplates: safeAdministrativeTemplates,
      compliancePolicies: safeCompliancePolicies,
      appProtectionPolicies: safeAppProtectionPolicies,
      securityBaselines: safeSecurityBaselines,
      scripts: safeScripts,
      appConfigurations: safeAppConfigurations,
      windowsUpdatePolicies: safeWindowsUpdatePolicies,
      enrollmentConfigurations: safeEnrollmentConfigurations,
      conditionalAccessPolicies: safeConditionalAccessPolicies,
      sections,
      permissionErrors: this.permissionErrors,
      fetchErrors: this.fetchErrors,
      summary: {
        totalConfigurations: sections.reduce(
          (total, section) => total + section.items.length,
          0,
        ),
        byType,
      },
    };
  }
}

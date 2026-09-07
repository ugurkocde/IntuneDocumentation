import { createGraphLimiter, retryGraphRequest } from "./graph-request";
import { Client, RetryHandlerOptions } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import {
  collectAllPages,
  collectAllPagesWithStatus,
  GraphPaginationError,
} from "./graph-paging";

export function createGraphClient(
  accessToken: string,
  options: { signal?: AbortSignal; budgetMs?: number } = {},
) {
  const signals = [
    options.signal,
    options.budgetMs ? AbortSignal.timeout(options.budgetMs) : undefined,
  ].filter((signal): signal is AbortSignal => !!signal);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const client = Client.init({
    defaultVersion: "beta",
    authProvider: (done) => done(null, accessToken),
  });
  const run = createGraphLimiter(6);
  const api = client.api.bind(client);
  client.api = (path: string) => {
    const request = api(path);
    request.middlewareOptions([new RetryHandlerOptions(0, 0)]);
    if (signal) request.option("signal", signal);
    const get = request.get.bind(request);
    request.get = ((...args: Parameters<typeof get>) =>
      run(
        () => retryGraphRequest(() => get(...args), { signal }),
        signal,
      )) as typeof request.get;
    const post = request.post.bind(request);
    request.post = ((...args: Parameters<typeof post>) => {
      const body = args[0];
      const readOnlyBatch =
        path === "/$batch" &&
        Array.isArray(body?.requests) &&
        body.requests.length > 0 &&
        body.requests.every((item: any) => item?.method === "GET");
      return run(
        () =>
          readOnlyBatch
            ? retryGraphRequest(() => post(...args), { signal })
            : post(...args),
        signal,
      );
    }) as typeof request.post;
    return request;
  };
  return client;
}

export interface DeviceConfiguration {
  id: string;
  displayName: string;
  description?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  version: number;
  "@odata.type": string;
  [key: string]: any;
}

export interface CompliancePolicy {
  id: string;
  displayName: string;
  description?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  version: number;
  "@odata.type": string;
  [key: string]: any;
}

export interface AppProtectionPolicy {
  id: string;
  displayName: string;
  description?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  version: number;
  "@odata.type": string;
  [key: string]: any;
}

export interface ConditionalAccessPolicy {
  id: string;
  displayName: string;
  state: string;
  createdDateTime?: string;
  modifiedDateTime?: string;
  conditions?: any;
  grantControls?: any;
  sessionControls?: any;
}

export interface EnrollmentRestriction {
  id: string;
  displayName: string;
  description?: string;
  priority: number;
  createdDateTime: string;
  lastModifiedDateTime: string;
  version: number;
  platformType?: string;
  platformRestriction?: any;
}

export class IntuneService {
  private collectionErrors: Array<{
    source: string;
    message: string;
    statusCode?: number;
  }> = [];
  getFetchErrors() {
    return [...this.collectionErrors];
  }
  private captureError(error: any) {
    this.collectionErrors.push({
      source: "Legacy Graph collection",
      message: error?.message ?? "Graph read failed",
      statusCode: error?.statusCode ?? error?.cause?.statusCode,
    });
  }

  private client: ReturnType<typeof createGraphClient>;

  constructor(accessToken: string) {
    this.client = createGraphClient(accessToken);
  }

  async getDeviceConfigurations(): Promise<DeviceConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceConfigurations")
        .select(
          "id,displayName,description,createdDateTime,lastModifiedDateTime,version",
        )
        .top(999)
        .get();
      return await collectAllPages<DeviceConfiguration>(
        this.client as unknown as Client,
        response,
      );
    } catch (error) {
      this.captureError(error);
      console.error("Error fetching device configurations:", error);
      return error instanceof GraphPaginationError ? error.items : [];
    }
  }

  async getDeviceConfigurationDetails(
    id: string,
  ): Promise<DeviceConfiguration | null> {
    try {
      const config = await this.client
        .api(`/deviceManagement/deviceConfigurations/${id}`)
        .get();
      return config;
    } catch (error) {
      this.captureError(error);
      console.error(`Error fetching configuration ${id}:`, error);
      return null;
    }
  }

  async getCompliancePolicies(): Promise<CompliancePolicy[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceCompliancePolicies")
        .select(
          "id,displayName,description,createdDateTime,lastModifiedDateTime,version",
        )
        .top(999)
        .get();
      return await collectAllPages<CompliancePolicy>(
        this.client as unknown as Client,
        response,
      );
    } catch (error) {
      this.captureError(error);
      console.error("Error fetching compliance policies:", error);
      return error instanceof GraphPaginationError ? error.items : [];
    }
  }

  async getCompliancePolicyDetails(
    id: string,
  ): Promise<CompliancePolicy | null> {
    try {
      const policy = await this.client
        .api(`/deviceManagement/deviceCompliancePolicies/${id}`)
        .get();
      return policy;
    } catch (error) {
      this.captureError(error);
      console.error(`Error fetching compliance policy ${id}:`, error);
      return null;
    }
  }

  async getAppProtectionPolicies(): Promise<AppProtectionPolicy[]> {
    try {
      const [iosFirst, androidFirst] = await Promise.all([
        this.client
          .api("/deviceAppManagement/iosManagedAppProtections")
          .select(
            "id,displayName,description,createdDateTime,lastModifiedDateTime,version",
          )
          .top(999)
          .get()
          .catch((error) => {
            this.captureError(error);
            return { value: [] };
          }),
        this.client
          .api("/deviceAppManagement/androidManagedAppProtections")
          .select(
            "id,displayName,description,createdDateTime,lastModifiedDateTime,version",
          )
          .top(999)
          .get()
          .catch((error) => {
            this.captureError(error);
            return { value: [] };
          }),
      ]);
      const platforms = await Promise.all(
        [iosFirst, androidFirst].map(async (response) => {
          const pages = await collectAllPagesWithStatus<AppProtectionPolicy>(
            this.client as unknown as Client,
            response,
          );
          if (!pages.complete)
            this.captureError(
              new GraphPaginationError(pages.items, pages.error),
            );
          return pages.items;
        }),
      );
      return platforms.flat();
    } catch (error) {
      this.captureError(error);
      console.error("Error fetching app protection policies:", error);
      return error instanceof GraphPaginationError ? error.items : [];
    }
  }

  async getConditionalAccessPolicies(): Promise<ConditionalAccessPolicy[]> {
    try {
      const response = await this.client
        .api("/identity/conditionalAccess/policies")
        .top(999)
        .get();
      return await collectAllPages<ConditionalAccessPolicy>(
        this.client as unknown as Client,
        response,
      );
    } catch (error: any) {
      this.captureError(error);
      // Conditional Access requires additional permissions that may not be granted
      if (error?.statusCode === 403) {
        console.log(
          "Conditional Access policies skipped - insufficient permissions",
        );
      } else {
        console.error("Error fetching conditional access policies:", error);
      }
      return error instanceof GraphPaginationError ? error.items : [];
    }
  }

  async getEnrollmentRestrictions(): Promise<EnrollmentRestriction[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceEnrollmentConfigurations")
        .select(
          "id,displayName,description,priority,createdDateTime,lastModifiedDateTime,version",
        )
        .top(999)
        .get();
      return await collectAllPages<EnrollmentRestriction>(
        this.client as unknown as Client,
        response,
      );
    } catch (error) {
      this.captureError(error);
      console.error("Error fetching enrollment restrictions:", error);
      return error instanceof GraphPaginationError ? error.items : [];
    }
  }

  async getAllConfigurations() {
    const [
      deviceConfigurations,
      compliancePolicies,
      appProtectionPolicies,
      conditionalAccessPolicies,
      enrollmentRestrictions,
    ] = await Promise.all([
      this.getDeviceConfigurations(),
      this.getCompliancePolicies(),
      this.getAppProtectionPolicies(),
      this.getConditionalAccessPolicies(),
      this.getEnrollmentRestrictions(),
    ]);

    // Fetch detailed information for each configuration
    const deviceConfigDetails = await Promise.all(
      deviceConfigurations.map((config) =>
        this.getDeviceConfigurationDetails(config.id),
      ),
    );

    const compliancePolicyDetails = await Promise.all(
      compliancePolicies.map((policy) =>
        this.getCompliancePolicyDetails(policy.id),
      ),
    );

    return {
      fetchErrors: this.getFetchErrors(),
      collectionStatus: this.collectionErrors.length
        ? "incomplete"
        : "complete",
      deviceConfigurations: deviceConfigDetails.filter(Boolean),
      compliancePolicies: compliancePolicyDetails.filter(Boolean),
      appProtectionPolicies,
      conditionalAccessPolicies,
      enrollmentRestrictions,
    };
  }
}

import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";

export function createGraphClient(accessToken: string) {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
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
  private client: ReturnType<typeof createGraphClient>;

  constructor(accessToken: string) {
    this.client = createGraphClient(accessToken);
  }

  async getDeviceConfigurations(): Promise<DeviceConfiguration[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceConfigurations")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,version")
        .top(999)
        .get();
      return response.value || [];
    } catch (error) {
      console.error("Error fetching device configurations:", error);
      return [];
    }
  }

  async getDeviceConfigurationDetails(id: string): Promise<DeviceConfiguration | null> {
    try {
      const config = await this.client
        .api(`/deviceManagement/deviceConfigurations/${id}`)
        .get();
      return config;
    } catch (error) {
      console.error(`Error fetching configuration ${id}:`, error);
      return null;
    }
  }

  async getCompliancePolicies(): Promise<CompliancePolicy[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceCompliancePolicies")
        .select("id,displayName,description,createdDateTime,lastModifiedDateTime,version")
        .top(999)
        .get();
      return response.value || [];
    } catch (error) {
      console.error("Error fetching compliance policies:", error);
      return [];
    }
  }

  async getCompliancePolicyDetails(id: string): Promise<CompliancePolicy | null> {
    try {
      const policy = await this.client
        .api(`/deviceManagement/deviceCompliancePolicies/${id}`)
        .get();
      return policy;
    } catch (error) {
      console.error(`Error fetching compliance policy ${id}:`, error);
      return null;
    }
  }

  async getAppProtectionPolicies(): Promise<AppProtectionPolicy[]> {
    try {
      const [iosPolicies, androidPolicies] = await Promise.all([
        this.client
          .api("/deviceAppManagement/iosManagedAppProtections")
          .select("id,displayName,description,createdDateTime,lastModifiedDateTime,version")
          .top(999)
          .get()
          .catch(() => ({ value: [] })),
        this.client
          .api("/deviceAppManagement/androidManagedAppProtections")
          .select("id,displayName,description,createdDateTime,lastModifiedDateTime,version")
          .top(999)
          .get()
          .catch(() => ({ value: [] })),
      ]);
      return [...(iosPolicies.value || []), ...(androidPolicies.value || [])];
    } catch (error) {
      console.error("Error fetching app protection policies:", error);
      return [];
    }
  }

  async getConditionalAccessPolicies(): Promise<ConditionalAccessPolicy[]> {
    try {
      const response = await this.client
        .api("/identity/conditionalAccess/policies")
        .top(999)
        .get();
      return response.value || [];
    } catch (error: any) {
      // Conditional Access requires additional permissions that may not be granted
      if (error?.statusCode === 403) {
        console.log("Conditional Access policies skipped - insufficient permissions");
      } else {
        console.error("Error fetching conditional access policies:", error);
      }
      return [];
    }
  }

  async getEnrollmentRestrictions(): Promise<EnrollmentRestriction[]> {
    try {
      const response = await this.client
        .api("/deviceManagement/deviceEnrollmentConfigurations")
        .select("id,displayName,description,priority,createdDateTime,lastModifiedDateTime,version")
        .top(999)
        .get();
      return response.value || [];
    } catch (error) {
      console.error("Error fetching enrollment restrictions:", error);
      return [];
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
      deviceConfigurations.map((config) => this.getDeviceConfigurationDetails(config.id))
    );

    const compliancePolicyDetails = await Promise.all(
      compliancePolicies.map((policy) => this.getCompliancePolicyDetails(policy.id))
    );

    return {
      deviceConfigurations: deviceConfigDetails.filter(Boolean),
      compliancePolicies: compliancePolicyDetails.filter(Boolean),
      appProtectionPolicies,
      conditionalAccessPolicies,
      enrollmentRestrictions,
    };
  }
}
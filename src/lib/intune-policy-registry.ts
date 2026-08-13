export type AdditionalConfigurationFamily =
  | "windowsUpdateProfiles"
  | "scriptsAndRemediations"
  | "enrollmentAndProvisioning"
  | "applications"
  | "assignmentAndRbac"
  | "tenantAndService"
  | "connectors"
  | "specialistPolicies";

export interface IntuneRegistryEntry {
  key: string;
  label: string;
  family: AdditionalConfigurationFamily;
  path: string;
  permissionHint: string;
  shape?: "collection" | "singleton";
  select?: string[];
  notConfiguredOn404?: boolean;
  legacy?: boolean;
  sensitiveFields?: string[];
  childCollections?: Array<{
    property: string;
    path: string;
    shape?: "collection" | "singleton";
    expand?: string;
  }>;
}

export const ADDITIONAL_FAMILY_LABELS: Record<
  AdditionalConfigurationFamily,
  string
> = {
  windowsUpdateProfiles: "Windows update profiles",
  scriptsAndRemediations: "Scripts & remediation",
  enrollmentAndProvisioning: "Enrollment & provisioning",
  applications: "Applications",
  assignmentAndRbac: "Assignment & RBAC",
  tenantAndService: "Tenant & service",
  connectors: "Connectors",
  specialistPolicies: "Specialist policies",
};

export const INTUNE_POLICY_REGISTRY: IntuneRegistryEntry[] = [
  {
    key: "windowsFeatureUpdateProfiles",
    label: "Feature update profiles",
    family: "windowsUpdateProfiles",
    path: "/deviceManagement/windowsFeatureUpdateProfiles",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "windowsQualityUpdateProfiles",
    label: "Quality update profiles",
    family: "windowsUpdateProfiles",
    path: "/deviceManagement/windowsQualityUpdateProfiles",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "windowsQualityUpdatePolicies",
    label: "Expedite quality update policies",
    family: "windowsUpdateProfiles",
    path: "/deviceManagement/windowsQualityUpdatePolicies",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "windowsDriverUpdateProfiles",
    label: "Driver update profiles",
    family: "windowsUpdateProfiles",
    path: "/deviceManagement/windowsDriverUpdateProfiles",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "deviceHealthScripts",
    label: "Remediations",
    family: "scriptsAndRemediations",
    path: "/deviceManagement/deviceHealthScripts",
    permissionHint: "DeviceManagementScripts.Read.All",
    childCollections: [{ property: "assignments", path: "assignments" }],
  },
  {
    key: "deviceComplianceScripts",
    label: "Compliance scripts",
    family: "scriptsAndRemediations",
    path: "/deviceManagement/deviceComplianceScripts",
    permissionHint: "DeviceManagementScripts.Read.All",
  },
  {
    key: "deviceCustomAttributeShellScripts",
    label: "macOS custom attributes",
    family: "scriptsAndRemediations",
    path: "/deviceManagement/deviceCustomAttributeShellScripts",
    permissionHint: "DeviceManagementScripts.Read.All",
  },
  {
    key: "windowsAutopilotDeploymentProfiles",
    label: "Windows Autopilot deployment profiles",
    family: "enrollmentAndProvisioning",
    path: "/deviceManagement/windowsAutopilotDeploymentProfiles",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
    childCollections: [{ property: "assignments", path: "assignments" }],
  },
  {
    key: "androidDeviceOwnerEnrollmentProfiles",
    label: "Android device-owner profiles",
    family: "enrollmentAndProvisioning",
    path: "/deviceManagement/androidDeviceOwnerEnrollmentProfiles",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
  },
  {
    key: "appleUserInitiatedEnrollmentProfiles",
    label: "Apple user-initiated profiles",
    family: "enrollmentAndProvisioning",
    path: "/deviceManagement/appleUserInitiatedEnrollmentProfiles",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
  },
  {
    key: "depOnboardingSettings",
    label: "Apple ADE tokens",
    family: "enrollmentAndProvisioning",
    path: "/deviceManagement/depOnboardingSettings",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
  },
  {
    key: "mobileApps",
    label: "Mobile apps",
    family: "applications",
    path: "/deviceAppManagement/mobileApps",
    permissionHint: "DeviceManagementApps.Read.All",
    select: [
      "id",
      "@odata.type",
      "displayName",
      "description",
      "publisher",
      "createdDateTime",
      "lastModifiedDateTime",
      "isAssigned",
      "owner",
      "developer",
      "notes",
      "uploadState",
      "publishingState",
      "dependentAppCount",
      "supersedingAppCount",
      "supersededAppCount",
    ],
  },
  {
    key: "targetedManagedAppConfigurations",
    label: "Targeted managed-app configurations",
    family: "applications",
    path: "/deviceAppManagement/targetedManagedAppConfigurations",
    permissionHint: "DeviceManagementApps.Read.All",
    childCollections: [
      { property: "assignments", path: "assignments" },
      { property: "apps", path: "apps" },
    ],
  },
  {
    key: "defaultManagedAppProtections",
    label: "Default managed-app protections",
    family: "applications",
    path: "/deviceAppManagement/defaultManagedAppProtections",
    permissionHint: "DeviceManagementApps.Read.All",
  },
  {
    key: "mdmWindowsInformationProtectionPolicies",
    label: "MDM Windows Information Protection (legacy)",
    family: "applications",
    path: "/deviceAppManagement/mdmWindowsInformationProtectionPolicies",
    permissionHint: "DeviceManagementApps.Read.All",
    legacy: true,
    notConfiguredOn404: true,
  },
  {
    key: "windowsInformationProtectionPolicies",
    label: "Windows Information Protection (legacy)",
    family: "applications",
    path: "/deviceAppManagement/windowsInformationProtectionPolicies",
    permissionHint: "DeviceManagementApps.Read.All",
    legacy: true,
    notConfiguredOn404: true,
  },
  {
    key: "iosLobAppProvisioningConfigurations",
    label: "iOS LOB provisioning profiles",
    family: "applications",
    path: "/deviceAppManagement/iosLobAppProvisioningConfigurations",
    permissionHint: "DeviceManagementApps.Read.All",
  },
  {
    key: "assignmentFilters",
    label: "Assignment filters",
    family: "assignmentAndRbac",
    path: "/deviceManagement/assignmentFilters",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "reusablePolicySettings",
    label: "Reusable policy settings",
    family: "assignmentAndRbac",
    path: "/deviceManagement/reusablePolicySettings",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "roleScopeTags",
    label: "Scope tags",
    family: "assignmentAndRbac",
    path: "/deviceManagement/roleScopeTags",
    permissionHint: "DeviceManagementRBAC.Read.All",
  },
  {
    key: "roleDefinitions",
    label: "Role definitions",
    family: "assignmentAndRbac",
    path: "/deviceManagement/roleDefinitions",
    permissionHint: "DeviceManagementRBAC.Read.All",
  },
  {
    key: "roleAssignments",
    label: "Role assignments",
    family: "assignmentAndRbac",
    path: "/deviceManagement/roleAssignments",
    permissionHint: "DeviceManagementRBAC.Read.All",
  },
  {
    key: "deviceManagementSettings",
    label: "Intune tenant settings",
    family: "tenantAndService",
    path: "/deviceManagement/settings",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
    shape: "singleton",
  },
  {
    key: "androidForWorkSettings",
    label: "Android Enterprise settings",
    family: "tenantAndService",
    path: "/deviceManagement/androidForWorkSettings",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
    shape: "singleton",
    notConfiguredOn404: true,
  },
  {
    key: "managedDeviceCleanupRules",
    label: "Managed-device cleanup rules",
    family: "tenantAndService",
    path: "/deviceManagement/managedDeviceCleanupRules",
    permissionHint: "DeviceManagementManagedDevices.Read.All",
  },
  {
    key: "mobileThreatDefenseConnectors",
    label: "Mobile threat-defense connectors",
    family: "connectors",
    path: "/deviceManagement/mobileThreatDefenseConnectors",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
  },
  {
    key: "deviceManagementPartners",
    label: "Device-management partners",
    family: "connectors",
    path: "/deviceManagement/deviceManagementPartners",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
  },
  {
    key: "remoteAssistancePartners",
    label: "Remote-assistance partners",
    family: "connectors",
    path: "/deviceManagement/remoteAssistancePartners",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
  },
  {
    key: "vppTokens",
    label: "Apple VPP tokens",
    family: "connectors",
    path: "/deviceAppManagement/vppTokens",
    permissionHint: "DeviceManagementApps.Read.All",
    sensitiveFields: ["token"],
  },
  {
    key: "policySets",
    label: "Policy sets",
    family: "specialistPolicies",
    path: "/deviceAppManagement/policySets",
    permissionHint: "DeviceManagementApps.Read.All",
    childCollections: [{ property: "items", path: "items" }],
  },
  {
    key: "notificationMessageTemplates",
    label: "Notification templates",
    family: "specialistPolicies",
    path: "/deviceManagement/notificationMessageTemplates",
    permissionHint: "DeviceManagementConfiguration.Read.All",
    childCollections: [
      {
        property: "localizedNotificationMessages",
        path: "localizedNotificationMessages",
      },
    ],
  },
  {
    key: "termsAndConditions",
    label: "Terms and conditions",
    family: "specialistPolicies",
    path: "/deviceManagement/termsAndConditions",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "microsoftTunnelConfigurations",
    label: "Microsoft Tunnel configurations",
    family: "specialistPolicies",
    path: "/deviceManagement/microsoftTunnelConfigurations",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "microsoftTunnelSites",
    label: "Microsoft Tunnel sites",
    family: "specialistPolicies",
    path: "/deviceManagement/microsoftTunnelSites",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "hardwareConfigurations",
    label: "Hardware configurations",
    family: "specialistPolicies",
    path: "/deviceManagement/hardwareConfigurations",
    permissionHint: "DeviceManagementConfiguration.Read.All",
  },
  {
    key: "remoteAssistanceSettings",
    label: "Remote Assistance settings",
    family: "specialistPolicies",
    path: "/deviceManagement/remoteAssistanceSettings",
    permissionHint: "DeviceManagementServiceConfig.Read.All",
    shape: "singleton",
    notConfiguredOn404: true,
  },
];

const REDACTED_FIELDS = new Set([
  "apptoken",
  "configurationfilecontent",
  "customattributescript",
  "detectionscriptcontent",
  "encodedsettingxml",
  "hardwareconfigurationfilecontent",
  "largeicon",
  "password",
  "payload",
  "privatekey",
  "qrcodecontent",
  "qrcodeimage",
  "remediationscriptcontent",
  "scriptcontent",
  "secret",
  "tokenvalue",
]);

export const REDACTED_VALUE = "[Redacted]";

const SENSITIVE_FIELD_PATTERN =
  /(apikey|password|secret|token|privatekey|presharedkey|credential|qrcodecontent|qrcodeimage|scriptcontent|configurationfilecontent|encodedsettingxml|largeicon|payload(?:json)?)$/i;

const SENSITIVE_OMA_URI_PATTERN =
  /(?:^|[/_.-])(apikey|password(?:value)?|secret|token(?:value)?|privatekey|presharedkey|credential)(?:$|[/_.-])/i;

const SENSITIVE_OMA_LABEL_PATTERN =
  /(api key|password value|shared secret|token value|private key|pre[- ]shared key|credential value)/i;

export function sanitizeGraphData(
  value: unknown,
  additionalSensitiveFields: string[] = [],
): unknown {
  const sensitiveFields = new Set([
    ...REDACTED_FIELDS,
    ...additionalSensitiveFields.map((field) => field.toLowerCase()),
  ]);

  const visit = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map((item) => visit(item));
    if (!current || typeof current !== "object") return current;

    const record = current as Record<string, unknown>;
    const sensitiveOmaValue =
      (typeof record.omaUri === "string" &&
        SENSITIVE_OMA_URI_PATTERN.test(record.omaUri)) ||
      [record.displayName, record.name].some(
        (hint) =>
          typeof hint === "string" && SENSITIVE_OMA_LABEL_PATTERN.test(hint),
      ) ||
      (typeof record.settingDefinitionId === "string" &&
        SENSITIVE_OMA_URI_PATTERN.test(record.settingDefinitionId));

    return Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => !["@odata.context", "@odata.nextLink"].includes(key))
        .map(([key, nested]) => [
          key,
          sensitiveFields.has(key.toLowerCase()) ||
          SENSITIVE_FIELD_PATTERN.test(key) ||
          (sensitiveOmaValue &&
            ["value", "omasettingstringvalue"].includes(key.toLowerCase()))
            ? REDACTED_VALUE
            : visit(nested),
        ]),
    );
  };

  return visit(value);
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      const value = values[index] as T;
      results[index] = await mapper(value, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

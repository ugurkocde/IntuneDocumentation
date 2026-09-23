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
  pageSize?: number;
  select?: string[];
  notConfiguredOn404?: boolean;
  unavailableWhen?: {
    statusCode: number;
    messageIncludes: string;
  };
  legacy?: boolean;
  sensitiveFields?: string[];
  childCollections?: Array<{
    property: string;
    path: string;
    shape?: "collection" | "singleton";
    pageSize?: number;
    expand?: string;
  }>;
}

export const DEFAULT_REGISTRY_PAGE_SIZE = 999;

export function getRegistryPageSize(
  entry: Pick<IntuneRegistryEntry, "pageSize">,
): number {
  return entry.pageSize ?? DEFAULT_REGISTRY_PAGE_SIZE;
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
    childCollections: [{ property: "assignments", path: "assignments" }],
    label: "Feature update profiles",
    family: "windowsUpdateProfiles",
    path: "/deviceManagement/windowsFeatureUpdateProfiles",
    permissionHint: "DeviceManagementConfiguration.Read.All",
    pageSize: 200,
  },
  {
    key: "windowsQualityUpdateProfiles",
    childCollections: [{ property: "assignments", path: "assignments" }],
    label: "Quality update profiles",
    family: "windowsUpdateProfiles",
    path: "/deviceManagement/windowsQualityUpdateProfiles",
    permissionHint: "DeviceManagementConfiguration.Read.All",
    pageSize: 200,
  },
  {
    key: "windowsQualityUpdatePolicies",
    childCollections: [{ property: "assignments", path: "assignments" }],
    label: "Expedite quality update policies",
    family: "windowsUpdateProfiles",
    path: "/deviceManagement/windowsQualityUpdatePolicies",
    permissionHint: "DeviceManagementConfiguration.Read.All",
    pageSize: 200,
  },
  {
    key: "windowsDriverUpdateProfiles",
    childCollections: [{ property: "assignments", path: "assignments" }],
    label: "Driver update profiles",
    family: "windowsUpdateProfiles",
    path: "/deviceManagement/windowsDriverUpdateProfiles",
    permissionHint: "DeviceManagementConfiguration.Read.All",
    pageSize: 200,
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
    childCollections: [{ property: "assignments", path: "assignments" }],
    label: "Compliance scripts",
    family: "scriptsAndRemediations",
    path: "/deviceManagement/deviceComplianceScripts",
    permissionHint: "DeviceManagementScripts.Read.All",
  },
  {
    key: "deviceCustomAttributeShellScripts",
    childCollections: [{ property: "assignments", path: "assignments" }],
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
    childCollections: [{ property: "assignments", path: "assignments" }],
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
    childCollections: [{ property: "assignments", path: "assignments" }],
    label: "Mobile apps",
    family: "applications",
    path: "/deviceAppManagement/mobileApps",
    permissionHint: "DeviceManagementApps.Read.All",
    select: [
      "id",
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
    childCollections: [{ property: "assignments", path: "assignments" }],
    label: "MDM Windows Information Protection (legacy)",
    family: "applications",
    path: "/deviceAppManagement/mdmWindowsInformationProtectionPolicies",
    permissionHint: "DeviceManagementApps.Read.All",
    legacy: true,
    notConfiguredOn404: true,
  },
  // WIP without enrollment was retired. Its windowsInformationProtectionPolicies
  // endpoint can return HTTP 200 with no body instead of a collection. Do not
  // query it or weaken collection validation; MDM WIP above is a separate API.
  // https://techcommunity.microsoft.com/blog/intunecustomersuccess/support-tip-end-of-support-guidance-for-windows-information-protection/3580091
  {
    key: "iosLobAppProvisioningConfigurations",
    childCollections: [{ property: "assignments", path: "assignments" }],
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
    childCollections: [{ property: "assignments", path: "assignments" }],
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
    childCollections: [
      { property: "items", path: "items" },
      { property: "assignments", path: "assignments" },
    ],
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
    childCollections: [{ property: "assignments", path: "assignments" }],
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
    childCollections: [{ property: "assignments", path: "assignments" }],
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
    unavailableWhen: {
      statusCode: 403,
      messageIncludes: "RemoteAssistService",
    },
  },
];

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export function isExpectedRegistryUnavailableError(
  entry: IntuneRegistryEntry,
  error: any,
): boolean {
  if (!entry.unavailableWhen) return false;

  const statusCode = error?.statusCode || error?.response?.status;
  const message = [error?.message, error?.error?.message]
    .map(errorText)
    .join(" ")
    .toLowerCase();

  return (
    statusCode === entry.unavailableWhen.statusCode &&
    message.includes(entry.unavailableWhen.messageIncludes.toLowerCase())
  );
}

const REDACTED_FIELDS = new Set([
  "apptoken",
  "configurationfilecontent",
  "customattributescript",
  "detectionscriptcontent",
  "encodedsettingxml",
  "hardwareconfigurationfilecontent",
  "kioskmodeexitcode",
  "largeicon",
  "password",
  "payload",
  "privatekey",
  "qrcodecontent",
  "qrcodeimage",
  "remediationscriptcontent",
  "scriptcontent",
  "scriptcontentbase64",
  "secret",
  "tokenvalue",
]);

// Property names that hold secrets only on specific Graph types. The same
// names are harmless identifiers elsewhere, such as Store app product keys.
const TYPE_REDACTED_FIELDS: Record<string, Set<string>> = {
  "#microsoft.graph.editionupgradeconfiguration": new Set([
    "license",
    "productkey",
  ]),
};

export const REDACTED_VALUE = "[Redacted]";

const SENSITIVE_FIELD_PATTERN =
  /(apikey|password|secret|token|privatekey|presharedkey|credential|qrcodecontent|qrcodeimage|scriptcontent|configurationfilecontent|encodedsettingxml|largeicon|payload(?:json)?)$/i;

const SENSITIVE_OMA_URI_PATTERN =
  /(?:^|[/_.-])(apikey|password(?:value)?|secret|token(?:value)?|privatekey|presharedkey|credential)(?:$|[/_.-])/i;

const SENSITIVE_OMA_LABEL_PATTERN =
  /(api key|password value|shared secret|token value|private key|pre[- ]shared key|credential value)/i;

// Settings Catalog ids join words without a delimiter, for example
// com.apple.extensiblesso_registrationtoken, so a secret word is also
// matched as the final word of the id.
const SENSITIVE_DEFINITION_ID_SUFFIX_PATTERN =
  /(apikey|password|passphrase|secret|token|privatekey|presharedkey|credential)$/i;

// App configuration keys and custom setting names are identifiers such as
// "apiKey", "api_key" or "ServerToken", matched by suffix without separators.
const SENSITIVE_CONFIG_KEY_PATTERN =
  /(apikey|password|passwd|pwd|passcode|passphrase|secret|token|privatekey|presharedkey|credentials?)$/i;

const SENSITIVE_PRESENTATION_LABEL_PATTERN =
  /(password|passphrase|passcode|shared secret|pre[- ]?shared key|api key|private key)/i;

const SECRET_SETTING_VALUE_TYPE =
  "#microsoft.graph.deviceManagementConfigurationSecretSettingValue";

const PAIR_VALUE_KEYS = new Set([
  "value",
  "values",
  "omasettingstringvalue",
  "appconfigkeyvalue",
]);

const SETTING_VALUE_KEYS = new Set([
  "simplesettingvalue",
  "simplesettingcollectionvalue",
]);

function isSensitiveConfigKey(name: unknown) {
  return (
    typeof name === "string" &&
    SENSITIVE_CONFIG_KEY_PATTERN.test(name.replace(/[^a-z0-9]/gi, ""))
  );
}

// ADMX free text fields labelled as passwords. Dropdowns, numbers and
// check boxes carry no typed secret and stay readable.
function isSensitivePresentationValue(record: Record<string, unknown>) {
  const presentation = record.presentation as
    | Record<string, unknown>
    | undefined;
  return (
    typeof presentation?.label === "string" &&
    SENSITIVE_PRESENTATION_LABEL_PATTERN.test(presentation.label) &&
    presentation["@odata.type"] !==
      "#microsoft.graph.groupPolicyPresentationDropdownList" &&
    (typeof record.value === "string" || Array.isArray(record.values))
  );
}

export function sanitizeGraphData(
  value: unknown,
  additionalSensitiveFields: string[] = [],
): unknown {
  const sensitiveFields = new Set([
    ...REDACTED_FIELDS,
    ...additionalSensitiveFields.map((field) => field.toLowerCase()),
  ]);

  // secretValue marks a Settings Catalog value record whose parent
  // settingInstance names a secret definition id.
  const visit = (current: unknown, secretValue = false): unknown => {
    if (Array.isArray(current))
      return current.map((item) => visit(item, secretValue));
    if (!current || typeof current !== "object") return current;

    const record = current as Record<string, unknown>;
    const sensitiveDefinition =
      typeof record.settingDefinitionId === "string" &&
      (SENSITIVE_OMA_URI_PATTERN.test(record.settingDefinitionId) ||
        SENSITIVE_DEFINITION_ID_SUFFIX_PATTERN.test(
          record.settingDefinitionId,
        ));
    const sensitivePairValue =
      secretValue ||
      sensitiveDefinition ||
      record["@odata.type"] === SECRET_SETTING_VALUE_TYPE ||
      (typeof record.omaUri === "string" &&
        SENSITIVE_OMA_URI_PATTERN.test(record.omaUri)) ||
      [record.displayName, record.name].some(
        (hint) =>
          typeof hint === "string" && SENSITIVE_OMA_LABEL_PATTERN.test(hint),
      ) ||
      isSensitiveConfigKey(record.name) ||
      (isSensitiveConfigKey(record.appConfigKey) &&
        record.appConfigKeyType !== "booleanType") ||
      isSensitivePresentationValue(record);
    const typeFields =
      typeof record["@odata.type"] === "string"
        ? TYPE_REDACTED_FIELDS[record["@odata.type"].toLowerCase()]
        : undefined;

    return Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => !["@odata.context", "@odata.nextLink"].includes(key))
        .map(([key, nested]) => {
          const lowerKey = key.toLowerCase();
          if (
            sensitivePairValue &&
            PAIR_VALUE_KEYS.has(lowerKey) &&
            typeof nested !== "boolean"
          ) {
            return [
              key,
              Array.isArray(nested) ? [REDACTED_VALUE] : REDACTED_VALUE,
            ];
          }
          return [
            key,
            sensitiveFields.has(lowerKey) ||
            typeFields?.has(lowerKey) ||
            SENSITIVE_FIELD_PATTERN.test(key)
              ? REDACTED_VALUE
              : visit(
                  nested,
                  sensitiveDefinition && SETTING_VALUE_KEYS.has(lowerKey),
                ),
          ];
        }),
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

// Sanitized response fragments captured from Microsoft Graph beta. These keep
// the parser contract anchored to real Intune property names without tenant data.
export const appConfigurationFixture = {
  id: "app-config-1",
  displayName: "Managed app settings",
  settings: [
    {
      appConfigKey: "refreshInterval",
      appConfigKeyType: "integerType",
      appConfigKeyValue: "123",
    },
  ],
};

export const enrollmentStatusPageFixture = {
  id: "enrollment-1",
  displayName: "Default ESP",
  showInstallationProgress: true,
  allowDeviceResetOnInstallFailure: true,
  allowLogCollectionOnInstallFailure: true,
  customErrorMessage: "Contact support",
  installProgressTimeoutInMinutes: 60,
  selectedMobileAppIds: ["app-1"],
  installQualityUpdates: true,
};

export const administrativeTemplateFixture = [
  {
    id: "definition-value-1",
    enabled: true,
    definition: {
      displayName: "Configure a policy",
      categoryPath: "Windows Components",
    },
    presentationValues: [
      {
        value: "Configured value",
        presentation: { label: "Policy value" },
      },
    ],
  },
];

export const defenderForEndpointPolicyFixture = {
  id: "defender-policy-1",
  name: "Endpoint antivirus policy",
  description: "Defender-managed endpoint protection settings",
  platforms: "windows10",
  technologies: "mdm,microsoftSense",
  createdDateTime: "2026-01-10T08:00:00Z",
  lastModifiedDateTime: "2026-02-12T09:30:00Z",
  settingCount: 1,
  templateReference: {
    templateId: "endpoint-antivirus-template-1",
    templateFamily: "endpointSecurityAntivirus",
    templateDisplayName: "Microsoft Defender Antivirus exclusions",
    templateDisplayVersion: "Version 1",
  },
  settings: [
    {
      id: "0",
      settingInstance: {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
        settingDefinitionId:
          "device_vendor_msft_policy_config_defender_excludedextensions",
        simpleSettingCollectionValue: [
          {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
            value: ".sample",
          },
        ],
      },
      settingDefinitions: [
        {
          id: "device_vendor_msft_policy_config_defender_excludedextensions",
          displayName: "Excluded file extensions",
          description: "File extensions excluded from antivirus scanning",
        },
      ],
    },
  ],
  assignments: [
    {
      id: "defender-policy-1_assignment-1",
      target: {
        "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
        deviceAndAppManagementAssignmentFilterId: null,
        deviceAndAppManagementAssignmentFilterType: "none",
      },
    },
  ],
};

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

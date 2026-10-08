import type { DetailedExportData } from "../../configuration-analyzer";

// Fictional Contoso demo tenant used to render the public sample evidence
// reports (scripts/build-sample-reports.ts). Every name and identifier is
// synthetic. Object shapes follow Microsoft Graph beta responses as returned
// to the collector in intune-detailed-client.ts: Settings Catalog
// configurationPolicies with settings and assignments, deviceConfigurations,
// deviceCompliancePolicies with scheduledActionsForRule, Windows Update rings,
// iOS app protection and Conditional Access policies.
//
// The posture is deliberately mixed: most mapped capabilities are configured
// and assigned, the pilot update ring is paused (mixed evidence against the
// broad ring), Office macro runtime scanning only covers low-trust documents
// and diagnostic data stays at the Required level (assigned counter-evidence),
// the Windows Firewall, application control and macOS device health policies
// exist but are not assigned yet, and PowerShell logging, AppLocker and
// phishing-resistant MFA enforcement are absent (the CA policy is report-only).

export const CONTOSO_TENANT_LABEL = "Contoso Ltd";

const COLLECTED_AT = "2026-10-08T09:00:00Z";

/** Deterministic, obviously synthetic GUID: 0c0e7050-0000-4000-8000-<n>. */
const guid = (n: number) =>
  `0c0e7050-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const GROUPS = {
  allCorporateDevices: { id: guid(0x901), name: "All Corporate Devices" },
  pilotDevices: { id: guid(0x902), name: "Pilot Devices" },
  financeUsers: { id: guid(0x903), name: "Finance Users" },
  allCorporateUsers: { id: guid(0x904), name: "All Corporate Users" },
  corporateMacs: { id: guid(0x905), name: "Corporate Mac Devices" },
  breakGlass: { id: guid(0x906), name: "Break Glass Accounts" },
  kioskDevices: { id: guid(0x907), name: "Kiosk Devices" },
  corporateMobile: { id: guid(0x908), name: "Corporate Mobile Devices" },
  itAdministrators: { id: guid(0x909), name: "IT Administrators" },
} as const;

type Group = (typeof GROUPS)[keyof typeof GROUPS];

function assignments(
  policyId: string,
  include: readonly Group[],
  exclude: readonly Group[] = [],
) {
  return [
    ...include.map((group) => ({
      id: `${policyId}_${group.id}`,
      source: "direct",
      sourceId: policyId,
      target: {
        "@odata.type": "#microsoft.graph.groupAssignmentTarget",
        deviceAndAppManagementAssignmentFilterId: null,
        deviceAndAppManagementAssignmentFilterType: "none",
        groupId: group.id,
      },
    })),
    ...exclude.map((group) => ({
      id: `${policyId}_${group.id}`,
      source: "direct",
      sourceId: policyId,
      target: {
        "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget",
        deviceAndAppManagementAssignmentFilterId: null,
        deviceAndAppManagementAssignmentFilterType: "none",
        groupId: group.id,
      },
    })),
  ];
}

// Settings Catalog setting instance builders (Graph beta shapes).
type Instance = Record<string, unknown>;

function choice(
  settingDefinitionId: string,
  option: string,
  children: Instance[] = [],
): Instance {
  return {
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
    settingDefinitionId,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    choiceSettingValue: {
      settingValueTemplateReference: null,
      value: `${settingDefinitionId}_${option}`,
      children,
    },
  };
}

function integer(settingDefinitionId: string, value: number): Instance {
  return {
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
    settingDefinitionId,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    simpleSettingValue: {
      "@odata.type":
        "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
      settingValueTemplateReference: null,
      value,
    },
  };
}

function text(settingDefinitionId: string, value: string): Instance {
  return {
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
    settingDefinitionId,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    simpleSettingValue: {
      "@odata.type":
        "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
      settingValueTemplateReference: null,
      value,
    },
  };
}

function groupCollection(
  settingDefinitionId: string,
  children: Instance[],
): Instance {
  return {
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
    settingDefinitionId,
    settingInstanceTemplateReference: null,
    auditRuleInformation: null,
    groupSettingCollectionValue: [
      { settingValueTemplateReference: null, children },
    ],
  };
}

// Setting definitions as Graph returns them from
// configurationPolicies/{id}/settings?$expand=settingDefinitions, trimmed to
// the fields the report reads. Names and option labels were read from
// GET /beta/deviceManagement/configurationSettings/{id} on 2026-10-08.
const SETTING_DEFINITIONS: Record<
  string,
  { displayName: string; options: Record<string, string> }
> = {
  device_vendor_msft_bitlocker_requiredeviceencryption: {
    displayName: "Require Device Encryption",
    options: {
      device_vendor_msft_bitlocker_requiredeviceencryption_0: "Disabled",
      device_vendor_msft_bitlocker_requiredeviceencryption_1: "Enabled",
    },
  },
  device_vendor_msft_policy_config_defender_allowrealtimemonitoring: {
    displayName: "Allow Realtime Monitoring",
    options: {
      device_vendor_msft_policy_config_defender_allowrealtimemonitoring_0:
        "Not allowed. Turns off the real-time monitoring service.",
      device_vendor_msft_policy_config_defender_allowrealtimemonitoring_1:
        "Allowed. Turns on and runs the real-time monitoring service.",
    },
  },
  vendor_msft_firewall_mdmstore_domainprofile_enablefirewall: {
    displayName: "Enable Domain Network Firewall",
    options: {
      vendor_msft_firewall_mdmstore_domainprofile_enablefirewall_false: "False",
      vendor_msft_firewall_mdmstore_domainprofile_enablefirewall_true: "True",
    },
  },
  vendor_msft_firewall_mdmstore_privateprofile_enablefirewall: {
    displayName: "Enable Private Network Firewall",
    options: {
      vendor_msft_firewall_mdmstore_privateprofile_enablefirewall_false:
        "False",
      vendor_msft_firewall_mdmstore_privateprofile_enablefirewall_true: "True",
    },
  },
  vendor_msft_firewall_mdmstore_publicprofile_enablefirewall: {
    displayName: "Enable Public Network Firewall",
    options: {
      vendor_msft_firewall_mdmstore_publicprofile_enablefirewall_false: "False",
      vendor_msft_firewall_mdmstore_publicprofile_enablefirewall_true: "True",
    },
  },
  "com.apple.mcx.filevault2_enable": {
    displayName: "Enable",
    options: {
      "com.apple.mcx.filevault2_enable_0": "On",
      "com.apple.mcx.filevault2_enable_1": "Off",
    },
  },
  "com.apple.mcx.filevault2_forceenableinsetupassistant": {
    displayName: "Force Enable In Setup Assistant",
    options: {
      "com.apple.mcx.filevault2_forceenableinsetupassistant_false": "False",
      "com.apple.mcx.filevault2_forceenableinsetupassistant_true": "True",
    },
  },
};

function definitionIds(instance: unknown, ids = new Set<string>()) {
  if (Array.isArray(instance)) {
    for (const item of instance) definitionIds(item, ids);
  } else if (instance && typeof instance === "object") {
    for (const [key, value] of Object.entries(instance)) {
      if (key === "settingDefinitionId" && typeof value === "string")
        ids.add(value);
      else definitionIds(value, ids);
    }
  }
  return ids;
}

function definitionsFor(instance: Instance) {
  return [...definitionIds(instance)].flatMap((id) => {
    const definition = SETTING_DEFINITIONS[id];
    if (!definition) return [];
    return [
      {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationChoiceSettingDefinition",
        id,
        displayName: definition.displayName,
        options: Object.entries(definition.options).map(
          ([itemId, displayName]) => ({ itemId, displayName }),
        ),
      },
    ];
  });
}

function settingsCatalogPolicy(options: {
  id: string;
  name: string;
  description: string;
  platforms: "windows10" | "macOS";
  technologies: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
  settings: Instance[];
  assignments: unknown[];
}) {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    platforms: options.platforms,
    technologies: options.technologies,
    createdDateTime: options.createdDateTime,
    lastModifiedDateTime: options.lastModifiedDateTime,
    creationSource: null,
    priorityMetaData: null,
    roleScopeTagIds: ["0"],
    settingCount: options.settings.length,
    templateReference: {
      templateId: "",
      templateFamily: "none",
      templateDisplayName: null,
      templateDisplayVersion: null,
    },
    displayName: options.name,
    configType: "Settings Catalog",
    settings: options.settings.map((settingInstance, index) => {
      const settingDefinitions = definitionsFor(settingInstance);
      return {
        id: String(index),
        settingInstance,
        ...(settingDefinitions.length ? { settingDefinitions } : {}),
      };
    }),
    assignments: options.assignments,
    collectionStatus: { assignments: "complete", settings: "complete" },
    hasFetchError: false,
  };
}

const BITLOCKER = "device_vendor_msft_bitlocker";
const DEFENDER = "device_vendor_msft_policy_config_defender";
const ASR = `${DEFENDER}_attacksurfacereductionrules`;
const FIREWALL = "vendor_msft_firewall_mdmstore";
const WORD =
  "user_vendor_msft_policy_config_word16v2~policy~l_microsoftofficeword~l_wordoptions~l_security~l_trustcenter";
const EXCEL =
  "user_vendor_msft_policy_config_excel16v2~policy~l_microsoftofficeexcel~l_exceloptions~l_security~l_trustcenter";
const POWERPOINT =
  "user_vendor_msft_policy_config_ppt16v2~policy~l_microsoftofficepowerpoint~l_powerpointoptions~l_security~l_trustcenter";
const OFFICE =
  "user_vendor_msft_policy_config_office16v2~policy~l_microsoftofficesystem~l_securitysettings";
const EDGE_ADS =
  "device_vendor_msft_policy_config_microsoft_edgev78diff~policy~microsoft_edge_adssettingforintrusiveadssites";
const IE = "device_vendor_msft_policy_config_internetexplorer";

const firewallProfile = (profile: "domain" | "private" | "public") =>
  choice(`${FIREWALL}_${profile}profile_enablefirewall`, "true", [
    choice(`${FIREWALL}_${profile}profile_defaultinboundaction`, "1"),
    choice(`${FIREWALL}_${profile}profile_defaultoutboundaction`, "0"),
    choice(`${FIREWALL}_${profile}profile_disableinboundnotifications`, "true"),
    integer(`${FIREWALL}_${profile}profile_logmaxfilesize`, 16384),
  ]);

const settingsCatalog = [
  settingsCatalogPolicy({
    id: guid(0x101),
    name: "WIN - Baseline - BitLocker",
    description: "OS and fixed drive encryption for corporate Windows devices.",
    platforms: "windows10",
    technologies: "mdm",
    createdDateTime: "2025-11-04T10:12:00Z",
    lastModifiedDateTime: "2026-08-19T14:30:00Z",
    settings: [
      choice(`${BITLOCKER}_requiredeviceencryption`, "1"),
      choice(`${BITLOCKER}_fixeddrivesencryptiontype`, "1", [
        choice(
          `${BITLOCKER}_fixeddrivesencryptiontype_fdvencryptiontypedropdown_name`,
          "2",
        ),
      ]),
    ],
    assignments: assignments(
      guid(0x101),
      [GROUPS.allCorporateDevices],
      [GROUPS.kioskDevices],
    ),
  }),
  settingsCatalogPolicy({
    id: guid(0x102),
    name: "WIN - Defender Antivirus",
    description: "Microsoft Defender Antivirus protection settings.",
    platforms: "windows10",
    technologies: "mdm,microsoftSense",
    createdDateTime: "2025-11-04T10:20:00Z",
    lastModifiedDateTime: "2026-09-02T08:45:00Z",
    settings: [
      choice(`${DEFENDER}_allowrealtimemonitoring`, "1"),
      choice(`${DEFENDER}_allowbehaviormonitoring`, "1"),
      choice(`${DEFENDER}_allowcloudprotection`, "1"),
      choice(`${DEFENDER}_allowioavprotection`, "1"),
      choice(`${DEFENDER}_allowscriptscanning`, "1"),
      choice(`${DEFENDER}_cloudblocklevel`, "2"),
      choice(`${DEFENDER}_enablenetworkprotection`, "1"),
      choice(`${DEFENDER}_puaprotection`, "1"),
      integer(`${DEFENDER}_signatureupdateinterval`, 4),
    ],
    assignments: assignments(guid(0x102), [GROUPS.allCorporateDevices]),
  }),
  settingsCatalogPolicy({
    id: guid(0x103),
    name: "WIN - Attack surface reduction - Block",
    description: "Attack surface reduction rules in block mode.",
    platforms: "windows10",
    technologies: "mdm,microsoftSense",
    createdDateTime: "2026-01-15T09:00:00Z",
    lastModifiedDateTime: "2026-09-10T16:05:00Z",
    settings: [
      groupCollection(ASR, [
        choice(`${ASR}_blockwin32apicallsfromofficemacros`, "block"),
        choice(
          `${ASR}_blockallofficeapplicationsfromcreatingchildprocesses`,
          "block",
        ),
        choice(
          `${ASR}_blockofficeapplicationsfromcreatingexecutablecontent`,
          "block",
        ),
        choice(
          `${ASR}_blockofficeapplicationsfrominjectingcodeintootherprocesses`,
          "block",
        ),
        choice(`${ASR}_blockadobereaderfromcreatingchildprocesses`, "block"),
        choice(
          `${ASR}_blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem`,
          "block",
        ),
        choice(`${ASR}_blockexecutionofpotentiallyobfuscatedscripts`, "audit"),
      ]),
    ],
    assignments: assignments(guid(0x103), [GROUPS.allCorporateDevices]),
  }),
  settingsCatalogPolicy({
    id: guid(0x104),
    name: "WIN - Defender Firewall - All profiles",
    description:
      "Firewall on for domain, private and public profiles. Awaiting change approval before assignment.",
    platforms: "windows10",
    technologies: "mdm,microsoftSense",
    createdDateTime: "2026-09-21T13:40:00Z",
    lastModifiedDateTime: "2026-09-29T11:15:00Z",
    settings: [
      firewallProfile("domain"),
      firewallProfile("private"),
      firewallProfile("public"),
    ],
    assignments: [],
  }),
  settingsCatalogPolicy({
    id: guid(0x105),
    name: "WIN - Office - Macro security",
    description: "VBA macro restrictions for Microsoft 365 Apps.",
    platforms: "windows10",
    technologies: "mdm",
    createdDateTime: "2026-02-03T08:30:00Z",
    lastModifiedDateTime: "2026-08-27T15:20:00Z",
    settings: [
      choice(`${WORD}_l_vbawarningspolicy`, "1", [
        choice(`${WORD}_l_vbawarningspolicy_l_empty19`, "4"),
      ]),
      choice(`${EXCEL}_l_vbawarningspolicy`, "1", [
        choice(`${EXCEL}_l_vbawarningspolicy_l_empty4`, "4"),
      ]),
      choice(`${WORD}_l_blockmacroexecutionfrominternet`, "1"),
      choice(`${EXCEL}_l_blockmacroexecutionfrominternet`, "1"),
      choice(`${POWERPOINT}_l_blockmacroexecutionfrominternet`, "1"),
      choice(`${OFFICE}_l_macroruntimescanscope`, "1", [
        choice(
          `${OFFICE}_l_macroruntimescanscope_l_macroruntimescanscopeenum`,
          "1",
        ),
      ]),
    ],
    assignments: assignments(guid(0x105), [GROUPS.allCorporateUsers]),
  }),
  settingsCatalogPolicy({
    id: guid(0x106),
    name: "WIN - Browser - Edge and IE hardening",
    description: "Retires Internet Explorer and hardens Microsoft Edge.",
    platforms: "windows10",
    technologies: "mdm",
    createdDateTime: "2026-02-10T12:00:00Z",
    lastModifiedDateTime: "2026-07-14T09:10:00Z",
    settings: [
      choice(`${IE}_disableinternetexplorerapp`, "1"),
      choice(`${IE}_internetzonejavapermissions`, "1", [
        choice(`${IE}_internetzonejavapermissions_iz_partname1c00`, "0"),
      ]),
      choice(EDGE_ADS, "1", [
        choice(`${EDGE_ADS}_adssettingforintrusiveadssites`, "2"),
      ]),
    ],
    assignments: assignments(guid(0x106), [GROUPS.allCorporateDevices]),
  }),
  settingsCatalogPolicy({
    id: guid(0x107),
    name: "WIN - Credential protection",
    description: "Credential Guard, LSA protection and memory integrity.",
    platforms: "windows10",
    technologies: "mdm",
    createdDateTime: "2026-03-02T10:00:00Z",
    lastModifiedDateTime: "2026-09-15T10:30:00Z",
    settings: [
      choice("device_vendor_msft_policy_config_deviceguard_lsacfgflags", "1"),
      choice(
        "device_vendor_msft_policy_config_localsecurityauthority_configurelsaprotectedprocess",
        "1",
      ),
      choice(
        "device_vendor_msft_policy_config_virtualizationbasedtechnology_hypervisorenforcedcodeintegrity",
        "1",
      ),
    ],
    assignments: assignments(
      guid(0x107),
      [GROUPS.allCorporateDevices],
      [GROUPS.kioskDevices],
    ),
  }),
  settingsCatalogPolicy({
    id: guid(0x108),
    name: "WIN - LAPS - Entra backup",
    description: "Windows LAPS with password backup to Microsoft Entra ID.",
    platforms: "windows10",
    technologies: "mdm",
    createdDateTime: "2025-12-01T09:00:00Z",
    lastModifiedDateTime: "2026-05-06T13:00:00Z",
    settings: [
      choice("device_vendor_msft_laps_policies_backupdirectory", "1", [
        integer("device_vendor_msft_laps_policies_passwordagedays_aad", 30),
      ]),
    ],
    assignments: assignments(guid(0x108), [GROUPS.allCorporateDevices]),
  }),
  settingsCatalogPolicy({
    id: guid(0x109),
    name: "MAC - FileVault enforcement",
    description: "FileVault with personal recovery key escrow to Intune.",
    platforms: "macOS",
    technologies: "mdm,appleRemoteManagement",
    createdDateTime: "2025-11-12T15:00:00Z",
    lastModifiedDateTime: "2026-06-18T10:45:00Z",
    settings: [
      groupCollection("com.apple.mcx.filevault2_com.apple.mcx.filevault2", [
        choice("com.apple.mcx.filevault2_enable", "0"),
        choice("com.apple.mcx.filevault2_forceenableinsetupassistant", "true"),
        choice("com.apple.mcx.filevault2_recoverykeyrotationinmonths", "6"),
      ]),
      groupCollection(
        "com.apple.security.fderecoverykeyescrow_com.apple.security.fderecoverykeyescrow",
        [
          text(
            "com.apple.security.fderecoverykeyescrow_location",
            "Retrieve your personal recovery key from the Contoso Company Portal.",
          ),
        ],
      ),
    ],
    assignments: assignments(guid(0x109), [GROUPS.corporateMacs]),
  }),
];

const deviceConfigurations = [
  {
    "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
    id: guid(0x201),
    displayName: "WIN - Device restrictions - Corporate",
    description: "General device restrictions and Defender scan schedule.",
    createdDateTime: "2025-11-04T11:00:00Z",
    lastModifiedDateTime: "2026-08-05T09:25:00Z",
    version: 7,
    roleScopeTagIds: ["0"],
    supportsScopeTags: true,
    microsoftAccountBlocked: true,
    cortanaBlocked: true,
    diagnosticsDataSubmissionMode: "basic",
    passwordRequired: true,
    passwordMinimumLength: 8,
    passwordRequiredType: "alphanumeric",
    defenderRequireRealTimeMonitoring: true,
    defenderRequireBehaviorMonitoring: true,
    defenderRequireNetworkInspectionSystem: true,
    defenderScanType: "quick",
    defenderSystemScanSchedule: "everyday",
    defenderScheduledScanTime: "12:00:00.0000000",
    defenderScheduledQuickScanTime: "12:00:00.0000000",
    configType: "Windows 10 General Configuration",
    assignments: assignments(guid(0x201), [GROUPS.allCorporateDevices]),
    collectionStatus: { assignments: "complete" },
  },
  {
    "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration",
    id: guid(0x202),
    displayName: "WIN - Application control - Enforce (staged)",
    description:
      "Enforce mode for Windows components and Store apps. Pilot in audit mode first.",
    createdDateTime: "2026-09-01T09:00:00Z",
    lastModifiedDateTime: "2026-09-24T14:00:00Z",
    version: 2,
    roleScopeTagIds: ["0"],
    supportsScopeTags: true,
    appLockerApplicationControl: "enforceComponentsAndStoreApps",
    bitLockerEncryptDevice: false,
    defenderOfficeMacroCodeAllowWin32ImportsType: "userDefined",
    deviceGuardLocalSystemAuthorityCredentialGuardSettings: "notConfigured",
    firewallProfileDomain: null,
    firewallProfilePrivate: null,
    firewallProfilePublic: null,
    configType: "Windows 10 Endpoint Protection",
    assignments: [],
    collectionStatus: { assignments: "complete" },
  },
  {
    "@odata.type": "#microsoft.graph.macOSEndpointProtectionConfiguration",
    id: guid(0x203),
    displayName: "MAC - Endpoint protection - Gatekeeper",
    description: "Allow apps from the App Store and identified developers.",
    createdDateTime: "2025-11-12T15:30:00Z",
    lastModifiedDateTime: "2026-04-22T08:00:00Z",
    version: 3,
    roleScopeTagIds: ["0"],
    supportsScopeTags: true,
    gatekeeperAllowedAppSource: "macAppStoreAndIdentifiedDevelopers",
    gatekeeperBlockOverride: true,
    firewallEnabled: false,
    firewallBlockAllIncoming: false,
    firewallEnableStealthMode: false,
    fileVaultEnabled: false,
    configType: "macOS Endpoint Protection",
    assignments: assignments(guid(0x203), [GROUPS.corporateMacs]),
    collectionStatus: { assignments: "complete" },
  },
];

function scheduledBlock(policyId: string, gracePeriodHours: number) {
  return [
    {
      id: policyId,
      ruleName: null,
      scheduledActionConfigurations: [
        {
          id: `${policyId.slice(0, -3)}a01`,
          gracePeriodHours,
          actionType: "block",
          notificationTemplateId: "00000000-0000-0000-0000-000000000000",
          notificationMessageCCList: [],
        },
      ],
    },
  ];
}

function compliancePolicy(
  odataType: string,
  id: string,
  displayName: string,
  version: number,
  lastModifiedDateTime: string,
  properties: Record<string, unknown>,
  groups: readonly Group[],
) {
  return {
    "@odata.type": `#microsoft.graph.${odataType}`,
    roleScopeTagIds: ["0"],
    id,
    createdDateTime: "2025-11-04T12:00:00Z",
    description: null,
    lastModifiedDateTime,
    displayName,
    version,
    ...properties,
    configType: "Compliance Policy",
    scheduledActionsForRule: scheduledBlock(id, 24),
    assignments: assignments(id, groups),
    collectionStatus: {
      scheduledActionsForRule: "complete",
      assignments: "complete",
    },
  };
}

const compliancePolicies = [
  compliancePolicy(
    "windows10CompliancePolicy",
    guid(0x301),
    "WIN - Compliance - Baseline",
    4,
    "2026-08-12T10:00:00Z",
    {
      passwordRequired: false,
      passwordBlockSimple: false,
      passwordRequiredToUnlockFromIdle: false,
      passwordMinimumLength: null,
      passwordRequiredType: "deviceDefault",
      requireHealthyDeviceReport: false,
      osMinimumVersion: "10.0.22631",
      osMaximumVersion: null,
      earlyLaunchAntiMalwareDriverEnabled: false,
      bitLockerEnabled: true,
      secureBootEnabled: false,
      codeIntegrityEnabled: false,
      memoryIntegrityEnabled: false,
      kernelDmaProtectionEnabled: false,
      virtualizationBasedSecurityEnabled: false,
      firmwareProtectionEnabled: false,
      storageRequireEncryption: false,
      activeFirewallRequired: false,
      defenderEnabled: true,
      defenderVersion: null,
      signatureOutOfDate: true,
      rtpEnabled: true,
      antivirusRequired: true,
      antiSpywareRequired: true,
      deviceThreatProtectionEnabled: false,
      deviceThreatProtectionRequiredSecurityLevel: "unavailable",
      configurationManagerComplianceRequired: false,
      tpmRequired: true,
      deviceCompliancePolicyScript: null,
      validOperatingSystemBuildRanges: [],
    },
    [GROUPS.allCorporateDevices],
  ),
  compliancePolicy(
    "macOSCompliancePolicy",
    guid(0x302),
    "MAC - Compliance - Baseline",
    3,
    "2026-06-18T11:00:00Z",
    {
      passwordRequired: true,
      passwordBlockSimple: true,
      passwordMinimumLength: 8,
      passwordMinutesOfInactivityBeforeLock: 5,
      passwordRequiredType: "alphanumeric",
      osMinimumVersion: "14.6",
      osMaximumVersion: null,
      systemIntegrityProtectionEnabled: false,
      deviceThreatProtectionEnabled: false,
      deviceThreatProtectionRequiredSecurityLevel: "unavailable",
      advancedThreatProtectionRequiredSecurityLevel: "unavailable",
      storageRequireEncryption: true,
      gatekeeperAllowedAppSource: "notConfigured",
      firewallEnabled: false,
      firewallBlockAllIncoming: false,
      firewallEnableStealthMode: false,
      deviceCompliancePolicyScript: null,
    },
    [GROUPS.corporateMacs],
  ),
  compliancePolicy(
    "macOSCompliancePolicy",
    guid(0x303),
    "MAC - Compliance - Device health (draft)",
    1,
    "2026-09-30T16:00:00Z",
    {
      passwordRequired: false,
      passwordBlockSimple: false,
      passwordRequiredType: "deviceDefault",
      osMinimumVersion: null,
      osMaximumVersion: null,
      systemIntegrityProtectionEnabled: true,
      deviceThreatProtectionEnabled: false,
      deviceThreatProtectionRequiredSecurityLevel: "unavailable",
      advancedThreatProtectionRequiredSecurityLevel: "unavailable",
      storageRequireEncryption: false,
      gatekeeperAllowedAppSource: "notConfigured",
      firewallEnabled: false,
      firewallBlockAllIncoming: false,
      firewallEnableStealthMode: false,
      deviceCompliancePolicyScript: null,
    },
    [],
  ),
  compliancePolicy(
    "iosCompliancePolicy",
    guid(0x304),
    "iOS - Compliance - Baseline",
    5,
    "2026-07-30T09:30:00Z",
    {
      passcodeBlockSimple: true,
      passcodeMinimumLength: 6,
      passcodeMinutesOfInactivityBeforeLock: 5,
      passcodeRequiredType: "numeric",
      passcodeRequired: true,
      osMinimumVersion: "17.6",
      osMaximumVersion: null,
      securityBlockJailbrokenDevices: true,
      deviceThreatProtectionEnabled: false,
      deviceThreatProtectionRequiredSecurityLevel: "unavailable",
      advancedThreatProtectionRequiredSecurityLevel: "unavailable",
      managedEmailProfileRequired: false,
      restrictedApps: [],
    },
    [GROUPS.corporateMobile],
  ),
  compliancePolicy(
    "androidWorkProfileCompliancePolicy",
    guid(0x305),
    "AND - Compliance - Work profile",
    3,
    "2026-07-30T09:45:00Z",
    {
      passwordRequired: true,
      passwordMinimumLength: 6,
      passwordRequiredType: "numericComplex",
      passwordMinutesOfInactivityBeforeLock: 5,
      securityPreventInstallAppsFromUnknownSources: true,
      securityDisableUsbDebugging: true,
      securityRequireVerifyApps: true,
      deviceThreatProtectionEnabled: false,
      deviceThreatProtectionRequiredSecurityLevel: "unavailable",
      advancedThreatProtectionRequiredSecurityLevel: "unavailable",
      securityBlockJailbrokenDevices: true,
      osMinimumVersion: "13.0",
      osMaximumVersion: null,
      minAndroidSecurityPatchLevel: "2026-06-01",
      storageRequireEncryption: true,
      securityRequireSafetyNetAttestationBasicIntegrity: true,
      securityRequireSafetyNetAttestationCertifiedDevice: true,
      securityRequireGooglePlayServices: true,
      securityRequireUpToDateSecurityProviders: false,
      securityRequireCompanyPortalAppIntegrity: true,
    },
    [GROUPS.corporateMobile],
  ),
];

function updateRing(
  id: string,
  displayName: string,
  description: string,
  timing: { deferral: number; deadline: number; grace: number },
  paused: boolean,
  groups: readonly Group[],
) {
  return {
    "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
    id,
    lastModifiedDateTime: paused
      ? "2026-10-06T07:40:00Z"
      : "2026-08-20T10:00:00Z",
    roleScopeTagIds: ["0"],
    supportsScopeTags: true,
    createdDateTime: "2025-11-05T09:00:00Z",
    description,
    displayName,
    version: paused ? 9 : 4,
    deliveryOptimizationMode: "userDefined",
    prereleaseFeatures: "userDefined",
    automaticUpdateMode: "autoInstallAtMaintenanceTime",
    microsoftUpdateServiceAllowed: true,
    driversExcluded: false,
    installationSchedule: {
      "@odata.type": "#microsoft.graph.windowsUpdateActiveHoursInstall",
      activeHoursStart: "08:00:00.0000000",
      activeHoursEnd: "17:00:00.0000000",
    },
    qualityUpdatesDeferralPeriodInDays: timing.deferral,
    featureUpdatesDeferralPeriodInDays: 0,
    qualityUpdatesPaused: paused,
    featureUpdatesPaused: false,
    qualityUpdatesPauseExpiryDateTime: paused
      ? "2026-11-05T07:40:00Z"
      : "0001-01-01T00:00:00Z",
    featureUpdatesPauseExpiryDateTime: "0001-01-01T00:00:00Z",
    businessReadyUpdatesOnly: "userDefined",
    skipChecksBeforeRestart: false,
    featureUpdatesRollbackWindowInDays: 10,
    qualityUpdatesWillBeRolledBack: false,
    featureUpdatesWillBeRolledBack: false,
    deadlineForFeatureUpdatesInDays: 7,
    deadlineForQualityUpdatesInDays: timing.deadline,
    deadlineGracePeriodInDays: timing.grace,
    postponeRebootUntilAfterDeadline: false,
    autoRestartNotificationDismissal: "notConfigured",
    userPauseAccess: "disabled",
    userWindowsUpdateScanAccess: "enabled",
    updateNotificationLevel: "defaultNotifications",
    allowWindows11Upgrade: true,
    configType: "Windows Update Ring",
    assignments: assignments(id, groups),
    hasFetchError: false,
    collectionStatus: { details: "complete", assignments: "complete" },
  };
}

const windowsUpdatePolicies = [
  updateRing(
    guid(0x401),
    "WIN - Update ring Pilot",
    "Quality updates on release day for the pilot group. Paused after a line-of-business regression.",
    { deferral: 0, deadline: 2, grace: 1 },
    true,
    [GROUPS.pilotDevices],
  ),
  updateRing(
    guid(0x402),
    "WIN - Update ring Broad",
    "Quality updates seven days after release with a five day deadline.",
    { deferral: 7, deadline: 5, grace: 2 },
    false,
    [GROUPS.allCorporateDevices],
  ),
];

const appProtectionPolicies = [
  {
    "@odata.type": "#microsoft.graph.iosManagedAppProtection",
    displayName: "iOS - APP - Corporate data",
    description: "Keeps corporate data inside managed apps.",
    createdDateTime: "2026-01-20T10:00:00Z",
    lastModifiedDateTime: "2026-07-01T12:00:00Z",
    roleScopeTagIds: ["0"],
    id: `T_${guid(0x501)}`,
    version: `"${guid(0x5a1)}"`,
    allowedInboundDataTransferSources: "managedApps",
    allowedOutboundDataTransferDestinations: "managedApps",
    allowedOutboundClipboardSharingLevel: "managedAppsWithPasteIn",
    dataBackupBlocked: true,
    deviceComplianceRequired: true,
    saveAsBlocked: true,
    pinRequired: true,
    minimumPinLength: 6,
    simplePinBlocked: true,
    printBlocked: false,
    isAssigned: true,
    targetedAppManagementLevels: "unspecified",
    appDataEncryptionType: "whenDeviceLocked",
    platform: "iOS",
    configType: "App Protection Policy",
    platformType: "iOS",
    assignments: assignments(`T_${guid(0x501)}`, [GROUPS.allCorporateUsers]),
    apps: [],
    collectionStatus: { assignments: "complete", apps: "complete" },
  },
];

function conditionalAccessUsers(options: {
  includeUsers?: string[];
  includeGroups?: string[];
  includeRoles?: string[];
  excludeGroups?: string[];
}) {
  return {
    includeUsers: options.includeUsers ?? [],
    excludeUsers: [],
    includeGroups: options.includeGroups ?? [],
    excludeGroups: options.excludeGroups ?? [],
    includeRoles: options.includeRoles ?? [],
    excludeRoles: [],
    includeGuestsOrExternalUsers: null,
    excludeGuestsOrExternalUsers: null,
  };
}

function conditionalAccessPolicy(options: {
  id: string;
  displayName: string;
  state: "enabled" | "disabled" | "enabledForReportingButNotEnforced";
  users: ReturnType<typeof conditionalAccessUsers>;
  clientAppTypes?: string[];
  platforms?: { includePlatforms: string[]; excludePlatforms: string[] };
  grantControls: Record<string, unknown>;
}) {
  return {
    id: options.id,
    templateId: null,
    displayName: options.displayName,
    createdDateTime: "2025-10-28T09:00:00Z",
    modifiedDateTime: "2026-08-14T10:00:00Z",
    state: options.state,
    deletedDateTime: null,
    partialEnablementStrategy: null,
    sessionControls: null,
    conditions: {
      userRiskLevels: [],
      signInRiskLevels: [],
      clientAppTypes: options.clientAppTypes ?? ["all"],
      locations: null,
      times: null,
      deviceStates: null,
      devices: null,
      clientApplications: null,
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
        includeAuthenticationContextClassReferences: [],
        applicationFilter: null,
      },
      users: options.users,
      platforms: options.platforms ?? null,
    },
    grantControls: {
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
      ...options.grantControls,
    },
    configType: "Conditional Access Policy",
  };
}

// Microsoft built-in "Phishing-resistant MFA" authentication strength.
const PHISHING_RESISTANT_STRENGTH = {
  id: "00000000-0000-0000-0000-000000000004",
  createdDateTime: "2021-12-01T00:00:00Z",
  modifiedDateTime: "2021-12-01T00:00:00Z",
  displayName: "Phishing-resistant MFA",
  description:
    "Phishing-resistant, Passwordless methods for the strongest authentication, such as a FIDO2 security key",
  policyType: "builtIn",
  requirementsSatisfied: "mfa",
  allowedCombinations: [
    "windowsHelloForBusiness",
    "fido2",
    "x509CertificateMultiFactor",
  ],
  combinationConfigurations: [],
};

const conditionalAccessPolicies = [
  conditionalAccessPolicy({
    id: guid(0x601),
    displayName: "CA - Require MFA all users",
    state: "enabled",
    users: conditionalAccessUsers({
      includeUsers: ["All"],
      excludeGroups: [GROUPS.breakGlass.id],
    }),
    grantControls: { operator: "OR", builtInControls: ["mfa"] },
  }),
  conditionalAccessPolicy({
    id: guid(0x602),
    displayName: "CA - Require compliant device",
    state: "enabled",
    users: conditionalAccessUsers({
      includeGroups: [GROUPS.allCorporateUsers.id],
      excludeGroups: [GROUPS.breakGlass.id],
    }),
    platforms: {
      includePlatforms: ["windows", "macOS", "iOS", "android"],
      excludePlatforms: [],
    },
    grantControls: { operator: "OR", builtInControls: ["compliantDevice"] },
  }),
  conditionalAccessPolicy({
    id: guid(0x603),
    displayName: "CA - Phishing-resistant MFA for admins",
    state: "enabledForReportingButNotEnforced",
    users: conditionalAccessUsers({
      includeGroups: [GROUPS.itAdministrators.id],
      excludeGroups: [GROUPS.breakGlass.id],
    }),
    grantControls: {
      operator: "OR",
      builtInControls: [],
      authenticationStrength: PHISHING_RESISTANT_STRENGTH,
    },
  }),
  conditionalAccessPolicy({
    id: guid(0x604),
    displayName: "CA - Block legacy authentication",
    state: "enabled",
    users: conditionalAccessUsers({
      includeUsers: ["All"],
      excludeGroups: [GROUPS.breakGlass.id],
    }),
    clientAppTypes: ["exchangeActiveSync", "other"],
    grantControls: { operator: "OR", builtInControls: ["block"] },
  }),
];

export const CONTOSO_TENANT: DetailedExportData = {
  collectedAt: COLLECTED_AT,
  collectionStartedAt: "2026-10-08T08:58:30Z",
  settingsCatalog,
  deviceConfigurations,
  administrativeTemplates: [],
  compliancePolicies,
  appProtectionPolicies,
  securityBaselines: [],
  scripts: { windows: [], macOS: [] },
  appConfigurations: [],
  windowsUpdatePolicies,
  enrollmentConfigurations: [],
  conditionalAccessPolicies,
  groupNames: new Map(
    Object.values(GROUPS).map((group) => [group.id, group.name]),
  ),
  fetchErrors: [],
};

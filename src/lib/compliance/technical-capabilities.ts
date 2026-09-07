import verified from "./verified-technical-settings.json";
import type {
  ComplianceCapability,
  DetectionSignal,
  SettingsCatalogSignal,
} from "./types";

// IDs and option values verified through Graph beta on 2026-09-07. Metadata
// selects the exact identifiers; policy display names never produce evidence.
const definitions = verified.catalog;
function catalog(
  id: string,
  on: string[],
  off: string[] = [],
): SettingsCatalogSignal {
  const definition = definitions.find((row) => row.id === id);
  const values = (suffixes: string[]) =>
    suffixes.map((suffix) => {
      const value = `${id}_${suffix}`;
      if (!definition?.options.some((option) => option.id === value))
        throw new Error(`Unverified setting option: ${value}`);
      return value;
    });
  const parent = definitions.find((row) =>
    row.options.some((option) => option.children.includes(id)),
  );
  const parentOption = parent?.options.find((option) =>
    option.children.includes(id),
  );
  return {
    source: "settingsCatalog",
    settingDefinitionId: id,
    enforcedWhen: { kind: "oneOf", values: values(on) },
    ...(off.length
      ? { disabledWhen: { kind: "oneOf" as const, values: values(off) } }
      : {}),
    ...(parent && parentOption
      ? {
          prerequisites: [
            { settingDefinitionId: parent.id, values: [parentOption.id] },
          ],
        }
      : {}),
  };
}
const matchingIds = (test: RegExp) =>
  definitions.filter((row) => test.test(row.id)).map((row) => row.id);
const enabled = (test: RegExp) =>
  matchingIds(test).map((id) => catalog(id, ["1"], ["0"]));
const warnings = matchingIds(/vbawarningspolicy_l_empty\d*$/);
const admin = verified.administrativeTemplates;
const adminBoolean = (name: string): DetectionSignal[] =>
  admin
    .filter((row) => row.displayName === name)
    .map((row) => ({
      source: "administrativeTemplate",
      settingId: row.id,
      enforcedWhen: { kind: "equals", value: true },
      disabledWhen: { kind: "equals", value: false },
    }));
const adminChoice = (
  name: string,
  on: string[],
  off: string[],
): DetectionSignal[] =>
  admin
    .filter((row) => row.displayName === name)
    .flatMap((row) =>
      row.presentations.map((presentation) => ({
        source: "administrativeTemplate" as const,
        settingId: row.id,
        presentationId: presentation.id,
        enforcedWhen: { kind: "oneOf" as const, values: on },
        disabledWhen: { kind: "oneOf" as const, values: off },
      })),
    );
const macroDisabled: DetectionSignal[] = [
  ...enabled(/disablevbaforofficeapplications(319)?$/),
  ...warnings.map((id) => catalog(id, ["4"], ["1", "2", "3"])),
  ...adminBoolean("Disable VBA for Office applications"),
  ...adminChoice("VBA Macro Notification Settings", ["4"], ["1", "2", "3"]),
];
const internetMacros = enabled(/_blockmacroexecutionfrominternet$/);
const java = matchingIds(/internetzonejavapermissions_iz_partname1c00$/).map(
  (id) => catalog(id, ["0"], ["65536", "131072", "196608", "8388608"]),
);
const ads = matchingIds(
  /adssettingforintrusiveadssites_adssettingforintrusiveadssites$/,
).map((id) => catalog(id, ["2"], ["1"]));
function capability(
  id: string,
  name: string,
  description: string,
  signals: DetectionSignal[],
  platform: ComplianceCapability["platform"] = "windows",
): ComplianceCapability {
  return {
    id,
    name,
    description,
    platform,
    signals,
    documentationUrl:
      "https://learn.microsoft.com/en-us/graph/api/resources/intune-deviceconfigv2-devicemanagementconfigurationsettingdefinition?view=graph-rest-beta",
  };
}
export const TECHNICAL_CAPABILITIES: readonly ComplianceCapability[] = [
  capability(
    "windows-applocker-rule-collections",
    "AppLocker rule collection types and enforcement",
    "Inspects readable AppLocker CSP XML for EXE, DLL, MSI and Script rule collections. Rule approval, broad allow paths, publisher/hash validity and actual device blocking remain unverified.",
    [{ source: "policyCheck", check: "appLockerRuleCollections" }],
  ),
  capability(
    "windows-office-v3-signatures",
    "Office VBA V3 signatures required",
    "Office policy requires VBA V3 signatures. Signing processes, publisher trust and effective application coverage still require review.",
    enabled(/_l_onlytrustvbasignaturev3$/),
  ),
  capability(
    "windows-office-macros-disabled",
    "Office VBA macros disabled",
    "Explicit Office or application-specific VBA restrictions disable macros. Verify business exceptions, all Office applications and assigned users separately.",
    macroDisabled,
  ),
  capability(
    "windows-office-internet-macros-blocked",
    "Internet-origin Office macros blocked",
    "Word, Excel or PowerPoint policy blocks internet-origin macros. Evidence identifies the configured applications; other applications, Trusted Locations and effective deployment remain unverified.",
    internetMacros,
  ),
  capability(
    "windows-office-macro-antivirus",
    "Office macro runtime scanning for all documents",
    "The enabled Office policy scans VBA behaviour for all documents, including trusted documents. Scanner health and actual detections remain unverified.",
    [
      ...matchingIds(/macroruntimescanscope_l_macroruntimescanscopeenum$/).map(
        (id) => catalog(id, ["2"], ["0", "1"]),
      ),
      ...adminChoice("Macro Runtime Scan Scope", ["2"], ["0", "1"]),
    ],
  ),
  capability(
    "windows-office-signed-macros",
    "Only signed Office VBA macros allowed",
    "The configured Office application allows only digitally signed macros. Publisher trust, Trusted Locations, signature review and other Office applications require separate review.",
    [
      ...warnings.map((id) => catalog(id, ["3"], ["1", "2"])),
      ...adminChoice("VBA Macro Notification Settings", ["3"], ["1", "2"]),
    ],
  ),
  capability(
    "windows-office-macro-settings-managed",
    "Office macro restrictions managed by policy",
    "The detected macro restriction is enforced through policy. This supports only the settings and application coverage shown, not every Trust Center setting.",
    [...macroDisabled, ...internetMacros],
  ),
  capability(
    "macos-office-macros-disabled",
    "Office VBA macros disabled on macOS",
    "An Office preference disables VBA macros. Review profile coverage and all Office applications separately.",
    [
      catalog(
        "com.apple.managedclient.preferences_visualbasicentirelydisabled",
        ["true"],
        ["false"],
      ),
      catalog(
        "com.apple.managedclient.preferences_visualbasicmacroexecutionstate",
        ["1"],
        ["0", "2"],
      ),
    ],
    "macos",
  ),
  capability(
    "windows-ie-disabled",
    "Internet Explorer 11 standalone browser disabled",
    "Policy disables the standalone Internet Explorer application. IE mode, COM activation, removal state and application dependencies require review.",
    [
      ...enabled(/disableinternetexplorerapp(_v2)?$/),
      ...adminBoolean("Disable Internet Explorer 11 as a standalone browser"),
    ],
  ),
  capability(
    "windows-browser-java-blocked",
    "Internet-zone Java disabled in Internet Explorer",
    "An enabled Internet Explorer zone policy disables Java. This covers the identified browser and zone only, not JavaScript or every installed browser.",
    java,
  ),
  capability(
    "windows-browser-intrusive-ads-blocked",
    "Intrusive advertisements blocked in managed browsers",
    "Mandatory Chrome or Edge policy blocks intrusive advertisements. It does not block all advertisements; additional filtering and other browsers need verification.",
    ads,
  ),
  capability(
    "macos-browser-intrusive-ads-blocked",
    "Intrusive advertisements blocked on macOS",
    "A managed browser preference blocks intrusive advertisements. It does not establish blocking of all advertisements or coverage of every browser.",
    [
      catalog(
        "com.apple.managedclient.preferences_adssettingforintrusiveadssites",
        ["1"],
        ["0"],
      ),
    ],
    "macos",
  ),
  capability(
    "windows-browser-security-settings-managed",
    "Browser security settings managed by policy",
    "Detected browser restrictions are configured through mandatory policy. Other browser settings, recommended policies and effective user permissions remain unverified.",
    [...java, ...ads],
  ),
  capability(
    "windows-powershell-scriptblock-logging",
    "PowerShell script block logging enabled",
    "Script block logging is enabled by policy. Log forwarding, retention, module logging and operational monitoring require separate evidence.",
    enabled(/turnonpowershellscriptblocklogging$/),
  ),
  capability(
    "windows-powershell-transcription",
    "PowerShell transcription enabled",
    "PowerShell transcription is enabled by policy. Destination access, collected events, forwarding and retention require separate evidence.",
    enabled(/enabletranscripting$/),
  ),
  capability(
    "tenant-mfa-all-apps",
    "MFA required for all cloud apps in the policy scope",
    "An enabled Conditional Access policy requires MFA for all cloud apps without application exclusions. User exclusions, conditions, external services and effective sign-ins require review.",
    [{ source: "policyCheck", check: "conditionalAccessMfaAllApps" }],
    "tenant",
  ),
  capability(
    "tenant-phishing-resistant-mfa",
    "Phishing-resistant MFA required",
    "An enabled Conditional Access policy requires a phishing-resistant authentication strength. Target coverage, exclusions and actual authentication remain unverified.",
    [{ source: "policyCheck", check: "conditionalAccessPhishingResistantMfa" }],
    "tenant",
  ),
];

const asr = (suffix: string) =>
  catalog(
    `device_vendor_msft_policy_config_defender_attacksurfacereductionrules_${suffix}`,
    ["block"],
    ["off", "audit", "warn"],
  );
export const VERIFIED_CATALOG_SIGNALS: Readonly<
  Record<string, readonly SettingsCatalogSignal[]>
> = {
  "windows-office-macro-win32-block": [
    asr("blockwin32apicallsfromofficemacros"),
  ],
  "windows-office-child-process-block": [
    asr("blockallofficeapplicationsfromcreatingchildprocesses"),
  ],
  "windows-office-executable-block": [
    asr("blockofficeapplicationsfromcreatingexecutablecontent"),
  ],
  "windows-office-injection-block": [
    asr("blockofficeapplicationsfrominjectingcodeintootherprocesses"),
  ],
  "windows-adobe-child-process-block": [
    asr("blockadobereaderfromcreatingchildprocesses"),
  ],
  "windows-credential-theft-protection": [
    asr("blockcredentialstealingfromwindowslocalsecurityauthoritysubsystem"),
  ],
  "windows-credential-guard": [
    catalog(
      "device_vendor_msft_policy_config_deviceguard_lsacfgflags",
      ["1", "2"],
      ["0"],
    ),
  ],
  "windows-memory-integrity": [
    catalog(
      "device_vendor_msft_policy_config_virtualizationbasedtechnology_hypervisorenforcedcodeintegrity",
      ["1", "2"],
      ["0"],
    ),
  ],
};

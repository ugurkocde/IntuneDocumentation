import type { OutsideScopeMeasure } from "../management/types";
import type { FrameworkControl, FrameworkDefinition } from "../types";

// Regulation (EU) 2022/2554 (DORA) and Commission Delegated Regulation (EU)
// 2024/1774 (RTS on the ICT risk management framework) are EU legislation and
// may be reused under Commission Decision 2011/833/EU and the EUR-Lex legal
// notice. Titles and summaries are short paraphrases. Paragraph numbering was
// checked against the Official Journal text on 18 October 2026: the data
// protection duty is Art. 9(2), not 9(3); strong authentication is 9(4)(d),
// access limitation 9(4)(c), patches and updates 9(4)(f). Only points with a
// device-management or Entra ID setting that genuinely supports them are
// listed; every mapping is supporting evidence.

export const DORA_SOURCE_ATTRIBUTION =
  "Source: EUR-Lex, Regulation (EU) 2022/2554 and Commission Delegated Regulation (EU) 2024/1774. Titles paraphrased; only the Official Journal text is authentic.";

function control(
  id: string,
  title: string,
  summary: string,
  unassessed: string,
): FrameworkControl {
  return {
    id,
    title,
    summary,
    evidenceStrength: "supporting",
    granularity: "requirement",
    unassessedAspects: [unassessed],
  };
}

const CONTROLS: FrameworkControl[] = [
  control(
    "DORA 9(2)",
    "Protecting data at rest, in use and in transit",
    "Security tools keep ICT systems resilient and data available, authentic, intact and confidential, including stored data on managed devices.",
    "Data in use and in transit, backup copies, data classification and the effectiveness of the security policies need separate evidence.",
  ),
  control(
    "DORA 9(4)(c)",
    "Limiting logical access to what is needed",
    "Logical access is limited to approved functions, for example by requiring managed, compliant and locked devices before access to organisational data.",
    "Access rights management, approval and review processes, physical access and least-privilege role design need separate evidence.",
  ),
  control(
    "DORA 9(4)(d)",
    "Strong authentication policies",
    "Strong authentication based on standards is configured, such as Conditional Access MFA and phishing-resistant methods in Entra ID.",
    "Coverage of every user and service, exclusions, the documented authentication policy and protection of cryptographic keys need separate evidence.",
  ),
  control(
    "DORA 9(4)(f)",
    "Patch and update policies",
    "Operating system updates are installed automatically within a configured timeframe.",
    "The documented patch policy, application and firmware updates and the time actually taken to install updates need separate evidence.",
  ),
  control(
    "DORA 10(1)",
    "Detecting anomalous activities",
    "Endpoint process and PowerShell logging produce records that support prompt detection of anomalous activity.",
    "Central collection, alerting, response, detection of single points of failure and regular testing of the detection mechanisms need separate evidence.",
  ),
  control(
    "RTS 6(2)(a)",
    "Encryption of data at rest and in transit",
    "The encryption rules cover data at rest, supported here by required disk and storage encryption on managed devices.",
    "Encryption in transit, the encryption policy itself, data classification and key management need separate evidence.",
  ),
  control(
    "RTS 10(4)(c)",
    "Testing and deploying patches",
    "Software patches and updates are deployed to managed devices through automatic update configuration (patch procedures under Art. 10(3)).",
    "Testing before deployment, emergency patching, installation deadlines with escalation and the documented procedures need separate evidence.",
  ),
  control(
    "RTS 11(2)(b)",
    "Secure configuration baseline",
    "A secure configuration baseline that reduces exposure is defined for ICT assets, supported by enforced hardening settings.",
    "The documented baseline, its completeness and the regular verification that it is deployed on every asset need separate evidence.",
  ),
  control(
    "RTS 11(2)(c)",
    "Only authorised software installed",
    "Measures ensure that only authorised software is installed on ICT systems and endpoint devices.",
    "The approved software inventory, exceptions and the actual software on each device need separate evidence.",
  ),
  control(
    "RTS 11(2)(d)",
    "Protection against malicious code",
    "Measures protect endpoints against malicious code, such as real-time antimalware, scans and attack surface reduction rules.",
    "Signature currency, detections, exclusions and response to infections need separate evidence.",
  ),
  control(
    "RTS 11(2)(e)",
    "Authorised storage and transfer of data",
    "Only authorised endpoints and apps are used to transfer and store the entity's data, supported by managed app data transfer restrictions.",
    "Removable media controls, authorised storage systems and data loss prevention need separate evidence.",
  ),
  control(
    "RTS 13(d)",
    "Blocking non-compliant endpoints",
    "Network access controls prevent connections from endpoints that do not meet security requirements, supported by Conditional Access requiring compliant devices.",
    "Network-level access control, unmanaged devices outside Conditional Access and effective blocking of sign-ins need separate evidence.",
  ),
  control(
    "RTS 13(l)",
    "Session lock after inactivity",
    "Sessions are locked after a defined period of inactivity, supported by configured screen lock limits.",
    "Ending system and remote sessions, the organisation's defined period and remote access session limits need separate evidence.",
  ),
  control(
    "RTS 21(e)(ii)",
    "Privileged access on a need-to-use basis",
    "Privileged and administrator access is granted only as needed, supported by managed local administrator passwords.",
    "Privileged role assignments, emergency access, dedicated admin accounts and privileged access management need separate evidence.",
  ),
  control(
    "RTS 21(f)(ii)",
    "Strong authentication for remote and privileged access",
    "Strong authentication is used for remote network access, privileged access and access to critical assets.",
    "Coverage of remote access, privileged accounts and assets supporting critical functions, and exclusions, need separate evidence.",
  ),
];

const NOT_MAPPED = [
  "windows-telemetry-minimized",
  "windows-cortana-disabled",
  "windows-microsoft-account-blocked",
  "windows-office-v3-signatures",
];

const HARDENING = [
  "windows-firewall",
  "macos-firewall",
  "windows-secure-boot",
  "windows-code-integrity",
  "macos-system-integrity",
  "ios-jailbreak-block",
  "android-device-integrity",
  "windows-office-macros-disabled",
  "windows-office-internet-macros-blocked",
  "windows-office-signed-macros",
  "macos-office-macros-disabled",
  "windows-office-macro-settings-managed",
  "windows-ie-disabled",
  "windows-browser-java-blocked",
  "windows-browser-intrusive-ads-blocked",
  "macos-browser-intrusive-ads-blocked",
  "windows-browser-security-settings-managed",
  "windows-virtualization-security",
  "windows-memory-integrity",
  "windows-remote-credential-guard",
  "windows-lsa-protection",
  "windows-credential-guard",
];

const MALWARE = [
  "windows-realtime-antimalware",
  "windows-antivirus-required",
  "windows-periodic-antimalware-scan",
  "windows-behavior-monitoring",
  "windows-network-inspection",
  "windows-office-macro-antivirus",
  "windows-office-macro-win32-block",
  "windows-office-child-process-block",
  "windows-office-executable-block",
  "windows-office-injection-block",
  "windows-adobe-child-process-block",
  "windows-credential-theft-protection",
];

const mappings: Record<string, readonly string[]> = {
  ...Object.fromEntries(NOT_MAPPED.map((id) => [id, []])),
  ...Object.fromEntries(HARDENING.map((id) => [id, ["RTS 11(2)(b)"]])),
  ...Object.fromEntries(MALWARE.map((id) => [id, ["RTS 11(2)(d)"]])),
  // Behaviour monitoring is malware protection (RTS 11(2)(d)); detection
  // under Art. 10(1) is supported by logging only, as for NIS2 point (b).
  "windows-password-required": ["DORA 9(4)(c)"],
  "macos-password-required": ["DORA 9(4)(c)"],
  "ios-passcode-required": ["DORA 9(4)(c)"],
  "android-password-required": ["DORA 9(4)(c)"],
  "windows-disk-encryption": ["DORA 9(2)", "RTS 6(2)(a)"],
  "macos-disk-encryption": ["DORA 9(2)", "RTS 6(2)(a)"],
  "android-storage-encryption": ["DORA 9(2)", "RTS 6(2)(a)"],
  "windows-automatic-updates": ["DORA 9(4)(f)", "RTS 10(4)(c)"],
  "windows-quality-update-deadline": ["DORA 9(4)(f)", "RTS 10(4)(c)"],
  // A minimum version requirement is not patch deployment.
  "windows-minimum-os-version": [],
  "macos-minimum-os-version": [],
  "ios-minimum-os-version": [],
  "android-minimum-os-version": [],
  "windows-process-creation-logging": ["DORA 10(1)"],
  "windows-powershell-module-logging": ["DORA 10(1)"],
  "windows-powershell-scriptblock-logging": ["DORA 10(1)"],
  "windows-powershell-transcription": ["DORA 10(1)"],
  "windows-application-control": ["RTS 11(2)(c)"],
  "windows-applocker-rule-collections": ["RTS 11(2)(c)"],
  "macos-gatekeeper": ["RTS 11(2)(c)"],
  "android-app-source-restriction": ["RTS 11(2)(c)"],
  "ios-app-data-transfer": ["DORA 9(4)(c)", "RTS 11(2)(e)"],
  "android-app-data-transfer": ["DORA 9(4)(c)", "RTS 11(2)(e)"],
  "tenant-compliant-device-required": ["DORA 9(4)(c)", "RTS 13(d)"],
  "windows-inactivity-lock": ["DORA 9(4)(c)", "RTS 13(l)"],
  "macos-inactivity-lock": ["DORA 9(4)(c)", "RTS 13(l)"],
  "ios-inactivity-lock": ["DORA 9(4)(c)", "RTS 13(l)"],
  "android-inactivity-lock": ["DORA 9(4)(c)", "RTS 13(l)"],
  "windows-laps-management": ["RTS 21(e)(ii)"],
  "tenant-mfa-required": ["DORA 9(4)(d)", "RTS 21(f)(ii)"],
  "tenant-mfa-all-apps": ["DORA 9(4)(d)", "RTS 21(f)(ii)"],
  "tenant-phishing-resistant-mfa": ["DORA 9(4)(d)", "RTS 21(f)(ii)"],
  "tenant-phishing-resistant-method-enabled": ["DORA 9(4)(d)", "RTS 21(f)(ii)"],
  "tenant-weak-methods-disabled": ["DORA 9(4)(d)", "RTS 21(f)(ii)"],
  "tenant-security-defaults-enabled": ["DORA 9(4)(d)", "RTS 21(f)(ii)"],
};

export const DORA: FrameworkDefinition = {
  id: "dora-2022-2554",
  name: "DORA",
  version: "Regulation (EU) 2022/2554 and RTS (EU) 2024/1774",
  note: `Supporting device-management and Entra ID evidence for selected ICT risk management points of DORA Art. 9 and 10 and of the RTS on the ICT risk management framework. Governance, risk management framework, incident reporting, resilience testing, third-party risk and information sharing are organisational and outside the scope of an Intune tenant export. ${DORA_SOURCE_ATTRIBUTION}`,
  source: {
    url: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj",
    verifiedAt: "2026-10-18",
  },
  controls: Object.fromEntries(CONTROLS.map((item) => [item.id, item])),
  mappings,
};

/** Organisational DORA provisions without an Intune evidence mapping. */
export const DORA_OUTSIDE_INTUNE_SCOPE: readonly OutsideScopeMeasure[] = [
  {
    id: "DORA 5",
    title: {
      en: "Governance and organisation of ICT risk management",
      de: "Governance und Organisation des IKT-Risikomanagements",
    },
  },
  {
    id: "DORA 6",
    title: {
      en: "ICT risk management framework",
      de: "IKT-Risikomanagementrahmen",
    },
  },
  {
    id: "DORA 8",
    title: {
      en: "Identification of ICT assets, functions and risks",
      de: "Ermittlung von IKT-Assets, Funktionen und Risiken",
    },
  },
  {
    id: "DORA 11 to 14",
    title: {
      en: "Response and recovery, backup and restoration, learning and communication",
      de: "Reaktion und Wiederherstellung, Datensicherung, Lernen und Kommunikation",
    },
  },
  {
    id: "DORA 17 to 23",
    title: {
      en: "ICT-related incident management, classification and reporting",
      de: "Management, Klassifizierung und Meldung IKT-bezogener Vorfälle",
    },
  },
  {
    id: "DORA 24 to 27",
    title: {
      en: "Digital operational resilience testing, including threat-led penetration testing",
      de: "Testen der digitalen operationalen Resilienz, einschließlich bedrohungsorientierter Penetrationstests",
    },
  },
  {
    id: "DORA 28 to 30",
    title: {
      en: "ICT third-party risk and key contractual provisions",
      de: "IKT-Drittparteienrisiko und wesentliche Vertragsbestimmungen",
    },
  },
  {
    id: "DORA 45",
    title: {
      en: "Sharing of cyber threat information and intelligence",
      de: "Austausch von Informationen und Erkenntnissen über Cyberbedrohungen",
    },
  },
];

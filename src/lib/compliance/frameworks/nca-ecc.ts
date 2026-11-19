import type { OutsideScopeMeasure } from "../management/types";
import type { FrameworkControl, FrameworkDefinition } from "../types";

// Essential Cybersecurity Controls (ECC-2:2024) of the National Cybersecurity
// Authority of Saudi Arabia. The English PDF is marked TLP: White and
// Document Classification: Public, but carries no open licence, so only
// control IDs and our own short paraphrased titles and summaries are shipped;
// no requirement sentence is copied. The Arabic version is the binding text.
//
// The PDF prints subcontrols with dots (2.2.3.2); IDs here use dashes
// (ECC 2-2-3-2), as the PDF itself does for 2-5-3-9 and as ECC-1 did.
// The document counts 108 main controls and 92 subcontrols. Only controls of
// the Cybersecurity Defense domain with a device-management or Entra ID
// setting that genuinely supports them are listed; every mapping is
// supporting evidence. ECC-2:2024 has no separate secure configuration
// control: hardening settings support ECC 2-3-2, the implemented protection
// of workstations and systems, which is mapped as a theme.

export const NCA_ECC_SOURCE_ATTRIBUTION =
  "Source: National Cybersecurity Authority (NCA), Essential Cybersecurity Controls ECC-2:2024. Titles and summaries paraphrased; only the Arabic text is binding.";

/**
 * Main controls per subdomain, each with its number of subcontrols, in the
 * order of ECC-2:2024. Subdomain 1-7 has a single main control.
 */
const STRUCTURE: Readonly<Record<string, readonly number[]>> = {
  "1-1": [0, 0, 0],
  "1-2": [0, 0, 0],
  "1-3": [0, 0, 0, 0],
  "1-4": [0, 0],
  "1-5": [0, 0, 4, 0],
  "1-6": [0, 2, 5, 0],
  "1-7": [0],
  "1-8": [0, 0, 0],
  "1-9": [0, 0, 2, 2, 0, 0],
  "1-10": [0, 0, 4, 3, 0],
  "2-1": [0, 0, 0, 0, 0, 0],
  "2-2": [0, 0, 5, 0],
  "2-3": [0, 0, 4, 0],
  "2-4": [0, 0, 5, 0],
  "2-5": [0, 0, 9, 0],
  "2-6": [0, 0, 4, 0],
  "2-7": [0, 0, 0],
  "2-8": [0, 0, 3, 0],
  "2-9": [0, 0, 3, 0],
  "2-10": [0, 0, 5, 0],
  "2-11": [0, 0, 2, 0],
  "2-12": [0, 0, 5, 0],
  "2-13": [0, 0, 5, 0],
  "2-14": [0, 0, 5, 0],
  "2-15": [0, 0, 5, 0],
  "3-1": [0, 0, 3, 0],
  "4-1": [0, 3, 2, 0],
  "4-2": [0, 0, 2, 0],
};

/** Every main control and subcontrol of ECC-2:2024, in document order. */
export const NCA_ECC_REQUIREMENT_IDS: readonly string[] = Object.entries(
  STRUCTURE,
).flatMap(([subdomain, mainControls]) =>
  mainControls.flatMap((subcontrols, index) => {
    const main = `ECC ${subdomain}-${index + 1}`;
    return [
      main,
      ...Array.from({ length: subcontrols }, (_, sub) => `${main}-${sub + 1}`),
    ];
  }),
);

/** Names of the subdomains that hold mapped controls, for report grouping. */
export const NCA_ECC_SUBDOMAINS: Readonly<Record<string, string>> = {
  "ECC 2-2": "Identity and access management",
  "ECC 2-3": "Protection of systems and processing facilities",
  "ECC 2-6": "Mobile device security",
  "ECC 2-8": "Cryptography",
  "ECC 2-10": "Vulnerability management",
  "ECC 2-12": "Event logs and monitoring",
};

function control(
  id: string,
  title: string,
  summary: string,
  unassessed: string,
  granularity: FrameworkControl["granularity"] = "requirement",
): FrameworkControl {
  return {
    id,
    title,
    summary,
    evidenceStrength: "supporting",
    granularity,
    unassessedAspects: [unassessed],
  };
}

const CONTROLS: FrameworkControl[] = [
  control(
    "ECC 2-2-3-2",
    "Multi-factor sign-in for remote and privileged access",
    "Entra ID asks for more than one factor at sign-in, for example through Conditional Access MFA and phishing-resistant methods, which supports remote and administrator access.",
    "How the factors were chosen from the risk of a failed or bypassed sign-in, coverage of every remote access path and privileged account, and exclusions need separate evidence.",
  ),
  control(
    "ECC 2-2-3-4",
    "Managing privileged access",
    "Windows LAPS rotates and stores the local administrator password of managed Windows devices, which supports control over privileged accounts.",
    "Privileged role assignments in Entra ID, just-in-time elevation, separate admin accounts and reviews of privileged access need separate evidence.",
  ),
  control(
    "ECC 2-3-2",
    "Protection of workstations and systems in place",
    "Hardening settings such as host firewalls, secure boot, code integrity, credential protection and Office macro and browser restrictions show that protection measures are applied on managed workstations.",
    "The documented protection requirements, servers and infrastructure outside Intune, and checks that every device keeps these settings need separate evidence.",
    "theme",
  ),
  control(
    "ECC 2-3-3-1",
    "Antimalware and untrusted software control on endpoints",
    "Real-time antimalware, scans, behaviour monitoring, attack surface reduction rules and application control protect managed endpoints against malicious and unapproved software.",
    "Servers outside Intune, signature currency, central management of the protection, detections and the handling of infections need separate evidence.",
  ),
  control(
    "ECC 2-3-3-3",
    "Keeping systems, apps and devices patched",
    "Windows Update rings install quality updates automatically and with a deadline on managed devices.",
    "Application, firmware and server patching, the documented patch process and the time actually taken to install updates need separate evidence.",
  ),
  control(
    "ECC 2-6-3-1",
    "Separating and encrypting entity data on mobile devices",
    "Disk and storage encryption and app protection data transfer rules keep the entity's data encrypted and apart from personal data on managed laptops, phones and tablets.",
    "Personal devices that are not managed, entity data kept outside managed apps and the BYOD policy itself need separate evidence.",
  ),
  control(
    "ECC 2-6-3-2",
    "Restricting how mobile devices are used",
    "Unlock credentials, screen lock after inactivity, device integrity checks, app data transfer rules and Conditional Access for compliant devices limit how laptops, phones and tablets reach entity data.",
    "The business rules for permitted use, devices that are not enrolled and the enforcement of the BYOD policy need separate evidence.",
  ),
  control(
    "ECC 2-8-3-3",
    "Encrypting stored data",
    "Required disk and storage encryption protects data at rest on managed devices.",
    "Encryption in transit, alignment with data classification and the National Cryptographic Standards, and key management need separate evidence.",
  ),
  control(
    "ECC 2-10-3-4",
    "Installing updates that fix vulnerabilities",
    "Automatic updates, with an installation deadline for quality updates, deploy security fixes for known vulnerabilities to managed Windows devices.",
    "Testing updates in a non-production environment before release, confirming that each fix works and remediation by severity need separate evidence.",
  ),
  control(
    "ECC 2-12-3-1",
    "Security event logging on critical assets",
    "Process creation auditing and PowerShell module, script block and transcription logging produce security event records on managed Windows devices.",
    "Which assets are critical, central collection in a SIEM, continuous monitoring and keeping logs for at least 12 months need separate evidence.",
  ),
];

const NOT_MAPPED = [
  "windows-telemetry-minimized",
  "windows-cortana-disabled",
  "windows-microsoft-account-blocked",
  "windows-office-v3-signatures",
  // A minimum version requirement is not patch deployment.
  "windows-minimum-os-version",
  "macos-minimum-os-version",
  "ios-minimum-os-version",
  "android-minimum-os-version",
];

const HARDENING = [
  "windows-firewall",
  "macos-firewall",
  "windows-secure-boot",
  "windows-code-integrity",
  "macos-system-integrity",
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
  // Suspicious programs: only approved software may run.
  "windows-application-control",
  "windows-applocker-rule-collections",
  "macos-gatekeeper",
  "android-app-source-restriction",
];

// Controlled use of laptops, phones and tablets (ECC 2-6 includes laptops).
const MOBILE_USE = [
  "ios-jailbreak-block",
  "android-device-integrity",
  "windows-password-required",
  "macos-password-required",
  "ios-passcode-required",
  "android-password-required",
  "windows-inactivity-lock",
  "macos-inactivity-lock",
  "ios-inactivity-lock",
  "android-inactivity-lock",
  "tenant-compliant-device-required",
];

const MFA = [
  "tenant-mfa-required",
  "tenant-mfa-all-apps",
  "tenant-phishing-resistant-mfa",
  "tenant-phishing-resistant-method-enabled",
  "tenant-weak-methods-disabled",
  "tenant-security-defaults-enabled",
];

const LOGGING = [
  "windows-process-creation-logging",
  "windows-powershell-module-logging",
  "windows-powershell-scriptblock-logging",
  "windows-powershell-transcription",
];

const mappings: Record<string, readonly string[]> = {
  ...Object.fromEntries(NOT_MAPPED.map((id) => [id, []])),
  ...Object.fromEntries(HARDENING.map((id) => [id, ["ECC 2-3-2"]])),
  ...Object.fromEntries(MALWARE.map((id) => [id, ["ECC 2-3-3-1"]])),
  ...Object.fromEntries(MOBILE_USE.map((id) => [id, ["ECC 2-6-3-2"]])),
  ...Object.fromEntries(MFA.map((id) => [id, ["ECC 2-2-3-2"]])),
  ...Object.fromEntries(LOGGING.map((id) => [id, ["ECC 2-12-3-1"]])),
  "windows-disk-encryption": ["ECC 2-6-3-1", "ECC 2-8-3-3"],
  "macos-disk-encryption": ["ECC 2-6-3-1", "ECC 2-8-3-3"],
  "android-storage-encryption": ["ECC 2-6-3-1", "ECC 2-8-3-3"],
  "ios-app-data-transfer": ["ECC 2-6-3-1", "ECC 2-6-3-2"],
  "android-app-data-transfer": ["ECC 2-6-3-1", "ECC 2-6-3-2"],
  "windows-automatic-updates": ["ECC 2-3-3-3", "ECC 2-10-3-4"],
  "windows-quality-update-deadline": ["ECC 2-3-3-3", "ECC 2-10-3-4"],
  "windows-laps-management": ["ECC 2-2-3-4"],
};

export const NCA_ECC: FrameworkDefinition = {
  id: "nca-ecc-2-2024",
  name: "NCA ECC",
  version: "ECC-2:2024",
  totalRequirements: NCA_ECC_REQUIREMENT_IDS.length,
  note: `Supporting device-management and Entra ID evidence for selected Cybersecurity Defense controls of the Essential Cybersecurity Controls (108 main controls and 92 subcontrols). Governance, resilience, third-party and cloud controls and the many process controls are organisational and outside the scope of an Intune tenant export. ${NCA_ECC_SOURCE_ATTRIBUTION}`,
  source: {
    url: "https://nca.gov.sa/en/regulatory-documents/controls-list/ecc/",
    verifiedAt: "2026-11-19",
  },
  controls: Object.fromEntries(CONTROLS.map((item) => [item.id, item])),
  mappings,
};

/**
 * Outside scope rows, one per subdomain, with paraphrased titles. Each row
 * stands for every control of its subdomain that is not listed above, so the
 * rows together cover all unmapped requirements.
 */
export const NCA_ECC_OUTSIDE_INTUNE_SCOPE: readonly OutsideScopeMeasure[] = [
  {
    id: "ECC 1-1",
    title: {
      en: "Cybersecurity strategy and its action plan",
      de: "Cybersicherheitsstrategie und Umsetzungsplan",
    },
  },
  {
    id: "ECC 1-2",
    title: {
      en: "Cybersecurity department, staffing and supervisory committee",
      de: "Cybersicherheitsabteilung, Personal und Lenkungsausschuss",
    },
  },
  {
    id: "ECC 1-3",
    title: {
      en: "Cybersecurity policies, procedures and technical standards",
      de: "Cybersicherheitsrichtlinien, Verfahren und technische Standards",
    },
  },
  {
    id: "ECC 1-4",
    title: {
      en: "Cybersecurity roles and responsibilities",
      de: "Rollen und Verantwortlichkeiten für die Cybersicherheit",
    },
  },
  {
    id: "ECC 1-5",
    title: {
      en: "Cybersecurity risk management and risk assessments",
      de: "Management und Bewertung von Cybersicherheitsrisiken",
    },
  },
  {
    id: "ECC 1-6",
    title: {
      en: "Security in IT projects, change management and software development",
      de: "Sicherheit in IT-Projekten, Änderungsmanagement und Softwareentwicklung",
    },
  },
  {
    id: "ECC 1-7",
    title: {
      en: "Compliance with national and international cybersecurity obligations",
      de: "Einhaltung nationaler und internationaler Cybersicherheitspflichten",
    },
  },
  {
    id: "ECC 1-8",
    title: {
      en: "Periodic cybersecurity review and independent audit",
      de: "Regelmäßige Überprüfung und unabhängige Prüfung der Cybersicherheit",
    },
  },
  {
    id: "ECC 1-9",
    title: {
      en: "Cybersecurity before, during and after employment",
      de: "Cybersicherheit vor, während und nach dem Beschäftigungsverhältnis",
    },
  },
  {
    id: "ECC 1-10",
    title: {
      en: "Security awareness programme and specialist training",
      de: "Sensibilisierungsprogramm und Fachschulungen zur Cybersicherheit",
    },
  },
  {
    id: "ECC 2-1",
    title: {
      en: "Asset inventory, acceptable use and asset classification",
      de: "Bestandsverzeichnis, zulässige Nutzung und Klassifizierung von Assets",
    },
  },
  {
    id: "ECC 2-2",
    title: {
      en: "Other identity and access controls, such as least privilege and access reviews",
      de: "Weitere Identitäts- und Zugriffskontrollen, etwa minimale Rechte und Zugriffsprüfungen",
    },
  },
  {
    id: "ECC 2-3",
    title: {
      en: "Other system protection controls, such as external storage media and clock synchronisation",
      de: "Weitere Kontrollen zum Schutz von Systemen, etwa externe Datenträger und Zeitsynchronisation",
    },
  },
  {
    id: "ECC 2-4",
    title: {
      en: "Email protection, such as filtering, archiving and sender domain validation",
      de: "Schutz von E-Mail, etwa Filterung, Archivierung und Prüfung der Absenderdomänen",
    },
  },
  {
    id: "ECC 2-5",
    title: {
      en: "Network security, such as segmentation, wireless, DNS and DDoS protection",
      de: "Netzwerksicherheit, etwa Segmentierung, WLAN, DNS und Schutz vor DDoS",
    },
  },
  {
    id: "ECC 2-6",
    title: {
      en: "Other mobile device controls, such as wiping entity data and user awareness",
      de: "Weitere Kontrollen für mobile Geräte, etwa Löschen von Unternehmensdaten und Sensibilisierung",
    },
  },
  {
    id: "ECC 2-7",
    title: {
      en: "Protecting data and information according to its classification",
      de: "Schutz von Daten und Informationen nach ihrer Klassifizierung",
    },
  },
  {
    id: "ECC 2-8",
    title: {
      en: "Other cryptography controls, such as approved solutions and key management",
      de: "Weitere Kryptografiekontrollen, etwa zugelassene Lösungen und Schlüsselverwaltung",
    },
  },
  {
    id: "ECC 2-9",
    title: {
      en: "Backups and recovery after incidents",
      de: "Datensicherung und Wiederherstellung nach Vorfällen",
    },
  },
  {
    id: "ECC 2-10",
    title: {
      en: "Other vulnerability controls, such as assessment, rating and remediation",
      de: "Weitere Kontrollen zu Schwachstellen, etwa Prüfung, Einstufung und Behebung",
    },
  },
  {
    id: "ECC 2-11",
    title: {
      en: "Penetration testing of externally provided services",
      de: "Penetrationstests extern angebotener Dienste",
    },
  },
  {
    id: "ECC 2-12",
    title: {
      en: "Other logging controls, such as privileged access events, SIEM, monitoring and retention",
      de: "Weitere Protokollierungskontrollen, etwa privilegierte Zugriffe, SIEM, Überwachung und Aufbewahrung",
    },
  },
  {
    id: "ECC 2-13",
    title: {
      en: "Handling cybersecurity incidents and threat intelligence",
      de: "Behandlung von Cybersicherheitsvorfällen und Bedrohungsinformationen",
    },
  },
  {
    id: "ECC 2-14",
    title: {
      en: "Physical protection of facilities and equipment",
      de: "Physischer Schutz von Räumlichkeiten und Ausrüstung",
    },
  },
  {
    id: "ECC 2-15",
    title: {
      en: "Security of external web applications",
      de: "Sicherheit externer Webanwendungen",
    },
  },
  {
    id: "ECC 3-1",
    title: {
      en: "Cybersecurity resilience in business continuity management",
      de: "Cyberresilienz im Business Continuity Management",
    },
  },
  {
    id: "ECC 4-1",
    title: {
      en: "Cybersecurity of third parties and outsourced services",
      de: "Cybersicherheit bei Dritten und ausgelagerten Diensten",
    },
  },
  {
    id: "ECC 4-2",
    title: {
      en: "Cybersecurity of cloud computing and hosting services",
      de: "Cybersicherheit von Cloud-Computing- und Hosting-Diensten",
    },
  },
];

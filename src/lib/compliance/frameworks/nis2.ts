import type { OutsideScopeMeasure } from "../management/types";
import type { FrameworkControl, FrameworkDefinition } from "../types";

// Directive (EU) 2022/2555 is EU legislation and may be reused. Titles are
// short paraphrases of the ten Art. 21(2) measures. National aliases were
// verified on 2026-10-01 against the Danish NIS 2-loven (LOV nr 434 af
// 06/05/2025) section 6(1) and the German BSIG section 30(2), which list the
// measures in the same order as points (a) to (j).
const MEASURE_LETTERS = "abcdefghij";

function measure(
  letter: string,
  title: string,
  summary: string,
): FrameworkControl {
  const n = MEASURE_LETTERS.indexOf(letter) + 1;
  return {
    id: `21.2.${letter}`,
    evidenceStrength: "supporting",
    granularity: "requirement",
    title,
    summary,
    aliases: [
      { scheme: "DK", id: `NIS2-loven § 6, stk. 1, nr. ${n}` },
      { scheme: "DE", id: `§ 30 Abs. 2 Nr. ${n} BSIG` },
    ],
  };
}

const CONTROLS: FrameworkControl[] = [
  measure(
    "a",
    "Risk analysis and information system security policies",
    "Policies on risk analysis and information system security are defined.",
  ),
  measure(
    "b",
    "Incident handling",
    "Security incidents are handled; device logging supports their detection and investigation.",
  ),
  measure(
    "c",
    "Business continuity and crisis management",
    "Business continuity is maintained, including backup management, disaster recovery and crisis management.",
  ),
  measure(
    "d",
    "Supply chain security",
    "Security in relationships with direct suppliers and service providers is managed.",
  ),
  measure(
    "e",
    "Security in acquisition, development and maintenance",
    "Network and information systems are maintained securely, including vulnerability handling and disclosure through timely updates and minimum versions.",
  ),
  measure(
    "f",
    "Assessing the effectiveness of measures",
    "Policies and procedures assess the effectiveness of cybersecurity risk-management measures.",
  ),
  measure(
    "g",
    "Basic cyber hygiene and training",
    "Basic cyber hygiene practices such as malware protection, host firewalls and system hardening are applied, alongside security training.",
  ),
  measure(
    "h",
    "Cryptography and encryption",
    "Policies and procedures govern the use of cryptography and, where appropriate, encryption of stored data.",
  ),
  measure(
    "i",
    "Human resources security, access control and asset management",
    "Access to managed devices and organisational data is controlled and managed assets are protected.",
  ),
  measure(
    "j",
    "Multi-factor authentication and secured communications",
    "Multi-factor or continuous authentication is used, together with secured communications where appropriate.",
  ),
];

export const NIS2: FrameworkDefinition = {
  id: "nis2-2022-2555",
  name: "NIS2",
  version: "Directive (EU) 2022/2555, Art. 21(2)",
  totalRequirements: 10,
  note: "Supporting device-management evidence for selected cybersecurity risk-management measures of Art. 21(2). Organisational measures, such as risk analysis policies, business continuity, supply chain security and effectiveness assessment, are outside the scope of an Intune tenant export.",
  source: {
    url: "https://eur-lex.europa.eu/eli/dir/2022/2555/oj",
    verifiedAt: "2026-10-01",
  },
  controls: Object.fromEntries(
    CONTROLS.map((control) => [control.id, control]),
  ),
  mappings: {
    "windows-lsa-protection": ["21.2.i"],
    "windows-remote-credential-guard": ["21.2.i"],
    "windows-laps-management": ["21.2.i"],
    "windows-process-creation-logging": ["21.2.b"],
    "windows-powershell-module-logging": ["21.2.b"],

    "windows-applocker-rule-collections": ["21.2.g"],
    "windows-office-v3-signatures": [],
    "windows-office-macros-disabled": ["21.2.g"],
    "windows-office-internet-macros-blocked": ["21.2.g"],
    "windows-office-macro-antivirus": ["21.2.g"],
    "windows-office-signed-macros": ["21.2.g"],
    "macos-office-macros-disabled": ["21.2.g"],
    "windows-office-macro-settings-managed": ["21.2.g"],
    "windows-ie-disabled": ["21.2.g"],
    "windows-browser-java-blocked": ["21.2.g"],
    "windows-browser-intrusive-ads-blocked": ["21.2.g"],
    "macos-browser-intrusive-ads-blocked": ["21.2.g"],
    "windows-browser-security-settings-managed": ["21.2.g"],
    "tenant-mfa-all-apps": ["21.2.j"],
    "tenant-phishing-resistant-mfa": ["21.2.j"],
    "windows-powershell-scriptblock-logging": ["21.2.b"],
    "windows-powershell-transcription": ["21.2.b"],

    "windows-office-macro-win32-block": ["21.2.g"],
    "windows-office-child-process-block": ["21.2.g"],
    "windows-office-executable-block": ["21.2.g"],
    "windows-office-injection-block": ["21.2.g"],
    "windows-adobe-child-process-block": ["21.2.g"],

    "windows-virtualization-security": [],
    "windows-credential-theft-protection": [],

    "windows-antivirus-required": ["21.2.g"],
    "windows-periodic-antimalware-scan": ["21.2.g"],
    "windows-quality-update-deadline": ["21.2.e"],
    "windows-application-control": ["21.2.g"],
    "windows-behavior-monitoring": ["21.2.g"],
    "windows-network-inspection": ["21.2.g"],
    "windows-memory-integrity": ["21.2.g"],
    "windows-credential-guard": ["21.2.i"],
    "tenant-mfa-required": ["21.2.j"],
    "tenant-compliant-device-required": ["21.2.i"],
    "ios-app-data-transfer": ["21.2.i"],
    "android-app-data-transfer": ["21.2.i"],

    "windows-disk-encryption": ["21.2.h"],
    "macos-disk-encryption": ["21.2.h"],
    "android-storage-encryption": ["21.2.h"],
    "windows-realtime-antimalware": ["21.2.g"],
    "windows-firewall": ["21.2.g"],
    "macos-firewall": ["21.2.g"],
    "windows-password-required": ["21.2.i"],
    "macos-password-required": ["21.2.i"],
    "ios-passcode-required": ["21.2.i"],
    "android-password-required": ["21.2.i"],
    "windows-automatic-updates": ["21.2.e"],
    "windows-minimum-os-version": ["21.2.e"],
    "macos-minimum-os-version": ["21.2.e"],
    "ios-minimum-os-version": ["21.2.e"],
    "android-minimum-os-version": ["21.2.e"],
    "windows-secure-boot": ["21.2.g"],
    "windows-code-integrity": ["21.2.g"],
    "macos-system-integrity": ["21.2.g"],
    "windows-telemetry-minimized": [],
    "windows-cortana-disabled": [],
    "windows-microsoft-account-blocked": [],
    "ios-jailbreak-block": ["21.2.g"],
    "android-device-integrity": ["21.2.g"],
    "macos-gatekeeper": ["21.2.g"],
    "android-app-source-restriction": ["21.2.g"],
  },
};

/** Art. 21(2) measures without an Intune evidence mapping, in Directive order. */
export const NIS2_OUTSIDE_INTUNE_SCOPE: readonly OutsideScopeMeasure[] = [
  {
    id: "21.2.a",
    title: {
      en: "Risk analysis and information system security policies",
      de: "Konzepte in Bezug auf die Risikoanalyse und die Sicherheit in der Informationstechnik",
    },
  },
  {
    id: "21.2.c",
    title: {
      en: "Business continuity, backup management, disaster recovery and crisis management",
      de: "Aufrechterhaltung des Betriebs, Backup-Management, Wiederherstellung nach einem Notfall und Krisenmanagement",
    },
  },
  {
    id: "21.2.d",
    title: {
      en: "Supply chain security",
      de: "Sicherheit der Lieferkette",
    },
  },
  {
    id: "21.2.f",
    title: {
      en: "Policies and procedures to assess the effectiveness of risk-management measures",
      de: "Konzepte und Verfahren zur Bewertung der Wirksamkeit von Risikomanagementmaßnahmen",
    },
  },
];

/**
 * Normalizes an Art. 21(2) reference to "21.2.x". Accepts "21.2.j",
 * "21(2)(j)", "j", "(j)", national numbering such as "10B", "1A" or "Nr. 10"
 * (1 to 10 map to points a to j), and returns null for anything else.
 */
export function nis2MeasureFromCode(code: string): string | null {
  const value = code.trim().toLowerCase().replace(/\s+/g, " ");
  const letter =
    /^(?:art(?:icle|\.)? ?)?21 ?(?:\. ?2 ?\.|\( ?2 ?\)) ?\(? ?([a-j]) ?\)?$/.exec(
      value,
    )?.[1] ?? /^\(? ?([a-j]) ?\)?$/.exec(value)?.[1];
  if (letter) return `21.2.${letter}`;
  const number = /^(?:nr\. ?)?(10|[1-9])[a-z]?$/.exec(value)?.[1];
  return number ? `21.2.${MEASURE_LETTERS[Number(number) - 1]}` : null;
}

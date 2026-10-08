import { displayCheckValue, checkSummary } from "./check-results";
import { assignmentDetails, summarizeAssignments } from "./assignments";
import {
  CONTROL_STATUS_LABELS,
  CAPABILITY_STATUS_LABELS,
  CONTROL_STATUS_COLORS,
  CAPABILITY_STATUS_COLORS,
  frameworkCoverageLabel,
} from "./presentation";
import { createEvidenceManifest } from "./manifest";
import verifiedSettings from "./verified-technical-settings.json";
import additionalVerifiedSettings from "./additional-verified-settings.json";
import { humanizePropertyName } from "../configuration-parser";
import { computeMetrics } from "./management/management-summary";
import { MANAGEMENT_REPORT_STRINGS } from "./management/management-report-strings";
import {
  PALETTE,
  TONES,
  capHeight,
  centredBaseline,
  chipWidth,
  clampLine,
  drawCard,
  drawChip,
  drawDonut,
  drawEyebrow,
  drawKpiTile,
  drawMarker,
  drawPill,
  drawRule,
  drawStackedBar,
  pillMetrics,
  setFont,
  textWidth,
  wrapLines,
  type FontStyle,
  type MarkerKind,
  type RgbColor,
  type Tone,
} from "./pdf-kit";
import jsPDF from "jspdf";
import type { BrandingOptions } from "~/types/branding";
import type { DetailedExportData } from "../configuration-analyzer";
import { compareControlIds, COMPLIANCE_RULESET_VERSION } from "./engine";
import { DEF_STAN_FAMILIES } from "./frameworks/def-stan-05-138";
import { addPdfOutline, type PdfOutlineEntry } from "../pdf-outline";
import type {
  CapabilityEvidence,
  CapabilityResult,
  CapabilityStatus,
  CollectionCoverage,
  ControlAssessment,
  ControlStatus,
  FrameworkAssessment,
  TechnicalCheck,
} from "./types";

export type ComplianceFrameworkId =
  | "nist-800-53-r5"
  | "nist-csf-2"
  | "bsi-it-grundschutz"
  | "iso-27001-2022"
  | "soc2-tsc"
  | "def-stan-05-138-i4"
  | "cyber-essentials-v3"
  | "nist-800-171-r2"
  | "nist-800-171-r3"
  | "essential-eight"
  | "nis2-2022-2555";

type Locale = "en" | "de";

interface ReportStrings {
  title: string;
  coverLead: string;
  generatedOn: string;
  documentControlLabels: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  tocHeading: string;
  summaryHeading: string;
  summaryCounts: (framework: FrameworkAssessment) => string;
  summaryScope?: string;
  resultsHeading: string;
  resultsHeaders: readonly [string, string, string, string];
  assignedDeviations: string;
  assignedDeviationsExplanation: string;
  unassignedCompliant: string;
  unassignedCompliantExplanation: string;
  findingsHeading: string;
  noFindings: string;
  provenanceHeading: string;
  dataBasis: string;
  rulesetLabel: string;
  inventoryHeading: string;
  inventoryHeaders: readonly [string, string, string];
  inventoryFamilies: readonly [string, string, string];
  inventoryOther: string;
  collectionHeading: string;
  incompleteCollection: string;
  noCollectionErrors: string;
  platformScope: string;
  controlStatuses: Record<ControlStatus, string>;
  capabilityStatuses: Record<CapabilityStatus, string>;
  counterEvidenceStatuses: Record<
    "assigned" | "notAssigned" | "unknown",
    string
  >;
  notAssigned: string;
  assigned: string;
  evidenceRefs: string;
  gapIntro: string;
  disclaimer: string;
  appendixHeading: string;
  appendixContinuation: string;
  appendixHeaders: readonly [string, string, string, string, string, string];
  appendixNote: string;
  methodology: string;
  footer: string;
  methodologyHeading: string;
  notePrefix: string;
  continuationCaption: (controlId: string) => string;
  manualHeading: string;
  manualNote: string;
  manualStatus: string;
  manualStatuses: readonly [string, string, string, string];
  manualResponsible: string;
  manualDueDate: string;
  manualComment: string;
  pageNumber: (page: number, total: number) => string;
  fileFrameworkLabels: Record<ComplianceFrameworkId, string>;
}

/** jsPDF 3 methods missing from the bundled type declarations. */
interface PdfMetadataApi {
  setCreationDate: (date: Date | string) => void;
  setFileId: (value: string) => void;
}

interface ImagePropertiesProvider {
  getImageProperties: (dataUrl: string) => {
    width: number;
    height: number;
  };
}

const STRINGS: Record<Locale, ReportStrings> = {
  en: {
    title: "Technical Evidence Report: Intune Configuration",
    coverLead:
      "Evidence matrix for selected assessment points, read from the Microsoft Intune configuration",
    generatedOn: "Report date",
    documentControlLabels: [
      "Tenant",
      "Prepared for",
      "Prepared by",
      "Contact",
      "Report ID",
      "Revision",
      "Ruleset version",
      "Classification",
    ],
    tocHeading: "Table of Contents",
    summaryHeading: "Summary",
    summaryCounts: (framework) =>
      `${framework.summary.withEvidence} of ${framework.summary.totalControls} selected controls with configuration evidence (${framework.summary.partial} partial)`,
    resultsHeading: "Results Overview",
    resultsHeaders: ["Category", "Evidence", "Partial", "No evidence"],
    assignedDeviations: "Assigned deviating configurations",
    assignedDeviationsExplanation:
      "At least one assigned policy explicitly contradicts the target configuration.",
    unassignedCompliant: "Configured settings without assignment",
    unassignedCompliantExplanation:
      "The detected target configuration is not effective until it is assigned.",
    findingsHeading: "Key findings",
    noFindings: "No prioritized findings were identified.",
    provenanceHeading: "Data Basis and Scope",
    dataBasis:
      "The assessment runs on the data provided at generation time. Data basis: configuration export provided at the time the report was generated.",
    rulesetLabel: "Ruleset version",
    inventoryHeading: "Assessed inventory",
    inventoryHeaders: ["Policy family", "Items", "Assigned"],
    inventoryFamilies: [
      "Settings Catalog policies",
      "Device configurations",
      "Device compliance policies",
    ],
    inventoryOther: "Other policy families",
    collectionHeading: "Collection notes",
    incompleteCollection:
      "Data collection was incomplete. Assessment points without evidence may be caused by missing data.",
    noCollectionErrors: "No collection errors were provided.",
    platformScope: "Platforms observed in export",
    controlStatuses: {
      ...CONTROL_STATUS_LABELS,
      evidenceFound: "Technical configuration evidence detected",
      partialEvidence: "Technical configuration evidence partially detected",
      noEvidence: "No supported technical configuration evidence detected",
    },
    capabilityStatuses: {
      ...CAPABILITY_STATUS_LABELS,
      enforced: "Setting configured and assigned",
      configuredNotAssigned: "Setting configured, but not assigned",
      disabledByPolicy: "Deviating configuration detected",
      noEvidence: "No evidence",
    },
    counterEvidenceStatuses: {
      unknown: "Assignment unknown; effective scope unverified",
      assigned: "Deviating configuration detected and assigned (risk)",
      notAssigned: "Deviating configuration detected, but not assigned",
    },
    notAssigned: "Not assigned",
    assigned: "Assigned",
    evidenceRefs: "Evidence",
    gapIntro:
      "No technical evidence was found. Possible implementation through these Intune settings:",
    disclaimer:
      "This report documents technical evidence from the tenant's Microsoft Intune configuration. It is not a compliance certification or an IT Grundschutz check and does not replace an audit. Missing evidence means that no supported configuration with a known assignment was detected in the evaluated dataset.",
    appendixHeading: "Appendix A: Evidence Register",
    appendixContinuation: "Appendix A (continued)",
    appendixHeaders: [
      "Ref",
      "Policy",
      "Type",
      "Setting",
      "Value",
      "Assignment",
    ],
    appendixNote:
      "Referenced assessment points for each item of evidence are listed in the relevant sections.",
    methodology:
      "Evidence is determined exclusively from concrete Intune settings: An assessment point is considered technically evidenced only when a recognized setting is configured with a recognized value and the policy is assigned. Configurations that explicitly contradict the target state are reported separately. Unsupported settings or settings that cannot be mapped unambiguously remain unassessed. Organizational requirements are not part of this automated technical assessment and must be assessed separately.",
    footer: "Generated with Intune Documentation (intunedocumentation.com)",
    methodologyHeading: "Methodology",
    notePrefix: "Note: ",
    continuationCaption: (controlId) => `${controlId} (continued)`,
    manualHeading: "Manual assessment (IT Grundschutz check)",
    manualNote:
      "The manual assessment of implementation status is performed by the reviewer and is independent of the automated technical evidence.",
    manualStatus: "Implementation status",
    manualStatuses: ["not applicable", "yes", "partial", "no"],
    manualResponsible: "Responsible",
    manualDueDate: "Target date",
    manualComment: "Comment",
    pageNumber: (page, total) => `Page ${page} of ${total}`,
    fileFrameworkLabels: {
      "nist-800-53-r5": "NIST-800-53-R5",
      "nist-csf-2": "NIST-CSF-2",
      "bsi-it-grundschutz": "BSI-IT-Grundschutz",
      "iso-27001-2022": "ISO-27001",
      "soc2-tsc": "SOC-2",
      "def-stan-05-138-i4": "Def-Stan-05-138",
      "cyber-essentials-v3": "Cyber-Essentials",
      "essential-eight": "Essential-Eight",
      "nist-800-171-r2": "NIST-800-171-R2",
      "nist-800-171-r3": "NIST-800-171-R3",
      "nis2-2022-2555": "NIS2",
    },
  },
  de: {
    title: "Technischer Nachweisbericht: Intune-Konfiguration",
    coverLead:
      "Nachweismatrix für ausgewählte Prüfpunkte aus der Microsoft-Intune-Konfiguration",
    generatedOn: "Berichtsstand",
    documentControlLabels: [
      "Mandant",
      "Erstellt für",
      "Erstellt von",
      "Kontakt",
      "Berichts-ID",
      "Revision",
      "Regelwerk-Version",
      "Klassifizierung",
    ],
    tocHeading: "Inhaltsverzeichnis",
    summaryHeading: "Zusammenfassung",
    summaryCounts: (framework) => {
      const requirements = framework.controls.filter(
        (item) => item.control.tier,
      );
      const buildingBlocks = framework.controls.filter(
        (item) => !item.control.tier,
      );
      const requirementsWithEvidence = requirements.filter(
        (item) => item.status === "evidenceFound",
      ).length;
      const requirementsPartial = requirements.filter(
        (item) => item.status === "partialEvidence",
      ).length;
      const buildingBlocksWithEvidence = buildingBlocks.filter(
        (item) => item.status === "evidenceFound",
      ).length;
      const buildingBlocksPartial = buildingBlocks.filter(
        (item) => item.status === "partialEvidence",
      ).length;
      return `${requirementsWithEvidence} von ${requirements.length} Anforderungen mit Nachweis (${requirementsPartial} teilweise), ${buildingBlocksWithEvidence} von ${buildingBlocks.length} Bausteinen mit Nachweis (${buildingBlocksPartial} teilweise)`;
    },
    summaryScope: "Bewertet werden nur ausgewählte technische Prüfpunkte.",
    resultsHeading: "Ergebnisübersicht",
    resultsHeaders: ["Kategorie", "Nachweis", "Teilweise", "Kein Nachweis"],
    assignedDeviations: "Abweichende Konfigurationen (zugewiesen)",
    assignedDeviationsExplanation:
      "Mindestens eine zugewiesene Richtlinie widerspricht der Sollkonfiguration.",
    unassignedCompliant: "Konfigurierte Einstellungen ohne Zuweisung",
    unassignedCompliantExplanation:
      "Die erkannte Sollkonfiguration ist ohne Zuweisung nicht wirksam.",
    findingsHeading: "Wesentliche Feststellungen",
    noFindings: "Keine priorisierten Feststellungen ermittelt.",
    provenanceHeading: "Datengrundlage und Geltungsbereich",
    dataBasis:
      "Die Bewertung erfolgt auf Basis der zum Zeitpunkt der Berichtserstellung vorliegenden Daten. Datengrundlage: zum Zeitpunkt der Berichtserstellung übermittelter Konfigurationsexport.",
    rulesetLabel: "Regelwerk-Version",
    inventoryHeading: "Geprüfter Bestand",
    inventoryHeaders: ["Richtlinienfamilie", "Anzahl", "Davon mit Zuweisung"],
    inventoryOther: "Weitere Richtlinienfamilien",
    inventoryFamilies: [
      "Einstellungskatalog-Richtlinien",
      "Gerätekonfigurationen",
      "Gerätekonformitätsrichtlinien",
    ],
    collectionHeading: "Erhebungshinweise",
    incompleteCollection:
      "Die Datenerhebung war unvollständig. Prüfpunkte ohne Nachweis können auf fehlende Daten zurückgehen.",
    noCollectionErrors: "Keine Erhebungsfehler übermittelt.",
    platformScope: "Im Export erkannte Plattformen",
    controlStatuses: {
      ...CONTROL_STATUS_LABELS,
      notApplicable: "Außerhalb des gewählten Geltungsbereichs",
      notAssessed: "Nicht bewertet",
      conflictingEvidence: "Widersprüchliche Richtliniennachweise",
      evidenceFound: "Technischer Konfigurationsnachweis erkannt",
      partialEvidence: "Technischer Konfigurationsnachweis teilweise erkannt",
      noEvidence:
        "Kein unterstützter technischer Konfigurationsnachweis erkannt",
    },
    capabilityStatuses: {
      ...CAPABILITY_STATUS_LABELS,
      requirementAssigned: "Konformitätsanforderung zugewiesen",
      assignmentUnknown: "Zuweisung unbekannt",
      conflictingEvidence: "Widersprüchliche Richtliniennachweise",
      partialConfiguration: "Erforderliche Einstellungen teilweise vorhanden",
      collectionIncomplete: "Datenerhebung unvollständig",
      notApplicable: "Außerhalb des Geltungsbereichs",
      enforced: "Einstellung konfiguriert und zugewiesen",
      configuredNotAssigned:
        "Einstellung konfiguriert, jedoch nicht zugewiesen",
      disabledByPolicy: "Abweichende Konfiguration erkannt",
      noEvidence: "Kein Nachweis",
    },
    counterEvidenceStatuses: {
      unknown: "Assignment unknown; effective scope unverified",
      assigned: "Abweichende Konfiguration erkannt und zugewiesen (Risiko)",
      notAssigned: "Abweichende Konfiguration erkannt, jedoch nicht zugewiesen",
    },
    notAssigned: "Nicht zugewiesen",
    assigned: "Zugewiesen",
    evidenceRefs: "Belege",
    gapIntro:
      "Kein technischer Nachweis gefunden. Mögliche technische Umsetzung mit folgenden Intune-Einstellungen:",
    disclaimer:
      "Dieser Bericht dokumentiert technische Nachweise aus der Microsoft-Intune-Konfiguration des Mandanten. Der Bericht stellt weder eine Zertifizierung noch einen IT-Grundschutz-Check dar und ersetzt keine Prüfung. Ein fehlender Nachweis bedeutet, dass im ausgewerteten Datenbestand keine unterstützte und wirksam zugewiesene Konfiguration erkannt wurde.",
    appendixHeading: "Anhang A: Nachweisverzeichnis",
    appendixContinuation: "Anhang A (Fortsetzung)",
    appendixHeaders: [
      "Ref",
      "Richtlinie",
      "Typ",
      "Einstellung",
      "Wert",
      "Zuweisung",
    ],
    appendixNote:
      "Referenzierte Prüfpunkte je Nachweis sind den Abschnitten zu entnehmen.",
    methodology:
      "Nachweise werden ausschließlich anhand konkreter Intune-Einstellungen ermittelt: Ein Prüfpunkt gilt nur dann als technisch nachgewiesen, wenn eine erkannte Einstellung mit einem erkannten Sollwert konfiguriert und die Richtlinie zugewiesen ist. Konfigurationen, die der Sollvorgabe ausdrücklich widersprechen, werden gesondert ausgewiesen. Nicht unterstützte oder nicht eindeutig zuordenbare Einstellungen bleiben unbewertet. Organisatorische Anforderungen sind nicht Teil dieser automatisierten technischen Prüfung und müssen separat bewertet werden.",
    footer: "Erstellt mit Intune Documentation (intunedocumentation.com)",
    methodologyHeading: "Methodik",
    notePrefix: "Hinweis: ",
    continuationCaption: (controlId) => `${controlId} (Fortsetzung)`,
    manualHeading: "Manuelle Bewertung (IT-Grundschutz-Check)",
    manualNote:
      "Die manuelle Bewertung des Umsetzungsstatus erfolgt durch die prüfende Person und ist unabhängig vom automatisierten technischen Nachweis.",
    manualStatus: "Umsetzungsstatus",
    manualStatuses: ["entbehrlich", "ja", "teilweise", "nein"],
    manualResponsible: "Verantwortlich",
    manualDueDate: "Zieltermin",
    manualComment: "Bemerkung",
    pageNumber: (page, total) => `Seite ${page} von ${total}`,
    fileFrameworkLabels: {
      "nist-800-53-r5": "NIST-800-53-R5",
      "nist-csf-2": "NIST-CSF-2",
      "bsi-it-grundschutz": "BSI-IT-Grundschutz",
      "iso-27001-2022": "ISO-27001",
      "soc2-tsc": "SOC-2",
      "def-stan-05-138-i4": "Def-Stan-05-138",
      "cyber-essentials-v3": "Cyber-Essentials",
      "essential-eight": "Essential-Eight",
      "nist-800-171-r2": "NIST-800-171-R2",
      "nist-800-171-r3": "NIST-800-171-R3",
      "nis2-2022-2555": "NIS2",
    },
  },
};

export const GERMAN_CAPABILITY_NAMES: Readonly<Record<string, string>> = {
  "windows-lsa-protection": "LSA-Prozessschutz erforderlich",
  "windows-remote-credential-guard": "Remote Credential Guard erforderlich",
  "windows-laps-management": "Windows-LAPS-Kennwortverwaltung aktiviert",
  "windows-process-creation-logging":
    "Prozesserstellungsüberwachung mit Befehlszeilen",
  "windows-powershell-module-logging":
    "PowerShell-Protokollierung aller Module",
  "windows-applocker-rule-collections":
    "AppLocker-Regelsammlungstypen und Erzwingung",
  "windows-office-v3-signatures": "VBA-V3-Signaturen erforderlich",
  "windows-office-macros-disabled": "Office-VBA-Makros deaktiviert",
  "windows-office-internet-macros-blocked":
    "Office-Makros aus dem Internet blockiert",
  "windows-office-macro-antivirus": "Laufzeitprüfung von Office-Makros",
  "windows-office-signed-macros": "Nur signierte Office-Makros zugelassen",
  "windows-office-macro-settings-managed":
    "Office-Makroeinstellungen durch Richtlinien verwaltet",
  "macos-office-macros-disabled": "Office-VBA-Makros unter macOS deaktiviert",
  "windows-ie-disabled": "Internet Explorer 11 deaktiviert",
  "windows-browser-java-blocked": "Java in der Internetzone blockiert",
  "windows-browser-intrusive-ads-blocked":
    "Aufdringliche Browserwerbung blockiert",
  "macos-browser-intrusive-ads-blocked":
    "Aufdringliche Browserwerbung unter macOS blockiert",
  "windows-browser-security-settings-managed":
    "Browsersicherheitseinstellungen durch Richtlinien verwaltet",
  "windows-powershell-scriptblock-logging":
    "PowerShell-Skriptblockprotokollierung aktiviert",
  "windows-powershell-transcription": "PowerShell-Transkription aktiviert",
  "tenant-mfa-all-apps":
    "MFA für alle Cloud-Apps im Richtlinienumfang erforderlich",
  "tenant-phishing-resistant-mfa": "Phishingresistente MFA erforderlich",

  "windows-office-macro-win32-block":
    "Win32-Aufrufe durch Office-Makros blockiert",
  "windows-office-child-process-block": "Unterprozesse von Office blockiert",
  "windows-office-executable-block": "Ausführbare Office-Inhalte blockiert",
  "windows-office-injection-block": "Prozessinjektion durch Office blockiert",
  "windows-adobe-child-process-block":
    "Unterprozesse von Adobe Reader blockiert",

  "windows-antivirus-required": "Antivirenschutz als Konformitätsanforderung",
  "windows-periodic-antimalware-scan": "Regelmäßige Schadsoftwareprüfungen",
  "windows-quality-update-deadline": "Qualitätsupdate-Frist bis 14 Tage",
  "windows-application-control": "Anwendungssteuerung im Erzwingungsmodus",
  "windows-behavior-monitoring": "Verhaltensüberwachung",
  "windows-network-inspection": "Netzwerkprüfung gegen Schadsoftware",
  "windows-memory-integrity": "Speicherintegrität (HVCI)",
  "windows-virtualization-security": "Virtualisierungsbasierte Sicherheit",
  "windows-credential-guard": "Credential Guard konfiguriert",
  "windows-credential-theft-protection":
    "Schutz vor Diebstahl von Anmeldeinformationen",
  "tenant-mfa-required": "MFA-Anforderung durch bedingten Zugriff",
  "tenant-compliant-device-required":
    "Gerätekonformität durch bedingten Zugriff",
  "ios-app-data-transfer":
    "Datentransferbeschränkungen für verwaltete iOS-Apps",
  "android-app-data-transfer":
    "Datentransferbeschränkungen für verwaltete Android-Apps",
  "windows-disk-encryption": "Festplattenverschlüsselung (BitLocker)",
  "windows-realtime-antimalware":
    "Echtzeitschutz durch Microsoft Defender Antivirus",
  "windows-firewall": "Windows-Firewall",
  "windows-password-required": "Kennwort oder PIN erforderlich (Windows)",
  "windows-automatic-updates": "Automatische Updates (Windows)",
  "windows-secure-boot": "Sicherer Start (Secure Boot)",
  "windows-code-integrity": "Codeintegrität erforderlich",
  "windows-minimum-os-version": "Mindestversion des Betriebssystems (Windows)",
  "windows-telemetry-minimized": "Minimierte Diagnosedaten (Windows)",
  "windows-cortana-disabled": "Cortana deaktiviert",
  "windows-microsoft-account-blocked": "Private Microsoft-Konten gesperrt",
  "macos-disk-encryption": "Festplattenverschlüsselung (FileVault)",
  "macos-firewall": "macOS-Firewall",
  "macos-password-required": "Kennwort oder PIN erforderlich (macOS)",
  "macos-system-integrity": "System Integrity Protection",
  "macos-gatekeeper": "Beschränkung der App-Quellen durch Gatekeeper",
  "macos-minimum-os-version": "Mindestversion des Betriebssystems (macOS)",
  "ios-passcode-required": "Gerätecode erforderlich (iOS/iPadOS)",
  "ios-jailbreak-block": "Blockierung von Jailbreak-Geräten",
  "ios-minimum-os-version": "Mindestversion des Betriebssystems (iOS/iPadOS)",
  "android-storage-encryption": "Speicherverschlüsselung (Android)",
  "android-password-required": "Kennwort oder PIN erforderlich (Android)",
  "android-device-integrity": "Geräteintegrität (Android)",
  "android-app-source-restriction":
    "Blockierung unbekannter App-Quellen (Android)",
  "android-minimum-os-version": "Mindestversion des Betriebssystems (Android)",
};

const PRODUCT_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bBit Locker\b/g, "BitLocker"],
  [/\bFile Vault\b/g, "FileVault"],
  [/\bSmart Screen\b/g, "SmartScreen"],
  [/\bMac ?Os\b/gi, "macOS"],
  [/\bWi ?Fi\b/gi, "Wi-Fi"],
  [/\bIos\b/g, "iOS"],
  [/\bOs\b/g, "OS"],
  [/\bPin\b/g, "PIN"],
  [/\bTpm\b/g, "TPM"],
  [/\bMfa\b/g, "MFA"],
  [/\bBios\b/g, "BIOS"],
  [/\bUsb\b/g, "USB"],
  [/\bLaps\b/g, "LAPS"],
  [/\bVpn\b/g, "VPN"],
];

/**
 * Graph property names as the documentation export humanizes them, with
 * well-known product terms restored (BitLocker, OS, PIN and similar).
 */
export function readablePropertyName(propertyPath: string): string {
  return PRODUCT_TERMS.reduce(
    (text, [pattern, term]) => text.replace(pattern, term),
    humanizePropertyName(propertyPath),
  );
}

/** Setting names from the verified public setting definition catalogs. */
const VERIFIED_SETTING_NAMES: ReadonlyMap<string, string> = new Map(
  [...verifiedSettings.catalog, ...additionalVerifiedSettings.catalog].map(
    (definition) => [definition.id, definition.name] as const,
  ),
);

const ASSIGNED_COUNTER_EVIDENCE_COLOR: RgbColor = [190, 45, 45];
const UNASSIGNED_COUNTER_EVIDENCE_COLOR: RgbColor = [171, 95, 0];

const GERMAN_BSI_FRAMEWORK_NOTE =
  "Die Bausteine zu Clients SYS.2.2.3, SYS.2.4, SYS.3.2.1 und SYS.3.2.2 werden auf Anforderungsebene abgebildet. Weitere Bausteine werden derzeit nur auf Bausteinebene betrachtet. Berücksichtigt werden ausschließlich ausgewählte technische Nachweise aus der Geräteverwaltung.";

const GERMAN_EVIDENCE_VALUE_TRANSLATIONS: Readonly<Record<string, string>> = {
  "Settings Catalog": "Einstellungskatalog",
  "Compliance Policy": "Gerätekonformitätsrichtlinie",
  "All Users": "Alle Benutzer",
  "All Devices": "Alle Geräte",
  "Custom target": "Benutzerdefinierte Zuweisung",
  "Not assigned": "Nicht zugewiesen",
};

const GERMAN_COMPLIANCE_NOTE_TRANSLATIONS: Readonly<Record<string, string>> = {
  "Compliance policy with a block action for noncompliant devices.":
    "Gerätekonformitätsrichtlinie mit Blockierungsaktion für nicht konforme Geräte.",
  "Compliance policy: marks devices noncompliant. Access enforcement depends on Conditional Access.":
    "Die Gerätekonformitätsrichtlinie kennzeichnet Geräte als nicht konform. Die Zugriffsdurchsetzung hängt von Richtlinien für bedingten Zugriff ab.",
};

function translateEvidenceValue(value: string, locale: Locale): string {
  if (locale !== "de") return value;
  if (value.startsWith("Group: ")) {
    return `Gruppe: ${value.slice("Group: ".length)}`;
  }
  if (value.startsWith("Excluded: ")) {
    return `Ausgeschlossen: ${translateEvidenceValue(value.slice("Excluded: ".length), locale)}`;
  }
  return GERMAN_EVIDENCE_VALUE_TRANSLATIONS[value] ?? value;
}

function translateEvidenceNote(value: string, locale: Locale): string {
  if (locale !== "de") return value;
  return GERMAN_COMPLIANCE_NOTE_TRANSLATIONS[value] ?? value;
}

function translateAssessmentLimitation(text: string): string {
  const sourceGap =
    /^(\w+): (not collected|collection incomplete)\. Refresh the policies to retry collection\. See collection coverage for the API error details\.$/.exec(
      text,
    );
  if (sourceGap)
    return `${sourceGap[1]}: ${sourceGap[2] === "not collected" ? "nicht erhoben" : "Datenerhebung unvollständig"}. Richtlinien aktualisieren, um die Erhebung erneut zu versuchen. API-Fehlerdetails stehen im Abschnitt zur Datenerhebung.`;
  const translations: Record<string, string> = {
    "Conditional Access policies were not collected. Enable Include Conditional Access in Settings, complete sign-in or consent if requested, and refresh the policies to assess MFA and access requirements.":
      "Richtlinien für bedingten Zugriff wurden nicht erhoben. In den Einstellungen den bedingten Zugriff einschließen, gegebenenfalls Anmeldung oder Zustimmung abschließen und die Richtlinien aktualisieren, um MFA- und Zugriffsanforderungen zu bewerten.",
    "Assignment data is unavailable for some matching policies; effective targeting remains unknown.":
      "Für einige passende Richtlinien fehlen Zuweisungsdaten; der tatsächliche Zielumfang bleibt unbekannt.",
    "These settings support part of this control. Remaining technical and organizational requirements need separate assessment.":
      "Diese Einstellungen liefern Teilnachweise. Weitere technische und organisatorische Anforderungen sind separat zu bewerten.",
    "Relevant policy collection is incomplete; additional or contradictory evidence may be missing.":
      "Die relevante Datenerhebung ist unvollständig. Weitere oder widersprüchliche Nachweise können fehlen.",
    "Mixed policy evidence. Review profile settings and targeting overlap; a device conflict has not been established.":
      "Widersprüchliche Richtliniennachweise. Profileinstellungen und überlappende Zuweisungen prüfen; ein Gerätekonflikt wurde nicht nachgewiesen.",
    "Not all required settings are present together on an assigned policy.":
      "Nicht alle erforderlichen Einstellungen sind gemeinsam in einer zugewiesenen Richtlinie vorhanden.",
    "A minimum version is configured; whether it is current is not assessed.":
      "Eine Mindestversion ist konfiguriert; ob sie aktuell ist, wird nicht bewertet.",
    "No detector is available for this control in the selected platform scope.":
      "Für diesen Prüfpunkt ist im gewählten Plattformumfang keine Erkennungsregel verfügbar.",
    "Hardware support and installed OS security-update support are not verified. A configured minimum version does not establish currency.":
      "Hardware-Unterstützung und Sicherheitsupdates für das installierte Betriebssystem sind nicht geprüft. Eine Mindestversion belegt keine Aktualität.",
    "XProtect status, installed software and actual activation of macOS protections are unassessed.":
      "XProtect-Status, installierte Software und tatsächliche Aktivierung der macOS-Schutzfunktionen sind unbewertet.",
    "FileVault recovery key custody and storage location are unassessed.":
      "Verwahrung und Speicherort der FileVault-Wiederherstellungsschlüssel sind unbewertet.",
    "LSA protected-mode monitoring and applicable RDP restrictions are unassessed.":
      "Überwachung des geschützten LSA-Modus und erforderliche RDP-Beschränkungen sind unbewertet.",
    "Passcode complexity, lock timeout and effective device enforcement require separate review.":
      "Code-Komplexität, Sperrfrist und tatsächliche Durchsetzung am Gerät sind separat zu prüfen.",
    "Installed OS and app support, actual patch installation and replacement of unsupported devices are unassessed.":
      "Support für Betriebssystem und Apps, tatsächliche Update-Installation und Ersatz nicht mehr unterstützter Geräte sind unbewertet.",
    "Approved device models and organizational authorization are unassessed.":
      "Freigegebene Gerätemodelle und organisatorische Genehmigungen sind unbewertet.",
    "Alerts, wipe and lock actions, grace periods and effective Conditional Access coverage require separate review.":
      "Warnungen, Lösch- und Sperraktionen, Karenzfristen und tatsächlicher Geltungsbereich des bedingten Zugriffs sind separat zu prüfen.",
  };
  return translations[text] ?? text;
}

/**
 * Calendar parts in local time, or in UTC for fixed render dates so the
 * same input renders the same date in every time zone.
 */
function dateParts(date: Date, utc = false) {
  return {
    year: String(utc ? date.getUTCFullYear() : date.getFullYear()),
    month: String((utc ? date.getUTCMonth() : date.getMonth()) + 1).padStart(
      2,
      "0",
    ),
    day: String(utc ? date.getUTCDate() : date.getDate()).padStart(2, "0"),
    hours: String(utc ? date.getUTCHours() : date.getHours()).padStart(2, "0"),
    minutes: String(utc ? date.getUTCMinutes() : date.getMinutes()).padStart(
      2,
      "0",
    ),
    seconds: String(utc ? date.getUTCSeconds() : date.getSeconds()).padStart(
      2,
      "0",
    ),
  };
}

/** PDF date string with an explicit UTC offset. */
function pdfUtcDate(date: Date): string {
  const { year, month, day, hours, minutes, seconds } = dateParts(date, true);
  return `D:${year}${month}${day}${hours}${minutes}${seconds}+00'00'`;
}

function formatReportDate(date: Date, locale: Locale, utc = false): string {
  const { year, month, day } = dateParts(date, utc);
  return locale === "de"
    ? `${day}.${month}.${year}`
    : `${year}-${month}-${day}`;
}

function hexToRgb(hex: string | undefined, fallback: RgbColor): RgbColor {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex ?? "");
  if (!match?.[1] || !match[2] || !match[3]) return fallback;
  return [
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  ];
}

function localIsoDate(date: Date, utc = false): string {
  const { year, month, day } = dateParts(date, utc);
  return `${year}-${month}-${day}`;
}

function localTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}${minutes}`;
}

function tenantSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

const FRAMEWORK_REPORT_CODES: Record<ComplianceFrameworkId, string> = {
  "nist-800-53-r5": "N53",
  "nist-csf-2": "CSF",
  "bsi-it-grundschutz": "BSI",
  "iso-27001-2022": "ISO",
  "soc2-tsc": "SOC",
  "def-stan-05-138-i4": "DEF",
  "cyber-essentials-v3": "CE",
  "essential-eight": "E8",
  "nist-800-171-r2": "N171",
  "nist-800-171-r3": "N171R3",
  "nis2-2022-2555": "NIS2",
};

function frameworkReportCode(frameworkId: ComplianceFrameworkId): string {
  return FRAMEWORK_REPORT_CODES[frameworkId];
}

/**
 * Four character report id suffix. Random by default; derived from the seed
 * when one is given so a fixed render date yields the same report id.
 */
function reportSuffix(seed?: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let hash = seed === undefined ? 0 : fnv1a(seed, 0x811c9dc5);
  let suffix = "";
  for (let index = 0; index < 4; index += 1) {
    if (seed === undefined) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "0";
    } else {
      suffix += alphabet[hash % alphabet.length] ?? "0";
      hash = Math.floor(hash / alphabet.length);
    }
  }
  return suffix;
}

function fnv1a(text: string, offset: number): number {
  let hash = offset >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** 32 hex characters for the PDF file identifier, derived from the inputs. */
function deterministicFileId(seed: string): string {
  return [0x811c9dc5, 0x01234567, 0x89abcdef, 0x5bd1e995]
    .map((offset) => fnv1a(seed, offset).toString(16).padStart(8, "0"))
    .join("")
    .toUpperCase();
}

function defaultReportId(
  frameworkId: ComplianceFrameworkId,
  generatedAt: Date,
  seed?: string,
): string {
  return `IDOC-${frameworkReportCode(frameworkId)}-${localIsoDate(generatedAt, seed !== undefined).replaceAll("-", "")}-${reportSuffix(seed)}`;
}

function formatReportTimestamp(
  date: Date,
  locale: Locale,
  utc = false,
): string {
  if (locale === "en") return date.toISOString();
  const { hours, minutes } = dateParts(date, utc);
  return `${formatReportDate(date, locale, utc)}, ${hours}:${minutes} Uhr${utc ? " UTC" : ""}`;
}

function truncate(value: string, maximumLength: number): string {
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, maximumLength - 3)}...`;
}

export interface ComplianceReportMetadata {
  tenantLabel?: string;
  preparedFor?: string;
  preparedBy?: string;
  contact?: string;
  classification?: string;
  reportId?: string;
  revision?: string;
}

export interface ComplianceReportOptions {
  frameworkId: ComplianceFrameworkId;
  branding?: BrandingOptions;
  metadata?: ComplianceReportMetadata;
  /**
   * Fixed render time. Replaces the current time for every displayed date,
   * the default report id and the PDF metadata, so the same input always
   * produces the same bytes.
   */
  renderDate?: Date;
  /**
   * Sample mode. Summary and results overview still cover every control, but
   * detail pages are rendered only for the listed control ids.
   */
  excerpt?: { controlIds: readonly string[] };
}

interface EvidenceRegistryEntry {
  ref: string;
  evidence: CapabilityEvidence;
}

interface TocEntry {
  title: string;
  page: number;
  level: 0 | 1;
  /** Control family of a level 1 entry, used to group the PDF bookmarks. */
  family?: string;
}

type FindingKind = "risk" | "gap" | "unassigned";

interface LayoutStrings {
  productName: string;
  coverTenant: string;
  coverFootRight: string;
  sampleTag: string;
  donutCaption: string;
  donutSub: string;
  donutCount: (count: number, total: number) => string;
  atAGlance: string;
  glanceNote: (ruleset: string) => string;
  documentControl: string;
  frameworkLabel: string;
  aboutEyebrow: string;
  disclaimerHeading: string;
  summaryEyebrow: string;
  heroLabel: string;
  tileCaptions: Record<"noEvidence" | "conflictingEvidence", string>;
  withEvidenceLabel: string;
  withEvidenceCaption: (configuration: number, supporting: number) => string;
  safeguardsLabel: string;
  safeguardsCaption: (total: number) => string;
  distributionHeading: string;
  controlsCount: (count: number) => string;
  familyHeading: string;
  tierHeading: string;
  familySmall: string;
  heroLead: (count: number, total: number) => string;
  findingsSmall: string;
  findingKinds: Record<FindingKind, string>;
  moreFindings: (count: number) => string;
  moreFindingsExcerpt: (count: number) => string;
  moreFamilies: (count: number) => string;
  seePage: (page: number) => string;
  scopeNote: string;
  resultsEyebrow: string;
  resultsLead: string;
  overviewHeaders: readonly [string, string, string, string, string];
  groupSummary: (count: number, total: number) => string;
  ofCount: (count: number, total: number) => string;
  noneRecorded: string;
  seeBelow: string;
  seeRegister: (ref: string) => string;
  evidenceItems: (count: number) => string;
  notAvailable: string;
  excerptNote: (ids: string) => string;
  dataEyebrow: string;
  coverageHeaders: readonly [string, string, string, string, string];
  collectionStatuses: Record<CollectionCoverage["status"], string>;
  detailEyebrow: string;
  capabilitiesWord: string;
  evidenceCount: (count: number) => string;
  checkHeaders: readonly [string, string, string, string];
  policyLabel: string;
  evidenceLabel: string;
  noPolicy: string;
  assignmentUnknown: string;
  unassessedHeading: string;
  gapHeading: (title: string) => string;
  appendixEyebrow: string;
  appendixLead: string;
  methodologyEyebrow: string;
  methodologyEarlyEyebrow: string;
  howToRead: string;
  howToReadNotes: readonly [string, string, string, string];
  shortStatuses: Record<ControlStatus, string>;
  assessmentLabels: Record<TechnicalCheck["assessmentStatus"], string>;
  resultLabels: Record<NonNullable<TechnicalCheck["result"]>, string>;
  notFound: string;
  unavailable: string;
}

const LAYOUT: Record<Locale, LayoutStrings> = {
  en: {
    productName: "Intune Documentation",
    coverTenant: "Tenant",
    coverFootRight: "Technical configuration evidence, not a certification",
    sampleTag: "SAMPLE REPORT, FICTIONAL TENANT",
    donutCaption: "Controls with supporting technical evidence",
    donutSub: "Supporting evidence only, not a compliance score",
    donutCount: (count, total) => `${count} of ${total} controls`,
    atAGlance: "At a glance",
    glanceNote: (ruleset) =>
      `Evidence is read from the Microsoft Intune configuration export on the report date and mapped using ruleset ${ruleset}. Organizational aspects of each control are listed separately for review.`,
    documentControl: "Document control",
    frameworkLabel: "Framework",
    aboutEyebrow: "About this report",
    disclaimerHeading: "Read this first",
    summaryEyebrow: "01 Executive summary",
    heroLabel: "Controls with technical evidence",
    tileCaptions: {
      noEvidence: "controls without recognized evidence",
      conflictingEvidence: "controls with mixed policy evidence",
    },
    withEvidenceLabel: "With technical evidence",
    withEvidenceCaption: (configuration, supporting) =>
      `${configuration} configuration, ${supporting} supporting or partial`,
    safeguardsLabel: "Safeguards in place",
    safeguardsCaption: (total) => `of ${total} mapped, set up and switched on`,
    distributionHeading: "Status distribution",
    controlsCount: (count) => `${count} controls`,
    familyHeading: "Coverage by family",
    tierHeading: "Coverage by tier",
    familySmall: "controls with technical evidence",
    heroLead: (count, total) =>
      `${count} of ${total} assessable controls have supporting technical evidence in the Intune configuration.`,
    findingsSmall: "ordered by severity, then control",
    findingKinds: {
      risk: "Assigned deviation",
      gap: "No recognized evidence",
      unassigned: "Not assigned",
    },
    moreFindings: (count) =>
      count === 1
        ? "1 further finding is listed on the control detail pages."
        : `${count} further findings are listed on the control detail pages.`,
    moreFindingsExcerpt: (count) =>
      count === 1
        ? "1 further finding is listed in the full report."
        : `${count} further findings are listed in the full report.`,
    moreFamilies: (count) =>
      count === 1
        ? "1 more family is listed in the results overview."
        : `${count} more families are listed in the results overview.`,
    seePage: (page) => `See page ${page}`,
    scopeNote: "Scope note",
    resultsEyebrow: "02 Results",
    resultsLead:
      "Each selected control, its rolled up status, how many of its capabilities are evidenced, and where the supporting evidence is recorded.",
    overviewHeaders: ["Control", "Status", "Capabilities", "Evidence", "Page"],
    groupSummary: (count, total) => `${count} of ${total} with evidence`,
    ofCount: (count, total) => `${count} of ${total}`,
    noneRecorded: "None recorded",
    seeBelow: "See below",
    seeRegister: (ref) => `(see register ${ref})`,
    evidenceItems: (count) =>
      count === 1 ? "1 evidence item" : `${count} evidence items`,
    notAvailable: "n/a",
    excerptNote: (ids) =>
      `Sample report: detail pages are included for selected controls only (${ids}). A full report includes a detail page for every control.`,
    dataEyebrow: "03 Data basis",
    coverageHeaders: [
      "Policy family",
      "Collection",
      "Policies",
      "Recognized",
      "Unrecognized",
    ],
    collectionStatuses: {
      complete: "complete",
      incomplete: "incomplete",
      unknown: "unknown",
      notCollected: "not collected",
    },
    detailEyebrow: "Control detail",
    capabilitiesWord: "capabilities",
    evidenceCount: (count) =>
      count === 1 ? "1 evidence reference" : `${count} evidence references`,
    checkHeaders: ["Check", "Expected", "Actual", "Result"],
    policyLabel: "Policy",
    evidenceLabel: "Evidence",
    noPolicy: "No matching policy found",
    assignmentUnknown: "Assignment unknown",
    unassessedHeading:
      "Additional verification: not assessed by technical evidence",
    gapHeading: (title) => `Gap: ${title}`,
    appendixEyebrow: "Appendix A",
    appendixLead:
      "Every configuration value cited in this report, as read from the tenant export. References are stable within a report ID.",
    methodologyEyebrow: "Appendix B",
    methodologyEarlyEyebrow: "About the method",
    howToRead: "How to read this report",
    howToReadNotes: [
      "Status is shown by marker shape and label, never by colour alone.",
      "A control rolls up from its capabilities. A capability rolls up from its checks.",
      "Only assigned policies count as evidence. Configured but unassigned settings are reported separately.",
      "Evidence references point to rows of the evidence register in Appendix A.",
    ],
    shortStatuses: CONTROL_STATUS_LABELS,
    assessmentLabels: {
      checked: "Checked",
      unableToCheck: "Unable to check",
      outsideScope: "Outside selected scope",
    },
    resultLabels: {
      matches: "Matches expected value",
      missing: "Missing",
      different: "Different value",
    },
    notFound: "Not found",
    unavailable: "Unavailable",
  },
  de: {
    productName: "Intune Documentation",
    coverTenant: "Mandant",
    coverFootRight: "Technischer Konfigurationsnachweis, keine Zertifizierung",
    sampleTag: "MUSTERBERICHT, FIKTIVER MANDANT",
    donutCaption: "Prüfpunkte mit unterstützendem technischem Nachweis",
    donutSub: "Nur unterstützender Nachweis, keine Compliance-Bewertung",
    donutCount: (count, total) => `${count} von ${total} Prüfpunkten`,
    atAGlance: "Auf einen Blick",
    glanceNote: (ruleset) =>
      `Nachweise werden zum Berichtsstand aus dem Konfigurationsexport von Microsoft Intune gelesen und mit Regelwerk ${ruleset} zugeordnet. Organisatorische Aspekte der Prüfpunkte sind gesondert zur Prüfung aufgeführt.`,
    documentControl: "Dokumentenlenkung",
    frameworkLabel: "Rahmenwerk",
    aboutEyebrow: "Zu diesem Bericht",
    disclaimerHeading: "Bitte zuerst lesen",
    summaryEyebrow: "01 Überblick",
    heroLabel: "Prüfpunkte mit technischem Nachweis",
    tileCaptions: {
      noEvidence: "Prüfpunkte ohne erkannten Nachweis",
      conflictingEvidence: "Prüfpunkte mit widersprüchlichen Nachweisen",
    },
    withEvidenceLabel: "Mit technischem Nachweis",
    withEvidenceCaption: (configuration, supporting) =>
      `${configuration} Konfiguration, ${supporting} unterstützend oder teilweise`,
    safeguardsLabel: "Aktive Schutzfunktionen",
    safeguardsCaption: (total) =>
      `von ${total} zugeordneten, eingerichtet und eingeschaltet`,
    distributionHeading: "Statusverteilung",
    controlsCount: (count) => `${count} Prüfpunkte`,
    familyHeading: "Abdeckung nach Gruppe",
    tierHeading: "Abdeckung nach Anforderungsstufe",
    familySmall: "Prüfpunkte mit technischem Nachweis",
    heroLead: (count, total) =>
      `${count} von ${total} bewertbaren Prüfpunkten haben unterstützende technische Nachweise in der Intune-Konfiguration.`,
    findingsSmall: "nach Schweregrad, dann Prüfpunkt",
    findingKinds: {
      risk: "Zugewiesene Abweichung",
      gap: "Kein Nachweis",
      unassigned: "Nicht zugewiesen",
    },
    moreFindings: (count) =>
      count === 1
        ? "1 weitere Feststellung steht auf den Detailseiten der Prüfpunkte."
        : `${count} weitere Feststellungen stehen auf den Detailseiten der Prüfpunkte.`,
    moreFindingsExcerpt: (count) =>
      count === 1
        ? "1 weitere Feststellung steht im vollständigen Bericht."
        : `${count} weitere Feststellungen stehen im vollständigen Bericht.`,
    moreFamilies: (count) =>
      count === 1
        ? "1 weitere Gruppe steht in der Ergebnisübersicht."
        : `${count} weitere Gruppen stehen in der Ergebnisübersicht.`,
    seePage: (page) => `Siehe Seite ${page}`,
    scopeNote: "Hinweis zum Umfang",
    resultsEyebrow: "02 Ergebnisse",
    resultsLead:
      "Jeder ausgewählte Prüfpunkt mit zusammengefasstem Status, Anzahl der nachgewiesenen Fähigkeiten und Verweis auf die zugehörigen Belege.",
    overviewHeaders: ["Prüfpunkt", "Status", "Fähigkeiten", "Belege", "Seite"],
    groupSummary: (count, total) => `${count} von ${total} mit Nachweis`,
    ofCount: (count, total) => `${count} von ${total}`,
    noneRecorded: "Keine erfasst",
    seeBelow: "Siehe unten",
    seeRegister: (ref) => `(siehe Verzeichnis ${ref})`,
    evidenceItems: (count) => (count === 1 ? "1 Beleg" : `${count} Belege`),
    notAvailable: "n. v.",
    excerptNote: (ids) =>
      `Musterbericht: Detailseiten sind nur für ausgewählte Prüfpunkte enthalten (${ids}). Ein vollständiger Bericht enthält eine Detailseite für jeden Prüfpunkt.`,
    dataEyebrow: "03 Datengrundlage",
    coverageHeaders: [
      "Richtlinienfamilie",
      "Erhebung",
      "Richtlinien",
      "Erkannt",
      "Nicht erkannt",
    ],
    collectionStatuses: {
      complete: "vollständig",
      incomplete: "unvollständig",
      unknown: "unbekannt",
      notCollected: "nicht erhoben",
    },
    detailEyebrow: "Prüfpunktdetails",
    capabilitiesWord: "Fähigkeiten",
    evidenceCount: (count) =>
      count === 1 ? "1 Belegverweis" : `${count} Belegverweise`,
    checkHeaders: ["Prüfung", "Sollwert", "Istwert", "Ergebnis"],
    policyLabel: "Richtlinie",
    evidenceLabel: "Belege",
    noPolicy: "Keine passende Richtlinie gefunden",
    assignmentUnknown: "Zuweisung unbekannt",
    unassessedHeading:
      "Zusätzliche Prüfung: nicht durch technische Nachweise bewertet",
    gapHeading: (title) => `Lücke: ${title}`,
    appendixEyebrow: "Anhang A",
    appendixLead:
      "Alle in diesem Bericht zitierten Konfigurationswerte, wie im Mandantenexport gelesen. Verweise sind innerhalb einer Berichts-ID stabil.",
    methodologyEyebrow: "Anhang B",
    methodologyEarlyEyebrow: "Zur Methode",
    howToRead: "Lesehilfe",
    howToReadNotes: [
      "Der Status wird durch Form und Beschriftung angezeigt, nie allein durch Farbe.",
      "Ein Prüfpunkt ergibt sich aus seinen Fähigkeiten, eine Fähigkeit aus ihren Prüfungen.",
      "Nur zugewiesene Richtlinien zählen als Nachweis. Konfigurierte, aber nicht zugewiesene Einstellungen werden gesondert ausgewiesen.",
      "Belegverweise zeigen auf Zeilen des Nachweisverzeichnisses in Anhang A.",
    ],
    shortStatuses: {
      evidenceFound: "Konfigurationsnachweis",
      partialEvidence: "Unterstützender oder teilweiser Nachweis",
      noEvidence: "Kein erkannter Nachweis",
      conflictingEvidence: "Widersprüchliche Richtliniennachweise",
      notAssessed: "Nicht bewertet",
      notApplicable: "Außerhalb des Geltungsbereichs",
    },
    assessmentLabels: {
      checked: "Geprüft",
      unableToCheck: "Nicht prüfbar",
      outsideScope: "Außerhalb des Umfangs",
    },
    resultLabels: {
      matches: "Entspricht dem Sollwert",
      missing: "Fehlt",
      different: "Abweichender Wert",
    },
    notFound: "Nicht gefunden",
    unavailable: "Nicht verfügbar",
  },
};

/** Short framework names for the cover title and the running header. */
const SHORT_FRAMEWORK_NAMES: Record<ComplianceFrameworkId, string> = {
  "nist-800-53-r5": "NIST SP 800-53",
  "nist-csf-2": "NIST CSF 2.0",
  "bsi-it-grundschutz": "BSI IT-Grundschutz",
  "iso-27001-2022": "ISO/IEC 27001:2022",
  "soc2-tsc": "SOC 2",
  "def-stan-05-138-i4": "Def Stan 05-138",
  "cyber-essentials-v3": "Cyber Essentials",
  "nist-800-171-r2": "NIST SP 800-171",
  "nist-800-171-r3": "NIST SP 800-171",
  "essential-eight": "Essential Eight",
  "nis2-2022-2555": "NIS2 Directive",
};

const ISO_THEMES: Readonly<Record<string, string>> = {
  "5": "Organizational controls",
  "6": "People controls",
  "7": "Physical controls",
  "8": "Technological controls",
};

const NIST_800_53_FAMILIES: Readonly<Record<string, string>> = {
  AC: "Access Control",
  AT: "Awareness and Training",
  AU: "Audit and Accountability",
  CA: "Assessment, Authorization, and Monitoring",
  CM: "Configuration Management",
  CP: "Contingency Planning",
  IA: "Identification and Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PE: "Physical and Environmental Protection",
  PL: "Planning",
  PM: "Program Management",
  PS: "Personnel Security",
  PT: "PII Processing and Transparency",
  RA: "Risk Assessment",
  SA: "System and Services Acquisition",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
  SR: "Supply Chain Risk Management",
};

const NIST_800_171_FAMILIES: readonly string[] = [
  "Access Control",
  "Awareness and Training",
  "Audit and Accountability",
  "Configuration Management",
  "Identification and Authentication",
  "Incident Response",
  "Maintenance",
  "Media Protection",
  "Personnel Security",
  "Physical Protection",
  "Risk Assessment",
  "Security Assessment and Monitoring",
  "System and Communications Protection",
  "System and Information Integrity",
  "Planning",
  "System and Services Acquisition",
  "Supply Chain Risk Management",
];

const NIST_CSF_FUNCTIONS: Readonly<Record<string, string>> = {
  GV: "Govern",
  ID: "Identify",
  PR: "Protect",
  DE: "Detect",
  RS: "Respond",
  RC: "Recover",
};

interface ControlGroup {
  /** Grouping key, identical to the bookmark family where one exists. */
  key: string;
  /** Short code drawn as a chip, if the framework has one. */
  code?: string;
  /** Readable group name. */
  name?: string;
  controls: ControlAssessment[];
}

function groupLabel(
  frameworkId: ComplianceFrameworkId,
  key: string,
): { code?: string; name?: string } {
  switch (frameworkId) {
    case "iso-27001-2022":
      return { code: `A.${key}`, name: ISO_THEMES[key] };
    case "nist-800-53-r5":
      return { code: key, name: NIST_800_53_FAMILIES[key] };
    case "nist-800-171-r2":
    case "nist-800-171-r3": {
      const index = Number(key.split(".")[1]) - 1;
      return { code: key, name: NIST_800_171_FAMILIES[index] };
    }
    case "nist-csf-2":
      return { code: key, name: NIST_CSF_FUNCTIONS[key] };
    case "nis2-2022-2555":
      return { code: key, name: "Cybersecurity risk-management measures" };
    case "essential-eight":
    case "def-stan-05-138-i4":
    case "bsi-it-grundschutz":
      return { name: key };
    default:
      return { code: key };
  }
}

function controlFamily(
  frameworkId: ComplianceFrameworkId,
  control: ControlAssessment,
): string | undefined {
  return frameworkId === "essential-eight"
    ? control.control.title
    : frameworkId === "nist-800-53-r5"
      ? control.control.id.split("-")[0]
      : frameworkId === "nist-800-171-r2" || frameworkId === "nist-800-171-r3"
        ? control.control.id.split(".").slice(0, 2).join(".")
        : frameworkId === "def-stan-05-138-i4"
          ? (DEF_STAN_FAMILIES[control.control.id.slice(0, 2)] ??
            control.control.id.slice(0, 2))
          : frameworkId === "nis2-2022-2555"
            ? "Art. 21(2)"
            : control.control.id.split(".")[0];
}

/**
 * Turns the flat contents list into PDF bookmarks: one per section, with the
 * controls beneath it. Controls are grouped under a bookmark per consecutive
 * control family, unless there is only one family or every family holds a
 * single entry, where the extra level would add nothing.
 */
function buildComplianceReportOutline(
  tocEntries: readonly TocEntry[],
): PdfOutlineEntry[] {
  const sections: Array<{ entry: TocEntry; controls: TocEntry[] }> = [];
  for (const entry of tocEntries) {
    const current = sections[sections.length - 1];
    if (entry.level === 1 && current) current.controls.push(entry);
    else sections.push({ entry, controls: [] });
  }

  const toOutline = (entry: TocEntry): PdfOutlineEntry => ({
    title: entry.title,
    pageNumber: entry.page,
  });

  return sections.map(({ entry, controls }) => {
    const families: Array<{
      family: string;
      page: number;
      controls: TocEntry[];
    }> = [];
    for (const control of controls) {
      const family = control.family ?? control.title;
      const current = families[families.length - 1];
      if (current?.family === family) current.controls.push(control);
      else families.push({ family, page: control.page, controls: [control] });
    }
    const nestFamilies =
      families.length > 1 &&
      families.some((group) => group.controls.length > 1);
    return {
      ...toOutline(entry),
      children: nestFamilies
        ? families.map((group) => ({
            title: group.family,
            pageNumber: group.page,
            children: group.controls.map(toOutline),
          }))
        : controls.map(toOutline),
    };
  });
}

const BSI_TIERS = [
  "Basis-Anforderung",
  "Standard-Anforderung",
  "Anforderung bei erhöhtem Schutzbedarf",
  undefined,
] as const;

/** Groups controls for the overview: BSI by tier, others by family. */
function buildControlGroups(
  frameworkId: ComplianceFrameworkId,
  controls: readonly ControlAssessment[],
): ControlGroup[] {
  if (frameworkId === "bsi-it-grundschutz") {
    return BSI_TIERS.map((tier) => ({
      key: tier ?? "Bausteine",
      name: tier ?? "Bausteine",
      controls: controls.filter((item) => item.control.tier === tier),
    })).filter((group) => group.controls.length > 0);
  }

  // Cyber Essentials controls are themes, so one group avoids a group row
  // per control that only repeats the control name.
  if (frameworkId === "cyber-essentials-v3") {
    return controls.length
      ? [
          {
            key: "themes",
            name: "Technical control themes",
            controls: [...controls],
          },
        ]
      : [];
  }

  const controlsByKey = new Map<string, ControlAssessment[]>();
  for (const control of controls) {
    const key = controlFamily(frameworkId, control);
    if (!key) continue;
    const existing = controlsByKey.get(key);
    if (existing) existing.push(control);
    else controlsByKey.set(key, [control]);
  }

  return [...controlsByKey.entries()]
    .sort(([left], [right]) => compareControlIds(left, right))
    .map(([key, grouped]) => ({
      key,
      ...groupLabel(frameworkId, key),
      controls: grouped,
    }));
}

function evidenceRegistryKey(evidence: CapabilityEvidence): string {
  return JSON.stringify([
    evidence.policyId,
    evidence.policyType,
    evidence.familyKey,
    evidence.kind,
    evidence.source,
    evidence.settingId,
    evidence.observedValue,
    evidence.verdict,
  ]);
}

function familyItems(
  data: DetailedExportData,
  familyKey: "settingsCatalog" | "deviceConfigurations" | "compliancePolicies",
): Array<Record<string, unknown>> {
  const items = data.sections?.length
    ? data.sections
        .filter(
          (section) =>
            section.familyKey === familyKey || section.key === familyKey,
        )
        .flatMap((section) => section.items)
    : data[familyKey];
  return (items ?? []).filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
  );
}

function allPolicyItems(
  data: DetailedExportData,
): Array<Record<string, unknown>> {
  const items = data.sections?.length
    ? data.sections.flatMap((section) => section.items)
    : [
        ...data.settingsCatalog,
        ...data.deviceConfigurations,
        ...data.administrativeTemplates,
        ...data.compliancePolicies,
        ...(data.appProtectionPolicies ?? []),
        ...data.securityBaselines,
        ...data.scripts.windows,
        ...data.scripts.macOS,
        ...(data.appConfigurations ?? []),
        ...(data.windowsUpdatePolicies ?? []),
        ...(data.enrollmentConfigurations ?? []),
        ...(data.conditionalAccessPolicies ?? []),
      ];
  return items.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
  );
}

function platformFromValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized.includes("windows")) return "Windows";
  if (normalized.includes("mac")) return "macOS";
  if (normalized.includes("ios") || normalized.includes("ipados")) return "iOS";
  if (normalized.includes("android")) return "Android";
  return undefined;
}

function implementationSignals(results: readonly CapabilityResult[]): string[] {
  const signals = new Set<string>();

  for (const result of results) {
    for (const signal of result.capability.signals) {
      if (signal.source === "settingsCatalog") {
        signals.add(signal.settingDefinitionId);
      } else if (signal.source === "graphProperty") {
        const odataType = signal.odataTypes[0];
        if (odataType) signals.add(`${odataType}.${signal.propertyPath}`);
      } else if (signal.source === "policyCheck") {
        signals.add(signal.check);
      } else {
        signals.add(signal.settingId);
      }
    }
  }

  return [...signals].slice(0, 4);
}

export function complianceReportFileName(
  frameworkId: ComplianceFrameworkId,
  tenantLabel?: string,
  essentialEightMaturityLevel: 1 | 2 | 3 = 1,
): string {
  const now = new Date();
  const frameworkLabel =
    STRINGS.en.fileFrameworkLabels[frameworkId] +
    (frameworkId === "essential-eight"
      ? `-ML${essentialEightMaturityLevel}`
      : "");
  const slug = tenantLabel ? tenantSlug(tenantLabel) : "";
  const tenantPart = slug ? `-${slug}` : "";
  return `Compliance-Report-${frameworkLabel}${tenantPart}-${localIsoDate(now)}-${localTime(now)}.pdf`;
}

const REGISTRY_KEY_COLLATOR = new Intl.Collator("en");

function mixColor(color: RgbColor, target: RgbColor, amount: number): RgbColor {
  return [
    Math.round(color[0] + (target[0] - color[0]) * amount),
    Math.round(color[1] + (target[1] - color[1]) * amount),
    Math.round(color[2] + (target[2] - color[2]) * amount),
  ];
}

const CONTROL_STATUS_TONES: Record<ControlStatus, Tone> = {
  evidenceFound: "found",
  partialEvidence: "supporting",
  noEvidence: "none",
  conflictingEvidence: "conflict",
  notAssessed: "na",
  notApplicable: "none",
};

/**
 * Control status colours for this report. Supporting or partial evidence is
 * the normal good state for mapped controls, so it uses the blue family
 * instead of the warning amber; capability level amber stays unchanged.
 */
const REPORT_STATUS_COLORS: Record<ControlStatus, RgbColor> = {
  ...CONTROL_STATUS_COLORS,
  partialEvidence: [46, 107, 176],
};

const CONTROL_STATUS_SEQUENCE: readonly ControlStatus[] = [
  "evidenceFound",
  "partialEvidence",
  "noEvidence",
  "conflictingEvidence",
  "notAssessed",
  "notApplicable",
];

function markerForControlStatus(status: ControlStatus): MarkerKind {
  return status === "evidenceFound"
    ? "filled"
    : status === "partialEvidence"
      ? "half"
      : status === "conflictingEvidence" || status === "notAssessed"
        ? "triangle"
        : "outline";
}

function markerForCapabilityStatus(status: CapabilityStatus): MarkerKind {
  return status === "enforced"
    ? "filled"
    : [
          "configuredNotAssigned",
          "requirementAssigned",
          "assignmentUnknown",
          "collectionIncomplete",
          "partialConfiguration",
        ].includes(status)
      ? "half"
      : status === "disabledByPolicy" || status === "conflictingEvidence"
        ? "triangle"
        : "outline";
}

function toneForCapabilityStatus(status: CapabilityStatus): Tone {
  switch (status) {
    case "enforced":
      return "found";
    case "requirementAssigned":
      return "info";
    case "disabledByPolicy":
    case "conflictingEvidence":
      return "conflict";
    case "noEvidence":
    case "notApplicable":
      return "none";
    default:
      return "partial";
  }
}

function checkPresentation(check: TechnicalCheck): {
  tone: Tone;
  marker: MarkerKind;
  color: RgbColor;
} {
  if (check.result === "matches")
    return { tone: "found", marker: "filled", color: [31, 133, 83] };
  if (check.result === "different")
    return { tone: "conflict", marker: "triangle", color: [185, 28, 28] };
  if (check.assessmentStatus === "unableToCheck")
    return { tone: "na", marker: "triangle", color: [196, 113, 31] };
  return { tone: "none", marker: "outline", color: [100, 116, 139] };
}

export async function generateComplianceReportPDF(
  data: DetailedExportData,
  options: ComplianceReportOptions,
): Promise<Uint8Array> {
  const locale: Locale =
    options.frameworkId === "bsi-it-grundschutz" ? "de" : "en";
  const strings = STRINGS[locale];
  const layout = LAYOUT[locale];
  const branding = options.branding ?? data.branding;
  const primaryColor = hexToRgb(branding?.colors?.primary, PALETTE.navy);
  const secondaryColor = hexToRgb(branding?.colors?.secondary, PALETTE.blue);
  const accentColor = hexToRgb(branding?.colors?.accent, PALETTE.green);
  const textColor = hexToRgb(branding?.colors?.text, PALETTE.ink);
  const primaryTint = mixColor(primaryColor, PALETTE.white, 0.92);

  const manifest = await createEvidenceManifest(data);
  const assessment = manifest.assessment;
  const framework = assessment.frameworks.find(
    (item) => item.framework.id === options.frameworkId,
  );
  if (!framework) {
    throw new Error(`Unknown compliance framework: ${options.frameworkId}`);
  }

  const capabilitiesById = new Map(
    assessment.capabilities.map((result) => [result.capability.id, result]),
  );
  // Setting names, in order of preference: definitions carried in the
  // export itself, the verified setting catalogs, the capability name for
  // checks that stand for the whole capability, and the Graph property
  // naming used by the documentation export. Otherwise the raw id remains.
  const exportSettingNames = new Map<string, string>();
  const exportOptionLabels = new Map<string, string>();
  for (const item of allPolicyItems(data)) {
    const settings = Array.isArray(item.settings) ? item.settings : [];
    for (const setting of settings as Array<Record<string, unknown>>) {
      const definitions = Array.isArray(setting?.settingDefinitions)
        ? (setting.settingDefinitions as Array<Record<string, unknown>>)
        : [];
      for (const definition of definitions) {
        if (
          typeof definition?.id === "string" &&
          typeof definition.displayName === "string" &&
          definition.displayName
        )
          exportSettingNames.set(definition.id, definition.displayName);
        const optionList = Array.isArray(definition?.options)
          ? (definition.options as Array<Record<string, unknown>>)
          : [];
        for (const option of optionList)
          if (
            typeof option?.itemId === "string" &&
            typeof option.displayName === "string" &&
            option.displayName
          )
            exportOptionLabels.set(option.itemId, option.displayName);
      }
    }
  }
  const settingDisplayName = (
    settingId: string,
    result?: CapabilityResult,
  ): string | undefined => {
    const name =
      exportSettingNames.get(settingId) ??
      VERIFIED_SETTING_NAMES.get(settingId);
    if (name) return name;
    if (!result) return undefined;
    const { capability } = result;
    if (settingId === capability.id) return capabilityName(result);
    const signal = capability.signals.find((item) =>
      item.source === "policyCheck"
        ? item.check === settingId
        : item.source === "graphProperty"
          ? item.propertyPath === settingId ||
            item.odataTypes.some(
              (type) => settingId === `${type}.${item.propertyPath}`,
            )
          : false,
    );
    if (signal?.source === "policyCheck") return capabilityName(result);
    if (signal?.source === "graphProperty")
      return readablePropertyName(signal.propertyPath);
    return undefined;
  };
  /** Option label for a raw value when the export or catalog knows it. */
  const displayValue = (value: string): string => labelledValue(value).label;
  /**
   * Replaces known option ids, alone or in a list of alternatives, with
   * their labels. `raw` is set when the label differs from the value.
   */
  const labelledValue = (value: string): { label: string; raw?: string } => {
    const parts = value.split(/( or |; alternative: |; requires )/);
    const mapped = parts.map((part, index) => {
      if (index % 2 === 1) return part;
      const unquoted = part.trim().replace(/^"(.*)"$/, "$1");
      return exportOptionLabels.get(unquoted) ?? part;
    });
    const label = displayCheckValue(mapped.join(""));
    // Long compound expressions keep their raw form in the register only;
    // under a check value it would bury the label.
    return label === value || value.length > 120
      ? { label }
      : { label, raw: value };
  };

  const generatedAt = options.renderDate
    ? new Date(options.renderDate.getTime())
    : new Date(assessment.generatedAt);
  const controls = [...framework.controls].sort((left, right) =>
    compareControlIds(left.control.id, right.control.id),
  );
  const fixedDate = options.renderDate !== undefined;
  const excerptIds = options.excerpt
    ? new Set(options.excerpt.controlIds)
    : undefined;
  const isExcerpt = excerptIds !== undefined;
  const detailControls = excerptIds
    ? controls.filter((item) => excerptIds.has(item.control.id))
    : controls;
  const detailIds = new Set(detailControls.map((item) => item.control.id));
  const metadata = options.metadata ?? {};
  const deterministicSeed = options.renderDate
    ? JSON.stringify([
        options.frameworkId,
        manifest.snapshotSha256,
        manifest.rulesetSha256,
        generatedAt.toISOString(),
        options.excerpt?.controlIds ?? null,
        metadata,
      ])
    : undefined;
  const reportId =
    metadata.reportId ??
    defaultReportId(options.frameworkId, generatedAt, deterministicSeed);
  const revision = metadata.revision ?? "1.0";
  const classification =
    metadata.classification ?? (locale === "de" ? "Intern" : "Internal");
  const tenantName = metadata.tenantLabel ?? branding?.companyName;
  const shortName =
    options.frameworkId === "essential-eight"
      ? `${SHORT_FRAMEWORK_NAMES[options.frameworkId]} ML${assessment.scope.essentialEightMaturityLevel ?? 1}`
      : SHORT_FRAMEWORK_NAMES[options.frameworkId];
  const frameworkDisplay =
    options.frameworkId === "bsi-it-grundschutz"
      ? "BSI IT-Grundschutz-Kompendium, Edition 2023"
      : options.frameworkId === "iso-27001-2022"
        ? "ISO/IEC 27001:2022, Annex A"
        : `${framework.framework.name} ${framework.framework.version}`;

  // Only evidence cited on rendered detail pages enters the register, so an
  // excerpt never shows a reference that the register does not list.
  const evidenceRegistry: EvidenceRegistryEntry[] = [];
  const evidenceRegistryByKey = new Map<string, EvidenceRegistryEntry>();
  for (const control of detailControls) {
    for (const capabilityId of control.capabilityIds) {
      const capability = capabilitiesById.get(capabilityId);
      if (!capability) continue;
      // Sort by registry key so E-nnn references stay stable when Graph
      // returns policies in a different order on a later export. The collator
      // is pinned to "en" so the order does not depend on the host locale.
      const sortedEvidence = [...capability.evidence].sort((a, b) =>
        REGISTRY_KEY_COLLATOR.compare(
          evidenceRegistryKey(a),
          evidenceRegistryKey(b),
        ),
      );
      for (const evidence of sortedEvidence) {
        const key = evidenceRegistryKey(evidence);
        if (evidenceRegistryByKey.has(key)) continue;
        const entry = {
          ref: `E-${String(evidenceRegistry.length + 1).padStart(3, "0")}`,
          evidence,
        };
        evidenceRegistry.push(entry);
        evidenceRegistryByKey.set(key, entry);
      }
    }
  }

  const evidenceRefsFor = (
    result: CapabilityResult,
  ): EvidenceRegistryEntry[] => {
    const seen = new Set<string>();
    const entries: EvidenceRegistryEntry[] = [];
    for (const evidence of result.evidence) {
      const entry = evidenceRegistryByKey.get(evidenceRegistryKey(evidence));
      if (!entry || seen.has(entry.ref)) continue;
      seen.add(entry.ref);
      entries.push(entry);
    }
    return entries;
  };

  const mappedCapabilitiesFor = (control: ControlAssessment) =>
    control.capabilityIds
      .map((capabilityId) => capabilitiesById.get(capabilityId))
      .filter((result): result is CapabilityResult => Boolean(result));

  const controlRefs = (control: ControlAssessment): string[] => {
    const refs = new Set<string>();
    for (const result of mappedCapabilitiesFor(control))
      for (const entry of evidenceRefsFor(result)) refs.add(entry.ref);
    return [...refs].sort();
  };

  const controlEvidenceCount = (control: ControlAssessment): number => {
    const keys = new Set<string>();
    for (const result of mappedCapabilitiesFor(control))
      for (const evidence of result.evidence)
        keys.add(evidenceRegistryKey(evidence));
    return keys.size;
  };

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  doc.setFont("helvetica", "normal");
  doc.setProperties({
    title: strings.title,
    author: branding?.companyName ?? strings.footer,
    subject: `${framework.framework.name} ${framework.framework.version}`,
  });
  if (deterministicSeed !== undefined) {
    const metadataApi = doc as unknown as PdfMetadataApi;
    metadataApi.setCreationDate(pdfUtcDate(generatedAt));
    metadataApi.setFileId(
      deterministicFileId(`${deterministicSeed}|${reportId}`),
    );
  }

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  const right = pageWidth - margin;
  const contentWidth = pageWidth - margin * 2;
  const contentTop = 21;
  const contentBottom = 276;
  let yPosition = contentTop;
  const tocEntries: TocEntry[] = [];
  const controlPages = new Map<string, number>();
  const pageRefs: Array<{
    page: number;
    x: number;
    y: number;
    controlId: string;
    kind: "overview" | "finding";
  }> = [];

  const currentPage = () => doc.internal.getCurrentPageInfo().pageNumber;

  const wrap = (
    text: string,
    width = contentWidth,
    fontSize = 9,
    style: FontStyle = "normal",
    maxLines?: number,
  ): string[] => wrapLines(doc, text, width, fontSize, style, maxLines);

  const wrapTechnicalId = (
    text: string,
    width: number,
    fontSize = 7,
    style: FontStyle = "normal",
  ): string[] =>
    wrap(text.replace(/([_./,;])/g, "$1​"), width, fontSize, style).map(
      (line) => line.replaceAll("​", ""),
    );

  const fitFontSize = (
    text: string,
    width: number,
    size: number,
    minimum: number,
    style: FontStyle = "bold",
  ): number => {
    let fitted = size;
    while (fitted > minimum && textWidth(doc, text, fitted, style) > width)
      fitted -= 0.5;
    return fitted;
  };

  const addContentPage = () => {
    doc.addPage();
    yPosition = contentTop;
  };

  const ensureSpace = (height: number): boolean => {
    if (yPosition + height <= contentBottom) return false;
    addContentPage();
    return true;
  };

  const drawLines = (
    lines: readonly string[],
    x: number,
    top: number,
    fontSize: number,
    style: FontStyle,
    color: RgbColor,
    lineHeight: number,
  ) => {
    setFont(doc, fontSize, style, color);
    lines.forEach((line, index) => {
      doc.text(line, x, top + capHeight(fontSize) + index * lineHeight);
    });
  };

  const drawWrappedText = (
    text: string,
    options: {
      x?: number;
      width?: number;
      fontSize?: number;
      style?: FontStyle;
      color?: RgbColor;
      lineHeight?: number;
      after?: number;
    } = {},
  ) => {
    const x = options.x ?? margin;
    const width = options.width ?? contentWidth;
    const fontSize = options.fontSize ?? 9;
    const style = options.style ?? "normal";
    const color = options.color ?? textColor;
    const lineHeight = options.lineHeight ?? fontSize * 0.42;
    for (const line of wrap(text, width, fontSize, style)) {
      ensureSpace(lineHeight);
      setFont(doc, fontSize, style, color);
      doc.text(line, x, yPosition + capHeight(fontSize));
      yPosition += lineHeight;
    }
    yPosition += options.after ?? 0;
  };

  const drawPageTitle = (
    eyebrow: string,
    title: string,
    options: { lead?: string; record?: boolean; size?: number } = {},
  ) => {
    if (options.record !== false)
      tocEntries.push({ title, page: currentPage(), level: 0 });
    drawEyebrow(doc, eyebrow, margin, yPosition + 2.4, {
      color: secondaryColor,
    });
    const size = fitFontSize(title, contentWidth, options.size ?? 20, 12);
    setFont(doc, size, "bold", primaryColor);
    doc.text(title, margin, yPosition + 4.5 + capHeight(size) + 1.2);
    yPosition += 6 + capHeight(size) + 2.5;
    if (options.lead) {
      const lines = wrap(options.lead, 150, 8.8);
      drawLines(
        lines,
        margin,
        yPosition + 0.5,
        8.8,
        "normal",
        PALETTE.muted,
        4,
      );
      yPosition += lines.length * 4 + 1;
    }
    yPosition += 4;
  };

  const drawSectionHeading = (text: string, small?: string) => {
    const baseline = yPosition + capHeight(10.5);
    setFont(doc, 10.5, "bold", primaryColor);
    doc.text(
      clampLine(doc, text, small ? 110 : contentWidth, 10.5, "bold"),
      margin,
      baseline,
    );
    if (small) {
      setFont(doc, 7, "normal", PALETTE.muted);
      doc.text(small, right, baseline, { align: "right" });
    }
    yPosition += 6.5;
  };

  const drawControlContinuationCaption = (controlId: string) => {
    setFont(doc, 7.2, "italic", PALETTE.muted);
    doc.text(strings.continuationCaption(controlId), margin, yPosition + 2.6);
    yPosition += 6;
  };

  const addControlContinuationPage = (controlId: string) => {
    addContentPage();
    drawControlContinuationCaption(controlId);
  };

  const controlStatusPill = (
    x: number,
    top: number,
    status: ControlStatus,
    small = false,
    maxWidth?: number,
  ) =>
    drawPill(doc, x, top, layout.shortStatuses[status], {
      tone: CONTROL_STATUS_TONES[status],
      marker: markerForControlStatus(status),
      markerColor: REPORT_STATUS_COLORS[status],
      small,
      maxWidth,
    });

  const capabilityName = (result: CapabilityResult) =>
    locale === "de"
      ? (GERMAN_CAPABILITY_NAMES[result.capability.id] ??
        result.capability.name)
      : result.capability.name;

  const assignmentLabel = (assignment: CapabilityEvidence["assignment"]) => {
    if (assignment.state === "notAssigned") return strings.notAssigned;
    if (assignment.state === "unknown") return layout.assignmentUnknown;
    const targets = assignmentDetails(assignment).map((target) =>
      translateEvidenceValue(target, locale),
    );
    return `${strings.assigned}: ${targets.join(", ") || strings.assigned}`;
  };

  const statusCounts = (items: readonly ControlAssessment[]) => {
    const counts = Object.fromEntries(
      CONTROL_STATUS_SEQUENCE.map((status) => [status, 0]),
    ) as Record<ControlStatus, number>;
    for (const item of items) counts[item.status] += 1;
    return counts;
  };

  const statusSegments = (counts: Record<ControlStatus, number>) =>
    CONTROL_STATUS_SEQUENCE.map((status) => ({
      value: counts[status],
      color: REPORT_STATUS_COLORS[status],
    }));

  const totalControls = controls.length;
  const frameworkCounts = statusCounts(controls);
  // Same formulas as the management summary so both reports agree.
  const metrics = computeMetrics(framework, assessment.capabilities);
  const coverageFraction =
    metrics.assessable > 0 ? metrics.withEvidence / metrics.assessable : 0;
  const coveragePercent =
    metrics.coveragePct === null
      ? layout.notAvailable
      : `${metrics.coveragePct}%`;
  const evidenceSegments = [
    {
      value: frameworkCounts.evidenceFound,
      color: REPORT_STATUS_COLORS.evidenceFound,
    },
    {
      value: frameworkCounts.partialEvidence,
      color: REPORT_STATUS_COLORS.partialEvidence,
    },
  ];
  const presentStatuses = CONTROL_STATUS_SEQUENCE.filter(
    (status) => frameworkCounts[status] > 0,
  );
  const groups = buildControlGroups(options.frameworkId, controls);

  // ---------------------------------------------------------------- Cover
  const bandHeight = 134;
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageWidth, bandHeight, "F");
  const ringSoft = mixColor(primaryColor, secondaryColor, 0.16);
  const ringStrong = mixColor(primaryColor, secondaryColor, 0.4);
  const ringX = 173;
  const ringY = 55;
  doc.setDrawColor(...ringSoft);
  doc.setLineWidth(0.6);
  doc.circle(ringX, ringY, 70, "S");
  doc.circle(ringX, ringY, 38, "S");
  drawDonut(
    doc,
    ringX,
    ringY,
    56,
    10,
    [{ value: coverageFraction, color: ringStrong }],
    1,
    ringSoft,
  );

  // Product mark and name.
  doc.setFillColor(...secondaryColor);
  doc.roundedRect(margin, 14, 6.5, 6.5, 1.4, 1.4, "F");
  doc.setFillColor(...PALETTE.white);
  [
    [15.5, 3.9],
    [16.9, 3],
    [18.3, 2.2],
  ].forEach(([barY, barWidth]) =>
    doc.roundedRect(
      margin + 1.3,
      barY ?? 0,
      barWidth ?? 0,
      0.7,
      0.35,
      0.35,
      "F",
    ),
  );
  doc.setFillColor(...accentColor);
  doc.circle(margin + 6.5 - 1.85, 14 + 6.5 - 1.85, 0.75, "F");
  setFont(doc, 9.5, "bold", PALETTE.white);
  doc.text(layout.productName, margin + 9, 18.7);

  let coverRightTop = 13;
  const logoDataUrl = branding?.logo?.dataUrl;
  let logoDrawn = false;
  if (logoDataUrl) {
    try {
      const properties = (
        doc as unknown as ImagePropertiesProvider
      ).getImageProperties(logoDataUrl);
      const ratio = properties.height / Math.max(properties.width, 1);
      let width = Math.min(branding?.logo?.width ?? 36, 44);
      let height = branding?.logo?.height ?? width * ratio;
      if (height > 14) {
        width = (width * 14) / height;
        height = 14;
      }
      const boxWidth = width + 5;
      const boxHeight = height + 4;
      doc.setFillColor(...PALETTE.white);
      doc.roundedRect(
        right - boxWidth,
        coverRightTop,
        boxWidth,
        boxHeight,
        1.5,
        1.5,
        "F",
      );
      const format = /image\/(jpe?g)/i.test(logoDataUrl) ? "JPEG" : "PNG";
      doc.addImage(
        logoDataUrl,
        format,
        right - boxWidth + 2.5,
        coverRightTop + 2,
        width,
        height,
      );
      coverRightTop += boxHeight + 3;
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn && branding?.companyName) {
    setFont(doc, 9.5, "bold", PALETTE.white);
    doc.text(
      clampLine(doc, branding.companyName, 80, 9.5, "bold"),
      right,
      18.7,
      { align: "right" },
    );
    coverRightTop = 24;
  }
  if (isExcerpt) {
    const tagSize = 6.2;
    const tagWidth =
      textWidth(doc, layout.sampleTag, tagSize, "bold", 0.2) + 2.6 * 2 + 3.2;
    const tagTop = coverRightTop + 1;
    doc.setFillColor(255, 244, 229);
    doc.roundedRect(right - tagWidth, tagTop, tagWidth, 5.6, 1, 1, "F");
    doc.setFillColor(...TONES.partial.text);
    doc.circle(right - tagWidth + 3.4, tagTop + 2.8, 0.8, "F");
    setFont(doc, tagSize, "bold", TONES.partial.text);
    doc.text(
      layout.sampleTag,
      right - tagWidth + 5.8,
      centredBaseline(tagTop, 5.6, tagSize),
      { charSpace: 0.2 },
    );
  }

  doc.setFillColor(...accentColor);
  doc.roundedRect(margin, 48.5, 14, 1.2, 0.6, 0.6, "F");
  setFont(doc, 8.5, "bold", PALETTE.coverAccentText);
  doc.text(
    clampLine(doc, strings.title, contentWidth, 8.5, "bold"),
    margin,
    56.5,
  );
  const coverTitleSize = fitFontSize(shortName, contentWidth, 36, 24);
  setFont(doc, coverTitleSize, "bold", PALETTE.white);
  const coverTitleLines = wrap(
    shortName,
    contentWidth,
    coverTitleSize,
    "bold",
    2,
  );
  coverTitleLines.forEach((line, index) =>
    doc.text(line, margin, 70 + index * coverTitleSize * 0.42),
  );
  const coverTitleBottom =
    70 + (coverTitleLines.length - 1) * coverTitleSize * 0.42;
  // The subtitle adds what the short title leaves out (edition, revision,
  // target level); the full framework name is in the document control grid.
  const coverSubtitle =
    options.frameworkId === "bsi-it-grundschutz"
      ? "Kompendium, Edition 2023"
      : options.frameworkId === "iso-27001-2022"
        ? "Annex A"
        : framework.framework.version;
  const displaySize = fitFontSize(coverSubtitle, contentWidth, 13, 8, "normal");
  setFont(doc, displaySize, "normal", PALETTE.coverMutedText);
  doc.text(coverSubtitle, margin, coverTitleBottom + 10);
  const leadLines = wrap(strings.coverLead, 150, 9, "normal", 2);
  drawLines(
    leadLines,
    margin,
    coverTitleBottom + 13.5,
    9,
    "normal",
    PALETTE.coverAccentText,
    4,
  );

  const coverRule = mixColor(primaryColor, PALETTE.white, 0.17);
  drawRule(doc, margin, 104, right, coverRule, 0.25);
  if (metadata.tenantLabel) {
    drawEyebrow(doc, layout.coverTenant, margin, 110.5, {
      color: PALETTE.coverAccentText,
    });
    setFont(doc, 18, "bold", PALETTE.white);
    doc.text(
      clampLine(doc, metadata.tenantLabel, 110, 18, "bold"),
      margin,
      118.5,
    );
  }
  const coverFacts: Array<[string, string]> = [
    [strings.generatedOn, formatReportDate(generatedAt, locale, fixedDate)],
    [strings.documentControlLabels[7], classification],
  ];
  coverFacts.forEach(([label, value], index) => {
    const baseline = 113.5 + index * 5;
    setFont(doc, 8, "bold", PALETTE.white);
    const valueWidth = doc.getTextWidth(value);
    doc.text(value, right, baseline, { align: "right" });
    setFont(doc, 8, "normal", PALETTE.coverMutedText);
    doc.text(label, right - valueWidth - 1.4, baseline, { align: "right" });
  });

  // Donut card and counts.
  const midTop = 144;
  drawCard(doc, margin, midTop, 72, 70, { fill: PALETTE.panel });
  const donutX = margin + 36;
  const donutY = midTop + 28;
  drawDonut(
    doc,
    donutX,
    donutY,
    18,
    4.4,
    evidenceSegments,
    Math.max(metrics.assessable, 1),
  );
  setFont(doc, 24, "bold", primaryColor);
  doc.text(coveragePercent, donutX, donutY + 2.2, { align: "center" });
  setFont(doc, 6.6, "normal", PALETTE.muted);
  doc.text(
    layout.donutCount(metrics.withEvidence, metrics.assessable),
    donutX,
    donutY + 6.6,
    {
      align: "center",
    },
  );
  const donutCaptionLines = wrap(layout.donutCaption, 64, 8.3, "bold", 2);
  const donutSubLines = wrap(layout.donutSub, 62, 7, "normal", 2);
  let donutTextY =
    midTop + 70 - 4 - donutSubLines.length * 3 - donutCaptionLines.length * 3.7;
  setFont(doc, 8.3, "bold", textColor);
  donutCaptionLines.forEach((line) => {
    donutTextY += 3.7;
    doc.text(line, donutX, donutTextY, { align: "center" });
  });
  donutTextY += 0.8;
  setFont(doc, 7, "normal", PALETTE.muted);
  donutSubLines.forEach((line) => {
    donutTextY += 3;
    doc.text(line, donutX, donutTextY, { align: "center" });
  });

  const glanceX = margin + 80;
  const glanceWidth = contentWidth - 80;
  drawEyebrow(doc, layout.atAGlance, glanceX, midTop + 2.4, {
    color: secondaryColor,
  });
  drawRule(doc, glanceX, midTop + 5, right, primaryColor, 0.4);
  const glanceStatuses: readonly ControlStatus[] = presentStatuses.length
    ? presentStatuses
    : ["noEvidence"];
  const glanceRowHeight = glanceStatuses.length > 4 ? 7.6 : 9.6;
  glanceStatuses.forEach((status, index) => {
    const rowTop = midTop + 5 + index * glanceRowHeight;
    const middle = rowTop + glanceRowHeight / 2;
    drawMarker(
      doc,
      glanceX + 1.4,
      middle,
      markerForControlStatus(status),
      REPORT_STATUS_COLORS[status],
    );
    setFont(doc, 8.5, "normal", textColor);
    doc.text(
      layout.shortStatuses[status],
      glanceX + 5,
      middle + capHeight(8.5) / 2,
    );
    setFont(doc, 11, "bold", primaryColor);
    doc.text(
      String(frameworkCounts[status]),
      right,
      middle + capHeight(11) / 2,
      {
        align: "right",
      },
    );
    drawRule(doc, glanceX, rowTop + glanceRowHeight, right);
  });
  const glanceNoteTop =
    midTop + 5 + glanceStatuses.length * glanceRowHeight + 4;
  drawLines(
    wrap(
      layout.glanceNote(COMPLIANCE_RULESET_VERSION),
      glanceWidth,
      7.6,
      "normal",
      Math.max(1, Math.floor((midTop + 72 - glanceNoteTop) / 3.5)),
    ),
    glanceX,
    glanceNoteTop,
    7.6,
    "normal",
    PALETTE.muted,
    3.5,
  );

  // Document control grid: only rows with values.
  const controlLabels = strings.documentControlLabels;
  const controlRows: Array<readonly [string, string | undefined]> = [
    [layout.frameworkLabel, frameworkDisplay],
    [controlLabels[0], metadata.tenantLabel],
    [controlLabels[1], metadata.preparedFor],
    [controlLabels[2], metadata.preparedBy],
    [controlLabels[3], metadata.contact],
    [controlLabels[4], reportId],
    [controlLabels[5], revision],
    [controlLabels[6], COMPLIANCE_RULESET_VERSION],
    [controlLabels[7], classification],
    [strings.generatedOn, formatReportDate(generatedAt, locale, fixedDate)],
  ];
  const visibleControlRows = controlRows.filter(
    (row): row is readonly [string, string] => Boolean(row[1]),
  );
  const gridTop = 222;
  drawEyebrow(doc, layout.documentControl, margin, gridTop + 2.4, {
    color: secondaryColor,
  });
  drawRule(doc, margin, gridTop + 5, right, primaryColor, 0.4);
  const cellWidth = contentWidth / 4;
  // The framework cell spans two columns so its full name stays one run.
  const gridRows: Array<Array<{ label: string; value: string; span: number }>> =
    [];
  for (const [label, value] of visibleControlRows) {
    const span = label === layout.frameworkLabel ? 2 : 1;
    const current = gridRows[gridRows.length - 1];
    const used = current?.reduce((sum, cell) => sum + cell.span, 0) ?? 4;
    if (!current || used + span > 4) gridRows.push([{ label, value, span }]);
    else current.push({ label, value, span });
  }
  let gridRowTop = gridTop + 5;
  for (const rowCells of gridRows) {
    const cellLines = rowCells.map(({ value, span }) =>
      wrap(value, cellWidth * span - 3, 8.4, "bold", 3),
    );
    const rowHeight = Math.max(
      13,
      Math.max(...cellLines.map((lines) => lines.length)) * 3.6 + 9.4,
    );
    let cellX = margin;
    rowCells.forEach(({ label, span }, cellIndex) => {
      setFont(doc, 6.3, "bold", PALETTE.muted);
      doc.text(
        clampLine(doc, label, cellWidth * span - 3, 6.3, "bold"),
        cellX,
        gridRowTop + 5,
      );
      drawLines(
        cellLines[cellIndex] ?? [],
        cellX,
        gridRowTop + 7.2,
        8.4,
        "bold",
        textColor,
        3.6,
      );
      cellX += cellWidth * span;
    });
    gridRowTop += rowHeight;
    drawRule(doc, margin, gridRowTop, right);
  }
  setFont(doc, 6.5, "normal", PALETTE.muted);
  doc.text(strings.footer, margin, 287);
  doc.text(layout.coverFootRight, right, 287, { align: "right" });

  // ---------------------------------------------- Disclaimer and contents
  let tocPage = 0;
  let tocStartY = contentTop;
  if (!isExcerpt) {
    addContentPage();
    drawEyebrow(doc, layout.aboutEyebrow, margin, yPosition + 2.4, {
      color: secondaryColor,
    });
    yPosition += 6;
    const disclaimerLines = (
      strings.disclaimer.match(/[^.]+[.]?/g) ?? [strings.disclaimer]
    ).flatMap((sentence) => wrap(sentence.trim(), contentWidth - 20, 8.8));
    const disclaimerHeight = disclaimerLines.length * 4.1 + 14;
    drawCard(doc, margin, yPosition, contentWidth, disclaimerHeight, {
      fill: [255, 250, 243],
      stroke: TONES.na.border,
    });
    doc.setFillColor(...TONES.partial.text);
    doc.circle(margin + 7.5, yPosition + 7.5, 3, "F");
    setFont(doc, 9, "bold", PALETTE.white);
    doc.text("!", margin + 7.5, yPosition + 7.5 + capHeight(9) / 2, {
      align: "center",
    });
    setFont(doc, 8.6, "bold", TONES.partial.text);
    doc.text(layout.disclaimerHeading, margin + 14, yPosition + 6.6);
    drawLines(
      disclaimerLines,
      margin + 14,
      yPosition + 9.2,
      8.8,
      "normal",
      textColor,
      4.1,
    );
    yPosition += disclaimerHeight + 10;
    tocPage = currentPage();
    tocStartY = yPosition;
  }

  // -------------------------------------------------------------- Summary
  addContentPage();
  drawPageTitle(layout.summaryEyebrow, strings.summaryHeading);

  const heroTop = yPosition;
  const heroTextX = margin + 58;
  const heroTextWidth = contentWidth - 58 - 6;
  const countLines = wrap(
    layout.heroLead(metrics.withEvidence, metrics.assessable),
    heroTextWidth,
    9.4,
    "bold",
  );
  const summaryCountLines = wrap(
    strings.summaryCounts(framework),
    heroTextWidth,
    7.6,
  );
  const scopeLine =
    locale === "de"
      ? `${framework.summary.applicableControls} im Geltungsbereich; ${framework.summary.notApplicable} außerhalb; ${framework.summary.notAssessed} unbewertet; ${framework.summary.conflicting} mit widersprüchlichen Nachweisen. Ausgewählte Zuordnungen, keine vollständige Rahmenwerksbewertung.`
      : `${framework.summary.applicableControls} in scope; ${framework.summary.notApplicable} outside scope; ${framework.summary.notAssessed} not assessed; ${framework.summary.conflicting} mixed policy evidence. Entries are selected mappings, not full framework coverage.`;
  const scopeLines = [
    ...summaryCountLines,
    ...wrap(scopeLine, heroTextWidth, 7.6),
  ];
  const safeguardLines =
    metrics.safeguardsTotal > 0
      ? wrap(
          MANAGEMENT_REPORT_STRINGS[locale].heroSentence(
            metrics.safeguardsInPlace,
            metrics.safeguardsTotal,
          ),
          heroTextWidth,
          8.4,
        )
      : [];
  const heroTextHeight =
    countLines.length * 4.3 +
    1.2 +
    safeguardLines.length * 3.8 +
    1.2 +
    scopeLines.length * 3.4 +
    3 +
    3 +
    4;
  const heroHeight = Math.max(30, heroTextHeight + 8);
  drawCard(doc, margin, heroTop, contentWidth, heroHeight, {
    fill: PALETTE.panel,
  });
  setFont(doc, 40, "bold", primaryColor);
  doc.text(coveragePercent, margin + 6, heroTop + heroHeight / 2 + 4);
  wrapLines(doc, layout.heroLabel.toUpperCase(), 44, 5.8, "bold", 2).forEach(
    (line, index) =>
      drawEyebrow(
        doc,
        line,
        margin + 6.3,
        heroTop + heroHeight / 2 + 9.5 + index * 2.8,
        {
          color: PALETTE.muted,
          size: 5.8,
          charSpace: 0.2,
        },
      ),
  );
  let heroY = heroTop + (heroHeight - heroTextHeight) / 2;
  drawLines(countLines, heroTextX, heroY, 9.4, "bold", textColor, 4.3);
  heroY += countLines.length * 4.3 + 1.2;
  drawLines(safeguardLines, heroTextX, heroY, 8.4, "normal", textColor, 3.8);
  heroY += safeguardLines.length * 3.8 + 1.2;
  drawLines(scopeLines, heroTextX, heroY, 7.6, "normal", PALETTE.muted, 3.4);
  heroY += scopeLines.length * 3.4 + 3;
  drawStackedBar(
    doc,
    heroTextX,
    heroY,
    heroTextWidth,
    3,
    evidenceSegments,
    Math.max(metrics.assessable, 1),
    { track: PALETTE.track },
  );
  setFont(doc, 6.2, "normal", PALETTE.muted);
  doc.text("0%", heroTextX, heroY + 6.6);
  doc.text("50%", heroTextX + heroTextWidth / 2, heroY + 6.6, {
    align: "center",
  });
  doc.text("100%", heroTextX + heroTextWidth, heroY + 6.6, { align: "right" });
  yPosition = heroTop + heroHeight + 4;

  const tileWidth = (contentWidth - 3 * 4) / 4;
  const tiles = [
    {
      label: layout.withEvidenceLabel,
      value: String(metrics.withEvidence),
      caption: layout.withEvidenceCaption(
        frameworkCounts.evidenceFound,
        frameworkCounts.partialEvidence,
      ),
      marker: "half" as MarkerKind,
      markerColor: REPORT_STATUS_COLORS.partialEvidence,
      valueColor: TONES.supporting.text,
    },
    {
      label: layout.safeguardsLabel,
      value: String(metrics.safeguardsInPlace),
      caption: layout.safeguardsCaption(metrics.safeguardsTotal),
      marker: "filled" as MarkerKind,
      markerColor: REPORT_STATUS_COLORS.evidenceFound,
      valueColor: TONES.found.text,
    },
    ...(["noEvidence", "conflictingEvidence"] as const).map((status) => ({
      label: layout.shortStatuses[status],
      value: String(frameworkCounts[status]),
      caption: layout.tileCaptions[status],
      marker: markerForControlStatus(status),
      markerColor: REPORT_STATUS_COLORS[status],
      valueColor:
        frameworkCounts[status] > 0
          ? TONES[CONTROL_STATUS_TONES[status]].text
          : PALETTE.faint,
    })),
  ];
  tiles.forEach((tile, index) => {
    drawKpiTile(
      doc,
      margin + index * (tileWidth + 4),
      yPosition,
      tileWidth,
      26,
      tile,
    );
  });
  yPosition += 26 + 5;

  drawSectionHeading(
    layout.distributionHeading,
    layout.controlsCount(totalControls),
  );
  drawStackedBar(
    doc,
    margin,
    yPosition,
    contentWidth,
    4,
    statusSegments(frameworkCounts),
    Math.max(totalControls, 1),
    { gap: 0.6 },
  );
  yPosition += 4 + 3.4;
  {
    let legendX = margin;
    let legendY = yPosition;
    for (const status of CONTROL_STATUS_SEQUENCE.filter(
      (item) => frameworkCounts[item] > 0,
    )) {
      const count = frameworkCounts[status];
      const percent =
        totalControls > 0
          ? `, ${Math.round((count / totalControls) * 100)}%`
          : "";
      const label = `${layout.shortStatuses[status]}${count > 0 ? percent : ""}`;
      const countWidth = textWidth(doc, String(count), 7, "bold");
      const itemWidth = 3.4 + countWidth + 1.2 + textWidth(doc, label, 7) + 6;
      if (legendX + itemWidth > right + 6 && legendX > margin) {
        legendX = margin;
        legendY += 4.2;
      }
      drawMarker(
        doc,
        legendX + 1.1,
        legendY + 1.3,
        markerForControlStatus(status),
        REPORT_STATUS_COLORS[status],
        1,
      );
      setFont(doc, 7, "bold", textColor);
      doc.text(String(count), legendX + 3.4, legendY + 2.3);
      setFont(doc, 7, "normal", PALETTE.muted);
      doc.text(label, legendX + 3.4 + countWidth + 1.2, legendY + 2.3);
      legendX += itemWidth;
    }
    yPosition = legendY + 4.2 + 3;
  }

  const familyColumns = groups.length > 8 ? 2 : 1;
  const familyRowHeight = groups.length > 6 && familyColumns === 1 ? 6.4 : 7.4;
  /** Height of the family block when it shows at most `rows` rows. */
  const familyBlockHeight = (rows: number) => {
    const shownRows = Math.min(rows, Math.ceil(groups.length / familyColumns));
    const hidden = groups.length - shownRows * familyColumns;
    return 6.5 + shownRows * familyRowHeight + (hidden > 0 ? 5 : 0) + 5;
  };
  const drawFamilyBlock = (maxRows: number) => {
    drawSectionHeading(
      options.frameworkId === "bsi-it-grundschutz"
        ? layout.tierHeading
        : layout.familyHeading,
      layout.familySmall,
    );
    drawRule(doc, margin, yPosition - 1.5, right, primaryColor, 0.4);
    {
      const columns = familyColumns;
      const rowHeight = familyRowHeight;
      const columnGap = 8;
      const columnWidth = (contentWidth - columnGap * (columns - 1)) / columns;
      const labelWidth = columns === 1 ? 64 : 42;
      const valueWidth = columns === 1 ? 22 : 16;
      const rowsPerColumn = Math.min(
        maxRows,
        Math.ceil(groups.length / columns),
      );
      // Large frameworks list the first families; the overview has them all.
      const shownGroups = groups.slice(0, rowsPerColumn * columns);
      const hiddenGroups = groups.length - shownGroups.length;
      const codeColumn = Math.min(
        Math.max(
          0,
          ...groups.map((group) =>
            group.code ? chipWidth(doc, group.code, 6.4) : 0,
          ),
        ),
        labelWidth / 2,
      );
      const top = yPosition - 1.5;
      shownGroups.forEach((group, index) => {
        const column = Math.floor(index / rowsPerColumn);
        const row = index % rowsPerColumn;
        const x = margin + column * (columnWidth + columnGap);
        const rowTop = top + row * rowHeight;
        const middle = rowTop + rowHeight / 2;
        let labelX = x;
        if (group.code) {
          drawChip(doc, x, middle - 2, group.code, "id", {
            size: 6.4,
            height: 4,
            fill: primaryTint,
            color: primaryColor,
            minWidth: codeColumn,
          });
          labelX += codeColumn + 1.8;
        }
        if (group.name) {
          setFont(doc, 7.8, "normal", textColor);
          doc.text(
            clampLine(doc, group.name, x + labelWidth - labelX - 1, 7.8),
            labelX,
            middle + capHeight(7.8) / 2,
          );
        }
        const counts = statusCounts(group.controls);
        drawStackedBar(
          doc,
          x + labelWidth + 2,
          middle - 1.3,
          columnWidth - labelWidth - valueWidth - 4,
          2.6,
          statusSegments(counts),
          group.controls.length,
          { gap: 0.5 },
        );
        const total = ` ${locale === "de" ? "von" : "of"} ${group.controls.length}`;
        setFont(doc, 7.8, "normal", PALETTE.muted);
        const totalWidth = doc.getTextWidth(total);
        doc.text(total, x + columnWidth, middle + capHeight(7.8) / 2, {
          align: "right",
        });
        setFont(doc, 7.8, "bold", primaryColor);
        doc.text(
          String(counts.evidenceFound + counts.partialEvidence),
          x + columnWidth - totalWidth,
          middle + capHeight(7.8) / 2,
          { align: "right" },
        );
        drawRule(doc, x, rowTop + rowHeight, x + columnWidth);
      });
      yPosition = top + rowsPerColumn * rowHeight;
      if (hiddenGroups > 0) {
        setFont(doc, 7, "italic", PALETTE.muted);
        doc.text(layout.moreFamilies(hiddenGroups), margin, yPosition + 3.6);
        yPosition += 5;
      }
      yPosition += 5;
    }
  };

  // Counter-evidence counts, scoped to capabilities mapped to this framework.
  const controlIdsByCapability = new Map<string, string[]>();
  for (const control of controls) {
    for (const capabilityId of control.capabilityIds) {
      const ids = controlIdsByCapability.get(capabilityId);
      if (ids) ids.push(control.control.id);
      else controlIdsByCapability.set(capabilityId, [control.control.id]);
    }
  }
  const frameworkCapabilities = assessment.capabilities.filter((result) =>
    controlIdsByCapability.has(result.capability.id),
  );
  const assignedDeviations = frameworkCapabilities.filter((result) =>
    result.evidence.some(
      (item) =>
        item.verdict === "disabled" && item.assignment.state === "assigned",
    ),
  );
  const unassignedCompliant = frameworkCapabilities.filter(
    (result) => result.status === "configuredNotAssigned",
  );
  const counterPanelWidth = (contentWidth - 4) / 2;
  const counterPanels = (() => {
    const panelWidth = counterPanelWidth;
    const panels = [
      {
        count: assignedDeviations.length,
        label: strings.assignedDeviations,
        explanation: strings.assignedDeviationsExplanation,
        color: ASSIGNED_COUNTER_EVIDENCE_COLOR,
      },
      {
        count: unassignedCompliant.length,
        label: strings.unassignedCompliant,
        explanation: strings.unassignedCompliantExplanation,
        color: UNASSIGNED_COUNTER_EVIDENCE_COLOR,
      },
    ].map((panel) => {
      const title =
        panel.count > 0
          ? `${panel.label}: ${panel.count}.`
          : `${panel.label}: 0`;
      const titleLines = wrap(title, panelWidth - 12, 7.6, "bold");
      const explanationLines =
        panel.count > 0 ? wrap(panel.explanation, panelWidth - 12, 7) : [];
      return {
        ...panel,
        titleLines,
        explanationLines,
        height: titleLines.length * 3.5 + explanationLines.length * 3.1 + 7,
      };
    });
    return panels;
  })();
  const counterPanelHeight = Math.max(
    ...counterPanels.map((panel) => panel.height),
  );
  const drawCounterPanels = () => {
    const panelWidth = counterPanelWidth;
    const panelHeight = counterPanelHeight;
    counterPanels.forEach((panel, index) => {
      const x = margin + index * (panelWidth + 4);
      drawCard(doc, x, yPosition, panelWidth, panelHeight, {
        stroke: PALETTE.border,
      });
      const active = panel.count > 0;
      drawMarker(
        doc,
        x + 5,
        yPosition + 4.6,
        active ? "triangle" : "outline",
        active ? panel.color : PALETTE.faint,
      );
      drawLines(
        panel.titleLines,
        x + 8.5,
        yPosition + 3.5,
        7.6,
        "bold",
        active ? panel.color : textColor,
        3.5,
      );
      drawLines(
        panel.explanationLines,
        x + 8.5,
        yPosition + 3.5 + panel.titleLines.length * 3.5 + 0.6,
        7,
        "normal",
        PALETTE.muted,
        3.1,
      );
    });
    yPosition += panelHeight + 5;
  };

  interface Finding {
    kind: FindingKind;
    title: string;
    description: string;
    controlIds: string[];
  }
  const findings: Finding[] = [];
  for (const result of assignedDeviations) {
    const ids = controlIdsByCapability.get(result.capability.id) ?? [];
    if (ids.length === 0) continue;
    findings.push({
      kind: "risk",
      title: capabilityName(result),
      description:
        locale === "de"
          ? `Zugewiesene abweichende Konfiguration für ${ids.join(", ")}.`
          : `Assigned deviating configuration affects ${ids.join(", ")}.`,
      controlIds: ids,
    });
  }
  if (options.frameworkId === "bsi-it-grundschutz") {
    for (const control of controls.filter(
      (item) =>
        item.control.tier === "Basis-Anforderung" &&
        item.status === "noEvidence",
    )) {
      const names = mappedCapabilitiesFor(control).map(capabilityName);
      findings.push({
        kind: "gap",
        title: names.join(", ") || control.control.title,
        description: `Kein technischer Nachweis für ${control.control.id}.`,
        controlIds: [control.control.id],
      });
    }
  }
  for (const result of unassignedCompliant) {
    const ids = controlIdsByCapability.get(result.capability.id) ?? [];
    if (ids.length === 0) continue;
    findings.push({
      kind: "unassigned",
      title: capabilityName(result),
      description:
        locale === "de"
          ? `Konfigurierte Einstellung ohne Zuweisung für ${ids.join(", ")}.`
          : `Configured setting without assignment affects ${ids.join(", ")}.`,
      controlIds: ids,
    });
  }
  const prioritizedFindings = findings.slice(0, 5);

  const frameworkNote =
    locale === "de" && framework.framework.id === "bsi-it-grundschutz"
      ? GERMAN_BSI_FRAMEWORK_NOTE
      : framework.framework.note;
  const coverageLabel = frameworkCoverageLabel(framework);
  const scopeTextWidth = contentWidth - 9 - 30;
  const scopeFor = (includeNote: boolean) => {
    const paragraphs = [
      ...(isExcerpt ? [strings.disclaimer] : []),
      ...(coverageLabel ? [coverageLabel] : []),
      ...(includeNote && frameworkNote
        ? [`${strings.notePrefix}${frameworkNote}`]
        : []),
      ...(strings.summaryScope ? [strings.summaryScope] : []),
    ];
    const lines = paragraphs.map((paragraph) =>
      wrap(paragraph, scopeTextWidth, 7, "normal"),
    );
    return {
      lines,
      height:
        lines.reduce((sum, item) => sum + item.length * 3.1, 0) +
        (lines.length - 1) * 1.4 +
        7.5,
    };
  };

  // Summary layout: all top findings (up to five) always appear. Cards come
  // first; findings that do not fit as cards become compact rows. The
  // family block is capped before any finding is dropped, and a long
  // framework note (Essential Eight carries its licence text) moves to the
  // methodology section.
  const findingCardWidth = (contentWidth - 4) / 2;
  const findingCardLayout = (finding: Finding) => {
    const titleLines = wrap(
      finding.title,
      findingCardWidth - 10,
      8.2,
      "bold",
      2,
    );
    const descriptionLines = wrap(
      finding.description,
      findingCardWidth - 10,
      7.1,
      "normal",
      3,
    );
    return {
      finding,
      titleLines,
      descriptionLines,
      height:
        3.6 +
        4.2 +
        3.4 +
        titleLines.length * 3.6 +
        0.6 +
        descriptionLines.length * 3.1 +
        3,
    };
  };
  // Compact rows: kind pill, control chips and the finding text, wrapped to
  // at most two lines so nothing is cut.
  const compactFindingLayout = (finding: Finding) => {
    const kindWidth = pillMetrics(doc, layout.findingKinds[finding.kind], {
      tone: "none",
      marker: "outline",
      small: true,
    }).width;
    const chipsWidth =
      chipWidth(doc, finding.controlIds[0] ?? "", 6.4) +
      1 +
      (finding.controlIds.length > 1
        ? chipWidth(doc, `+${finding.controlIds.length - 1}`, 6.2) + 1
        : 0);
    const pageSpace = detailIds.has(finding.controlIds[0] ?? "") ? 24 : 0;
    const textX = 3.4 + kindWidth + 1.6 + chipsWidth + 1;
    const lines = wrap(
      `${finding.title}: ${finding.description}`,
      contentWidth - textX - 2 - pageSpace,
      7.6,
      "bold",
      2,
    );
    return { lines, height: lines.length > 1 ? 10.6 : 7.4 };
  };
  const hiddenFindings = findings.length - prioritizedFindings.length;
  const findingsHeight = (cards: number) => {
    const layouts = prioritizedFindings.slice(0, cards).map(findingCardLayout);
    let height = 6.5;
    if (prioritizedFindings.length === 0) return height + 8;
    for (let index = 0; index < layouts.length; index += 2)
      height +=
        Math.max(
          ...layouts.slice(index, index + 2).map((card) => card.height),
        ) + 4;
    for (const finding of prioritizedFindings.slice(cards))
      height += compactFindingLayout(finding).height;
    if (prioritizedFindings.length > cards) height += 2;
    return height + (hiddenFindings > 0 ? 5 : 0);
  };
  const summaryStart = yPosition;
  const familyRowsAll = Math.ceil(groups.length / familyColumns);
  const summaryFits = (cards: number, familyRows: number, note: boolean) =>
    summaryStart +
      familyBlockHeight(familyRows) +
      counterPanelHeight +
      5 +
      findingsHeight(cards) +
      scopeFor(note).height +
      4 <=
    contentBottom;
  const summaryPlan = (() => {
    // Order of preference: the full family block with at least two cards,
    // then fewer family rows (down to two), then compact rows for every
    // finding, and only then a family block reduced to its pointer line.
    const fullToTwo = Array.from(
      { length: familyRowsAll },
      (_, index) => familyRowsAll - index,
    ).filter((rows) => rows >= 2);
    const minimumRows = Math.min(2, familyRowsAll);
    const noteOptions = frameworkNote ? [true, false] : [false];
    // A short note stays on the summary at the cost of family rows; a long
    // one (Essential Eight licence text) moves before any row is capped.
    const shortNote = scopeFor(true).height - scopeFor(false).height < 20;
    const combine = (rowsList: number[]) =>
      shortNote
        ? noteOptions.flatMap((note) =>
            rowsList.map((familyRows) => ({ note, familyRows })),
          )
        : rowsList.flatMap((familyRows) =>
            noteOptions.map((note) => ({ note, familyRows })),
          );
    const maxCards = prioritizedFindings.length;
    const stages: Array<{
      plans: Array<{ note: boolean; familyRows: number }>;
      minCards: number;
    }> = [
      {
        plans: combine(fullToTwo.length ? fullToTwo : [minimumRows]),
        minCards: Math.min(2, maxCards),
      },
      { plans: combine([minimumRows]), minCards: 0 },
      {
        plans: combine([1, 0].filter((rows) => rows < minimumRows)),
        minCards: 0,
      },
    ];
    for (const stage of stages)
      for (const { note, familyRows } of stage.plans)
        for (let cards = maxCards; cards >= stage.minCards; cards -= 1)
          if (summaryFits(cards, familyRows, note))
            return { cards, familyRows, note };
    return { cards: 0, familyRows: 0, note: false };
  })();
  const frameworkNoteInMethodology =
    Boolean(frameworkNote) && !summaryPlan.note;
  const { lines: scopeLayout, height: scopeHeight } = scopeFor(
    summaryPlan.note,
  );

  drawFamilyBlock(summaryPlan.familyRows);
  drawCounterPanels();

  drawSectionHeading(strings.findingsHeading, layout.findingsSmall);
  if (prioritizedFindings.length === 0) {
    setFont(doc, 8.5, "normal", PALETTE.muted);
    doc.text(strings.noFindings, margin, yPosition + 3);
    yPosition += 8;
  } else {
    const cardWidth = findingCardWidth;
    const cardLayout = findingCardLayout;
    let shown = 0;
    const cardFindings = prioritizedFindings.slice(0, summaryPlan.cards);
    for (let index = 0; index < cardFindings.length; index += 2) {
      const row = cardFindings.slice(index, index + 2).map(cardLayout);
      const rowHeight = Math.max(...row.map((card) => card.height));
      row.forEach((card, column) => {
        const x = margin + column * (cardWidth + 4);
        const top = yPosition;
        const kindColor =
          card.finding.kind === "risk"
            ? ASSIGNED_COUNTER_EVIDENCE_COLOR
            : card.finding.kind === "unassigned"
              ? UNASSIGNED_COUNTER_EVIDENCE_COLOR
              : REPORT_STATUS_COLORS.noEvidence;
        drawCard(doc, x, top, cardWidth, rowHeight, { stroke: PALETTE.border });
        doc.setFillColor(...kindColor);
        doc.roundedRect(x, top + 3.6, 0.9, rowHeight - 7.2, 0.45, 0.45, "F");
        let rowX = x + 5.4;
        rowX +=
          drawPill(
            doc,
            rowX,
            top + 3.6,
            layout.findingKinds[card.finding.kind],
            {
              tone:
                card.finding.kind === "risk"
                  ? "conflict"
                  : card.finding.kind === "unassigned"
                    ? "partial"
                    : "none",
              marker:
                card.finding.kind === "risk"
                  ? "triangle"
                  : card.finding.kind === "unassigned"
                    ? "half"
                    : "outline",
              markerColor: kindColor,
              small: true,
            },
          ) + 1.6;
        const firstId = card.finding.controlIds[0] ?? "";
        rowX +=
          drawChip(doc, rowX, top + 3.7, firstId, "id", {
            size: 6.4,
            height: 4,
            fill: primaryTint,
            color: primaryColor,
          }) + 1;
        if (card.finding.controlIds.length > 1)
          drawChip(
            doc,
            rowX,
            top + 3.7,
            `+${card.finding.controlIds.length - 1}`,
            "muted",
            {
              size: 6.2,
              height: 4,
            },
          );
        if (detailIds.has(firstId))
          pageRefs.push({
            page: currentPage(),
            x: x + cardWidth - 4,
            y: top + 6.6,
            controlId: firstId,
            kind: "finding",
          });
        const titleTop = top + 3.6 + 4.2 + 3;
        drawLines(
          card.titleLines,
          x + 5.4,
          titleTop,
          8.2,
          "bold",
          textColor,
          3.6,
        );
        drawLines(
          card.descriptionLines,
          x + 5.4,
          titleTop + card.titleLines.length * 3.6 + 0.8,
          7.1,
          "normal",
          PALETTE.muted,
          3.1,
        );
      });
      shown += row.length;
      yPosition += rowHeight + 4;
    }
    // Remaining top findings as compact rows, so none is dropped.
    for (const finding of prioritizedFindings.slice(shown)) {
      const top = yPosition;
      const compact = compactFindingLayout(finding);
      const compactFindingHeight = compact.height;
      const middle = top + 3.7;
      const kindColor =
        finding.kind === "risk"
          ? ASSIGNED_COUNTER_EVIDENCE_COLOR
          : finding.kind === "unassigned"
            ? UNASSIGNED_COUNTER_EVIDENCE_COLOR
            : REPORT_STATUS_COLORS.noEvidence;
      doc.setFillColor(...kindColor);
      doc.roundedRect(
        margin,
        top + 1.4,
        0.9,
        compactFindingHeight - 2.8,
        0.45,
        0.45,
        "F",
      );
      let rowX = margin + 3.4;
      rowX +=
        drawPill(doc, rowX, middle - 2.1, layout.findingKinds[finding.kind], {
          tone:
            finding.kind === "risk"
              ? "conflict"
              : finding.kind === "unassigned"
                ? "partial"
                : "none",
          marker:
            finding.kind === "risk"
              ? "triangle"
              : finding.kind === "unassigned"
                ? "half"
                : "outline",
          markerColor: kindColor,
          small: true,
        }) + 1.6;
      const firstId = finding.controlIds[0] ?? "";
      rowX +=
        drawChip(doc, rowX, middle - 2, firstId, "id", {
          size: 6.4,
          height: 4,
          fill: primaryTint,
          color: primaryColor,
        }) + 1;
      if (finding.controlIds.length > 1)
        rowX +=
          drawChip(
            doc,
            rowX,
            middle - 2,
            `+${finding.controlIds.length - 1}`,
            "muted",
            {
              size: 6.2,
              height: 4,
            },
          ) + 1;
      setFont(doc, 7.6, "bold", textColor);
      compact.lines.forEach((line, index) =>
        doc.text(line, rowX + 1, middle + capHeight(7.6) / 2 + index * 3.3),
      );
      if (detailIds.has(firstId))
        pageRefs.push({
          page: currentPage(),
          x: right - 1,
          y: middle + capHeight(6.4) / 2,
          controlId: firstId,
          kind: "finding",
        });
      drawRule(doc, margin, top + compactFindingHeight, right);
      yPosition += compactFindingHeight;
      shown += 1;
    }
    if (prioritizedFindings.length > summaryPlan.cards) yPosition += 2;
    if (hiddenFindings > 0) {
      setFont(doc, 7, "italic", PALETTE.muted);
      doc.text(
        isExcerpt
          ? layout.moreFindingsExcerpt(hiddenFindings)
          : layout.moreFindings(hiddenFindings),
        margin,
        yPosition + 2,
      );
      yPosition += 5;
    }
  }

  // Scope note anchored to the foot of the summary page when it fits.
  if (scopeLayout.length > 0 && yPosition + scopeHeight + 2 > contentBottom)
    addContentPage();
  if (scopeLayout.length > 0) {
    const top = Math.max(yPosition + 2, contentBottom - scopeHeight);
    drawCard(doc, margin, top, contentWidth, scopeHeight, {
      fill: PALETTE.panel,
    });
    drawEyebrow(
      doc,
      layout.scopeNote,
      margin + 4.5,
      top + 3.6 + capHeight(6.2),
      {
        color: primaryColor,
        size: 6,
        charSpace: 0.2,
      },
    );
    let noteY = top + 3.6;
    scopeLayout.forEach((lines) => {
      drawLines(
        lines,
        margin + 4.5 + 30,
        noteY,
        7,
        "normal",
        PALETTE.muted,
        3.1,
      );
      noteY += lines.length * 3.1 + 1.4;
    });
    yPosition = top + scopeHeight + 4;
  }

  // Legend panel. Placed under the results overview when it fits there,
  // otherwise after the methodology.
  let howToReadDrawn = false;
  const drawHowToRead = (force: boolean): boolean => {
    const panelPad = 5.5;
    const legendWidth = 98;
    const notesX = margin + panelPad + legendWidth + 6;
    const notesWidth = right - panelPad - notesX;
    const pillColumn = 44;
    const legendRows = CONTROL_STATUS_SEQUENCE.map((status) => {
      const descriptionLines = wrap(
        strings.controlStatuses[status],
        legendWidth - pillColumn - 2,
        6.8,
      );
      return {
        status,
        descriptionLines,
        height: Math.max(5, descriptionLines.length * 2.9 + 1.6),
      };
    });
    const noteLayouts = layout.howToReadNotes.map((note) =>
      wrap(note, notesWidth - 4, 7.2),
    );
    const legendHeight = legendRows.reduce((sum, row) => sum + row.height, 0);
    const notesHeight = noteLayouts.reduce(
      (sum, lines) => sum + lines.length * 3.4 + 1.6,
      0,
    );
    const height = 6 + 5 + Math.max(legendHeight, notesHeight) + panelPad;
    if (yPosition + height > contentBottom) {
      if (!force) return false;
      addContentPage();
    }
    const top = yPosition;
    drawCard(doc, margin, top, contentWidth, height, { fill: PALETTE.panel });
    drawEyebrow(
      doc,
      layout.howToRead,
      margin + panelPad,
      top + panelPad + 1.8,
      {
        color: secondaryColor,
      },
    );
    let rowTop = top + panelPad + 6;
    for (const row of legendRows) {
      const middle = rowTop + row.height / 2;
      controlStatusPill(
        margin + panelPad,
        middle - 2.1,
        row.status,
        true,
        pillColumn - 2,
      );
      drawLines(
        row.descriptionLines,
        margin + panelPad + pillColumn,
        middle - (row.descriptionLines.length * 3) / 2 + 0.2,
        6.8,
        "normal",
        PALETTE.muted,
        3,
      );
      rowTop += row.height;
    }
    let noteTop = top + panelPad + 6.6;
    noteLayouts.forEach((lines, index) => {
      setFont(doc, 7.2, "bold", primaryColor);
      doc.text(`${index + 1}.`, notesX, noteTop + capHeight(7.2));
      drawLines(lines, notesX + 4, noteTop, 7.2, "normal", textColor, 3.4);
      noteTop += lines.length * 3.4 + 1.6;
    });
    yPosition = top + height + 4;
    howToReadDrawn = true;
    return true;
  };

  // Methodology section. An excerpt places it under the legend on the
  // results page when it fits there, so a short tail never fills a page.
  let methodologyDrawn = false;
  let methodologyEntry: TocEntry | undefined;
  const drawMethodology = (eyebrow: string, force: boolean): boolean => {
    const methodologyLines = wrap(strings.methodology, contentWidth, 8.4);
    const noteLines =
      frameworkNoteInMethodology && frameworkNote
        ? wrap(`${strings.notePrefix}${frameworkNote}`, contentWidth, 7.6)
        : [];
    const fullHeight =
      20 +
      methodologyLines.length * 3.9 +
      (noteLines.length ? noteLines.length * 3.5 + 6 : 0);
    if (
      yPosition + (force ? 20 + methodologyLines.length * 3.9 : fullHeight) >
      contentBottom
    ) {
      if (!force) return false;
      addContentPage();
    }
    // Recorded after the register so the bookmarks keep the section order.
    methodologyEntry = {
      title: strings.methodologyHeading,
      page: currentPage(),
      level: 0,
    };
    drawEyebrow(doc, eyebrow, margin, yPosition + 2.4, {
      color: secondaryColor,
    });
    setFont(doc, 15, "bold", primaryColor);
    doc.text(
      strings.methodologyHeading,
      margin,
      yPosition + 4 + capHeight(15) + 1,
    );
    yPosition += 6 + capHeight(15) + 4;
    drawLines(
      methodologyLines,
      margin,
      yPosition,
      8.4,
      "normal",
      textColor,
      3.9,
    );
    yPosition += methodologyLines.length * 3.9 + 6;
    if (noteLines.length) {
      drawWrappedText(`${strings.notePrefix}${frameworkNote}`, {
        fontSize: 7.6,
        color: PALETTE.muted,
        lineHeight: 3.5,
        after: 6,
      });
    }
    methodologyDrawn = true;
    return true;
  };

  // ------------------------------------------------------ Results overview
  addContentPage();
  drawPageTitle(layout.resultsEyebrow, strings.resultsHeading, {
    lead: layout.resultsLead,
  });
  {
    const widths = [62, 48, 26, 32, 12] as const;
    const columnX = widths.map(
      (_, index) =>
        margin + widths.slice(0, index).reduce((sum, width) => sum + width, 0),
    );
    const drawHeader = () => {
      layout.overviewHeaders.forEach((header, index) => {
        const isLast = index === widths.length - 1;
        drawEyebrow(
          doc,
          header,
          isLast
            ? right - 1.5
            : (columnX[index] ?? margin) + (index === 0 ? 1.5 : 0),
          yPosition + 3.2,
          {
            color: PALETTE.muted,
            size: 5.8,
            charSpace: 0.2,
            align: isLast ? "right" : "left",
          },
        );
      });
      drawRule(doc, margin, yPosition + 5.2, right, primaryColor, 0.4);
      yPosition += 5.6;
    };
    drawHeader();
    // Tighten the rows when the table would just spill onto a second page.
    const estimate = (rowHeight: number, groupRow: number, spacer: number) =>
      groups.reduce(
        (sum, group, index) =>
          sum +
          (index > 0 ? spacer : 0) +
          groupRow +
          group.controls.length * rowHeight,
        0,
      ) + 30;
    const overflow =
      yPosition + estimate(controls.length > 16 ? 8 : 9, 7, 2) - contentBottom;
    const compact = overflow > 0 && overflow < 45;
    const groupHeight = compact ? 6.2 : 7;
    const baseRowHeight = compact ? 7.2 : controls.length > 16 ? 8 : 9;
    groups.forEach((group, groupIndex) => {
      const rowLayouts = group.controls.map((control) => {
        const chipW = Math.max(chipWidth(doc, control.control.id, 6.6), 9.6);
        const showTitle = control.control.title !== control.control.id;
        const titleLines = showTitle
          ? wrap(control.control.title, widths[0] - chipW - 5, 7.5, "normal", 2)
          : [];
        return {
          control,
          chipW,
          titleLines,
          height: Math.max(baseRowHeight, titleLines.length * 3.2 + 2.6),
        };
      });
      if (groupIndex > 0) yPosition += compact ? 1 : 2;
      if (
        yPosition + groupHeight + (rowLayouts[0]?.height ?? 0) >
        contentBottom
      ) {
        addContentPage();
        drawHeader();
      }
      doc.setFillColor(...primaryTint);
      doc.rect(margin, yPosition, contentWidth, groupHeight, "F");
      let labelX = margin + 1.5;
      const middle = yPosition + groupHeight / 2;
      if (group.code) {
        setFont(doc, 7.4, "bold", primaryColor);
        doc.text(group.code, labelX, middle + capHeight(7.4) / 2);
        labelX += doc.getTextWidth(group.code) + 1.6;
      }
      if (group.name) {
        setFont(doc, 7.4, "bold", primaryColor);
        doc.text(
          clampLine(doc, group.name, 130 - (labelX - margin), 7.4, "bold"),
          labelX,
          middle + capHeight(7.4) / 2,
        );
      }
      const groupCounts = statusCounts(group.controls);
      setFont(doc, 6.8, "normal", PALETTE.muted);
      doc.text(
        layout.groupSummary(
          groupCounts.evidenceFound + groupCounts.partialEvidence,
          group.controls.length,
        ),
        right - 1.5,
        middle + capHeight(6.8) / 2,
        { align: "right" },
      );
      yPosition += groupHeight;

      rowLayouts.forEach((row, rowIndex) => {
        if (yPosition + row.height > contentBottom) {
          addContentPage();
          drawHeader();
        }
        const { control } = row;
        const top = yPosition;
        const rowMiddle = top + row.height / 2;
        if (rowIndex % 2 === 1) {
          doc.setFillColor(...PALETTE.zebra);
          doc.rect(margin, top, contentWidth, row.height, "F");
        }
        drawRule(doc, margin, top + row.height, right);
        drawChip(doc, margin + 1.5, rowMiddle - 2.2, control.control.id, "id", {
          size: 6.6,
          minWidth: 9.6,
          fill: primaryTint,
          color: primaryColor,
        });
        drawLines(
          row.titleLines,
          margin + 1.5 + row.chipW + 2.2,
          rowMiddle - (row.titleLines.length * 3.2) / 2 + 0.3,
          7.5,
          "normal",
          textColor,
          3.2,
        );
        controlStatusPill(
          columnX[1] ?? 0,
          rowMiddle - 2.1,
          control.status,
          true,
          widths[1] - 2,
        );
        const capabilityTotal = control.capabilityIds.length;
        const enforced = control.enforcedCapabilityIds.length;
        drawStackedBar(
          doc,
          columnX[2] ?? 0,
          rowMiddle - 0.8,
          12,
          1.6,
          [{ value: enforced, color: REPORT_STATUS_COLORS[control.status] }],
          Math.max(capabilityTotal, 1),
        );
        setFont(doc, 7.4, "normal", textColor);
        doc.text(
          layout.ofCount(enforced, capabilityTotal),
          (columnX[2] ?? 0) + 14,
          rowMiddle + capHeight(7.4) / 2,
        );
        const evidenceX = columnX[3] ?? 0;
        if (detailIds.has(control.control.id)) {
          const refs = controlRefs(control);
          if (refs.length === 0) {
            setFont(doc, 7.2, "normal", PALETTE.faint);
            doc.text(
              layout.noneRecorded,
              evidenceX,
              rowMiddle + capHeight(7.2) / 2,
            );
          } else {
            let chipX = evidenceX;
            const limit = evidenceX + widths[3] - 2;
            for (let index = 0; index < refs.length; index += 1) {
              const ref = refs[index] ?? "";
              const remaining = refs.length - index;
              const width = chipWidth(doc, ref, 6.2);
              const moreWidth = chipWidth(doc, `+${remaining - 1}`, 6.2) + 0.8;
              if (
                chipX + width + (remaining > 1 ? moreWidth : 0) > limit &&
                index > 0
              ) {
                drawChip(doc, chipX, rowMiddle - 2, `+${remaining}`, "muted", {
                  size: 6.2,
                  height: 4,
                });
                break;
              }
              chipX +=
                drawChip(doc, chipX, rowMiddle - 2, ref, "evidence", {
                  color: primaryColor,
                }) + 0.8;
            }
          }
          pageRefs.push({
            page: currentPage(),
            x: right - 1.5,
            y: rowMiddle + capHeight(7.6) / 2,
            controlId: control.control.id,
            kind: "overview",
          });
        } else {
          const count = controlEvidenceCount(control);
          setFont(doc, 7, "normal", PALETTE.faint);
          doc.text(
            count > 0 ? layout.evidenceItems(count) : layout.noneRecorded,
            evidenceX,
            rowMiddle + capHeight(7) / 2,
          );
          setFont(doc, 7.4, "normal", PALETTE.faint);
          doc.text(
            layout.notAvailable,
            right - 1.5,
            rowMiddle + capHeight(7.4) / 2,
            {
              align: "right",
            },
          );
        }
        yPosition += row.height;
      });
    });

    const noteLines = isExcerpt
      ? wrap(
          layout.excerptNote(
            detailControls.map((item) => item.control.id).join(", "),
          ),
          contentWidth,
          6.8,
        )
      : [];
    const stripHeight = 10 + (noteLines.length ? noteLines.length * 3 + 3 : 0);
    if (yPosition + 8 + stripHeight > contentBottom) addContentPage();
    else yPosition += 8;
    drawRule(doc, margin, yPosition, right, primaryColor, 0.4);
    {
      let stripX = margin;
      let baseline = yPosition + 7;
      for (const status of presentStatuses) {
        const count = String(frameworkCounts[status]);
        const countWidth = textWidth(doc, count, 12, "bold");
        let label = layout.shortStatuses[status];
        // Wrap to a second strip line instead of cutting a label off.
        if (
          stripX > margin &&
          stripX + 4 + countWidth + 1.6 + textWidth(doc, label, 7.4) > right
        ) {
          stripX = margin;
          baseline += 6;
          yPosition += 6;
        }
        label = clampLine(doc, label, right - stripX - countWidth - 6, 7.4);
        drawMarker(
          doc,
          stripX + 1.2,
          baseline - 1.4,
          markerForControlStatus(status),
          REPORT_STATUS_COLORS[status],
        );
        setFont(doc, 12, "bold", primaryColor);
        doc.text(count, stripX + 4, baseline);
        setFont(doc, 7.4, "normal", PALETTE.muted);
        doc.text(label, stripX + 4 + countWidth + 1.6, baseline);
        stripX += 4 + countWidth + 1.6 + textWidth(doc, label, 7.4) + 9;
      }
    }
    yPosition += 10;
    if (noteLines.length) {
      drawLines(
        noteLines,
        margin,
        yPosition + 1.5,
        6.8,
        "normal",
        PALETTE.muted,
        3,
      );
      yPosition += noteLines.length * 3 + 3;
    }
    yPosition += 6;
    if (drawHowToRead(false) && isExcerpt)
      drawMethodology(layout.methodologyEarlyEyebrow, false);
  }

  // A simple zebra table used by the data basis section.
  const drawDataTable = (
    headers: readonly string[],
    rows: ReadonlyArray<{ cells: readonly string[]; note?: string }>,
    widths: readonly number[],
    align: ReadonlyArray<"left" | "right">,
  ) => {
    const columnX = widths.map(
      (_, index) =>
        margin + widths.slice(0, index).reduce((sum, width) => sum + width, 0),
    );
    const cellX = (index: number) =>
      align[index] === "right"
        ? (columnX[index] ?? margin) + (widths[index] ?? 0) - 1.6
        : (columnX[index] ?? margin) + 1.6;
    const drawHeader = () => {
      headers.forEach((header, index) => {
        drawEyebrow(doc, header, cellX(index), yPosition + 3.2, {
          color: PALETTE.muted,
          size: 5.8,
          charSpace: 0.2,
          align: align[index] === "right" ? "right" : "left",
        });
      });
      drawRule(doc, margin, yPosition + 5.2, right, primaryColor, 0.4);
      yPosition += 5.6;
    };
    const layouts = rows.map((row) => {
      const cells = row.cells.map((cell, index) =>
        wrap(cell, (widths[index] ?? 0) - 3.2, 7.4),
      );
      const noteLines = row.note
        ? wrapTechnicalId(row.note, contentWidth - 3.2, 6.6)
        : [];
      const height =
        Math.max(
          7,
          Math.max(...cells.map((lines) => lines.length)) * 3.2 + 3.8,
        ) + (noteLines.length ? noteLines.length * 2.9 + 1 : 0);
      return { cells, noteLines, height };
    });
    if (yPosition + 5.6 + (layouts[0]?.height ?? 0) > contentBottom)
      addContentPage();
    drawHeader();
    layouts.forEach((row, rowIndex) => {
      if (yPosition + row.height > contentBottom) {
        addContentPage();
        drawHeader();
      }
      if (rowIndex % 2 === 1) {
        doc.setFillColor(...PALETTE.zebra);
        doc.rect(margin, yPosition, contentWidth, row.height, "F");
      }
      row.cells.forEach((lines, index) => {
        setFont(doc, 7.4, index === 0 ? "bold" : "normal", textColor);
        lines.forEach((line, lineIndex) =>
          doc.text(line, cellX(index), yPosition + 4.6 + lineIndex * 3.2, {
            align: align[index] === "right" ? "right" : "left",
          }),
        );
      });
      if (row.noteLines.length) {
        const noteTop =
          yPosition +
          Math.max(
            7,
            Math.max(...row.cells.map((lines) => lines.length)) * 3.2 + 3.8,
          ) -
          1.2;
        drawLines(
          row.noteLines,
          margin + 1.6,
          noteTop,
          6.6,
          "normal",
          PALETTE.muted,
          2.9,
        );
      }
      yPosition += row.height;
      drawRule(doc, margin, yPosition, right);
    });
    yPosition += 6;
  };

  // ------------------------------------------------------ Data basis
  if (!isExcerpt) {
    addContentPage();
    drawPageTitle(layout.dataEyebrow, strings.provenanceHeading);
    {
      const innerWidth = contentWidth - 10;
      const timestampLines = wrap(
        `${strings.generatedOn}: ${formatReportTimestamp(generatedAt, locale, fixedDate)}`,
        innerWidth,
        8.6,
        "bold",
      );
      const basisLines = wrap(strings.dataBasis, innerWidth, 8.2);
      const rulesetLines = wrap(
        `${strings.rulesetLabel}: ${COMPLIANCE_RULESET_VERSION}, ${frameworkDisplay}`,
        innerWidth,
        8.2,
        "bold",
      );
      const height =
        timestampLines.length * 3.9 +
        basisLines.length * 3.7 +
        rulesetLines.length * 3.7 +
        3 +
        9;
      drawCard(doc, margin, yPosition, contentWidth, height, {
        fill: PALETTE.panel,
      });
      let panelY = yPosition + 4.5;
      drawLines(
        timestampLines,
        margin + 5,
        panelY,
        8.6,
        "bold",
        textColor,
        3.9,
      );
      panelY += timestampLines.length * 3.9 + 1.5;
      drawLines(basisLines, margin + 5, panelY, 8.2, "normal", textColor, 3.7);
      panelY += basisLines.length * 3.7 + 1.5;
      drawLines(
        rulesetLines,
        margin + 5,
        panelY,
        8.2,
        "bold",
        primaryColor,
        3.7,
      );
      yPosition += height + 7;
    }

    const inventoryKeys = [
      "settingsCatalog",
      "deviceConfigurations",
      "compliancePolicies",
    ] as const;
    const countAssigned = (items: Array<Record<string, unknown>>): number =>
      items.filter(
        (item) =>
          summarizeAssignments(
            item.assignments,
            undefined,
            (item.collectionStatus as any)?.assignments === "incomplete",
          ).state === "assigned",
      ).length;
    const familyCounts = inventoryKeys.map((key) => familyItems(data, key));
    const inventoryRows = inventoryKeys.map((key, index) => {
      const items = familyCounts[index] ?? [];
      return [
        strings.inventoryFamilies[index] ?? key,
        String(items.length),
        String(countAssigned(items)),
      ];
    });
    // The engine assesses every collected policy family; list the remainder
    // so the provenance section never understates the assessed inventory.
    const allItems = allPolicyItems(data);
    const familyTotal = familyCounts.reduce(
      (sum, items) => sum + items.length,
      0,
    );
    const otherCount = allItems.length - familyTotal;
    if (otherCount > 0) {
      const otherAssigned =
        countAssigned(allItems) -
        familyCounts.reduce((sum, items) => sum + countAssigned(items), 0);
      inventoryRows.push([
        strings.inventoryOther,
        String(otherCount),
        String(Math.max(otherAssigned, 0)),
      ]);
    }
    ensureSpace(30);
    drawSectionHeading(strings.inventoryHeading);
    drawDataTable(
      strings.inventoryHeaders,
      inventoryRows.map((cells) => ({ cells })),
      [108, 30, 42],
      ["left", "right", "right"],
    );

    ensureSpace(40);
    drawSectionHeading(strings.collectionHeading);
    drawWrappedText(
      locale === "de"
        ? `Erhoben: ${assessment.provenance.collectedAt ?? "unbekannt"}; Regelwerk ${assessment.provenance.rulesetVersion}. Gerätezustand nicht erhoben; tatsächlicher Zugriff nicht geprüft.`
        : `Collected: ${assessment.provenance.collectedAt ?? "unknown"}; ruleset ${assessment.provenance.rulesetVersion}. Device state not collected; effective access unverified.`,
      { fontSize: 8, lineHeight: 3.7, after: 1.5 },
    );
    drawWrappedText(
      `${locale === "de" ? "Geltungsbereich" : "Scope"}: ${(assessment.scope.platforms ?? ["windows", "macos", "ios", "android"]).join(", ")}${options.frameworkId === "def-stan-05-138-i4" ? `; Cyber Risk Profile: ${assessment.scope.defStanRiskLevel ?? "all levels"}` : ""}.`,
      { fontSize: 8, lineHeight: 3.7, after: 2.5 },
    );
    for (const line of [
      `${locale === "de" ? "Datenstand" : "Snapshot"} SHA-256: ${manifest.snapshotSha256}`,
      `${locale === "de" ? "Regelwerk" : "Ruleset"} SHA-256: ${manifest.rulesetSha256}`,
      ...(framework.framework.source
        ? [
            `${locale === "de" ? "Herausgeberquelle" : "Publisher reference"}: ${framework.framework.source.url}`,
          ]
        : []),
    ]) {
      for (const wrapped of wrapTechnicalId(line, contentWidth, 6.8)) {
        ensureSpace(3.2);
        setFont(doc, 6.8, "normal", PALETTE.muted);
        doc.text(wrapped, margin, yPosition + capHeight(6.8));
        yPosition += 3.2;
      }
      yPosition += 0.8;
    }
    yPosition += 3;
    if (assessment.collectionCoverage.length > 0) {
      drawDataTable(
        layout.coverageHeaders,
        assessment.collectionCoverage.map((row) => ({
          cells: [
            row.family,
            layout.collectionStatuses[row.status],
            String(row.collectedPolicies),
            String(row.recognizedPolicies),
            String(row.unsupportedPolicies),
          ],
          note: row.errors.length
            ? row.errors
                .map((message) =>
                  locale === "de"
                    ? message.replaceAll(
                        "Settings Catalog",
                        "Einstellungskatalog",
                      )
                    : message,
                )
                .join("; ")
            : undefined,
        })),
        [68, 34, 26, 26, 26],
        ["left", "left", "right", "right", "right"],
      );
    }

    const fetchErrors = data.fetchErrors ?? [];
    if (fetchErrors.length > 0) {
      const innerWidth = contentWidth - 18;
      const headingLines = wrap(
        strings.incompleteCollection,
        innerWidth,
        8.2,
        "bold",
      );
      const detailLines = [
        ...fetchErrors
          .slice(0, 12)
          .flatMap((error) =>
            wrap(
              `${translateEvidenceValue(error.policyType, locale)}: ${truncate(error.error, 120)}${error.permissionHint ? ` (${error.permissionHint})` : ""}`,
              innerWidth,
              7.3,
            ),
          ),
        ...(fetchErrors.length > 12
          ? [
              locale === "de"
                ? `+${fetchErrors.length - 12} weitere Erhebungshinweise`
                : `+${fetchErrors.length - 12} more collection notes`,
            ]
          : []),
      ];
      const height = headingLines.length * 3.8 + detailLines.length * 3.4 + 10;
      ensureSpace(height + 4);
      drawCard(doc, margin, yPosition, contentWidth, height, {
        fill: [255, 250, 243],
        stroke: TONES.na.border,
      });
      doc.setFillColor(...TONES.partial.text);
      doc.circle(margin + 7, yPosition + 7, 2.8, "F");
      setFont(doc, 8.6, "bold", PALETTE.white);
      doc.text("!", margin + 7, yPosition + 7 + capHeight(8.6) / 2, {
        align: "center",
      });
      drawLines(
        headingLines,
        margin + 13,
        yPosition + 4.6,
        8.2,
        "bold",
        TONES.partial.text,
        3.8,
      );
      drawLines(
        detailLines,
        margin + 13,
        yPosition + 4.6 + headingLines.length * 3.8 + 1.2,
        7.3,
        "normal",
        textColor,
        3.4,
      );
      yPosition += height + 6;
    } else {
      drawWrappedText(strings.noCollectionErrors, {
        fontSize: 8.4,
        color: PALETTE.muted,
        after: 4,
      });
    }

    const platforms = new Set<string>();
    for (const result of assessment.capabilities) {
      if (result.evidence.length > 0) {
        const platform = platformFromValue(result.capability.platform);
        if (platform) platforms.add(platform);
      }
    }
    for (const item of allPolicyItems(data)) {
      const platform =
        platformFromValue(item.platforms) ??
        platformFromValue(item.platformType) ??
        platformFromValue(item["@odata.type"]);
      if (platform) platforms.add(platform);
    }
    const orderedPlatforms = ["Windows", "macOS", "iOS", "Android"].filter(
      (platform) => platforms.has(platform),
    );
    drawWrappedText(
      `${strings.platformScope}: ${orderedPlatforms.length > 0 ? orderedPlatforms.join(", ") : locale === "de" ? "Keine Plattform erkannt" : "No platform detected"}`,
      { fontSize: 8.4, style: "bold", after: 4 },
    );

    if (options.frameworkId === "bsi-it-grundschutz") {
      drawWrappedText(strings.manualNote, {
        fontSize: 8,
        style: "italic",
        color: PALETTE.muted,
        lineHeight: 3.7,
        after: 4,
      });
    }
  }

  // ------------------------------------------------------ Control detail
  const cardPad = 4;
  const innerX = margin + cardPad;
  const innerWidth = contentWidth - cardPad * 2;
  const maxBlockLines = Math.floor((contentBottom - contentTop - 30) / 3.2);

  interface FlowBlock {
    height: number;
    draw: (top: number) => void;
  }

  /**
   * Draws a bordered card from blocks, continuing it on the next page when a
   * block does not fit. Each page segment gets its own border.
   */
  const flowCard = (
    controlId: string,
    blocks: readonly FlowBlock[],
    options: {
      repeatOnBreak?: (index: number) => FlowBlock | undefined;
      dashed?: boolean;
    } = {},
  ) => {
    const bottomPad = 3;
    let segmentTop = yPosition;
    const closeSegment = () => {
      drawCard(
        doc,
        margin,
        segmentTop,
        contentWidth,
        yPosition + bottomPad - segmentTop,
        options.dashed
          ? { stroke: PALETTE.dashed, dashed: true }
          : { stroke: PALETTE.border },
      );
      yPosition += bottomPad;
    };
    blocks.forEach((block, index) => {
      if (
        yPosition + block.height + bottomPad > contentBottom &&
        yPosition > segmentTop
      ) {
        closeSegment();
        addControlContinuationPage(controlId);
        segmentTop = yPosition;
        yPosition += 1.5;
        const repeated = options.repeatOnBreak?.(index);
        if (repeated) {
          repeated.draw(yPosition);
          yPosition += repeated.height;
        }
      }
      block.draw(yPosition);
      yPosition += block.height;
    });
    closeSegment();
  };

  const chunkLines = (lines: readonly string[], size: number) => {
    const chunks: string[][] = [];
    for (let offset = 0; offset < Math.max(lines.length, 1); offset += size)
      chunks.push(lines.slice(offset, offset + size));
    return chunks;
  };

  const capabilityBlocks = (
    result: CapabilityResult,
  ): {
    blocks: FlowBlock[];
    tableHeader?: FlowBlock;
    firstRowIndex: number;
    lastRowIndex: number;
  } => {
    const blocks: FlowBlock[] = [];
    const statusLabel = strings.capabilityStatuses[result.status];
    const pillOptions = {
      tone: toneForCapabilityStatus(result.status),
      marker: markerForCapabilityStatus(result.status),
      markerColor:
        result.status === "requirementAssigned"
          ? primaryColor
          : CAPABILITY_STATUS_COLORS[result.status],
      maxWidth: 70,
    } as const;
    const pillWidth = pillMetrics(doc, statusLabel, pillOptions).width;
    const platform = platformFromValue(result.capability.platform);
    const nameWidth = innerWidth - pillWidth - 4;
    const nameLines = wrap(capabilityName(result), nameWidth, 9, "bold");
    const platformFits =
      platform &&
      nameLines.length === 1 &&
      textWidth(doc, nameLines[0] ?? "", 9, "bold") +
        textWidth(doc, platform, 7) +
        2 <
        nameWidth;
    const headerHeight = Math.max(8.4, nameLines.length * 4 + 4.4);
    blocks.push({
      height: headerHeight + 1.5,
      draw: (top) => {
        doc.setFillColor(...PALETTE.panel);
        doc.roundedRect(margin, top, contentWidth, headerHeight, 2, 2, "F");
        doc.rect(margin, top + headerHeight - 2, contentWidth, 2, "F");
        const textTop = top + (headerHeight - nameLines.length * 4) / 2 - 0.4;
        drawLines(nameLines, innerX, textTop, 9, "bold", textColor, 4);
        if (platformFits && platform) {
          setFont(doc, 7, "normal", PALETTE.muted);
          doc.text(
            platform,
            innerX + textWidth(doc, nameLines[0] ?? "", 9, "bold") + 2,
            textTop + capHeight(9),
          );
        }
        drawPill(
          doc,
          right - cardPad - pillWidth,
          top + (headerHeight - 4.8) / 2,
          statusLabel,
          pillOptions,
        );
      },
    });

    const caveat =
      result.evidence.length > 0
        ? result.capability.caveat?.[locale]
        : undefined;
    if (caveat) {
      const lines = wrap(caveat, innerWidth, 7.2, "italic");
      for (const chunk of chunkLines(lines, maxBlockLines))
        blocks.push({
          height: chunk.length * 3.2 + 1.8,
          draw: (top) =>
            drawLines(
              chunk,
              innerX,
              top + 0.4,
              7.2,
              "italic",
              PALETTE.muted,
              3.2,
            ),
        });
    }

    const widths = [52, 48, 42, innerWidth - 142] as const;
    const columnX = [
      innerX,
      innerX + widths[0],
      innerX + widths[0] + widths[1],
      innerX + widths[0] + widths[1] + widths[2],
    ];
    let tableHeader: FlowBlock | undefined;
    let firstRowIndex = -1;
    let lastRowIndex = -1;
    if (result.checks.length > 0) {
      tableHeader = {
        height: 6.4,
        draw: (top) => {
          layout.checkHeaders.forEach((header, index) => {
            const isLast = index === 3;
            drawEyebrow(
              doc,
              header,
              isLast ? right - cardPad : (columnX[index] ?? innerX),
              top + 3.6,
              {
                color: PALETTE.muted,
                size: 5.6,
                charSpace: 0.2,
                align: isLast ? "right" : "left",
              },
            );
          });
          drawRule(
            doc,
            innerX,
            top + 5.2,
            right - cardPad,
            PALETTE.border,
            0.25,
          );
        },
      };
      blocks.push(tableHeader);
      firstRowIndex = blocks.length;
      result.checks.forEach((check, checkIndex) => {
        const presentation = checkPresentation(check);
        const pillLabel = check.result
          ? layout.resultLabels[check.result]
          : layout.assessmentLabels[check.assessmentStatus];
        // Readable setting name first, the technical id small beneath it.
        const settingName = settingDisplayName(check.settingId, result);
        const leftItems: Array<{
          text: string;
          size: number;
          color: RgbColor;
          lineHeight: number;
        }> = [
          ...(settingName
            ? [
                ...wrap(settingName, widths[0] - 3, 7.2).map((text) => ({
                  text,
                  size: 7.2,
                  color: textColor,
                  lineHeight: 3.1,
                })),
                ...wrapTechnicalId(check.settingId, widths[0] - 3, 6).map(
                  (text) => ({
                    text,
                    size: 6,
                    color: PALETTE.faint,
                    lineHeight: 2.6,
                  }),
                ),
              ]
            : wrapTechnicalId(check.settingId, widths[0] - 3, 7.2).map(
                (text) => ({
                  text,
                  size: 7.2,
                  color: textColor,
                  lineHeight: 3.1,
                }),
              )),
          ...(check.policyName
            ? wrap(
                translateEvidenceValue(check.policyName, locale),
                widths[0] - 3,
                6.3,
              ).map((text) => ({
                text,
                size: 6.3,
                color: PALETTE.muted,
                lineHeight: 2.8,
              }))
            : []),
        ];
        // Very long values (Conditional Access JSON) span the card width
        // below the row instead of a tall narrow column.
        const longValue = 180;
        const expectedValue = labelledValue(check.expectedValue);
        const expectedText = expectedValue.label;
        const expectedLong = expectedText.length > longValue;
        const actualLabelled =
          check.actualValue === null ? null : labelledValue(check.actualValue);
        const actualValue = actualLabelled?.label ?? null;
        const actualMissing = actualValue === null;
        const actualLong = (actualValue?.length ?? 0) > longValue;
        // Labels lead; the raw option id stays visible, small and muted.
        const valueItems = (
          lines: readonly string[],
          raw: string | undefined,
          width: number,
          color: RgbColor,
          style: FontStyle,
        ) => [
          ...lines.map((text) => ({
            text,
            size: 7.2,
            style,
            color,
            lineHeight: 3.1,
          })),
          ...(raw
            ? wrapTechnicalId(raw, width, 6).map((text) => ({
                text,
                size: 6,
                style: "normal" as FontStyle,
                color: PALETTE.faint,
                lineHeight: 2.6,
              }))
            : []),
        ];
        const expectedLines = valueItems(
          expectedLong
            ? [layout.seeBelow]
            : wrapTechnicalId(expectedText, widths[1] - 3, 7.2),
          expectedLong ? undefined : expectedValue.raw,
          widths[1] - 3,
          PALETTE.muted,
          "normal",
        );
        const actualTextLines = actualLong
          ? [layout.seeBelow]
          : wrapTechnicalId(
              actualValue ??
                (check.result === "missing"
                  ? layout.notFound
                  : layout.unavailable),
              widths[2] - 3,
              7.2,
              actualMissing ? "italic" : "bold",
            );
        const actualLines = valueItems(
          actualTextLines,
          actualLong ? undefined : actualLabelled?.raw,
          widths[2] - 3,
          actualMissing ? PALETTE.muted : textColor,
          actualMissing ? "italic" : "bold",
        );
        const detailLines = [
          ...(expectedLong
            ? wrapTechnicalId(
                `${layout.checkHeaders[1]}: ${expectedText}`,
                innerWidth - 2,
                6.2,
              )
            : []),
          ...(actualLong && actualValue
            ? wrapTechnicalId(
                `${layout.checkHeaders[2]}: ${actualValue}`,
                innerWidth - 2,
                6.2,
              )
            : []),
        ];
        const isLastCheck = checkIndex === result.checks.length - 1;
        const reasonLines = check.reason
          ? wrap(
              locale === "de"
                ? check.reason.replaceAll(
                    "Settings Catalog",
                    "Einstellungskatalog",
                  )
                : check.reason,
              innerWidth - 2,
              6.6,
              "italic",
            )
          : [];
        // Very long values continue across pages in row chunks.
        const lineCount = Math.max(
          leftItems.length,
          expectedLines.length,
          actualLines.length,
        );
        const chunkCount = Math.max(1, Math.ceil(lineCount / maxBlockLines));
        for (let chunk = 0; chunk < chunkCount; chunk += 1) {
          const from = chunk * maxBlockLines;
          const to = from + maxBlockLines;
          const leftChunk = leftItems.slice(from, to);
          const expectedChunk = expectedLines.slice(from, to);
          const actualChunk = actualLines.slice(from, to);
          const isLastChunk = chunk === chunkCount - 1;
          // Reasons follow as their own blocks so long text can break.
          const reasonChunk: string[] = [];
          const leftHeight = leftChunk.reduce(
            (sum, item) => sum + item.lineHeight,
            0,
          );
          const itemsHeight = (items: ReadonlyArray<{ lineHeight: number }>) =>
            items.reduce((sum, item) => sum + item.lineHeight, 0);
          const bodyHeight = Math.max(
            leftHeight,
            itemsHeight(expectedChunk),
            itemsHeight(actualChunk),
            4.2,
          );
          const height =
            bodyHeight +
            3.4 +
            (reasonChunk.length ? reasonChunk.length * 2.9 + 0.8 : 0);
          blocks.push({
            height,
            draw: (top) => {
              if (check.result === "different") {
                doc.setFillColor(255, 247, 247);
                doc.rect(innerX, top, innerWidth, height, "F");
              }
              const cellTop = top + 1.7;
              let leftTop = cellTop;
              for (const item of leftChunk) {
                drawLines(
                  [item.text],
                  columnX[0] ?? innerX,
                  leftTop,
                  item.size,
                  "normal",
                  item.color,
                  item.lineHeight,
                );
                leftTop += item.lineHeight;
              }
              for (const [items, x] of [
                [expectedChunk, columnX[1] ?? innerX],
                [actualChunk, columnX[2] ?? innerX],
              ] as const) {
                let itemTop = cellTop;
                for (const item of items) {
                  drawLines(
                    [item.text],
                    x,
                    itemTop,
                    item.size,
                    item.style,
                    item.color,
                    item.lineHeight,
                  );
                  itemTop += item.lineHeight;
                }
              }
              if (chunk === 0) {
                const pill = {
                  tone: presentation.tone,
                  marker: presentation.marker,
                  markerColor: presentation.color,
                  small: true,
                  maxWidth: widths[3] - 1,
                } as const;
                const width = pillMetrics(doc, pillLabel, pill).width;
                drawPill(
                  doc,
                  right - cardPad - width,
                  cellTop - 0.4,
                  pillLabel,
                  pill,
                );
              }
              drawLines(
                reasonChunk,
                innerX,
                cellTop + bodyHeight + 0.6,
                6.6,
                "italic",
                PALETTE.muted,
                2.9,
              );
              if (
                !(
                  isLastChunk &&
                  (isLastCheck || detailLines.length || reasonLines.length)
                )
              )
                drawRule(doc, innerX, top + height, right - cardPad);
            },
          });
        }
        const trailing = [
          ...chunkLines(detailLines, maxBlockLines)
            .filter((chunk) => chunk.length > 0)
            .map((chunk) => ({
              chunk,
              size: 6.2,
              style: "normal" as FontStyle,
              color: textColor,
              lineHeight: 2.8,
            })),
          ...chunkLines(reasonLines, maxBlockLines)
            .filter((chunk) => chunk.length > 0)
            .map((chunk) => ({
              chunk,
              size: 6.6,
              style: "italic" as FontStyle,
              color: PALETTE.muted,
              lineHeight: 2.9,
            })),
        ];
        trailing.forEach((item, index) => {
          const height = item.chunk.length * item.lineHeight + 1.8;
          blocks.push({
            height,
            draw: (top) => {
              if (check.result === "different") {
                doc.setFillColor(255, 247, 247);
                doc.rect(innerX, top, innerWidth, height, "F");
              }
              drawLines(
                item.chunk,
                innerX,
                top + 0.4,
                item.size,
                item.style,
                item.color,
                item.lineHeight,
              );
              if (index === trailing.length - 1 && !isLastCheck)
                drawRule(doc, innerX, top + height, right - cardPad);
            },
          });
        });
      });
      lastRowIndex = blocks.length;
    }

    // Policies behind the evidence, each with its assignment.
    const policies = new Map<
      string,
      {
        name: string;
        assignment?: CapabilityEvidence["assignment"];
        ref?: string;
      }
    >();
    for (const evidence of result.evidence) {
      if (!policies.has(evidence.policyId || evidence.policyName))
        policies.set(evidence.policyId || evidence.policyName, {
          name: evidence.policyName,
          assignment: evidence.assignment,
          ref: evidenceRegistryByKey.get(evidenceRegistryKey(evidence))?.ref,
        });
    }
    for (const check of result.checks) {
      if (!check.policyName) continue;
      const key = check.policyId || check.policyName;
      if (!policies.has(key))
        policies.set(key, {
          name: check.policyName,
          assignment: check.assignment,
        });
    }
    const labelWidth = 18;
    const policyEntries = [...policies.values()];
    if (policyEntries.length === 0) {
      blocks.push({
        height: 8,
        draw: (top) => {
          drawRule(doc, innerX, top + 1, right - cardPad);
          drawEyebrow(doc, layout.policyLabel, innerX, top + 5.6, {
            color: PALETTE.muted,
            size: 5.6,
            charSpace: 0.2,
          });
          setFont(doc, 7.2, "normal", PALETTE.muted);
          doc.text(layout.noPolicy, innerX + labelWidth, top + 5.6);
        },
      });
    }
    policyEntries.forEach((policy, index) => {
      const name = translateEvidenceValue(policy.name, locale);
      const chipLabel = policy.assignment
        ? assignmentLabel(policy.assignment)
        : layout.assignmentUnknown;
      const chipTone: Tone =
        policy.assignment?.state === "assigned"
          ? "info"
          : policy.assignment?.state === "notAssigned"
            ? "none"
            : "partial";
      const available = innerWidth - labelWidth;
      const nameLines = wrap(name, available, 7.2, "bold");
      const lastWidth = textWidth(
        doc,
        nameLines[nameLines.length - 1] ?? "",
        7.2,
        "bold",
      );
      // A cut assignment (Conditional Access conditions) points to the
      // register row that holds the full value.
      const pointer = policy.ref ? layout.seeRegister(policy.ref) : "";
      const chipText =
        textWidth(doc, chipLabel, 6.2) <= available - 4 || !pointer
          ? clampLine(doc, chipLabel, available - 4, 6.2)
          : `${clampLine(
              doc,
              chipLabel,
              available - 4 - textWidth(doc, ` ${pointer}`, 6.2),
              6.2,
            )} ${pointer}`;
      const chipW = textWidth(doc, chipText, 6.2) + 3.6;
      const inline = lastWidth + 2 + chipW <= available;
      const height =
        nameLines.length * 3.3 +
        (inline ? 0 : 4.8) +
        2.6 +
        (index === 0 ? 2.4 : 0);
      blocks.push({
        height,
        draw: (top) => {
          let lineTop = top + 1.2;
          if (index === 0) {
            drawRule(doc, innerX, top + 1, right - cardPad);
            lineTop += 2.4;
          }
          drawEyebrow(
            doc,
            layout.policyLabel,
            innerX,
            lineTop + capHeight(7.2),
            {
              color: PALETTE.muted,
              size: 5.6,
              charSpace: 0.2,
            },
          );
          drawLines(
            nameLines,
            innerX + labelWidth,
            lineTop,
            7.2,
            "bold",
            textColor,
            3.3,
          );
          const chipX = inline
            ? innerX + labelWidth + lastWidth + 2
            : innerX + labelWidth;
          const chipTop = inline
            ? lineTop + (nameLines.length - 1) * 3.3 - 1.1
            : lineTop + nameLines.length * 3.3 + 0.2;
          const tone = TONES[chipTone];
          doc.setFillColor(...(chipTone === "info" ? primaryTint : tone.fill));
          doc.roundedRect(chipX, chipTop, chipW, 4.2, 2.1, 2.1, "F");
          setFont(
            doc,
            6.2,
            "normal",
            chipTone === "info" ? primaryColor : tone.text,
          );
          doc.text(chipText, chipX + 1.8, centredBaseline(chipTop, 4.2, 6.2));
        },
      });
    });

    // Evidence references, wrapped as chips.
    const refs = evidenceRefsFor(result);
    {
      const chipRows: string[][] = [[]];
      let rowWidth = 0;
      const available = innerWidth - labelWidth;
      for (const entry of refs) {
        const width = chipWidth(doc, entry.ref, 6.2) + 0.8;
        if (rowWidth + width > available && rowWidth > 0) {
          chipRows.push([]);
          rowWidth = 0;
        }
        chipRows[chipRows.length - 1]?.push(entry.ref);
        rowWidth += width;
      }
      chipRows.forEach((row, rowIndex) => {
        blocks.push({
          height: 5,
          draw: (top) => {
            if (rowIndex === 0)
              drawEyebrow(doc, layout.evidenceLabel, innerX, top + 3.4, {
                color: PALETTE.muted,
                size: 5.6,
                charSpace: 0.2,
              });
            if (refs.length === 0) {
              setFont(doc, 7, "normal", PALETTE.faint);
              doc.text(layout.noneRecorded, innerX + labelWidth, top + 3.4);
              return;
            }
            let chipX = innerX + labelWidth;
            for (const ref of row)
              chipX +=
                drawChip(doc, chipX, top + 0.6, ref, "evidence", {
                  color: primaryColor,
                }) + 0.8;
          },
        });
      });
    }

    if (refs.length > 0) {
      const notes = new Set(
        result.evidence
          .map((evidence) => evidence.note)
          .filter((note): note is string => Boolean(note)),
      );
      for (const note of notes) {
        const lines = wrap(
          translateEvidenceNote(note, locale),
          innerWidth,
          6.9,
          "italic",
        );
        for (const chunk of chunkLines(lines, maxBlockLines))
          blocks.push({
            height: chunk.length * 3 + 1.4,
            draw: (top) =>
              drawLines(
                chunk,
                innerX,
                top + 0.8,
                6.9,
                "italic",
                PALETTE.muted,
                3,
              ),
          });
      }

      for (const entry of refs.filter(
        (item) => item.evidence.verdict === "disabled",
      )) {
        const { evidence } = entry;
        const assigned = evidence.assignment.state === "assigned";
        const color = assigned
          ? ASSIGNED_COUNTER_EVIDENCE_COLOR
          : UNASSIGNED_COUNTER_EVIDENCE_COLOR;
        const assignment = assigned
          ? strings.assigned.toLowerCase()
          : evidence.assignment.state === "unknown"
            ? locale === "de"
              ? "Zuweisung unbekannt"
              : "assignment unknown"
            : strings.notAssigned.toLowerCase();
        const observed = labelledValue(evidence.observedValue);
        const refPrefix =
          locale === "de"
            ? assigned
              ? "Risiko"
              : "Abweichung"
            : assigned
              ? "Risk"
              : "Deviation";
        const sentence =
          locale === "de"
            ? `${refPrefix} ${entry.ref}: ${evidence.policyName} setzt ${evidence.settingId} auf ${observed.label} (${assignment}).`
            : `${refPrefix} ${entry.ref}: ${evidence.policyName} sets ${evidence.settingId} to ${observed.label} (${assignment}).`;
        const lines = [
          ...wrapTechnicalId(sentence, innerWidth - 5, 7.2, "bold"),
          ...wrap(
            `${strings.counterEvidenceStatuses[evidence.assignment.state]}.`,
            innerWidth - 5,
            7.2,
            "bold",
          ),
        ];
        chunkLines(lines, maxBlockLines).forEach((chunk, chunkIndex) =>
          blocks.push({
            height: chunk.length * 3.2 + 1.6,
            draw: (top) => {
              if (chunkIndex === 0)
                drawMarker(doc, innerX + 1.2, top + 1.9, "triangle", color);
              drawLines(
                chunk,
                innerX + 4.5,
                top + 0.8,
                7.2,
                "bold",
                color,
                3.2,
              );
            },
          }),
        );
        if (observed.raw) {
          const rawLines = wrapTechnicalId(observed.raw, innerWidth - 5, 6);
          blocks.push({
            height: rawLines.length * 2.6 + 1.2,
            draw: (top) =>
              drawLines(
                rawLines,
                innerX + 4.5,
                top,
                6,
                "normal",
                PALETTE.faint,
                2.6,
              ),
          });
        }
      }
    }

    return { blocks, tableHeader, firstRowIndex, lastRowIndex };
  };

  const drawGapCallout = (
    control: ControlAssessment,
    capabilities: readonly CapabilityResult[],
  ) => {
    const textX = margin + 13;
    const width = contentWidth - 13 - 5;
    const headingLines = wrap(
      layout.gapHeading(control.control.title),
      width,
      8.6,
      "bold",
    );
    const introLines = wrap(strings.gapIntro, width, 7.6);
    const signalLines = implementationSignals(capabilities).map((signal) =>
      wrapTechnicalId(signal, width - 4, 7.2),
    );
    const height =
      headingLines.length * 3.9 +
      1.2 +
      introLines.length * 3.5 +
      1.2 +
      signalLines.reduce((sum, lines) => sum + lines.length * 3.2 + 0.6, 0) +
      8;
    if (yPosition + height > contentBottom)
      addControlContinuationPage(control.control.id);
    drawCard(doc, margin, yPosition, contentWidth, height, {
      fill: [255, 250, 243],
      stroke: TONES.na.border,
    });
    doc.setFillColor(...TONES.partial.text);
    doc.circle(margin + 7, yPosition + 7, 2.8, "F");
    setFont(doc, 8.6, "bold", PALETTE.white);
    doc.text("!", margin + 7, yPosition + 7 + capHeight(8.6) / 2, {
      align: "center",
    });
    let lineTop = yPosition + 4.4;
    drawLines(
      headingLines,
      textX,
      lineTop,
      8.6,
      "bold",
      TONES.partial.text,
      3.9,
    );
    lineTop += headingLines.length * 3.9 + 1.2;
    drawLines(introLines, textX, lineTop, 7.6, "normal", textColor, 3.5);
    lineTop += introLines.length * 3.5 + 1.2;
    for (const lines of signalLines) {
      doc.setFillColor(...TONES.partial.text);
      doc.circle(textX + 1, lineTop + 1.2, 0.5, "F");
      drawLines(lines, textX + 4, lineTop, 7.2, "normal", textColor, 3.2);
      lineTop += lines.length * 3.2 + 0.6;
    }
    yPosition += height + 4;
  };

  // Dashed panel of aspects outside technical evidence. Built from blocks so
  // a very long list continues on the next page instead of overflowing.
  const drawUnassessedPanel = (control: ControlAssessment) => {
    const headingLines = wrap(
      layout.unassessedHeading,
      innerWidth - 6,
      8.2,
      "bold",
    );
    const blocks: FlowBlock[] = [
      {
        height: headingLines.length * 3.8 + 4.5,
        draw: (top) => {
          drawMarker(
            doc,
            innerX + 1.2,
            top + 4 + 1.6,
            "triangle",
            REPORT_STATUS_COLORS.notAssessed,
          );
          drawLines(
            headingLines,
            innerX + 4.5,
            top + 4,
            8.2,
            "bold",
            TONES.none.text,
            3.8,
          );
        },
      },
    ];
    control.unassessedAspects.forEach((aspect, index) => {
      const lines = wrap(
        locale === "de" ? translateAssessmentLimitation(aspect) : aspect,
        innerWidth - 2,
        7.4,
      );
      const isLast = index === control.unassessedAspects.length - 1;
      chunkLines(lines, maxBlockLines).forEach((chunk, chunkIndex, chunks) => {
        const lastChunk = chunkIndex === chunks.length - 1;
        const height = chunk.length * 3.3 + (lastChunk ? 3 : 0.6);
        blocks.push({
          height,
          draw: (top) => {
            drawLines(chunk, innerX, top + 1.2, 7.4, "normal", textColor, 3.3);
            if (lastChunk && !isLast)
              drawRule(doc, innerX, top + height - 0.4, right - cardPad);
          },
        });
      });
    });
    const leadHeight = (blocks[0]?.height ?? 0) + (blocks[1]?.height ?? 0) + 3;
    if (yPosition + leadHeight > contentBottom)
      addControlContinuationPage(control.control.id);
    flowCard(control.control.id, blocks, { dashed: true });
    yPosition += 4;
  };

  const drawManualAssessment = (controlId: string) => {
    const blockHeight = 34;
    if (yPosition + blockHeight > contentBottom) {
      addControlContinuationPage(controlId);
    }
    const blockTop = yPosition;
    drawCard(doc, margin, blockTop, contentWidth, blockHeight, {
      fill: PALETTE.panel,
      stroke: PALETTE.border,
    });
    setFont(doc, 8.4, "bold", primaryColor);
    doc.text(strings.manualHeading, innerX + 1, blockTop + 6);

    const statusY = blockTop + 13.5;
    setFont(doc, 7.2, "bold", textColor);
    doc.text(`${strings.manualStatus}:`, innerX + 1, statusY);
    let checkboxX = margin + 44;
    doc.setDrawColor(...PALETTE.muted);
    doc.setLineWidth(0.3);
    for (const status of strings.manualStatuses) {
      doc.setFillColor(...PALETTE.white);
      doc.roundedRect(checkboxX, statusY - 3.3, 3.8, 3.8, 0.6, 0.6, "FD");
      setFont(doc, 7.2, "normal", textColor);
      doc.text(status, checkboxX + 5.4, statusY);
      checkboxX += 10 + doc.getTextWidth(status);
    }

    doc.setDrawColor(...PALETTE.muted);
    doc.setLineWidth(0.25);
    const ownerY = blockTop + 21.5;
    setFont(doc, 7.2, "bold", textColor);
    doc.text(`${strings.manualResponsible}:`, innerX + 1, ownerY);
    doc.line(margin + 30, ownerY + 0.7, margin + 100, ownerY + 0.7);
    doc.text(`${strings.manualDueDate}:`, margin + 106, ownerY);
    doc.line(margin + 128, ownerY + 0.7, right - cardPad, ownerY + 0.7);

    const commentY = blockTop + 28.5;
    doc.text(`${strings.manualComment}:`, innerX + 1, commentY);
    doc.line(margin + 30, commentY + 0.7, right - cardPad, commentY + 0.7);
    yPosition += blockHeight + 4;
  };

  if (detailControls.length > 0) {
    // Details continue on the current page when there is room for a
    // control header with its first card; the header check below keeps
    // them together.
    if (contentBottom - yPosition < 80) addContentPage();
    else if (yPosition > contentTop) yPosition += 6;
    drawEyebrow(
      doc,
      `${isExcerpt ? "03" : "04"} ${layout.detailEyebrow}`,
      margin,
      yPosition + 2.4,
      { color: secondaryColor },
    );
    yPosition += 6;
  }

  const recordedStrategies = new Set<string>();
  for (const control of detailControls) {
    const controlChecks = control.capabilityIds.flatMap(
      (id) => capabilitiesById.get(id)?.checks ?? [],
    );
    const comparisonSummary =
      control.status === "notApplicable"
        ? strings.controlStatuses.notApplicable
        : locale === "de"
          ? controlChecks.length
            ? `${controlChecks.filter((check) => check.result === "matches").length} Sollwert; ${controlChecks.filter((check) => check.result === "missing").length} fehlt; ${controlChecks.filter((check) => check.result === "different").length} abweichend; ${controlChecks.filter((check) => check.assessmentStatus === "unableToCheck").length} nicht prüfbar`
            : "Nicht prüfbar"
          : checkSummary(controlChecks);
    const mappedCapabilities = mappedCapabilitiesFor(control);
    const requirementText =
      options.frameworkId === "essential-eight"
        ? control.control.summary
        : undefined;

    // Header card layout.
    const idText = control.control.id;
    let idSize = fitFontSize(idText, 30, 15, 7);
    const tileWidth = Math.min(
      Math.max(textWidth(doc, idText, idSize, "bold") + 7, 20),
      36,
    );
    const idLines =
      textWidth(doc, idText, idSize, "bold") > tileWidth - 4
        ? wrap(idText, tileWidth - 4, (idSize = 7), "bold", 3)
        : [idText];
    const sideWidth = 40;
    const sideX = right - 5 - sideWidth;
    const midX = margin + 5 + tileWidth + 5;
    const midWidth = sideX - 5 - midX;
    const titleLines = wrap(control.control.title, midWidth, 15, "bold");
    const summaryLines = wrap(comparisonSummary, midWidth, 8);
    const requirementLines = requirementText
      ? wrap(requirementText, midWidth, 8.2)
      : [];
    const midHeight =
      4.8 +
      2.8 +
      titleLines.length * 6.2 +
      0.6 +
      summaryLines.length * 3.6 +
      (requirementLines.length ? 1.8 + requirementLines.length * 3.7 : 0);
    const headerHeight = Math.max(16, midHeight, 20) + 10;
    // Build the capability cards first so the header can stay with the
    // head, table header and first row of its first card.
    const capabilityCards = mappedCapabilities.map((result) => {
      const built = capabilityBlocks(result);
      const leadCount = built.firstRowIndex >= 0 ? built.firstRowIndex + 1 : 2;
      return {
        result,
        ...built,
        leadHeight: Math.min(
          built.blocks
            .slice(0, leadCount)
            .reduce((sum, block) => sum + block.height, 0),
          150,
        ),
      };
    });
    const firstLead = capabilityCards[0]
      ? capabilityCards[0].leadHeight + 4 + 3
      : 30;
    if (yPosition + headerHeight + firstLead > contentBottom) addContentPage();

    // Essential Eight has up to 149 requirements. Index the eight strategies
    // at their first requirement so the contents stay readable on one page.
    const isEssentialEight = options.frameworkId === "essential-eight";
    if (!isEssentialEight || !recordedStrategies.has(control.control.title)) {
      tocEntries.push({
        title: isEssentialEight
          ? control.control.title
          : `${control.control.id} ${control.control.title}`,
        page: currentPage(),
        level: 1,
        family: controlFamily(options.frameworkId, control),
      });
      recordedStrategies.add(control.control.title);
    }
    controlPages.set(control.control.id, currentPage());

    const headerTop = yPosition;
    drawCard(doc, margin, headerTop, contentWidth, headerHeight, {
      stroke: PALETTE.border,
    });
    const tileHeight = Math.max(16, idLines.length * 3.6 + 6);
    const tileTop = headerTop + (headerHeight - tileHeight) / 2;
    doc.setFillColor(...primaryColor);
    doc.roundedRect(margin + 5, tileTop, tileWidth, tileHeight, 2, 2, "F");
    setFont(doc, idSize, "bold", PALETTE.white);
    idLines.forEach((line, index) =>
      doc.text(
        line,
        margin + 5 + tileWidth / 2,
        tileTop +
          tileHeight / 2 -
          ((idLines.length - 1) * 3.6) / 2 +
          capHeight(idSize) / 2 +
          index * 3.6,
        { align: "center" },
      ),
    );

    let midY = headerTop + (headerHeight - midHeight) / 2;
    const pillWidth = controlStatusPill(
      midX,
      midY,
      control.status,
      false,
      midWidth,
    );
    if (control.control.tier) {
      const tierText = clampLine(
        doc,
        control.control.tier,
        midWidth - pillWidth - 6,
        6.6,
        "bold",
      );
      drawChip(doc, midX + pillWidth + 1.6, midY + 0.2, tierText, "muted", {
        size: 6.4,
        height: 4.4,
      });
    }
    midY += 4.8 + 2.8;
    drawLines(titleLines, midX, midY, 15, "bold", primaryColor, 6.2);
    midY += titleLines.length * 6.2 + 0.6;
    drawLines(summaryLines, midX, midY, 8, "normal", PALETTE.muted, 3.6);
    midY += summaryLines.length * 3.6;
    if (requirementLines.length) {
      midY += 1.8;
      drawLines(requirementLines, midX, midY, 8.2, "normal", textColor, 3.7);
    }

    doc.setDrawColor(...PALETTE.rule);
    doc.setLineWidth(0.2);
    doc.line(sideX - 5, headerTop + 5, sideX - 5, headerTop + headerHeight - 5);
    const sideTop = headerTop + headerHeight / 2 - 8;
    const enforced = control.enforcedCapabilityIds.length;
    const capabilityTotal = control.capabilityIds.length;
    const meter = layout.ofCount(enforced, capabilityTotal);
    setFont(doc, 11, "bold", primaryColor);
    doc.text(meter, sideX, sideTop + 4);
    setFont(doc, 7, "normal", PALETTE.muted);
    doc.text(
      clampLine(
        doc,
        layout.capabilitiesWord,
        sideWidth - textWidth(doc, meter, 11, "bold") - 1.5,
        7,
      ),
      sideX + textWidth(doc, meter, 11, "bold") + 1.5,
      sideTop + 4,
    );
    drawStackedBar(
      doc,
      sideX,
      sideTop + 6.4,
      sideWidth,
      1.6,
      [{ value: enforced, color: REPORT_STATUS_COLORS[control.status] }],
      Math.max(capabilityTotal, 1),
    );
    setFont(doc, 7, "normal", PALETTE.muted);
    doc.text(
      layout.evidenceCount(controlRefs(control).length),
      sideX,
      sideTop + 13.6,
    );
    yPosition = headerTop + headerHeight + 4;

    for (const {
      blocks,
      tableHeader,
      firstRowIndex,
      lastRowIndex,
      leadHeight,
    } of capabilityCards) {
      // Keep the card head with its table header and first row.
      if (yPosition + leadHeight + 3 > contentBottom)
        addControlContinuationPage(control.control.id);
      flowCard(control.control.id, blocks, {
        repeatOnBreak: (index) =>
          tableHeader && index >= firstRowIndex && index < lastRowIndex
            ? tableHeader
            : undefined,
      });
      yPosition += 4;
    }

    if (
      control.status === "noEvidence" &&
      !controlChecks.some((check) => check.policyId)
    ) {
      drawGapCallout(control, mappedCapabilities);
    }

    if (control.unassessedAspects.length > 0) drawUnassessedPanel(control);

    if (options.frameworkId === "bsi-it-grundschutz" && control.control.tier) {
      drawManualAssessment(control.control.id);
    }

    yPosition += 6;
  }

  // ------------------------------------------------------ Evidence register
  if (!howToReadDrawn && yPosition > contentTop) {
    yPosition += 4;
    drawHowToRead(false);
  }
  // Share a page with the end of the details only when more than half of
  // it is still free, so a short tail never sits alone on a page.
  if (yPosition > contentTop + (contentBottom - contentTop) / 2)
    addContentPage();
  else if (yPosition > contentTop) yPosition += 6;
  drawPageTitle(layout.appendixEyebrow, strings.appendixHeading, {
    lead: layout.appendixLead,
  });
  {
    const order = [0, 1, 2, 3, 4, 5] as const;
    // The type column grows to fit its longest word (German compounds such
    // as "Gerätekonformitätsrichtlinie"), taking the space from the policy
    // column, so a word never breaks mid-word.
    const typeFont = 6.9;
    const longestTypeWord = Math.max(
      0,
      ...evidenceRegistry.flatMap(({ evidence }) =>
        translateEvidenceValue(evidence.policyType, locale)
          .split(/\s+/)
          .map((word) => textWidth(doc, word, typeFont)),
      ),
    );
    const typeWidth = Math.min(Math.max(21, longestTypeWord + 3.4), 38);
    const widths = [14, 46 - (typeWidth - 21), typeWidth, 41, 33, 25] as const;
    const columnX = widths.map(
      (_, index) =>
        margin + widths.slice(0, index).reduce((sum, width) => sum + width, 0),
    );
    const lineHeight = 3;
    const headerHeight = 5.6;

    const buildRow = (entry: EvidenceRegistryEntry) => {
      const { evidence } = entry;
      const targetLabels = assignmentDetails(evidence.assignment).map(
        (target) => translateEvidenceValue(target, locale),
      );
      const assignment =
        targetLabels.length > 0 ? targetLabels.join(", ") : strings.notAssigned;
      const longAssignment = assignment.length > 110;
      const capabilityResult = capabilitiesById.get(evidence.capabilityId);
      const registerName = settingDisplayName(
        evidence.settingId,
        capabilityResult,
      );
      const observedLabel = displayValue(evidence.observedValue);
      // Technical ids stay visible, small and muted, under readable labels.
      const settingIdLines = registerName
        ? wrapTechnicalId(evidence.settingId, widths[3] - 3, 5.4)
        : [];
      const rawValueLines =
        observedLabel !== evidence.observedValue
          ? wrapTechnicalId(evidence.observedValue, widths[4] - 3, 5.4)
          : [];
      const cells = [
        [entry.ref],
        wrap(evidence.policyName, widths[1] - 3, 6.9),
        wrap(
          translateEvidenceValue(evidence.policyType, locale),
          widths[2] - 3,
          typeFont,
        ),
        registerName
          ? wrap(registerName, widths[3] - 3, 6.9)
          : wrapTechnicalId(evidence.settingId, widths[3] - 3, 6.9),
        wrapTechnicalId(observedLabel, widths[4] - 3, 6.9, "bold"),
        longAssignment
          ? [layout.seeBelow]
          : wrapTechnicalId(assignment, widths[5] - 3, 6.9),
      ];
      // Long targets (Conditional Access conditions) span the full row
      // width below the cells instead of a tall narrow column.
      const detailLines = longAssignment
        ? wrapTechnicalId(
            `${strings.appendixHeaders[5]}: ${assignment}`,
            contentWidth - widths[0] - 3,
            6,
          )
        : [];
      const policyIdLines = wrapTechnicalId(
        `${evidence.policyId || "-"}; ${evidence.kind}; version ${evidence.policyVersion ?? "unknown"}; modified ${evidence.policyModifiedAt ?? "unknown"}`,
        widths[1] - 3,
        5.4,
      );
      const mainLineCount = Math.max(...cells.map((cell) => cell.length));
      const subLines: Record<number, string[]> = {
        1: policyIdLines,
        3: settingIdLines,
        4: rawValueLines,
      };
      const policyHeight = Math.max(
        ...Object.entries(subLines).map(
          ([index, lines]) =>
            (cells[Number(index)]?.length ?? 0) * lineHeight +
            lines.length * 2.3 +
            3.4,
        ),
      );
      const mainHeight = Math.max(
        7.6,
        mainLineCount * lineHeight + 4,
        policyHeight,
      );
      return {
        entry,
        cells,
        policyIdLines,
        subLines,
        detailLines,
        mainHeight,
        height:
          mainHeight + (detailLines.length ? detailLines.length * 2.6 + 1 : 0),
      };
    };
    const detailLineHeight = 2.6;

    const maxRowLines = Math.floor(
      (contentBottom - contentTop - 6 - headerHeight - 5) / lineHeight,
    );
    const maxDetailLines = Math.floor(
      (contentBottom - contentTop - 6 - headerHeight - 8) / detailLineHeight,
    );
    const rows = evidenceRegistry.flatMap((entry) => {
      const built = buildRow(entry);
      if (built.height <= maxRowLines * lineHeight + 4) return [built];
      // Full-width target text that does not fit continues in its own rows.
      const detailChunks: (typeof built)[] = [];
      if (built.detailLines.length) {
        for (
          let offset = 0;
          offset < built.detailLines.length;
          offset += maxDetailLines
        ) {
          const lines = built.detailLines.slice(
            offset,
            offset + maxDetailLines,
          );
          detailChunks.push({
            ...built,
            cells: [[entry.ref], [], [], [], [], []],
            policyIdLines: [],
            subLines: {} as Record<number, string[]>,
            detailLines: lines,
            mainHeight: 1.5,
            height: lines.length * detailLineHeight + 4,
          });
        }
      }
      const row = {
        ...built,
        detailLines: [] as string[],
        height: built.mainHeight,
      };
      if (row.height <= maxRowLines * lineHeight + 4)
        return [row, ...detailChunks];
      // Large Conditional Access conditions (and long policy values) must flow
      // across pages rather than extend beyond the printable area.
      const cells = row.cells.map((lines, index) => [
        ...lines,
        ...(row.subLines[index] ?? []),
      ]);
      const lineCount = Math.max(...cells.map((lines) => lines.length));
      const chunks = [];
      for (let offset = 0; offset < lineCount; offset += maxRowLines) {
        const chunkCells = cells.map((lines, index) =>
          index === 0 ? [entry.ref] : lines.slice(offset, offset + maxRowLines),
        );
        const height =
          Math.max(...chunkCells.map((lines) => lines.length)) * lineHeight + 4;
        chunks.push({
          ...row,
          cells: chunkCells,
          policyIdLines: [],
          subLines: {} as Record<number, string[]>,
          mainHeight: height,
          height,
        });
      }
      return [...chunks, ...detailChunks];
    });
    const drawAppendixContinuationCaption = () => {
      setFont(doc, 7.2, "italic", PALETTE.muted);
      doc.text(strings.appendixContinuation, margin, yPosition + 2.6);
      yPosition += 6;
    };
    const drawHeader = () => {
      order.forEach((headerIndex, index) => {
        drawEyebrow(
          doc,
          strings.appendixHeaders[headerIndex],
          (columnX[index] ?? margin) + 1.5,
          yPosition + 3.2,
          { color: PALETTE.muted, size: 5.6, charSpace: 0.2 },
        );
      });
      drawRule(doc, margin, yPosition + 5.2, right, primaryColor, 0.4);
      yPosition += headerHeight;
    };

    const firstRow = rows[0];
    if (
      firstRow &&
      yPosition + headerHeight + firstRow.height > contentBottom
    ) {
      addContentPage();
      drawAppendixContinuationCaption();
    }
    drawHeader();

    rows.forEach((row, rowIndex) => {
      if (yPosition + row.height > contentBottom) {
        addContentPage();
        drawAppendixContinuationCaption();
        drawHeader();
      }
      const { evidence } = row.entry;
      const assignedCounter =
        evidence.verdict === "disabled" &&
        evidence.assignment.state === "assigned";
      const unassignedCounter =
        evidence.verdict === "disabled" &&
        evidence.assignment.state === "notAssigned";
      if (assignedCounter) doc.setFillColor(255, 239, 239);
      else if (unassignedCounter) doc.setFillColor(255, 247, 230);
      else if (rowIndex % 2 === 1) doc.setFillColor(...PALETTE.zebra);
      else doc.setFillColor(...PALETTE.white);
      doc.rect(margin, yPosition, contentWidth, row.height, "F");
      drawRule(doc, margin, yPosition + row.height, right);

      row.cells.forEach((lines, index) => {
        const x = (columnX[index] ?? margin) + 1.5;
        const color = assignedCounter
          ? ASSIGNED_COUNTER_EVIDENCE_COLOR
          : unassignedCounter
            ? UNASSIGNED_COUNTER_EVIDENCE_COLOR
            : index === 0
              ? primaryColor
              : index === 2
                ? PALETTE.muted
                : textColor;
        drawLines(
          lines,
          x,
          yPosition + 2.2,
          6.9,
          index === 0 || index === 4 ? "bold" : "normal",
          color,
          lineHeight,
        );
        const sub = row.subLines[index] ?? [];
        if (sub.length) {
          drawLines(
            sub,
            x,
            yPosition + 2.2 + lines.length * lineHeight + 0.4,
            5.4,
            "normal",
            PALETTE.faint,
            2.3,
          );
        }
      });
      if (row.detailLines.length)
        drawLines(
          row.detailLines,
          (columnX[1] ?? margin) + 1.5,
          yPosition + row.mainHeight - 1.4,
          6,
          "normal",
          assignedCounter
            ? ASSIGNED_COUNTER_EVIDENCE_COLOR
            : unassignedCounter
              ? UNASSIGNED_COUNTER_EVIDENCE_COLOR
              : textColor,
          detailLineHeight,
        );
      yPosition += row.height;
    });
    yPosition += 4;
  }
  drawWrappedText(strings.appendixNote, {
    fontSize: 7.6,
    style: "italic",
    color: PALETTE.muted,
    after: 6,
  });

  // ------------------------------------------------------ Methodology
  if (!methodologyDrawn) drawMethodology(layout.methodologyEyebrow, true);
  if (methodologyEntry) tocEntries.push(methodologyEntry);
  if (!howToReadDrawn) drawHowToRead(true);

  // ------------------------------------------------------ Contents
  let tocPageOffset = 0;
  if (!isExcerpt) {
    const tocContinuationEntryY = contentTop + 14;
    const drawTocHeading = (y: number) => {
      setFont(doc, 20, "bold", primaryColor);
      doc.text(strings.tocHeading, margin, y + capHeight(20) + 1);
      drawRule(doc, margin, y + capHeight(20) + 4.5, right, primaryColor, 0.4);
    };
    const tocRows = tocEntries.map((entry, index) => {
      const size = entry.level === 1 ? 7.3 : 8.4;
      const style: FontStyle = entry.level === 1 ? "normal" : "bold";
      const lines = wrap(
        entry.title,
        contentWidth - (entry.level === 1 ? 20 : 14),
        size,
        style,
      );
      const gapBefore = entry.level === 0 && index > 0 ? 2 : 0;
      return {
        entry,
        lines,
        size,
        style,
        gapBefore,
        height:
          gapBefore + lines.length * 3.6 + (entry.level === 0 ? 3.4 : 1.4),
        pageOffset: 0,
        y: 0,
      };
    });
    let tocY = tocStartY + 14;
    for (const row of tocRows) {
      if (tocY + row.height > contentBottom && tocY > tocContinuationEntryY) {
        tocPageOffset += 1;
        tocY = tocContinuationEntryY;
      }
      row.pageOffset = tocPageOffset;
      row.y = tocY;
      tocY += row.height;
    }

    // Every recorded page moves back by the number of inserted contents pages.
    for (const entry of tocEntries) entry.page += tocPageOffset;
    for (let offset = 1; offset <= tocPageOffset; offset += 1) {
      doc.insertPage(tocPage + offset);
    }

    for (let offset = 0; offset <= tocPageOffset; offset += 1) {
      // Leave the first page without a heading if no entry fits beneath it.
      if (offset === 0 && (tocRows[0]?.pageOffset ?? 0) > 0) continue;
      doc.setPage(tocPage + offset);
      drawTocHeading(offset === 0 ? tocStartY : contentTop);
    }
    for (const row of tocRows) {
      const { entry, lines, size, style, pageOffset, gapBefore } = row;
      doc.setPage(tocPage + pageOffset);
      const top = row.y + gapBefore;
      const entryX = margin + (entry.level === 1 ? 6 : 0);
      drawLines(lines, entryX, top + 0.6, size, style, textColor, 3.6);
      setFont(
        doc,
        size,
        "bold",
        entry.level === 1 ? PALETTE.muted : primaryColor,
      );
      doc.text(String(entry.page), right, top + 0.6 + capHeight(size), {
        align: "right",
      });
      if (entry.level === 0)
        drawRule(doc, margin, top + lines.length * 3.6 + 1.6, right);
      doc.link(margin, top - 0.6, contentWidth, row.height - gapBefore, {
        pageNumber: entry.page,
      });
    }
  }

  // Page numbers that point at control detail pages.
  for (const reference of pageRefs) {
    const target = controlPages.get(reference.controlId);
    if (target === undefined) continue;
    doc.setPage(reference.page + tocPageOffset);
    const page = target + tocPageOffset;
    if (reference.kind === "overview") {
      setFont(doc, 7.6, "bold", primaryColor);
      doc.text(String(page), reference.x, reference.y, { align: "right" });
    } else {
      setFont(doc, 6.4, "bold", secondaryColor);
      doc.text(layout.seePage(page), reference.x, reference.y, {
        align: "right",
      });
    }
  }

  addPdfOutline(doc, buildComplianceReportOutline(tocEntries));

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 2; page <= pageCount; page += 1) {
    doc.setPage(page);
    setFont(doc, 6.5, "bold", primaryColor);
    doc.text(shortName, margin, 12.4, { charSpace: 0.15 });
    if (tenantName) {
      setFont(doc, 6.5, "normal", PALETTE.muted);
      doc.text(clampLine(doc, tenantName, 90, 6.5), right, 12.4, {
        align: "right",
      });
    }
    drawRule(doc, margin, 14.6, right);
    drawRule(doc, margin, pageHeight - 14.5, right);
    setFont(doc, 6.5, "normal", PALETTE.muted);
    doc.text(strings.footer, margin, pageHeight - 10.6);
    doc.text(strings.pageNumber(page, pageCount), right, pageHeight - 10.6, {
      align: "right",
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

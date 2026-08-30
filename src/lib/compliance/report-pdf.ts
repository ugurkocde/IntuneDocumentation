import jsPDF from "jspdf";
import type { BrandingOptions } from "~/types/branding";
import type { DetailedExportData } from "../configuration-analyzer";
import {
  assessCompliance,
  compareControlIds,
  COMPLIANCE_RULESET_VERSION,
} from "./engine";
import type {
  CapabilityEvidence,
  CapabilityResult,
  CapabilityStatus,
  ControlAssessment,
  ControlStatus,
  FrameworkAssessment,
} from "./types";

export type ComplianceFrameworkId =
  | "nist-800-53-r5"
  | "nist-csf-2"
  | "bsi-it-grundschutz"
  | "iso-27001-2022"
  | "soc2-tsc";

type Locale = "en" | "de";
type RgbColor = [number, number, number];

interface ReportStrings {
  title: string;
  coverSubtitle: (frameworkName: string, version: string) => string;
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
  counterEvidenceStatuses: Record<"assigned" | "notAssigned", string>;
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

interface ImagePropertiesProvider {
  getImageProperties: (dataUrl: string) => {
    width: number;
    height: number;
  };
}

const STRINGS: Record<Locale, ReportStrings> = {
  en: {
    title: "Technical Evidence Report: Intune Configuration",
    coverSubtitle: (frameworkName, version) =>
      `Evidence matrix for selected assessment points from ${frameworkName} ${version}`,
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
    unassignedCompliant: "Compliant configurations without assignment",
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
    platformScope: "Platforms in scope",
    controlStatuses: {
      evidenceFound: "Technical configuration evidence detected",
      partialEvidence: "Technical configuration evidence partially detected",
      noEvidence: "No supported technical configuration evidence detected",
    },
    capabilityStatuses: {
      enforced: "Compliant configuration detected and assigned",
      configuredNotAssigned:
        "Compliant configuration detected, but not assigned",
      disabledByPolicy: "Deviating configuration detected",
      noEvidence: "No evidence",
    },
    counterEvidenceStatuses: {
      assigned: "Deviating configuration detected and assigned (risk)",
      notAssigned: "Deviating configuration detected, but not assigned",
    },
    notAssigned: "Not assigned",
    assigned: "Assigned",
    evidenceRefs: "Evidence",
    gapIntro:
      "No technical evidence was found. Possible implementation through these Intune settings:",
    disclaimer:
      "This report documents technical evidence from the tenant's Microsoft Intune configuration. It is not a compliance certification or an IT Grundschutz check and does not replace an audit. Missing evidence means that no supported and effectively assigned configuration was detected in the evaluated dataset.",
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
      "Evidence is determined exclusively from concrete Intune settings: An assessment point is considered technically evidenced only when a recognized setting is configured with a value defined as compliant and the policy is assigned. Configurations that explicitly contradict the target state are reported separately. Unsupported settings or settings that cannot be mapped unambiguously remain unassessed. Organizational requirements are not part of this automated technical assessment and must be assessed separately.",
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
    },
  },
  de: {
    title: "Technischer Nachweisbericht: Intune-Konfiguration",
    coverSubtitle: (frameworkName, version) =>
      `Nachweismatrix für ausgewählte Prüfpunkte aus ${frameworkName} ${version}`,
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
    unassignedCompliant: "Konforme Konfigurationen ohne Zuweisung",
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
    platformScope: "Plattformen im Geltungsbereich",
    controlStatuses: {
      evidenceFound: "Technischer Konfigurationsnachweis erkannt",
      partialEvidence: "Technischer Konfigurationsnachweis teilweise erkannt",
      noEvidence:
        "Kein unterstützter technischer Konfigurationsnachweis erkannt",
    },
    capabilityStatuses: {
      enforced: "Konforme Konfiguration erkannt und zugewiesen",
      configuredNotAssigned:
        "Konforme Konfiguration erkannt, jedoch nicht zugewiesen",
      disabledByPolicy: "Abweichende Konfiguration erkannt",
      noEvidence: "Kein Nachweis",
    },
    counterEvidenceStatuses: {
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
      "Nachweise werden ausschließlich anhand konkreter Intune-Einstellungen ermittelt: Ein Prüfpunkt gilt nur dann als technisch nachgewiesen, wenn eine erkannte Einstellung mit einem als konform definierten Wert konfiguriert und die Richtlinie zugewiesen ist. Konfigurationen, die der Sollvorgabe ausdrücklich widersprechen, werden gesondert ausgewiesen. Nicht unterstützte oder nicht eindeutig zuordenbare Einstellungen bleiben unbewertet. Organisatorische Anforderungen sind nicht Teil dieser automatisierten technischen Prüfung und müssen separat bewertet werden.",
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
    },
  },
};

export const GERMAN_CAPABILITY_NAMES: Readonly<Record<string, string>> = {
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

const CONTROL_STATUS_COLORS: Record<ControlStatus, RgbColor> = {
  evidenceFound: [31, 133, 83],
  partialEvidence: [196, 113, 31],
  noEvidence: [105, 112, 119],
};

const CAPABILITY_STATUS_COLORS: Record<CapabilityStatus, RgbColor> = {
  enforced: [31, 133, 83],
  configuredNotAssigned: [196, 113, 31],
  disabledByPolicy: [190, 45, 45],
  noEvidence: [105, 112, 119],
};

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
  return GERMAN_EVIDENCE_VALUE_TRANSLATIONS[value] ?? value;
}

function translateEvidenceNote(value: string, locale: Locale): string {
  if (locale !== "de") return value;
  return GERMAN_COMPLIANCE_NOTE_TRANSLATIONS[value] ?? value;
}

function formatReportDate(date: Date, locale: Locale): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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

function localIsoDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
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
};

function frameworkReportCode(frameworkId: ComplianceFrameworkId): string {
  return FRAMEWORK_REPORT_CODES[frameworkId];
}

function randomReportSuffix(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let suffix = "";
  for (let index = 0; index < 4; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)] ?? "0";
  }
  return suffix;
}

function defaultReportId(
  frameworkId: ComplianceFrameworkId,
  generatedAt: Date,
): string {
  return `IDOC-${frameworkReportCode(frameworkId)}-${localIsoDate(generatedAt).replaceAll("-", "")}-${randomReportSuffix()}`;
}

function formatReportTimestamp(date: Date, locale: Locale): string {
  if (locale === "en") return date.toISOString();
  return `${formatReportDate(date, locale)}, ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")} Uhr`;
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
}

interface EvidenceRegistryEntry {
  ref: string;
  evidence: CapabilityEvidence;
}

interface TocEntry {
  title: string;
  page: number;
  level: 0 | 1;
}

interface OverviewRow {
  label: string;
  evidenceFound: number;
  partialEvidence: number;
  noEvidence: number;
}

function evidenceRegistryKey(evidence: CapabilityEvidence): string {
  return JSON.stringify([
    evidence.policyId,
    evidence.settingId,
    evidence.observedValue,
    evidence.verdict,
  ]);
}

function controlStatusCounts(
  controls: readonly ControlAssessment[],
): Omit<OverviewRow, "label"> {
  return {
    evidenceFound: controls.filter((item) => item.status === "evidenceFound")
      .length,
    partialEvidence: controls.filter(
      (item) => item.status === "partialEvidence",
    ).length,
    noEvidence: controls.filter((item) => item.status === "noEvidence").length,
  };
}

function buildOverviewRows(
  frameworkId: ComplianceFrameworkId,
  controls: readonly ControlAssessment[],
): OverviewRow[] {
  if (frameworkId === "bsi-it-grundschutz") {
    return [
      "Basis-Anforderung",
      "Standard-Anforderung",
      "Anforderung bei erhöhtem Schutzbedarf",
      undefined,
    ].map((tier) => {
      const grouped = controls.filter((item) => item.control.tier === tier);
      return {
        label: tier ?? "Bausteine",
        ...controlStatusCounts(grouped),
      };
    });
  }

  const controlsByPrefix = new Map<string, ControlAssessment[]>();
  for (const control of controls) {
    const prefix =
      frameworkId === "nist-800-53-r5"
        ? control.control.id.split("-")[0]
        : control.control.id.split(".")[0];
    if (!prefix) continue;
    const existing = controlsByPrefix.get(prefix);
    if (existing) existing.push(control);
    else controlsByPrefix.set(prefix, [control]);
  }

  return [...controlsByPrefix.entries()]
    .sort(([left], [right]) => compareControlIds(left, right))
    .map(([label, grouped]) => ({ label, ...controlStatusCounts(grouped) }));
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
      } else {
        const odataType = signal.odataTypes[0];
        if (odataType) signals.add(`${odataType}.${signal.propertyPath}`);
      }
    }
  }

  return [...signals].slice(0, 4);
}

export function complianceReportFileName(
  frameworkId: ComplianceFrameworkId,
  tenantLabel?: string,
): string {
  const now = new Date();
  const frameworkLabel = STRINGS.en.fileFrameworkLabels[frameworkId];
  const slug = tenantLabel ? tenantSlug(tenantLabel) : "";
  const tenantPart = slug ? `-${slug}` : "";
  return `Compliance-Report-${frameworkLabel}${tenantPart}-${localIsoDate(now)}-${localTime(now)}.pdf`;
}

export async function generateComplianceReportPDF(
  data: DetailedExportData,
  options: ComplianceReportOptions,
): Promise<Uint8Array> {
  const locale: Locale =
    options.frameworkId === "bsi-it-grundschutz" ? "de" : "en";
  const strings = STRINGS[locale];
  const branding = options.branding ?? data.branding;
  const primaryColor = hexToRgb(branding?.colors?.primary, [0, 51, 102]);
  const secondaryColor = hexToRgb(branding?.colors?.secondary, [0, 102, 204]);
  const accentColor = hexToRgb(branding?.colors?.accent, [0, 166, 82]);
  const textColor = hexToRgb(branding?.colors?.text, [30, 30, 30]);

  const assessment = assessCompliance(data);
  const framework = assessment.frameworks.find(
    (item) => item.framework.id === options.frameworkId,
  );
  if (!framework) {
    throw new Error(`Unknown compliance framework: ${options.frameworkId}`);
  }

  const capabilitiesById = new Map(
    assessment.capabilities.map((result) => [result.capability.id, result]),
  );
  const generatedAt = new Date(assessment.generatedAt);
  const controls = [...framework.controls].sort((left, right) =>
    compareControlIds(left.control.id, right.control.id),
  );
  const metadata = options.metadata ?? {};
  const reportId =
    metadata.reportId ?? defaultReportId(options.frameworkId, generatedAt);
  const revision = metadata.revision ?? "1.0";
  const classification =
    metadata.classification ?? (locale === "de" ? "Intern" : "Internal");

  const evidenceRegistry: EvidenceRegistryEntry[] = [];
  const evidenceRegistryByKey = new Map<string, EvidenceRegistryEntry>();
  for (const control of controls) {
    for (const capabilityId of control.capabilityIds) {
      const capability = capabilitiesById.get(capabilityId);
      if (!capability) continue;
      // Sort by registry key so E-nnn references stay stable when Graph
      // returns policies in a different order on a later export.
      const sortedEvidence = [...capability.evidence].sort((a, b) =>
        evidenceRegistryKey(a).localeCompare(evidenceRegistryKey(b)),
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

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const contentBottom = pageHeight - 22;
  let yPosition = 18;
  const tocEntries: TocEntry[] = [];

  const wrap = (
    text: string,
    width = contentWidth,
    fontSize = 9,
    style: "normal" | "bold" | "italic" = "normal",
  ): string[] => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(text, width) as string[];
  };

  const wrapTechnicalId = (text: string, width: number): string[] =>
    wrap(text.replace(/([_.])/g, "$1\u200b"), width, 7).map((line) =>
      line.replaceAll("\u200b", ""),
    );

  const addContentPage = () => {
    doc.addPage();
    yPosition = 18;
  };

  const ensureSpace = (height: number): boolean => {
    if (yPosition + height <= contentBottom) return false;
    addContentPage();
    return true;
  };

  const drawWrappedText = (
    text: string,
    options: {
      x?: number;
      width?: number;
      fontSize?: number;
      style?: "normal" | "bold" | "italic";
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
    const lines = wrap(text, width, fontSize, style);

    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.setFont("helvetica", style);
      doc.setFontSize(fontSize);
      doc.setTextColor(...color);
      doc.text(line, x, yPosition);
      yPosition += lineHeight;
    }
    yPosition += options.after ?? 0;
  };

  const drawSectionHeading = (text: string) => {
    ensureSpace(16);
    yPosition += 2;
    drawWrappedText(text, {
      fontSize: 16,
      style: "bold",
      color: primaryColor,
      lineHeight: 7,
      after: 1,
    });
    doc.setDrawColor(...accentColor);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 6;
  };

  const drawRecordedSectionHeading = (text: string) => {
    ensureSpace(16);
    tocEntries.push({
      title: text,
      page: doc.internal.getCurrentPageInfo().pageNumber,
      level: 0,
    });
    drawSectionHeading(text);
  };

  const drawControlContinuationCaption = (controlId: string) => {
    const caption = strings.continuationCaption(controlId);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(95, 95, 95);
    doc.text(caption, margin, yPosition);
    yPosition += 5;
  };

  const addControlContinuationPage = (controlId: string) => {
    addContentPage();
    drawControlContinuationCaption(controlId);
  };

  type MarkerKind = "filled" | "half" | "outline" | "triangle";

  const drawMarker = (
    x: number,
    textBaseline: number,
    kind: MarkerKind,
    color: RgbColor,
  ) => {
    const radius = 1.1;
    const centerY = textBaseline - 1.05;
    doc.setLineWidth(0.35);
    doc.setDrawColor(...color);
    doc.setFillColor(...color);
    if (kind === "filled") {
      doc.circle(x, centerY, radius, "F");
    } else if (kind === "half") {
      doc.circle(x, centerY, radius, "F");
      doc.setFillColor(255, 255, 255);
      doc.rect(x, centerY - radius - 0.1, radius + 0.2, radius * 2 + 0.2, "F");
      doc.setDrawColor(...color);
      doc.circle(x, centerY, radius, "S");
    } else if (kind === "outline") {
      doc.circle(x, centerY, radius, "S");
    } else {
      doc.triangle(
        x - radius,
        centerY + radius,
        x + radius,
        centerY + radius,
        x,
        centerY - radius,
        "F",
      );
    }
  };

  const drawMarkedText = (
    text: string,
    marker: MarkerKind,
    color: RgbColor,
    options: {
      fontSize?: number;
      lineHeight?: number;
      after?: number;
      style?: "normal" | "bold" | "italic";
      controlId?: string;
    } = {},
  ) => {
    const fontSize = options.fontSize ?? 8;
    const lineHeight = options.lineHeight ?? fontSize * 0.42;
    const lines = wrap(
      text,
      contentWidth - 5,
      fontSize,
      options.style ?? "bold",
    );
    const height = lines.length * lineHeight + (options.after ?? 0);
    if (yPosition + height > contentBottom && options.controlId) {
      addControlContinuationPage(options.controlId);
    }
    doc.setFont("helvetica", options.style ?? "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    lines.forEach((line, index) => {
      if (index === 0) {
        drawMarker(margin + 1.2, yPosition, marker, color);
      }
      doc.text(line, margin + 5, yPosition);
      yPosition += lineHeight;
    });
    yPosition += options.after ?? 0;
  };

  const markerForControlStatus = (status: ControlStatus): MarkerKind =>
    status === "evidenceFound"
      ? "filled"
      : status === "partialEvidence"
        ? "half"
        : "outline";

  const markerForCapabilityStatus = (status: CapabilityStatus): MarkerKind =>
    status === "enforced"
      ? "filled"
      : status === "configuredNotAssigned"
        ? "half"
        : status === "disabledByPolicy"
          ? "triangle"
          : "outline";

  const drawGridTable = (
    headers: readonly string[],
    rows: readonly (readonly string[])[],
    widths: readonly number[],
  ) => {
    const headerHeight = 8;
    const rowLayouts = rows.map((row) => {
      const cells = row.map((cell, index) =>
        wrap(cell, (widths[index] ?? 0) - 3, 7.5),
      );
      return {
        cells,
        height: Math.max(
          8,
          Math.max(...cells.map((lines) => lines.length)) * 3.2 + 3,
        ),
      };
    });
    const totalHeight =
      headerHeight + rowLayouts.reduce((sum, row) => sum + row.height, 0) + 5;
    ensureSpace(totalHeight);

    doc.setFillColor(...primaryColor);
    doc.rect(margin, yPosition, contentWidth, headerHeight, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(255, 255, 255);
    let headerX = margin;
    headers.forEach((header, index) => {
      const width = widths[index] ?? 0;
      doc.text(
        header,
        index === 0 ? headerX + 1.5 : headerX + width - 1.5,
        yPosition + 5,
        {
          align: index === 0 ? "left" : "right",
        },
      );
      headerX += width;
    });
    yPosition += headerHeight;

    rowLayouts.forEach((row, rowIndex) => {
      doc.setFillColor(
        rowIndex % 2 === 0 ? 248 : 255,
        rowIndex % 2 === 0 ? 249 : 255,
        rowIndex % 2 === 0 ? 250 : 255,
      );
      doc.rect(margin, yPosition, contentWidth, row.height, "F");
      doc.setDrawColor(215, 218, 221);
      doc.setLineWidth(0.15);
      doc.rect(margin, yPosition, contentWidth, row.height);
      let cellX = margin;
      row.cells.forEach((lines, index) => {
        if (index > 0)
          doc.line(cellX, yPosition, cellX, yPosition + row.height);
        const width = widths[index] ?? 0;
        doc.setFont("helvetica", index === 0 ? "bold" : "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...textColor);
        lines.forEach((line, lineIndex) => {
          doc.text(
            line,
            index === 0 ? cellX + 1.5 : cellX + width - 1.5,
            yPosition + 4.2 + lineIndex * 3.2,
            { align: index === 0 ? "left" : "right" },
          );
        });
        cellX += width;
      });
      yPosition += row.height;
    });
    yPosition += 5;
  };

  const gapBlockLayout = (capabilities: readonly CapabilityResult[]) => {
    const innerWidth = contentWidth - 8;
    const introLines = wrap(strings.gapIntro, innerWidth, 8);
    const signalLines = implementationSignals(capabilities).map((signal) =>
      wrapTechnicalId(`- ${signal}`, innerWidth),
    );
    const totalLineCount =
      introLines.length +
      signalLines.reduce((total, lines) => total + lines.length, 0);
    const blockHeight = totalLineCount * 3.4 + 7;

    return { introLines, signalLines, blockHeight };
  };

  const drawGapBlock = (capabilities: readonly CapabilityResult[]) => {
    const { introLines, signalLines, blockHeight } =
      gapBlockLayout(capabilities);

    doc.setFillColor(246, 247, 248);
    doc.setDrawColor(150, 155, 160);
    doc.setLineWidth(0.3);
    doc.roundedRect(
      margin,
      yPosition,
      contentWidth,
      blockHeight,
      1.5,
      1.5,
      "FD",
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...textColor);

    let blockY = yPosition + 4.5;
    for (const line of introLines) {
      doc.text(line, margin + 4, blockY);
      blockY += 3.4;
    }
    blockY += 1;
    for (const lines of signalLines) {
      for (const line of lines) {
        doc.text(line, margin + 4, blockY);
        blockY += 3.4;
      }
    }
    yPosition += blockHeight + 5;
  };

  const drawCounterEvidenceLine = (
    entry: EvidenceRegistryEntry,
    controlId: string,
  ) => {
    const { evidence } = entry;
    const assigned = evidence.assignment.state === "assigned";
    const color = assigned
      ? ASSIGNED_COUNTER_EVIDENCE_COLOR
      : UNASSIGNED_COUNTER_EVIDENCE_COLOR;
    const assignment = assigned
      ? strings.assigned.toLowerCase()
      : strings.notAssigned.toLowerCase();
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
        ? `${refPrefix} ${entry.ref}: ${evidence.policyName} setzt ${evidence.settingId} auf ${evidence.observedValue} (${assignment}). ${strings.counterEvidenceStatuses[evidence.assignment.state]}.`
        : `${refPrefix} ${entry.ref}: ${evidence.policyName} sets ${evidence.settingId} to ${evidence.observedValue} (${assignment}). ${strings.counterEvidenceStatuses[evidence.assignment.state]}.`;
    drawMarkedText(sentence, "triangle", color, {
      fontSize: 7.3,
      lineHeight: 3.2,
      after: 1.2,
      style: "bold",
      controlId,
    });
  };

  const drawManualAssessment = (controlId: string) => {
    const blockHeight = 36;
    if (yPosition + blockHeight > contentBottom) {
      addControlContinuationPage(controlId);
    }

    const blockTop = yPosition;
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(125, 130, 135);
    doc.setLineWidth(0.35);
    doc.roundedRect(
      margin,
      blockTop,
      contentWidth,
      blockHeight,
      1.5,
      1.5,
      "FD",
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...textColor);
    doc.text(strings.manualHeading, margin + 4, blockTop + 5.5);

    const statusY = blockTop + 13;
    doc.setFontSize(7.2);
    doc.text(`${strings.manualStatus}:`, margin + 4, statusY);
    let checkboxX = margin + 42;
    for (const status of strings.manualStatuses) {
      doc.rect(checkboxX, statusY - 3.5, 4, 4);
      doc.setFont("helvetica", "normal");
      doc.text(status, checkboxX + 5.5, statusY);
      checkboxX += 10 + doc.getTextWidth(status);
    }

    const ownerY = blockTop + 21.5;
    doc.setFont("helvetica", "bold");
    doc.text(`${strings.manualResponsible}:`, margin + 4, ownerY);
    const ownerLineStart = margin + 29;
    const ownerLineEnd = margin + 100;
    doc.line(ownerLineStart, ownerY + 0.7, ownerLineEnd, ownerY + 0.7);
    doc.text(`${strings.manualDueDate}:`, margin + 106, ownerY);
    doc.line(margin + 128, ownerY + 0.7, pageWidth - margin - 4, ownerY + 0.7);

    const commentY = blockTop + 28.5;
    doc.text(`${strings.manualComment}:`, margin + 4, commentY);
    doc.line(
      margin + 27,
      commentY + 0.7,
      pageWidth - margin - 4,
      commentY + 0.7,
    );
    doc.line(margin + 27, commentY + 5, pageWidth - margin - 4, commentY + 5);
    yPosition += blockHeight + 5;
  };

  const drawAppendixTable = () => {
    const widths = [14, 49, 27, 48, 20, 22] as const;
    const headerHeight = 8;
    const lineHeight = 3;

    const buildRow = (entry: EvidenceRegistryEntry) => {
      const { evidence } = entry;
      const maxTargets = 6;
      const targetLabels = evidence.assignment.targets.map((target) =>
        translateEvidenceValue(target, locale),
      );
      const shownTargets =
        targetLabels.length > maxTargets
          ? [
              ...targetLabels.slice(0, maxTargets),
              locale === "de"
                ? `+${targetLabels.length - maxTargets} weitere`
                : `+${targetLabels.length - maxTargets} more`,
            ]
          : targetLabels;
      const assignment =
        evidence.assignment.state === "assigned" && shownTargets.length > 0
          ? shownTargets.join(", ")
          : strings.notAssigned;
      const cells = [
        [entry.ref],
        wrap(evidence.policyName, widths[1] - 3, 7),
        wrap(
          translateEvidenceValue(evidence.policyType, locale),
          widths[2] - 3,
          7,
        ),
        wrapTechnicalId(evidence.settingId, widths[3] - 3),
        wrap(evidence.observedValue, widths[4] - 3, 7),
        wrap(assignment, widths[5] - 3, 7),
      ];
      const policyIdLines = wrapTechnicalId(
        evidence.policyId || "-",
        widths[1] - 3,
      );
      const mainLineCount = Math.max(...cells.map((cell) => cell.length));
      const policyHeight =
        cells[1]!.length * lineHeight + policyIdLines.length * 2.6 + 3.5;
      return {
        entry,
        cells,
        policyIdLines,
        height: Math.max(8, mainLineCount * lineHeight + 3, policyHeight),
      };
    };

    const rows = evidenceRegistry.map(buildRow);
    const drawAppendixContinuationCaption = () => {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(95, 95, 95);
      doc.text(strings.appendixContinuation, margin, yPosition);
      yPosition += 5;
    };
    const drawHeader = () => {
      doc.setFillColor(...primaryColor);
      doc.rect(margin, yPosition, contentWidth, headerHeight, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      let x = margin;
      strings.appendixHeaders.forEach((header, index) => {
        doc.text(header, x + 1.5, yPosition + 5);
        x += widths[index] ?? 0;
      });
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
      else if (rowIndex % 2 === 0) doc.setFillColor(248, 249, 250);
      else doc.setFillColor(255, 255, 255);
      doc.rect(margin, yPosition, contentWidth, row.height, "F");
      doc.setDrawColor(215, 218, 221);
      doc.setLineWidth(0.15);
      doc.rect(margin, yPosition, contentWidth, row.height);

      let x = margin;
      row.cells.forEach((lines, index) => {
        if (index > 0) doc.line(x, yPosition, x, yPosition + row.height);
        const color = assignedCounter
          ? ASSIGNED_COUNTER_EVIDENCE_COLOR
          : unassignedCounter
            ? UNASSIGNED_COUNTER_EVIDENCE_COLOR
            : textColor;
        doc.setFont("helvetica", index === 0 ? "bold" : "normal");
        doc.setFontSize(7);
        doc.setTextColor(...color);
        lines.forEach((line, lineIndex) => {
          doc.text(line, x + 1.5, yPosition + 3.8 + lineIndex * lineHeight);
        });
        if (index === 1) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6);
          doc.setTextColor(110, 110, 110);
          const idStart = yPosition + 3.8 + lines.length * lineHeight + 0.3;
          row.policyIdLines.forEach((line, lineIndex) => {
            doc.text(line, x + 1.5, idStart + lineIndex * 2.6);
          });
        }
        x += widths[index] ?? 0;
      });
      yPosition += row.height;
    });
    yPosition += 5;
  };

  const addCoverLogo = (): number | undefined => {
    const dataUrl = branding?.logo?.dataUrl;
    if (!dataUrl) return undefined;

    try {
      const properties = (
        doc as unknown as ImagePropertiesProvider
      ).getImageProperties(dataUrl);
      const width = Math.min(branding?.logo?.width ?? 42, 70);
      const height =
        branding?.logo?.height ??
        width * (properties.height / properties.width);
      const boundedHeight = Math.min(height, 35);
      const format = /image\/(jpe?g)/i.test(dataUrl) ? "JPEG" : "PNG";
      doc.addImage(
        dataUrl,
        format,
        (pageWidth - width) / 2,
        30,
        width,
        boundedHeight,
      );
      return boundedHeight;
    } catch {
      return undefined;
    }
  };

  const logoHeight = addCoverLogo();
  const coverTitleY = logoHeight ? 30 + logoHeight + 28 : 78;
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(1.2);
  doc.line(margin, 24, pageWidth - margin, 24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...primaryColor);
  const coverTitleLines = wrap(strings.title, contentWidth, 24, "bold");
  coverTitleLines.forEach((line, index) => {
    doc.text(line, pageWidth / 2, coverTitleY + index * 10, {
      align: "center",
    });
  });
  const frameworkY = coverTitleY + coverTitleLines.length * 10 + 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...secondaryColor);
  const frameworkDisplay =
    options.frameworkId === "bsi-it-grundschutz"
      ? "BSI IT-Grundschutz-Kompendium, Edition 2023"
      : options.frameworkId === "iso-27001-2022"
        ? "ISO/IEC 27001:2022, Annex A"
      : `${framework.framework.name} ${framework.framework.version}`;
  doc.text(frameworkDisplay, pageWidth / 2, frameworkY, { align: "center" });

  const subtitleLines = wrap(
    strings.coverSubtitle(frameworkDisplay, ""),
    contentWidth - 20,
    9.5,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(90, 90, 90);
  subtitleLines.forEach((line, index) => {
    doc.text(line, pageWidth / 2, frameworkY + 9 + index * 4.5, {
      align: "center",
    });
  });
  let coverMetaY = frameworkY + 9 + subtitleLines.length * 4.5 + 8;

  if (branding?.companyName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(...textColor);
    doc.text(branding.companyName, pageWidth / 2, coverMetaY, {
      align: "center",
    });
    coverMetaY += 12;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `${strings.generatedOn}: ${formatReportDate(generatedAt, locale)}`,
    pageWidth / 2,
    coverMetaY,
    { align: "center" },
  );

  coverMetaY += 8;
  const controlLabels = strings.documentControlLabels;
  const controlRows: Array<readonly [string, string | undefined]> = [
    [controlLabels[0], metadata.tenantLabel],
    [controlLabels[1], metadata.preparedFor],
    [controlLabels[2], metadata.preparedBy],
    [controlLabels[3], metadata.contact],
    [controlLabels[4], reportId],
    [controlLabels[5], revision],
    [controlLabels[6], COMPLIANCE_RULESET_VERSION],
    [controlLabels[7], classification],
  ];
  const visibleControlRows = controlRows.filter(
    (row): row is readonly [string, string] => Boolean(row[1]),
  );
  const controlTableWidth = 150;
  const controlLabelWidth = 48;
  const controlTableX = (pageWidth - controlTableWidth) / 2;
  for (const [label, value] of visibleControlRows) {
    const valueLines = wrap(
      value,
      controlTableWidth - controlLabelWidth - 5,
      7.5,
    );
    const rowHeight = Math.max(7, valueLines.length * 3.2 + 3);
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(210, 214, 218);
    doc.setLineWidth(0.2);
    doc.rect(controlTableX, coverMetaY, controlTableWidth, rowHeight, "FD");
    doc.line(
      controlTableX + controlLabelWidth,
      coverMetaY,
      controlTableX + controlLabelWidth,
      coverMetaY + rowHeight,
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(75, 75, 75);
    doc.text(label, controlTableX + 2, coverMetaY + 4.4);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...textColor);
    valueLines.forEach((line, index) => {
      doc.text(
        line,
        controlTableX + controlLabelWidth + 2,
        coverMetaY + 4.4 + index * 3.2,
      );
    });
    coverMetaY += rowHeight;
  }

  addContentPage();

  const disclaimerLines = (
    strings.disclaimer.match(/[^.]+[.]?/g) ?? [strings.disclaimer]
  ).flatMap((sentence) =>
    wrap(sentence.trim(), contentWidth - 12, 9.5, "bold"),
  );
  const disclaimerHeight = disclaimerLines.length * 4.5 + 11;
  doc.setFillColor(255, 248, 230);
  doc.setDrawColor(214, 150, 35);
  doc.setLineWidth(0.6);
  doc.roundedRect(
    margin,
    yPosition,
    contentWidth,
    disclaimerHeight,
    2,
    2,
    "FD",
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(95, 65, 15);
  disclaimerLines.forEach((line, index) => {
    doc.text(line, margin + 6, yPosition + 6.5 + index * 4.5);
  });
  yPosition += disclaimerHeight + 8;

  const tocPage = doc.internal.getCurrentPageInfo().pageNumber;
  const tocStartY = yPosition;
  addContentPage();

  drawRecordedSectionHeading(strings.summaryHeading);
  drawWrappedText(strings.summaryCounts(framework), {
    fontSize: 10,
    style: "bold",
    after: strings.summaryScope ? 2 : 5,
  });
  if (strings.summaryScope) {
    drawWrappedText(strings.summaryScope, {
      fontSize: 8.5,
      color: [80, 80, 80],
      after: 5,
    });
  }

  for (const status of [
    "evidenceFound",
    "partialEvidence",
    "noEvidence",
  ] as const) {
    drawMarkedText(
      strings.controlStatuses[status],
      markerForControlStatus(status),
      CONTROL_STATUS_COLORS[status],
      {
        fontSize: 8.5,
        style: "bold",
        lineHeight: 3.8,
        after: 0.5,
      },
    );
  }
  yPosition += 4;

  const frameworkNote =
    locale === "de" && framework.framework.id === "bsi-it-grundschutz"
      ? GERMAN_BSI_FRAMEWORK_NOTE
      : framework.framework.note;
  if (frameworkNote) {
    drawWrappedText(`${strings.notePrefix}${frameworkNote}`, {
      fontSize: 8.5,
      style: "italic",
      color: [80, 80, 80],
      after: 5,
    });
  }

  drawRecordedSectionHeading(strings.resultsHeading);
  const overviewRows = buildOverviewRows(options.frameworkId, controls);
  drawGridTable(
    strings.resultsHeaders,
    overviewRows.map((row) => [
      row.label,
      String(row.evidenceFound),
      String(row.partialEvidence),
      String(row.noEvidence),
    ]),
    [96, 28, 28, 28],
  );

  const assignedDeviations = assessment.capabilities.filter((result) =>
    result.evidence.some(
      (item) =>
        item.verdict === "disabled" && item.assignment.state === "assigned",
    ),
  );
  const unassignedCompliant = assessment.capabilities.filter(
    (result) => result.status === "configuredNotAssigned",
  );
  drawWrappedText(
    assignedDeviations.length > 0
      ? `${strings.assignedDeviations}: ${assignedDeviations.length}. ${strings.assignedDeviationsExplanation}`
      : `${strings.assignedDeviations}: 0`,
    {
      fontSize: 8.2,
      style: "bold",
      color:
        assignedDeviations.length > 0
          ? ASSIGNED_COUNTER_EVIDENCE_COLOR
          : textColor,
      lineHeight: 3.7,
      after: 1.2,
    },
  );
  drawWrappedText(
    unassignedCompliant.length > 0
      ? `${strings.unassignedCompliant}: ${unassignedCompliant.length}. ${strings.unassignedCompliantExplanation}`
      : `${strings.unassignedCompliant}: 0`,
    {
      fontSize: 8.2,
      style: "bold",
      color:
        unassignedCompliant.length > 0
          ? UNASSIGNED_COUNTER_EVIDENCE_COLOR
          : textColor,
      lineHeight: 3.7,
      after: 4,
    },
  );

  drawWrappedText(strings.findingsHeading, {
    fontSize: 10,
    style: "bold",
    color: primaryColor,
    lineHeight: 4.5,
    after: 1,
  });
  const controlIdsByCapability = new Map<string, string[]>();
  for (const control of controls) {
    for (const capabilityId of control.capabilityIds) {
      const ids = controlIdsByCapability.get(capabilityId);
      if (ids) ids.push(control.control.id);
      else controlIdsByCapability.set(capabilityId, [control.control.id]);
    }
  }
  const capabilityName = (result: CapabilityResult) =>
    locale === "de"
      ? (GERMAN_CAPABILITY_NAMES[result.capability.id] ??
        result.capability.name)
      : result.capability.name;
  const findings: string[] = [];
  for (const result of assignedDeviations) {
    const ids = controlIdsByCapability.get(result.capability.id) ?? [];
    if (ids.length === 0) continue;
    findings.push(
      locale === "de"
        ? `${capabilityName(result)}: Zugewiesene abweichende Konfiguration für ${ids.join(", ")}.`
        : `${capabilityName(result)}: Assigned deviating configuration affects ${ids.join(", ")}.`,
    );
  }
  if (options.frameworkId === "bsi-it-grundschutz") {
    for (const control of controls.filter(
      (item) =>
        item.control.tier === "Basis-Anforderung" &&
        item.status === "noEvidence",
    )) {
      const names = control.capabilityIds
        .map((id) => capabilitiesById.get(id))
        .filter((result): result is CapabilityResult => Boolean(result))
        .map(capabilityName);
      findings.push(
        `${names.join(", ") || control.control.title}: Kein technischer Nachweis für ${control.control.id}.`,
      );
    }
  }
  for (const result of unassignedCompliant) {
    const ids = controlIdsByCapability.get(result.capability.id) ?? [];
    if (ids.length === 0) continue;
    findings.push(
      locale === "de"
        ? `${capabilityName(result)}: Konforme Konfiguration ohne Zuweisung für ${ids.join(", ")}.`
        : `${capabilityName(result)}: Compliant configuration without assignment affects ${ids.join(", ")}.`,
    );
  }
  const prioritizedFindings = findings.slice(0, 5);
  if (prioritizedFindings.length === 0) {
    drawWrappedText(strings.noFindings, { fontSize: 8.5, after: 4 });
  } else {
    for (const finding of prioritizedFindings) {
      const lines = wrap(finding, contentWidth - 6, 8.3);
      ensureSpace(lines.length * 3.7 + 1);
      doc.setFillColor(...primaryColor);
      doc.circle(margin + 1.2, yPosition - 1, 0.7, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.3);
      doc.setTextColor(...textColor);
      lines.forEach((line, index) => {
        doc.text(line, margin + 5, yPosition + index * 3.7);
      });
      yPosition += lines.length * 3.7 + 1;
    }
    yPosition += 3;
  }

  drawRecordedSectionHeading(strings.provenanceHeading);
  drawWrappedText(
    `${strings.generatedOn}: ${formatReportTimestamp(generatedAt, locale)}`,
    { fontSize: 8.8, style: "bold", after: 1.5 },
  );
  drawWrappedText(strings.dataBasis, {
    fontSize: 8.5,
    lineHeight: 3.8,
    after: 2,
  });
  drawWrappedText(
    `${strings.rulesetLabel}: ${COMPLIANCE_RULESET_VERSION}, ${frameworkDisplay}`,
    { fontSize: 8.5, style: "bold", after: 4 },
  );

  drawWrappedText(strings.inventoryHeading, {
    fontSize: 10,
    style: "bold",
    color: primaryColor,
    lineHeight: 4.5,
    after: 1,
  });
  const inventoryKeys = [
    "settingsCatalog",
    "deviceConfigurations",
    "compliancePolicies",
  ] as const;
  const countAssigned = (items: Array<Record<string, unknown>>): number =>
    items.filter(
      (item) => Array.isArray(item.assignments) && item.assignments.length > 0,
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
  // The engine assesses every collected policy family; list the remainder so
  // the provenance section never understates the assessed inventory.
  const allItems = allPolicyItems(data);
  const familyTotal = familyCounts.reduce((sum, items) => sum + items.length, 0);
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
  drawGridTable(strings.inventoryHeaders, inventoryRows, [108, 30, 42]);

  drawWrappedText(strings.collectionHeading, {
    fontSize: 10,
    style: "bold",
    color: primaryColor,
    lineHeight: 4.5,
    after: 1,
  });
  const fetchErrors = data.fetchErrors ?? [];
  if (fetchErrors.length > 0) {
    const warningLines = [
      ...wrap(strings.incompleteCollection, contentWidth - 10, 8.2, "bold"),
      ...fetchErrors.slice(0, 12).flatMap((error) => {
        const details = `${translateEvidenceValue(error.policyType, locale)}: ${truncate(error.error, 120)}${error.permissionHint ? ` (${error.permissionHint})` : ""}`;
        return wrap(details, contentWidth - 10, 7.3);
      }),
      ...(fetchErrors.length > 12
        ? [
            locale === "de"
              ? `+${fetchErrors.length - 12} weitere Erhebungshinweise`
              : `+${fetchErrors.length - 12} more collection notes`,
          ]
        : []),
    ];
    const warningHeight = warningLines.length * 3.5 + 8;
    ensureSpace(warningHeight + 4);
    doc.setFillColor(255, 248, 230);
    doc.setDrawColor(214, 150, 35);
    doc.setLineWidth(0.5);
    doc.roundedRect(
      margin,
      yPosition,
      contentWidth,
      warningHeight,
      1.5,
      1.5,
      "FD",
    );
    warningLines.forEach((line, index) => {
      doc.setFont("helvetica", index === 0 ? "bold" : "normal");
      doc.setFontSize(index === 0 ? 8.2 : 7.3);
      doc.setTextColor(105, 70, 15);
      doc.text(line, margin + 5, yPosition + 5.5 + index * 3.5);
    });
    yPosition += warningHeight + 5;
  } else {
    drawWrappedText(strings.noCollectionErrors, {
      fontSize: 8.5,
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
    { fontSize: 8.5, style: "bold", after: 5 },
  );

  if (options.frameworkId === "bsi-it-grundschutz") {
    drawWrappedText(strings.manualNote, {
      fontSize: 8.2,
      style: "italic",
      color: [80, 80, 80],
      lineHeight: 3.7,
      after: 5,
    });
  }

  for (const control of controls) {
    const tier = control.control.tier ? ` (${control.control.tier})` : "";
    const controlHeading = `${control.control.id} ${control.control.title}${tier}`;
    const controlHeadingHeight =
      wrap(controlHeading, contentWidth, 12, "bold").length * 5.2 + 1.5;
    const controlStatusHeight =
      wrap(strings.controlStatuses[control.status], contentWidth, 9, "bold")
        .length *
        4 +
      3;
    const mappedCapabilities = control.capabilityIds
      .map((capabilityId) => capabilitiesById.get(capabilityId))
      .filter((result): result is CapabilityResult => Boolean(result));
    const capabilityCaveat = (result: CapabilityResult) =>
      result.evidence.length > 0
        ? result.capability.caveat?.[locale]
        : undefined;
    const capabilityTextHeight = (result: CapabilityResult) => {
      const caveat = capabilityCaveat(result);
      return (
        wrap(capabilityName(result), contentWidth, 9.5, "bold").length * 4.2 +
        0.5 +
        (caveat
          ? wrap(caveat, contentWidth, 7.5, "italic").length * 3.2 + 1
          : 0) +
        wrap(
          strings.capabilityStatuses[result.status],
          contentWidth - 5,
          8,
          "bold",
        ).length *
          3.5 +
        6
      );
    };
    const firstCapability = mappedCapabilities[0];
    const minimumControlStartHeight =
      controlHeadingHeight +
      controlStatusHeight +
      (firstCapability
        ? wrap(capabilityName(firstCapability), contentWidth, 9.5, "bold")
            .length * 4.2
        : 0);

    if (control.status === "noEvidence") {
      const gapHeight = gapBlockLayout(mappedCapabilities).blockHeight + 5;
      const capabilityHeight = mappedCapabilities.reduce(
        (total, result) => total + capabilityTextHeight(result),
        0,
      );
      const fullControlHeight =
        controlHeadingHeight +
        controlStatusHeight +
        capabilityHeight +
        gapHeight;
      if (yPosition + fullControlHeight > contentBottom && yPosition > 18) {
        addContentPage();
      }
    } else {
      ensureSpace(minimumControlStartHeight);
    }

    tocEntries.push({
      title: `${control.control.id} ${control.control.title}`,
      page: doc.internal.getCurrentPageInfo().pageNumber,
      level: 1,
    });

    drawWrappedText(controlHeading, {
      fontSize: 12,
      style: "bold",
      color: primaryColor,
      lineHeight: 5.2,
      after: 1.5,
    });
    drawMarkedText(
      strings.controlStatuses[control.status],
      markerForControlStatus(control.status),
      CONTROL_STATUS_COLORS[control.status],
      {
        fontSize: 9,
        style: "bold",
        lineHeight: 4,
        after: 3,
        controlId: control.control.id,
      },
    );

    for (const result of mappedCapabilities) {
      const resultTextHeight = capabilityTextHeight(result);
      if (yPosition + resultTextHeight > contentBottom) {
        addControlContinuationPage(control.control.id);
      }
      drawWrappedText(capabilityName(result), {
        fontSize: 9.5,
        style: "bold",
        color: secondaryColor,
        lineHeight: 4.2,
        after: 0.5,
      });
      const caveat = capabilityCaveat(result);
      if (caveat) {
        drawWrappedText(caveat, {
          fontSize: 7.5,
          style: "italic",
          color: [95, 95, 95],
          lineHeight: 3.2,
          after: 1,
        });
      }
      drawMarkedText(
        strings.capabilityStatuses[result.status],
        markerForCapabilityStatus(result.status),
        CAPABILITY_STATUS_COLORS[result.status],
        {
          fontSize: 8,
          style: "bold",
          lineHeight: 3.5,
          after: 2,
          controlId: control.control.id,
        },
      );

      const refs = evidenceRefsFor(result);
      if (refs.length > 0) {
        const refText = `${strings.evidenceRefs}: ${refs.map((entry) => entry.ref).join(", ")}`;
        const refHeight =
          wrap(refText, contentWidth, 7.8, "bold").length * 3.4 + 1.5;
        if (yPosition + refHeight > contentBottom) {
          addControlContinuationPage(control.control.id);
        }
        drawWrappedText(refText, {
          fontSize: 7.8,
          style: "bold",
          color: [70, 70, 70],
          lineHeight: 3.4,
          after: 1.5,
        });

        const notes = new Set(
          result.evidence
            .map((evidence) => evidence.note)
            .filter((note): note is string => Boolean(note)),
        );
        for (const note of notes) {
          drawWrappedText(translateEvidenceNote(note, locale), {
            fontSize: 7.2,
            style: "italic",
            color: [90, 90, 90],
            lineHeight: 3.1,
            after: 1,
          });
        }

        for (const entry of refs.filter(
          (item) => item.evidence.verdict === "disabled",
        )) {
          drawCounterEvidenceLine(entry, control.control.id);
        }
      }
    }

    if (options.frameworkId === "bsi-it-grundschutz" && control.control.tier) {
      drawManualAssessment(control.control.id);
    }

    if (control.status === "noEvidence") {
      const gapHeight = gapBlockLayout(mappedCapabilities).blockHeight + 5;
      if (yPosition + gapHeight > contentBottom) {
        addControlContinuationPage(control.control.id);
      }
      drawGapBlock(mappedCapabilities);
    }

    if (yPosition + 7 <= contentBottom) {
      doc.setDrawColor(225, 227, 229);
      doc.setLineWidth(0.2);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 7;
    }
  }

  ensureSpace(55);
  drawRecordedSectionHeading(strings.appendixHeading);
  drawAppendixTable();
  drawWrappedText(strings.appendixNote, {
    fontSize: 8,
    style: "italic",
    color: [85, 85, 85],
    after: 5,
  });

  drawRecordedSectionHeading(strings.methodologyHeading);
  drawWrappedText(strings.methodology, {
    fontSize: 9,
    lineHeight: 4.1,
  });

  doc.setPage(tocPage);
  let tocY = tocStartY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...primaryColor);
  doc.text(strings.tocHeading, margin, tocY);
  tocY += 4;
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.5);
  doc.line(margin, tocY, pageWidth - margin, tocY);
  tocY += 6;
  for (const entry of tocEntries) {
    const entryX = margin + (entry.level === 1 ? 4 : 0);
    const entryWidth = contentWidth - (entry.level === 1 ? 12 : 8);
    const lines = wrap(
      entry.title,
      entryWidth,
      entry.level === 1 ? 7.1 : 7.7,
      entry.level === 1 ? "normal" : "bold",
    );
    doc.setFont("helvetica", entry.level === 1 ? "normal" : "bold");
    doc.setFontSize(entry.level === 1 ? 7.1 : 7.7);
    doc.setTextColor(...textColor);
    lines.forEach((line, index) => {
      doc.text(line, entryX, tocY + index * 3.5);
    });
    doc.text(String(entry.page), pageWidth - margin, tocY, { align: "right" });
    tocY += Math.max(4.3, lines.length * 3.5 + 0.8);
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(105, 105, 105);
    doc.text(strings.footer, margin, pageHeight - 10);
    if (page > 1) {
      doc.text(
        strings.pageNumber(page, pageCount),
        pageWidth - margin,
        pageHeight - 10,
        { align: "right" },
      );
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

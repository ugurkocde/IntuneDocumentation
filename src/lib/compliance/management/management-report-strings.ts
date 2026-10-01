import type { ControlStatus } from "../types";
import type { ManagementLocale, NextActionTier, PortalAreaId } from "./types";

// Plain-language text for the management one-pager. Readers are board and
// management members, so wording avoids verdicts and technical jargon. Text is
// limited to the WinAnsi character set because the PDF uses the standard
// Helvetica font.

export interface ManagementReportStrings {
  title: (frameworkName: string) => string;
  documentTitle: string;
  tenant: string;
  date: string;
  frameworkVersion: string;
  coverageHeadline: (pct: string) => string;
  coverageNotAvailable: string;
  notAvailable: string;
  coverageSentence: (withEvidence: number, assessable: number) => string;
  coverageNotAvailableReason: string;
  percent: (value: number) => string;
  details: string;
  tileCoverage: string;
  tileCoverageDetail: (withEvidence: number, assessable: number) => string;
  tileWithoutEvidence: string;
  tileWithoutEvidenceDetail: (
    assessable: number,
    conflicting: number,
  ) => string;
  tileUnassigned: string;
  tileUnassignedDetail: string;
  tileChange: string;
  deltaPoints: (points: number) => string;
  deltaNotAvailable: string;
  deltaDetail: (newlyEvidenced: number, regressions: number) => string;
  noBaseline: string;
  noBaselineHint: string;
  outsideScopeLine: (count: number) => string;
  dataGapsNote: (count: number) => string;
  nextActionsHeading: string;
  noNextActions: string;
  actionSentence: Record<NextActionTier, (name: string) => string>;
  areaLabel: string;
  controlsLabel: string;
  moreItems: (count: number) => string;
  openInIntune: string;
  openInEntra: string;
  disclaimerHeading: string;
  /** Translation of COMPLIANCE_DISCLAIMER; null uses the English text passed in. */
  disclaimer: string | null;
  backToSummary: string;
  continued: (heading: string) => string;
  controlsHeading: string;
  controlsIntro: string;
  crosswalkNote: string;
  controlHeaders: readonly [string, string, string];
  cisLabel: string;
  withoutEvidenceHeading: string;
  withoutEvidenceIntro: string;
  withoutEvidenceEmpty: string;
  unassignedHeading: string;
  unassignedIntro: string;
  unassignedEmpty: string;
  unassignedHeaders: readonly [string, string];
  changeHeading: string;
  changeIntro: (baselineDate: string) => string;
  changeCoverage: string;
  changeNewlyEvidenced: string;
  changeRegressions: string;
  changeAdded: string;
  changeRemoved: string;
  changeNone: string;
  rulesetChanged: string;
  noBaselineHeading: string;
  noBaselineSteps: readonly string[];
  outsideScopeHeading: string;
  outsideScopeIntro: string;
  outsideScopeHeaders: readonly [string, string];
  controlStatuses: Record<ControlStatus, string>;
  portalAreas: Record<PortalAreaId, string>;
  footer: string;
  pageNumber: (page: number, total: number) => string;
  fileNamePrefix: string;
  dateLocale: string;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

export const MANAGEMENT_REPORT_STRINGS: Record<
  ManagementLocale,
  ManagementReportStrings
> = {
  en: {
    title: (frameworkName) => `Management summary: ${frameworkName}`,
    documentTitle: "Management summary",
    tenant: "Tenant",
    date: "Date",
    frameworkVersion: "Framework version",
    coverageHeadline: (pct) => `Evidence coverage ${pct}`,
    coverageNotAvailable: "Evidence coverage: Not available",
    notAvailable: "Not available",
    coverageSentence: (withEvidence, assessable) =>
      `${withEvidence} of ${assessable} controls that Intune can evidence have supporting configuration evidence. This is a coverage figure, not an audit result.`,
    coverageNotAvailableReason:
      "None of the controls in this framework can be evidenced from the Intune configuration, so no coverage figure can be given.",
    percent: (value) => `${value}%`,
    details: "Details >",
    tileCoverage: "Evidence coverage",
    tileCoverageDetail: (withEvidence, assessable) =>
      `${withEvidence} of ${assessable} assessable controls have evidence`,
    tileWithoutEvidence: "Controls without evidence",
    tileWithoutEvidenceDetail: (assessable, conflicting) =>
      `of ${assessable} assessable controls` +
      (conflicting > 0
        ? `; ${conflicting} more with conflicting policies`
        : ""),
    tileUnassigned: "Unassigned security configurations",
    tileUnassignedDetail:
      "Configured in Intune but not assigned to any devices or users",
    tileChange: "Change since baseline",
    deltaPoints: (points) => `${signed(points)} pts`,
    deltaNotAvailable: "No figure",
    deltaDetail: (newlyEvidenced, regressions) =>
      `${newlyEvidenced} newly evidenced, ${plural(regressions, "regression", "regressions")}`,
    noBaseline: "No baseline loaded",
    noBaselineHint: "Save a baseline now and load it next month",
    outsideScopeLine: (count) =>
      count === 1
        ? "1 measure is outside Intune scope and needs separate assessment."
        : `${count} measures are outside Intune scope and need separate assessment.`,
    dataGapsNote: (count) =>
      `Evidence for ${plural(count, "security configuration", "security configurations")} could not be read. Collect the data again before sharing this report.`,
    nextActionsHeading: "Next actions",
    noNextActions: "No next actions were identified in this run.",
    actionSentence: {
      conflicting: (name) => `Resolve conflicting policies for ${name}`,
      assignedDeviation: (name) => `Review policies that switch off ${name}`,
      partial: (name) => `Complete the configuration for ${name}`,
      unassigned: (name) => `Assign the existing policy for ${name}`,
      missing: (name) => `Configure ${name}`,
    },
    areaLabel: "Area",
    controlsLabel: "Controls",
    moreItems: (count) => `and ${count} more`,
    openInIntune: "Open in Intune >",
    openInEntra: "Open in Entra >",
    disclaimerHeading: "Important note",
    disclaimer: null,
    backToSummary: "< Back to summary",
    continued: (heading) => `${heading} (continued)`,
    controlsHeading: "All controls",
    controlsIntro:
      "Every control in the selected framework with the evidence status found in this run.",
    crosswalkNote:
      "CIS safeguard ids come from the crosswalk file you supplied. Intune Documentation does not ship or check them.",
    controlHeaders: ["Control", "Title", "Status"],
    cisLabel: "CIS (from your crosswalk file)",
    withoutEvidenceHeading: "Controls without evidence",
    withoutEvidenceIntro:
      "Controls that Intune can evidence but where no supporting configuration was found, followed by controls with conflicting policies.",
    withoutEvidenceEmpty:
      "Every assessable control has at least some evidence in this run.",
    unassignedHeading: "Unassigned security configurations",
    unassignedIntro:
      "These security settings are configured in Intune but the policy is not assigned, so they have no effect on devices yet.",
    unassignedEmpty: "No unassigned security configurations were found.",
    unassignedHeaders: ["Configuration", "Affected controls"],
    changeHeading: "Change since baseline",
    changeIntro: (baselineDate) =>
      `Compared with the baseline saved on ${baselineDate}.`,
    changeCoverage: "Change in evidence coverage",
    changeNewlyEvidenced: "Newly evidenced controls",
    changeRegressions: "Controls that lost evidence",
    changeAdded: "Controls added since the baseline",
    changeRemoved: "Controls no longer assessed",
    changeNone: "None",
    rulesetChanged:
      "The evaluation rules changed between the two runs, so some movement may come from the rules rather than from the tenant.",
    noBaselineHeading: "No baseline loaded",
    noBaselineSteps: [
      "A baseline is a small file that records today's evidence status. It contains control ids, statuses and counts, never policy names or settings.",
      "1. Save a baseline now from the management view in the app.",
      "2. Keep the file in a safe place.",
      "3. Next month, load the file before you create this report. This page then shows what changed.",
    ],
    outsideScopeHeading: "Measures outside Intune scope",
    outsideScopeIntro:
      "These measures cannot be evidenced from the Intune configuration. They need a separate assessment, for example through policies, processes or other systems.",
    outsideScopeHeaders: ["Measure", "Description"],
    controlStatuses: {
      evidenceFound: "Evidence found",
      partialEvidence: "Partly evidenced",
      noEvidence: "No evidence found",
      conflictingEvidence: "Conflicting policies",
      notApplicable: "Not in selected scope",
      notAssessed: "Not assessed",
    },
    portalAreas: {
      configurationProfiles: "Configuration profiles",
      compliancePolicies: "Compliance policies",
      diskEncryption: "Disk encryption",
      firewall: "Firewall",
      antivirus: "Antivirus",
      accountProtection: "Account protection",
      attackSurfaceReduction: "Attack surface reduction",
      windowsUpdates: "Windows updates",
      appProtection: "App protection policies",
      conditionalAccess: "Conditional Access",
      intuneHome: "Intune admin center",
    },
    footer: "Generated with Intune Documentation (intunedocumentation.com)",
    pageNumber: (page, total) => `Page ${page} of ${total}`,
    fileNamePrefix: "Management-Summary",
    dateLocale: "en-GB",
  },
  de: {
    title: (frameworkName) => `Management-Zusammenfassung: ${frameworkName}`,
    documentTitle: "Management-Zusammenfassung",
    tenant: "Mandant",
    date: "Datum",
    frameworkVersion: "Framework-Version",
    coverageHeadline: (pct) => `Nachweisabdeckung ${pct}`,
    coverageNotAvailable: "Nachweisabdeckung: Nicht verfügbar",
    notAvailable: "Nicht verfügbar",
    coverageSentence: (withEvidence, assessable) =>
      `${withEvidence} von ${assessable} Anforderungen, die Intune belegen kann, haben unterstützende Konfigurationsnachweise. Dies ist eine Abdeckungskennzahl, kein Prüfergebnis.`,
    coverageNotAvailableReason:
      "Keine Anforderung dieses Frameworks lässt sich anhand der Intune-Konfiguration belegen, daher gibt es keine Abdeckungskennzahl.",
    percent: (value) => `${value} %`,
    details: "Details >",
    tileCoverage: "Nachweisabdeckung",
    tileCoverageDetail: (withEvidence, assessable) =>
      `${withEvidence} von ${assessable} bewertbaren Anforderungen mit Nachweis`,
    tileWithoutEvidence: "Anforderungen ohne Nachweis",
    tileWithoutEvidenceDetail: (assessable, conflicting) =>
      `von ${assessable} bewertbaren Anforderungen` +
      (conflicting > 0
        ? `; ${conflicting} weitere mit widersprüchlichen Richtlinien`
        : ""),
    tileUnassigned: "Nicht zugewiesene Sicherheitskonfigurationen",
    tileUnassignedDetail:
      "In Intune konfiguriert, aber keinen Geräten oder Benutzern zugewiesen",
    tileChange: "Veränderung seit Baseline",
    deltaPoints: (points) => `${signed(points)} Pkt.`,
    deltaNotAvailable: "Kein Wert",
    deltaDetail: (newlyEvidenced, regressions) =>
      `${newlyEvidenced} neu belegt, ${plural(regressions, "Rückschritt", "Rückschritte")}`,
    noBaseline: "Keine Baseline geladen",
    noBaselineHint: "Jetzt eine Baseline speichern und nächsten Monat laden",
    outsideScopeLine: (count) =>
      count === 1
        ? "1 Maßnahme liegt außerhalb des Intune-Umfangs und braucht eine gesonderte Bewertung."
        : `${count} Maßnahmen liegen außerhalb des Intune-Umfangs und brauchen eine gesonderte Bewertung.`,
    dataGapsNote: (count) =>
      `Nachweise für ${plural(count, "Sicherheitskonfiguration", "Sicherheitskonfigurationen")} konnten nicht gelesen werden. Erfassen Sie die Daten erneut, bevor Sie diesen Bericht weitergeben.`,
    nextActionsHeading: "Nächste Schritte",
    noNextActions: "In diesem Lauf wurden keine nächsten Schritte ermittelt.",
    actionSentence: {
      conflicting: (name) =>
        `Widersprüchliche Richtlinien für ${name} auflösen`,
      assignedDeviation: (name) => `Richtlinien prüfen, die ${name} abschalten`,
      partial: (name) => `Konfiguration für ${name} vervollständigen`,
      unassigned: (name) => `Vorhandene Richtlinie für ${name} zuweisen`,
      missing: (name) => `${name} konfigurieren`,
    },
    areaLabel: "Bereich",
    controlsLabel: "Anforderungen",
    moreItems: (count) => `und ${count} weitere`,
    openInIntune: "In Intune öffnen >",
    openInEntra: "In Entra öffnen >",
    disclaimerHeading: "Wichtiger Hinweis",
    disclaimer:
      "Diese Auswertung zeigt technische Nachweise aus der Intune-Konfiguration des Mandanten. Sie ist keine Compliance-Zertifizierung und ersetzt kein Audit. Fehlende Nachweise bedeuten, dass keine passende Intune-Richtlinie erkannt wurde, nicht dass eine Anforderung auf anderem Weg nicht umgesetzt ist.",
    backToSummary: "< Zurück zur Zusammenfassung",
    continued: (heading) => `${heading} (Fortsetzung)`,
    controlsHeading: "Alle Anforderungen",
    controlsIntro:
      "Alle Anforderungen des gewählten Frameworks mit dem Nachweisstatus aus diesem Lauf.",
    crosswalkNote:
      "Die CIS-Safeguard-IDs stammen aus der von Ihnen bereitgestellten Crosswalk-Datei. Intune Documentation liefert oder prüft sie nicht.",
    controlHeaders: ["Anforderung", "Titel", "Status"],
    cisLabel: "CIS (aus Ihrer Crosswalk-Datei)",
    withoutEvidenceHeading: "Anforderungen ohne Nachweis",
    withoutEvidenceIntro:
      "Anforderungen, die Intune belegen kann, für die aber keine unterstützende Konfiguration gefunden wurde, gefolgt von Anforderungen mit widersprüchlichen Richtlinien.",
    withoutEvidenceEmpty:
      "In diesem Lauf hat jede bewertbare Anforderung zumindest teilweise Nachweise.",
    unassignedHeading: "Nicht zugewiesene Sicherheitskonfigurationen",
    unassignedIntro:
      "Diese Sicherheitseinstellungen sind in Intune konfiguriert, die Richtlinie ist aber nicht zugewiesen. Sie wirken daher noch auf keinem Gerät.",
    unassignedEmpty:
      "Es wurden keine nicht zugewiesenen Sicherheitskonfigurationen gefunden.",
    unassignedHeaders: ["Konfiguration", "Betroffene Anforderungen"],
    changeHeading: "Veränderung seit Baseline",
    changeIntro: (baselineDate) =>
      `Verglichen mit der Baseline vom ${baselineDate}.`,
    changeCoverage: "Veränderung der Nachweisabdeckung",
    changeNewlyEvidenced: "Neu belegte Anforderungen",
    changeRegressions: "Anforderungen, deren Nachweis entfallen ist",
    changeAdded: "Seit der Baseline hinzugekommene Anforderungen",
    changeRemoved: "Nicht mehr bewertete Anforderungen",
    changeNone: "Keine",
    rulesetChanged:
      "Die Bewertungsregeln haben sich zwischen den beiden Läufen geändert. Ein Teil der Veränderung kann daher aus den Regeln statt aus dem Mandanten stammen.",
    noBaselineHeading: "Keine Baseline geladen",
    noBaselineSteps: [
      "Eine Baseline ist eine kleine Datei, die den heutigen Nachweisstatus festhält. Sie enthält Anforderungs-IDs, Status und Zahlen, niemals Richtliniennamen oder Einstellungen.",
      "1. Speichern Sie jetzt in der App in der Management-Ansicht eine Baseline.",
      "2. Bewahren Sie die Datei sicher auf.",
      "3. Laden Sie die Datei nächsten Monat, bevor Sie diesen Bericht erstellen. Diese Seite zeigt dann die Veränderungen.",
    ],
    outsideScopeHeading: "Maßnahmen außerhalb des Intune-Umfangs",
    outsideScopeIntro:
      "Diese Maßnahmen lassen sich nicht anhand der Intune-Konfiguration belegen. Sie brauchen eine gesonderte Bewertung, zum Beispiel über Richtlinien, Prozesse oder andere Systeme.",
    outsideScopeHeaders: ["Maßnahme", "Beschreibung"],
    controlStatuses: {
      evidenceFound: "Nachweis vorhanden",
      partialEvidence: "Teilweise belegt",
      noEvidence: "Kein Nachweis gefunden",
      conflictingEvidence: "Widersprüchliche Richtlinien",
      notApplicable: "Nicht im gewählten Umfang",
      notAssessed: "Nicht bewertet",
    },
    portalAreas: {
      configurationProfiles: "Konfigurationsprofile",
      compliancePolicies: "Compliance-Richtlinien",
      diskEncryption: "Datenträgerverschlüsselung",
      firewall: "Firewall",
      antivirus: "Antivirus",
      accountProtection: "Kontoschutz",
      attackSurfaceReduction: "Verringerung der Angriffsfläche",
      windowsUpdates: "Windows-Updates",
      appProtection: "App-Schutzrichtlinien",
      conditionalAccess: "Bedingter Zugriff",
      intuneHome: "Intune Admin Center",
    },
    footer: "Erstellt mit Intune Documentation (intunedocumentation.com)",
    pageNumber: (page, total) => `Seite ${page} von ${total}`,
    fileNamePrefix: "Management-Zusammenfassung",
    dateLocale: "de-DE",
  },
};

import type { CompliancePlatform } from "../types";
import type { ManagementLocale, NextActionTier, SafeguardState } from "./types";

// Text for the security summary PDF. Page 1 is read by management without IT
// knowledge, so its wording avoids verdicts, control ids and technical terms.
// The pages after it are for the IT reviewer and may name policies and
// assignments. Text is limited to the WinAnsi character set because the PDF
// uses the standard Helvetica font (no arrows or typographic dashes).

export interface GuideSection {
  heading: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
}

export interface FigureText {
  label: string;
  note: string;
}

export interface ManagementReportStrings {
  // Page 1
  title: (frameworkName: string) => string;
  tenant: string;
  date: string;
  heroLabel: string;
  heroSentence: (inPlace: number, total: number) => string;
  heroNotAvailable: string;
  heroNotAvailableSentence: string;
  percent: (value: number) => string;
  ofCount: (part: number, total: number) => string;
  details: string;
  tileInPlace: string;
  tileInPlaceDetail: string;
  tileNoSafeguards: string;
  tileNoSafeguardsDetail: (measures: number) => string;
  tileNotSwitchedOn: string;
  tileNotSwitchedOnDetail: string;
  tileChange: string;
  deltaPoints: (points: number) => string;
  deltaNotAvailable: string;
  deltaDetail: (baselineDate: string) => string;
  oldBaselineDetail: string;
  noBaseline: string;
  noBaselineHint: string;
  measuresHeading: string;
  measuresCaption: string;
  moreMeasures: (count: number) => string;
  outsideScopeLine: (count: number) => string;
  notEvaluatedLine: (count: number) => string;
  dataGapsNote: (count: number) => string;
  nextStepsHeading: string;
  noNextSteps: string;
  actionSentence: Record<NextActionTier, (name: string) => string>;
  helpsWith: (titles: string) => string;
  openInIntune: string;
  openInEntra: string;
  page1Note: string;
  disclaimerHeading: string;
  /** Translation of COMPLIANCE_DISCLAIMER; null uses the English text passed in. */
  disclaimer: string | null;

  // IT reviewer pages
  itBand: string;
  backToSummary: string;
  continued: (heading: string) => string;
  guideHeading: string;
  guideSections: readonly GuideSection[];
  figuresHeading: string;
  figureHeaders: readonly [string, string];
  figures: {
    inPlace: FigureText;
    coverage: FigureText;
    noSafeguards: FigureText;
    conflicting: FigureText;
    notSwitchedOn: FigureText;
    outsideScope: FigureText;
    notEvaluated: FigureText;
    dataGaps: FigureText;
  };
  measuresValue: (count: number) => string;
  measuresOf: (part: number, total: number) => string;
  safeguardsValue: (count: number) => string;
  aboutRunHeading: string;
  frameworkVersion: string;
  rulesetVersion: string;
  generated: string;
  scope: string;
  allPlatforms: string;
  platforms: Record<CompliancePlatform, string>;
  overviewHeading: string;
  overviewIntro: string;
  crosswalkNote: string;
  overviewHeaders: readonly [string, string, string];
  cisLabel: string;
  measureDetailHeading: string;
  measureDetailIntro: string;
  measureCount: (inPlace: number, total: number) => string;
  safeguardHeaders: readonly [string, string, string];
  safeguardStates: Record<SafeguardState, string>;
  notAssignedSuffix: string;
  noPolicy: string;
  noSafeguardsMapped: string;
  unassignedHeading: string;
  unassignedIntro: string;
  unassignedEmpty: string;
  unassignedHeaders: readonly [string, string];
  changeHeading: string;
  changeIntro: (baselineDate: string) => string;
  changeSafeguards: string;
  changeSafeguardsMissing: string;
  changePerMeasure: string;
  changeHeaders: readonly [string, string, string];
  changeFromTo: (from: number, to: number, total: number) => string;
  changeNewlyEvidenced: string;
  changeRegressions: string;
  changeAdded: string;
  changeRemoved: string;
  changeNone: string;
  moreItems: (count: number) => string;
  rulesetChanged: string;
  noBaselineHeading: string;
  noBaselineSteps: readonly string[];
  outsideScopeHeading: string;
  outsideScopeIntro: string;
  outsideScopeHeaders: readonly [string, string];
  notEvaluatedNote: string;
  notEvaluatedIntro: string;
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
    title: (frameworkName) => `Security summary: ${frameworkName}`,
    tenant: "Tenant",
    date: "Date",
    heroLabel: "Safeguards in place",
    heroSentence: (inPlace, total) =>
      `${inPlace} of ${total} technical ${total === 1 ? "safeguard is" : "safeguards are"} set up and switched on in Intune.`,
    heroNotAvailable: "Not available",
    heroNotAvailableSentence:
      "None of the measures in this framework can be supported by Intune, so no figure can be given.",
    percent: (value) => `${value}%`,
    ofCount: (part, total) => `${part} of ${total}`,
    details: "Details >",
    tileInPlace: "Safeguards in place",
    tileInPlaceDetail: "set up and switched on",
    tileNoSafeguards: "Measures with no safeguards",
    tileNoSafeguardsDetail: (measures) =>
      `of ${plural(measures, "measure", "measures")}`,
    tileNotSwitchedOn: "Set up but not switched on",
    tileNotSwitchedOnDetail: "prepared, not yet in use",
    tileChange: "Change since last report",
    deltaPoints: (points) => `${signed(points)} pts`,
    deltaNotAvailable: "No figure",
    deltaDetail: (baselineDate) => `since ${baselineDate}`,
    oldBaselineDetail: "not in the earlier report",
    noBaseline: "No earlier report loaded",
    noBaselineHint: "compare next month",
    measuresHeading: "Measures",
    measuresCaption: "Safeguards in place per measure",
    moreMeasures: (count) =>
      count === 1
        ? "1 more measure on the following pages"
        : `${count} more measures on the following pages`,
    outsideScopeLine: (count) =>
      count === 1
        ? "1 measure cannot be checked in Intune and needs a separate review."
        : `${count} measures cannot be checked in Intune and need a separate review.`,
    notEvaluatedLine: (count) =>
      count === 1
        ? "1 measure relates to Intune or Entra settings that this report does not check yet; review it in the admin center."
        : `${count} measures relate to Intune or Entra settings that this report does not check yet; review them in the admin center.`,
    dataGapsNote: (count) =>
      `${plural(count, "safeguard", "safeguards")} could not be read. Ask your IT team to collect the data again before sharing this report.`,
    nextStepsHeading: "Recommended next steps",
    noNextSteps: "No next steps were found in this run.",
    actionSentence: {
      conflicting: (name) => `Resolve conflicting settings: ${name}`,
      assignedDeviation: (name) =>
        `Switch back on, a setting in use turns it off: ${name}`,
      partial: (name) => `Finish setting up: ${name}`,
      unassigned: (name) => `Switch on what is already set up: ${name}`,
      missing: (name) => `Set up: ${name}`,
    },
    helpsWith: (titles) => `Helps with: ${titles}`,
    openInIntune: "Open in Intune >",
    openInEntra: "Open in Entra >",
    page1Note:
      "This is a coverage figure from the Intune configuration, not an audit result. Explanations for your IT team follow on the next pages.",
    disclaimerHeading: "Important note",
    disclaimer: null,

    itBand: "For the IT reviewer",
    backToSummary: "< Back to summary",
    continued: (heading) => `${heading} (continued)`,
    guideHeading: "How to read this report",
    guideSections: [
      {
        heading: "Three levels",
        paragraphs: [],
        bullets: [
          "Measure: a requirement of the framework, for example one point of NIS2 Article 21(2) or one ISO 27001 Annex A control. Page 1 shows measures by title only.",
          "Safeguard: a security outcome that Intune or Entra Conditional Access can set, for example BitLocker disk encryption or multifactor authentication for cloud apps. One safeguard can support several measures; the headline counts it once.",
          "Policy setting: the value in an Intune configuration, compliance or Conditional Access policy that provides a safeguard. The table for each measure names every policy found.",
        ],
      },
      {
        heading: "When a safeguard counts as in place",
        paragraphs: [
          "A safeguard is in place when an assigned Intune policy sets a value that enforces it, or when an assigned compliance policy requires it. The report reads the tenant configuration only; it does not verify the state on each device.",
        ],
      },
      {
        heading: "What is not counted",
        paragraphs: [],
        bullets: [
          "Policies that are not assigned to any group, user or device. Their safeguards show as Set up, not switched on.",
          "Settings with a weaker value than the safeguard needs, or a value that switches it off.",
          "Check results of compliance policies that are not assigned.",
          "Anything outside Intune and Entra Conditional Access, such as processes, contracts or other security products.",
        ],
      },
      {
        heading:
          "Why a measure can have safeguards in place and still need work",
        paragraphs: [
          "Most measures map to several safeguards. 2 of 33 means that 2 of the 33 safeguards relevant to that measure are in place. A single safeguard in place is enough to count a measure in the measure coverage figure below, which is why page 1 leads with the safeguard figure.",
        ],
      },
    ],
    figuresHeading: "Figures in this report",
    figureHeaders: ["Figure", "Value"],
    figures: {
      inPlace: {
        label: "Safeguards in place (headline)",
        note: "Distinct safeguards mapped to the assessed measures that are in place, over all distinct mapped safeguards.",
      },
      coverage: {
        label: "Measure coverage",
        note: "Measures with at least one safeguard in place, over measures with at least one mapped safeguard.",
      },
      noSafeguards: {
        label: "Measures with no safeguards",
        note: "Measures with at least one mapped safeguard, none of them in place.",
      },
      conflicting: {
        label: "Measures with conflicting policies",
        note: "Assigned policies set opposing values for a safeguard of the measure.",
      },
      notSwitchedOn: {
        label: "Set up but not switched on",
        note: "Mapped safeguards configured only in policies that are not assigned.",
      },
      outsideScope: {
        label: "Measures outside Intune scope",
        note: "Framework requirements with no Intune mapping; they need a separate review.",
      },
      notEvaluated: {
        label: "Measures not checked yet",
        note: "Framework requirements that Intune or Entra settings could support, but that this report does not check yet; review them in the admin center.",
      },
      dataGaps: {
        label: "Safeguards that could not be read",
        note: "Mapped safeguards whose Intune data was missing or incomplete, for example because of a missing permission. They do not count as in place; collect the data again.",
      },
    },
    measuresValue: (count) => plural(count, "measure", "measures"),
    measuresOf: (part, total) =>
      `${part} of ${plural(total, "measure", "measures")}`,
    safeguardsValue: (count) => plural(count, "safeguard", "safeguards"),
    aboutRunHeading: "About this run",
    frameworkVersion: "Framework version",
    rulesetVersion: "Ruleset version",
    generated: "Generated",
    scope: "Platforms in scope",
    allPlatforms: "All supported platforms",
    platforms: {
      windows: "Windows",
      macos: "macOS",
      ios: "iOS/iPadOS",
      android: "Android",
      tenant: "Tenant-wide settings",
    },
    overviewHeading: "Measures overview",
    overviewIntro:
      "Every assessed measure with its identifier and the safeguards in place. Select a row to jump to its safeguard table.",
    crosswalkNote:
      "CIS safeguard ids come from the crosswalk file you supplied. Intune Documentation does not ship or check them.",
    overviewHeaders: ["Measure", "Title", "Safeguards in place"],
    cisLabel: "CIS (from your crosswalk file)",
    measureDetailHeading: "Safeguards per measure",
    measureDetailIntro:
      "Each measure lists every mapped safeguard, its state and the policies behind it. Policies marked (not assigned) do not count.",
    measureCount: (inPlace, total) =>
      `${inPlace} of ${plural(total, "safeguard", "safeguards")} in place`,
    safeguardHeaders: ["Safeguard", "State", "Policies"],
    safeguardStates: {
      inPlace: "In place",
      partial: "Partly set up",
      notAssigned: "Set up, not switched on",
      switchedOff: "Switched off by a policy in use",
      conflicting: "Conflicting policies",
      notConfigured: "Not set up",
      dataMissing: "Could not be read",
    },
    notAssignedSuffix: "(not assigned)",
    noPolicy: "No policy found",
    noSafeguardsMapped: "No safeguards are mapped to this measure.",
    unassignedHeading: "Set up but not switched on",
    unassignedIntro:
      "These safeguards are configured in Intune, but the policy is not assigned to any group, user or device, so they have no effect yet. Assigning the policy is often the quickest gain.",
    unassignedEmpty: "No safeguards are set up without being switched on.",
    unassignedHeaders: ["Safeguard", "Measures"],
    changeHeading: "Change since last report",
    changeIntro: (baselineDate) =>
      `Compared with the baseline file saved on ${baselineDate}.`,
    changeSafeguards: "Change in safeguards in place",
    changeSafeguardsMissing:
      "No figure: the baseline file was saved before safeguard counts existed. Save a new baseline to compare next time.",
    changePerMeasure: "Safeguards in place per measure",
    changeHeaders: ["Measure", "Title", "Safeguards in place"],
    changeFromTo: (from, to, total) => `${from} to ${to} of ${total}`,
    changeNewlyEvidenced: "Measures that now have evidence",
    changeRegressions: "Measures that lost evidence",
    changeAdded: "Measures added since the baseline",
    changeRemoved: "Measures no longer assessed",
    changeNone: "None",
    moreItems: (count) => `and ${count} more`,
    rulesetChanged:
      "The evaluation rules changed between the two runs, so some movement may come from the rules rather than from the tenant.",
    noBaselineHeading: "No earlier report loaded",
    noBaselineSteps: [
      "A baseline is a small file that records today's figures. It contains measure ids, statuses and counts, never policy names or settings.",
      "1. Save a baseline now from the management view in the app.",
      "2. Keep the file in a safe place.",
      "3. Next month, load the file before you create this report. Page 1 and this page then show what changed.",
    ],
    outsideScopeHeading: "Measures outside Intune scope",
    outsideScopeIntro:
      "These measures cannot be checked from the Intune configuration. They need a separate review, for example of processes, contracts or other systems.",
    outsideScopeHeaders: ["Measure", "Description"],
    notEvaluatedNote:
      "Not checked yet: related Intune or Entra settings exist, review them in the admin center.",
    notEvaluatedIntro:
      "Rows marked Not checked yet are the exception: Intune or Entra settings can support them, but this report does not check them yet.",
    footer: "Generated with Intune Documentation (intunedocumentation.com)",
    pageNumber: (page, total) => `Page ${page} of ${total}`,
    fileNamePrefix: "Security-Summary",
    dateLocale: "en-GB",
  },
  de: {
    title: (frameworkName) => `Sicherheitsübersicht: ${frameworkName}`,
    tenant: "Mandant",
    date: "Datum",
    heroLabel: "Aktive Schutzfunktionen",
    heroSentence: (inPlace, total) =>
      `${inPlace} von ${total} technischen ${total === 1 ? "Schutzfunktion" : "Schutzfunktionen"} ${inPlace === 1 ? "ist" : "sind"} in Intune eingerichtet und eingeschaltet.`,
    heroNotAvailable: "Nicht verfügbar",
    heroNotAvailableSentence:
      "Keine Maßnahme dieses Frameworks lässt sich mit Intune unterstützen, daher gibt es keine Kennzahl.",
    percent: (value) => `${value} %`,
    ofCount: (part, total) => `${part} von ${total}`,
    details: "Details >",
    tileInPlace: "Aktive Schutzfunktionen",
    tileInPlaceDetail: "eingerichtet und eingeschaltet",
    tileNoSafeguards: "Maßnahmen ohne Schutzfunktion",
    tileNoSafeguardsDetail: (measures) =>
      `von ${plural(measures, "Maßnahme", "Maßnahmen")}`,
    tileNotSwitchedOn: "Eingerichtet, aber nicht eingeschaltet",
    tileNotSwitchedOnDetail: "vorbereitet, noch ohne Wirkung",
    tileChange: "Veränderung seit letztem Bericht",
    deltaPoints: (points) => `${signed(points)} Pkt.`,
    deltaNotAvailable: "Kein Wert",
    deltaDetail: (baselineDate) => `seit ${baselineDate}`,
    oldBaselineDetail: "nicht im früheren Bericht",
    noBaseline: "Kein früherer Bericht geladen",
    noBaselineHint: "nächsten Monat vergleichen",
    measuresHeading: "Maßnahmen",
    measuresCaption: "Aktive Schutzfunktionen je Maßnahme",
    moreMeasures: (count) =>
      count === 1
        ? "1 weitere Maßnahme auf den folgenden Seiten"
        : `${count} weitere Maßnahmen auf den folgenden Seiten`,
    outsideScopeLine: (count) =>
      count === 1
        ? "1 Maßnahme lässt sich nicht in Intune prüfen und braucht eine gesonderte Bewertung."
        : `${count} Maßnahmen lassen sich nicht in Intune prüfen und brauchen eine gesonderte Bewertung.`,
    notEvaluatedLine: (count) =>
      count === 1
        ? "1 Maßnahme betrifft Intune- oder Entra-Einstellungen, die dieser Bericht noch nicht prüft; bewerten Sie sie im Admin Center."
        : `${count} Maßnahmen betreffen Intune- oder Entra-Einstellungen, die dieser Bericht noch nicht prüft; bewerten Sie sie im Admin Center.`,
    dataGapsNote: (count) =>
      `${plural(count, "Schutzfunktion konnte", "Schutzfunktionen konnten")} nicht gelesen werden. Bitten Sie Ihr IT-Team, die Daten erneut zu erfassen, bevor Sie diesen Bericht weitergeben.`,
    nextStepsHeading: "Empfohlene nächste Schritte",
    noNextSteps: "In diesem Lauf wurden keine nächsten Schritte ermittelt.",
    actionSentence: {
      conflicting: (name) => `Widersprüchliche Einstellungen auflösen: ${name}`,
      assignedDeviation: (name) =>
        `Wieder einschalten, eine genutzte Einstellung schaltet es ab: ${name}`,
      partial: (name) => `Einrichtung abschließen: ${name}`,
      unassigned: (name) => `Bereits eingerichtet, jetzt einschalten: ${name}`,
      missing: (name) => `Einrichten: ${name}`,
    },
    helpsWith: (titles) => `Hilft bei: ${titles}`,
    openInIntune: "In Intune öffnen >",
    openInEntra: "In Entra öffnen >",
    page1Note:
      "Dies ist eine Abdeckungskennzahl aus der Intune-Konfiguration, kein Prüfergebnis. Erläuterungen für Ihr IT-Team folgen auf den nächsten Seiten.",
    disclaimerHeading: "Wichtiger Hinweis",
    disclaimer:
      "Diese Auswertung zeigt technische Nachweise aus der Intune-Konfiguration des Mandanten. Sie ist keine Compliance-Zertifizierung und ersetzt kein Audit. Fehlende Nachweise bedeuten, dass keine passende Intune-Richtlinie erkannt wurde, nicht dass eine Anforderung auf anderem Weg nicht umgesetzt ist.",

    itBand: "Für die IT-Prüfung",
    backToSummary: "< Zurück zur Übersicht",
    continued: (heading) => `${heading} (Fortsetzung)`,
    guideHeading: "So lesen Sie diesen Bericht",
    guideSections: [
      {
        heading: "Drei Ebenen",
        paragraphs: [],
        bullets: [
          "Maßnahme: eine Anforderung des Frameworks, zum Beispiel ein Punkt aus NIS2 Artikel 21 Absatz 2 oder ein Control aus ISO 27001 Anhang A. Seite 1 zeigt Maßnahmen nur mit ihrem Titel.",
          "Schutzfunktion: ein Sicherheitsergebnis, das Intune oder der bedingte Zugriff in Entra herstellen kann, zum Beispiel BitLocker-Datenträgerverschlüsselung oder mehrstufige Authentifizierung für Cloud-Apps. Eine Schutzfunktion kann mehrere Maßnahmen unterstützen; die Hauptkennzahl zählt sie einmal.",
          "Richtlinieneinstellung: der Wert in einer Intune-Konfigurationsrichtlinie, Compliance-Richtlinie oder Richtlinie für bedingten Zugriff, der eine Schutzfunktion herstellt. Die Tabelle jeder Maßnahme nennt alle gefundenen Richtlinien.",
        ],
      },
      {
        heading: "Wann eine Schutzfunktion als aktiv zählt",
        paragraphs: [
          "Eine Schutzfunktion ist aktiv, wenn eine zugewiesene Intune-Richtlinie einen Wert setzt, der sie durchsetzt, oder eine zugewiesene Compliance-Richtlinie sie verlangt. Der Bericht liest nur die Konfiguration des Mandanten; den Zustand der einzelnen Geräte prüft er nicht.",
        ],
      },
      {
        heading: "Was nicht gezählt wird",
        paragraphs: [],
        bullets: [
          "Richtlinien, die keiner Gruppe, keinem Benutzer und keinem Gerät zugewiesen sind. Ihre Schutzfunktionen erscheinen als Eingerichtet, nicht eingeschaltet.",
          "Einstellungen mit einem schwächeren Wert, als die Schutzfunktion braucht, oder mit einem Wert, der sie abschaltet.",
          "Prüfergebnisse von Compliance-Richtlinien, die nicht zugewiesen sind.",
          "Alles außerhalb von Intune und dem bedingten Zugriff in Entra, etwa Prozesse, Verträge oder andere Sicherheitsprodukte.",
        ],
      },
      {
        heading:
          "Warum eine Maßnahme aktive Schutzfunktionen haben und trotzdem Arbeit brauchen kann",
        paragraphs: [
          "Die meisten Maßnahmen umfassen mehrere Schutzfunktionen. 2 von 33 bedeutet, dass 2 der 33 für diese Maßnahme relevanten Schutzfunktionen aktiv sind. Schon eine aktive Schutzfunktion reicht, damit eine Maßnahme in der Maßnahmenabdeckung unten zählt. Deshalb steht auf Seite 1 die Kennzahl der Schutzfunktionen.",
        ],
      },
    ],
    figuresHeading: "Kennzahlen in diesem Bericht",
    figureHeaders: ["Kennzahl", "Wert"],
    figures: {
      inPlace: {
        label: "Aktive Schutzfunktionen (Hauptkennzahl)",
        note: "Aktive Schutzfunktionen, die den bewerteten Maßnahmen zugeordnet sind, im Verhältnis zu allen zugeordneten Schutzfunktionen; jede wird einmal gezählt.",
      },
      coverage: {
        label: "Maßnahmenabdeckung",
        note: "Anteil der Maßnahmen mit zugeordneter Schutzfunktion, bei denen mindestens eine aktiv ist.",
      },
      noSafeguards: {
        label: "Maßnahmen ohne Schutzfunktion",
        note: "Maßnahmen mit mindestens einer zugeordneten Schutzfunktion, von denen keine aktiv ist.",
      },
      conflicting: {
        label: "Maßnahmen mit widersprüchlichen Richtlinien",
        note: "Zugewiesene Richtlinien setzen gegensätzliche Werte für eine Schutzfunktion der Maßnahme.",
      },
      notSwitchedOn: {
        label: "Eingerichtet, aber nicht eingeschaltet",
        note: "Zugeordnete Schutzfunktionen, die nur in nicht zugewiesenen Richtlinien konfiguriert sind.",
      },
      outsideScope: {
        label: "Maßnahmen außerhalb des Intune-Umfangs",
        note: "Anforderungen des Frameworks ohne Intune-Zuordnung; sie brauchen eine gesonderte Bewertung.",
      },
      notEvaluated: {
        label: "Noch nicht geprüfte Maßnahmen",
        note: "Anforderungen des Frameworks, die Intune- oder Entra-Einstellungen unterstützen könnten, die dieser Bericht aber noch nicht prüft; bewerten Sie sie im Admin Center.",
      },
      dataGaps: {
        label: "Nicht lesbare Schutzfunktionen",
        note: "Zugeordnete Schutzfunktionen, deren Intune-Daten fehlten oder unvollständig waren, etwa wegen einer fehlenden Berechtigung. Sie zählen nicht als aktiv; erfassen Sie die Daten erneut.",
      },
    },
    measuresValue: (count) => plural(count, "Maßnahme", "Maßnahmen"),
    measuresOf: (part, total) =>
      `${part} von ${plural(total, "Maßnahme", "Maßnahmen")}`,
    safeguardsValue: (count) =>
      plural(count, "Schutzfunktion", "Schutzfunktionen"),
    aboutRunHeading: "Zu diesem Lauf",
    frameworkVersion: "Framework-Version",
    rulesetVersion: "Regelwerksversion",
    generated: "Erstellt",
    scope: "Plattformen im Umfang",
    allPlatforms: "Alle unterstützten Plattformen",
    platforms: {
      windows: "Windows",
      macos: "macOS",
      ios: "iOS/iPadOS",
      android: "Android",
      tenant: "Mandantenweite Einstellungen",
    },
    overviewHeading: "Maßnahmen im Überblick",
    overviewIntro:
      "Alle bewerteten Maßnahmen mit Kennung und aktiven Schutzfunktionen. Eine Zeile führt zur Tabelle der Schutzfunktionen dieser Maßnahme.",
    crosswalkNote:
      "Die CIS-Safeguard-IDs stammen aus der von Ihnen bereitgestellten Crosswalk-Datei. Intune Documentation liefert oder prüft sie nicht.",
    overviewHeaders: ["Maßnahme", "Titel", "Aktive Schutzfunktionen"],
    cisLabel: "CIS (aus Ihrer Crosswalk-Datei)",
    measureDetailHeading: "Schutzfunktionen je Maßnahme",
    measureDetailIntro:
      "Jede Maßnahme listet alle zugeordneten Schutzfunktionen, ihren Zustand und die Richtlinien dahinter. Richtlinien mit dem Zusatz (nicht zugewiesen) zählen nicht.",
    measureCount: (inPlace, total) =>
      `${inPlace} von ${plural(total, "Schutzfunktion", "Schutzfunktionen")} aktiv`,
    safeguardHeaders: ["Schutzfunktion", "Zustand", "Richtlinien"],
    safeguardStates: {
      inPlace: "Aktiv",
      partial: "Teilweise eingerichtet",
      notAssigned: "Eingerichtet, nicht eingeschaltet",
      switchedOff: "Durch zugewiesene Richtlinie abgeschaltet",
      conflicting: "Widersprüchliche Richtlinien",
      notConfigured: "Nicht eingerichtet",
      dataMissing: "Nicht lesbar",
    },
    notAssignedSuffix: "(nicht zugewiesen)",
    noPolicy: "Keine Richtlinie gefunden",
    noSafeguardsMapped:
      "Dieser Maßnahme sind keine Schutzfunktionen zugeordnet.",
    unassignedHeading: "Eingerichtet, aber nicht eingeschaltet",
    unassignedIntro:
      "Diese Schutzfunktionen sind in Intune konfiguriert, die Richtlinie ist aber keiner Gruppe, keinem Benutzer und keinem Gerät zugewiesen. Sie wirken daher noch nicht. Die Richtlinie zuzuweisen ist oft der schnellste Gewinn.",
    unassignedEmpty:
      "Es gibt keine Schutzfunktionen, die eingerichtet, aber nicht eingeschaltet sind.",
    unassignedHeaders: ["Schutzfunktion", "Maßnahmen"],
    changeHeading: "Veränderung seit letztem Bericht",
    changeIntro: (baselineDate) =>
      `Verglichen mit der Baseline-Datei vom ${baselineDate}.`,
    changeSafeguards: "Veränderung der aktiven Schutzfunktionen",
    changeSafeguardsMissing:
      "Kein Wert: Die Baseline-Datei wurde gespeichert, bevor es Zahlen zu Schutzfunktionen gab. Speichern Sie eine neue Baseline für den nächsten Vergleich.",
    changePerMeasure: "Aktive Schutzfunktionen je Maßnahme",
    changeHeaders: ["Maßnahme", "Titel", "Aktive Schutzfunktionen"],
    changeFromTo: (from, to, total) => `${from} auf ${to} (von ${total})`,
    changeNewlyEvidenced: "Maßnahmen, die jetzt Nachweise haben",
    changeRegressions: "Maßnahmen, deren Nachweis entfallen ist",
    changeAdded: "Seit der Baseline hinzugekommene Maßnahmen",
    changeRemoved: "Nicht mehr bewertete Maßnahmen",
    changeNone: "Keine",
    moreItems: (count) => `und ${count} weitere`,
    rulesetChanged:
      "Die Bewertungsregeln haben sich zwischen den beiden Läufen geändert. Ein Teil der Veränderung kann daher aus den Regeln statt aus dem Mandanten stammen.",
    noBaselineHeading: "Kein früherer Bericht geladen",
    noBaselineSteps: [
      "Eine Baseline ist eine kleine Datei, die die heutigen Kennzahlen festhält. Sie enthält Maßnahmen-IDs, Status und Zahlen, niemals Richtliniennamen oder Einstellungen.",
      "1. Speichern Sie jetzt in der App in der Management-Ansicht eine Baseline.",
      "2. Bewahren Sie die Datei sicher auf.",
      "3. Laden Sie die Datei nächsten Monat, bevor Sie diesen Bericht erstellen. Seite 1 und diese Seite zeigen dann die Veränderungen.",
    ],
    outsideScopeHeading: "Maßnahmen außerhalb des Intune-Umfangs",
    outsideScopeIntro:
      "Diese Maßnahmen lassen sich nicht anhand der Intune-Konfiguration prüfen. Sie brauchen eine gesonderte Bewertung, zum Beispiel von Prozessen, Verträgen oder anderen Systemen.",
    outsideScopeHeaders: ["Maßnahme", "Beschreibung"],
    notEvaluatedNote:
      "Noch nicht geprüft: Es gibt passende Intune- oder Entra-Einstellungen, bewerten Sie diese im Admin Center.",
    notEvaluatedIntro:
      "Ausgenommen sind Zeilen mit dem Hinweis Noch nicht geprüft: Intune- oder Entra-Einstellungen können sie unterstützen, dieser Bericht prüft sie aber noch nicht.",
    footer: "Erstellt mit Intune Documentation (intunedocumentation.com)",
    pageNumber: (page, total) => `Seite ${page} von ${total}`,
    fileNamePrefix: "Sicherheitsuebersicht",
    dateLocale: "de-DE",
  },
};

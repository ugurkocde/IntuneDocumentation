// Data Processing Agreement (Art. 28 GDPR) for the hosted web app.
//
// Bump DPA_VERSION whenever the agreement or Annex 1 changes in substance:
// signed-in users of the hosted web app are asked to accept the new version
// before the next collection. Announce subprocessor changes 30 days ahead.
export const DPA_VERSION = "2026-11-16";
export const DPA_EFFECTIVE_LABEL = "November 16, 2026";

export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "ol"; items: string[] }
  | { kind: "ul"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface Subprocessor {
  name: string;
  service: string;
  data: string;
  location: string;
  safeguards: string;
}

// Annex 1. Rendered on /subprocessors and inside the DPA.
export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Vercel Inc., San Francisco, USA",
    service: "Hosting of the application server and delivery of the website",
    data: "Microsoft Graph responses and access tokens (transient, in memory), IP addresses, operational logs",
    location:
      "Server functions in Frankfurt, Germany (fra1). Static assets through Vercel's global edge network, for users in Germany usually from EU locations",
    safeguards:
      "EU-U.S. Data Privacy Framework, EU SCCs, SOC 2 Type II, ISO 27001",
  },
  {
    name: "Supabase Inc., San Francisco, USA",
    service:
      "Database for pseudonymous usage counters and DPA acceptance records",
    data: "SHA-256 hashes of user principal name and tenant ID, DPA version, timestamps",
    location: "AWS eu-central-1, Frankfurt, Germany",
    safeguards: "EU SCCs, SOC 2 Type II",
  },
  {
    name: "Resend Inc., San Francisco, USA",
    service:
      "Delivery of support requests (only when the support form is used)",
    data: "Name, email address, subject, message",
    location: "USA",
    safeguards: "EU-U.S. Data Privacy Framework, EU SCCs",
  },
  {
    name: "Cloudflare Inc., San Francisco, USA",
    service: "Spam protection for the support form (Turnstile)",
    data: "Browser and network information, IP address",
    location: "Global network",
    safeguards: "EU-U.S. Data Privacy Framework, EU SCCs, ISO 27001",
  },
];

export const SUBPROCESSOR_NOTES = [
  "Microsoft is the provider of your own tenant and not a subprocessor of Ugurlabs.",
  "Plausible Analytics (EU) runs on the public website only and processes no personal data.",
  "The desktop app sends no tenant data to Ugurlabs, so no processing on your behalf takes place and no DPA is needed. Self-hosted deployments of the open-source web app are operated by you and do not use these subprocessors.",
];

const PROVIDER =
  "Ugurlabs UG (haftungsbeschränkt), Fährstraße 217, 40221 Düsseldorf, Germany, represented by its Managing Director Ugur Koc. Privacy contact: support@ugurlabs.com.";

// German is the binding version. Keep both languages in step.
export const DPA_DE: LegalSection[] = [
  {
    id: "de-geltungsbereich",
    title: "Geltungsbereich",
    blocks: [
      {
        kind: "p",
        text: "Dieser Vertrag ist ein Standardvertrag und Teil der Nutzungsbedingungen. Er gilt nur für die gehostete Webversion unter intunedocumentation.com und wird nicht individuell verhandelt. Nur dort verarbeitet Ugurlabs Intune-Konfigurationsdaten im Auftrag des Kunden.",
      },
      {
        kind: "ul",
        items: [
          "Desktop-App (Windows/macOS): Kein AVV erforderlich. Die App ruft Microsoft Graph direkt vom Rechner des Kunden auf, über eine App-Registrierung im eigenen Tenant. Konfigurationsdaten, Tokens und Dokumente erreichen die Infrastruktur von Ugurlabs nicht. Für die Lizenzprüfung ist Ugurlabs eigenständig Verantwortlicher (Art. 6 Abs. 1 lit. b DSGVO).",
          "Selbst gehostete Webversion (Open Source, Docker): Kein AVV erforderlich. Der Kunde betreibt die Anwendung in seiner eigenen Infrastruktur.",
        ],
      },
    ],
  },
  {
    id: "de-1",
    title: "§ 1 Vertragsparteien, Gegenstand und Dauer",
    blocks: [
      {
        kind: "p",
        text: "Verantwortlicher (Auftraggeber): die Organisation, für die ein Nutzer die Webversion verwendet und den Nutzungsbedingungen zugestimmt hat.",
      },
      {
        kind: "p",
        text: "Auftragsverarbeiter (Auftragnehmer): Ugurlabs UG (haftungsbeschränkt), Fährstraße 217, 40221 Düsseldorf, Deutschland, vertreten durch den Geschäftsführer Ugur Koc. Kontakt für Datenschutz: support@ugurlabs.com.",
      },
      {
        kind: "ol",
        items: [
          "Gegenstand ist die Bereitstellung der Webversion von Intune Documentation. Sie liest die Microsoft-Intune-Konfiguration des Auftraggebers über Microsoft Graph aus und stellt sie zur Dokumentation bereit.",
          'Der Vertrag kommt zustande, sobald der Auftraggeber den Nutzungsbedingungen zustimmt, und gilt, solange er die Webversion nutzt. Er endet automatisch, wenn der Auftraggeber die Einwilligung für die Enterprise-Anwendung "Intune Documentation" in seinem Tenant entfernt und die Nutzung einstellt.',
          "Dieser Vertrag konkretisiert die Pflichten der Parteien nach Art. 28 DSGVO. Bei Widersprüchen zu anderen Vereinbarungen geht er in Datenschutzfragen vor.",
        ],
      },
    ],
  },
  {
    id: "de-2",
    title: "§ 2 Art, Zweck, Datenarten und betroffene Personen",
    blocks: [
      {
        kind: "p",
        text: "Art und Zweck: Abruf der Intune-Konfiguration mit dem delegierten, rein lesenden Zugriffstoken des angemeldeten Nutzers. Der Anwendungsserver sammelt, normalisiert und schwärzt die Graph-Antworten im Arbeitsspeicher und gibt sie an den Browser zurück. PDF und DOCX entstehen ausschließlich im Browser. Zusätzlich erfasst der Dienst pseudonyme Nutzungszähler.",
      },
      {
        kind: "table",
        head: ["Datenart", "Verarbeitung", "Speicherung"],
        rows: [
          [
            "Intune-Konfigurationsdaten (Richtlinien, Profile, Apps, Zuweisungen, aufgelöste Gruppennamen, Gerätezahlen je Plattform)",
            "Flüchtig während der Anfrage",
            "Keine Speicherung bei Ugurlabs",
          ],
          [
            "In Konfigurationen enthaltene Personendaten (z. B. Namen von Administratoren, Gruppen, Ansprechpartnern)",
            "Flüchtig während der Anfrage",
            "Keine Speicherung bei Ugurlabs",
          ],
          [
            "Zugriffstoken (Microsoft Entra ID)",
            "Nur für die laufende Graph-Anfrage",
            "Keine Speicherung bei Ugurlabs",
          ],
          [
            "SHA-256-Hash von UPN und Tenant-ID",
            "Monatliche aktive Nutzer zählen, Zustimmung zu diesem Vertrag nachweisen",
            "Supabase, Frankfurt",
          ],
          [
            "Tenant-ID, Nutzer-Hash, Anfragekontext, Zeitstempel, IP-Adresse",
            "Betriebs- und Fehlerprotokolle",
            "Hosting-Protokolle von Vercel",
          ],
        ],
      },
      {
        kind: "p",
        text: "Betroffene Personen: Administratoren und sonstige Nutzer des Auftraggebers, die sich an der Webversion anmelden. Außerdem Personen, deren Daten in der Intune-Konfiguration enthalten sind.",
      },
      {
        kind: "p",
        text: "Besondere Kategorien personenbezogener Daten (Art. 9 DSGVO) werden nicht verarbeitet. Geheimnisse wie Skriptinhalte, Kennwörter, Pre-Shared Keys und Tokens werden vor der Ausgabe durch [Redacted] ersetzt.",
      },
    ],
  },
  {
    id: "de-3",
    title: "§ 3 Pflichten des Auftragsverarbeiters",
    blocks: [
      {
        kind: "ol",
        items: [
          "Weisungen: Der Auftragnehmer verarbeitet Daten nur auf dokumentierte Weisung des Auftraggebers, einschließlich der Drittlandübermittlung (Art. 28 Abs. 3 lit. a DSGVO), es sei denn, das Recht der Union oder eines Mitgliedstaats verpflichtet ihn zu einer Verarbeitung. Dann teilt er dem Auftraggeber diese Pflicht vorher mit, sofern das Recht dies nicht verbietet. Die Weisungen ergeben sich aus diesem Vertrag und der Nutzung der Webversion. Hält der Auftragnehmer eine Weisung für rechtswidrig, informiert er den Auftraggeber unverzüglich und darf die Ausführung aussetzen, bis sie bestätigt oder geändert wird.",
          "Keine eigenen Zwecke: Der Auftragnehmer verwendet die Daten nicht für eigene Zwecke, insbesondere nicht für Werbung, Profilbildung oder das Training von KI-Modellen.",
          "Vertraulichkeit: Alle Personen mit Zugang zu den Daten sind zur Vertraulichkeit verpflichtet, auch über das Ende ihrer Tätigkeit hinaus.",
          "Sicherheit: Der Auftragnehmer trifft die Maßnahmen nach Art. 32 DSGVO, beschrieben in Anlage 2. Er darf sie weiterentwickeln, solange das Schutzniveau nicht sinkt.",
          "Unterstützung: Der Auftragnehmer unterstützt den Auftraggeber bei Anfragen betroffener Personen (Art. 12 bis 23 DSGVO) sowie bei den Pflichten nach Art. 32 bis 36 DSGVO, soweit ihm das möglich ist. Anfragen, die direkt bei ihm eingehen, leitet er unverzüglich weiter. Da keine Konfigurationsdaten gespeichert werden, beschränkt sich dies in der Regel auf die pseudonymen Nutzungsdaten.",
          "Meldung von Datenschutzverletzungen: Der Auftragnehmer meldet eine Verletzung des Schutzes personenbezogener Daten unverzüglich, spätestens innerhalb von 24 Stunden nach Kenntnis, in Textform an die vom Auftraggeber benannte Stelle. Die Meldung enthält, soweit bekannt, die Angaben nach Art. 33 Abs. 3 DSGVO. Meldungen an Aufsichtsbehörden oder betroffene Personen nimmt er nur auf Weisung des Auftraggebers vor.",
          "Verzeichnis: Der Auftragnehmer führt ein Verzeichnis der Verarbeitungstätigkeiten nach Art. 30 Abs. 2 DSGVO.",
          "Zugriffe Dritter: Werden die Daten durch Pfändung, Beschlagnahme, Insolvenz oder Anfragen von Behörden gefährdet, informiert der Auftragnehmer den Auftraggeber unverzüglich, soweit dies rechtlich zulässig ist.",
          "Ansprechpartner: Ugur Koc, Geschäftsführer, support@ugurlabs.com. Ein Datenschutzbeauftragter ist nach § 38 BDSG nicht zu benennen.",
        ],
      },
    ],
  },
  {
    id: "de-4",
    title: "§ 4 Unterauftragnehmer, Drittländer, Kontrolle und Vertragsende",
    blocks: [
      {
        kind: "ol",
        items: [
          "Unterauftragnehmer: Der Auftraggeber genehmigt die in Anlage 1 genannten Unterauftragnehmer. Über neue oder ersetzte Unterauftragnehmer informiert der Auftragnehmer mindestens 30 Tage vorher auf intunedocumentation.com/subprocessors und per E-Mail an alle, die sich dafür angemeldet haben. Der Auftraggeber kann innerhalb von 14 Tagen nach der Mitteilung aus datenschutzrechtlichen Gründen in Textform widersprechen. Finden die Parteien keine Lösung, kann der Auftraggeber die Nutzung ohne Kosten beenden. Der Auftragnehmer erlegt jedem Unterauftragnehmer dieselben Datenschutzpflichten auf (Art. 28 Abs. 4 DSGVO) und haftet gegenüber dem Auftraggeber für deren Einhaltung.",
          "Drittländer: Intune-Konfigurationsdaten, Tokens und pseudonyme Nutzungsdaten werden in Rechenzentren in Frankfurt verarbeitet. Ausgenommen sind Support-Anfragen über das Kontaktformular: Sie werden über Resend in den USA und über das globale Netz von Cloudflare verarbeitet (Anlage 1). Alle Unterauftragnehmer haben ihren Sitz in den USA, ein Zugriff aus Drittländern ist daher nicht ausgeschlossen. Er ist durch die Zertifizierung nach dem EU-U.S. Data Privacy Framework (Art. 45 DSGVO) und ergänzend durch die EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO) abgesichert. Entfällt der Angemessenheitsbeschluss, gelten die Standardvertragsklauseln fort, und der Auftragnehmer informiert den Auftraggeber.",
          "Kontrollrechte: Der Auftragnehmer weist die Einhaltung seiner Pflichten vorrangig durch diesen Vertrag, Anlage 2, den öffentlichen Quellcode der Webversion und die Zertifikate der Unterauftragnehmer (SOC 2 Typ II, ISO 27001) nach. Auf Anfrage beantwortet er einmal jährlich einen Fragebogen des Auftraggebers. Darüber hinausgehende Prüfungen, auch vor Ort, sind nach Absprache mit 30 Tagen Vorlauf und auf Kosten des Auftraggebers möglich, höchstens einmal jährlich, außer bei einem konkreten Anlass oder auf Anordnung einer Aufsichtsbehörde.",
          "Löschung und Rückgabe: Intune-Konfigurationsdaten und Tokens werden nach jeder Anfrage verworfen. Nach Vertragsende löscht der Auftragnehmer auf Anfrage die pseudonymen Nutzungsdaten des Auftraggebers innerhalb von 30 Tagen, soweit sie einem Tenant zugeordnet werden können, und bestätigt die Löschung in Textform. Hosting-Protokolle laufen nach den Fristen des Hosting-Anbieters ab.",
          "Haftung: Es gilt Art. 82 DSGVO. Im Innenverhältnis haften die Parteien nach ihrem Anteil an der Verantwortung für den Schaden (Art. 82 Abs. 5 DSGVO).",
          "Schlussbestimmungen: Der Auftragnehmer kann diesen Vertrag mit 30 Tagen Ankündigung anpassen, wenn Gesetz, Rechtsprechung oder Unterauftragnehmer es erfordern. Das Schutzniveau sinkt dabei nicht. Es gilt deutsches Recht. Gerichtsstand ist Düsseldorf, soweit gesetzlich zulässig. Ein Zurückbehaltungsrecht des Auftragnehmers an den Daten (§ 273 BGB) ist ausgeschlossen. Ist eine Bestimmung unwirksam, bleibt der Rest wirksam.",
        ],
      },
      {
        kind: "p",
        text: "Vertragsschluss: Eine Unterschrift ist nicht erforderlich. Der Vertrag wird elektronisch geschlossen, indem der Auftraggeber den Nutzungsbedingungen zustimmt (Art. 28 Abs. 9 DSGVO). Die jeweils gültige Fassung ist unter intunedocumentation.com/dpa abrufbar und kann als PDF gespeichert werden. Auf Wunsch stellt der Auftragnehmer eine unterschriebene Fassung bereit.",
      },
    ],
  },
];

export const DPA_EN: LegalSection[] = [
  {
    id: "en-scope",
    title: "Scope",
    blocks: [
      {
        kind: "p",
        text: "This agreement is a standard agreement and part of the Terms of Use. It applies only to the hosted web app at intunedocumentation.com and is not negotiated individually. Only there does Ugurlabs process Intune configuration data on the customer's behalf.",
      },
      {
        kind: "ul",
        items: [
          "Desktop app (Windows/macOS): no DPA required. The app calls Microsoft Graph directly from the customer's computer through an app registration in the customer's own tenant. Configuration data, tokens and documents never reach Ugurlabs' infrastructure. For license checks, Ugurlabs is an independent controller (Art. 6(1)(b) GDPR).",
          "Self-hosted web app (open source, Docker): no DPA required. The customer operates the application in its own infrastructure.",
        ],
      },
    ],
  },
  {
    id: "en-1",
    title: "1. Parties, subject matter and term",
    blocks: [
      {
        kind: "p",
        text: "Controller (customer): the organization on whose behalf a user uses the web app and has accepted the Terms of Use.",
      },
      { kind: "p", text: `Processor: ${PROVIDER}` },
      {
        kind: "ol",
        items: [
          "The subject matter is the provision of the Intune Documentation web app. It reads the customer's Microsoft Intune configuration through Microsoft Graph and presents it for documentation.",
          'The agreement is concluded when the customer accepts the Terms of Use and applies for as long as the customer uses the web app. It ends automatically when the customer removes consent for the "Intune Documentation" enterprise application in its tenant and stops using the web app.',
          "This agreement sets out the parties' obligations under Art. 28 GDPR. In data protection matters it takes precedence over other agreements.",
        ],
      },
    ],
  },
  {
    id: "en-2",
    title: "2. Nature, purpose, data and data subjects",
    blocks: [
      {
        kind: "p",
        text: "Nature and purpose: retrieval of the Intune configuration with the signed-in user's delegated, read-only access token. The application server collects, normalizes and redacts the Graph responses in memory and returns them to the browser. PDF and DOCX files are generated in the browser only. The service also keeps pseudonymous usage counters.",
      },
      {
        kind: "table",
        head: ["Data", "Processing", "Storage"],
        rows: [
          [
            "Intune configuration data (policies, profiles, apps, assignments, resolved group names, device counts per platform)",
            "Transient, during the request",
            "Not stored by Ugurlabs",
          ],
          [
            "Personal data contained in configurations (for example names of administrators, groups, contacts)",
            "Transient, during the request",
            "Not stored by Ugurlabs",
          ],
          [
            "Access token (Microsoft Entra ID)",
            "Only for the running Graph request",
            "Not stored by Ugurlabs",
          ],
          [
            "SHA-256 hash of user principal name and tenant ID",
            "Counting monthly active users, recording acceptance of this agreement",
            "Supabase, Frankfurt",
          ],
          [
            "Tenant ID, user hash, request context, timestamp, IP address",
            "Operational and error logs",
            "Vercel hosting logs",
          ],
        ],
      },
      {
        kind: "p",
        text: "Data subjects: the customer's administrators and other users who sign in to the web app, and people whose data is contained in the Intune configuration.",
      },
      {
        kind: "p",
        text: "No special categories of personal data (Art. 9 GDPR) are processed. Secrets such as script bodies, passwords, pre-shared keys and tokens are replaced with [Redacted] before output.",
      },
    ],
  },
  {
    id: "en-3",
    title: "3. Obligations of the processor",
    blocks: [
      {
        kind: "ol",
        items: [
          "Instructions: the processor processes data only on the customer's documented instructions, including transfers to third countries (Art. 28(3)(a) GDPR), unless Union or Member State law requires processing. In that case it informs the customer before processing, unless that law prohibits it. The instructions are this agreement and the customer's use of the web app. If the processor considers an instruction unlawful, it informs the customer without delay and may suspend it until the customer confirms or changes it.",
          "No own purposes: the processor does not use the data for its own purposes, in particular not for advertising, profiling or training AI models.",
          "Confidentiality: everyone with access to the data is bound to confidentiality, also after their work ends.",
          "Security: the processor implements the measures required by Art. 32 GDPR, described in Annex 2. It may develop them further as long as the level of protection does not decrease.",
          "Assistance: the processor assists the customer with data subject requests (Art. 12 to 23 GDPR) and with the obligations under Art. 32 to 36 GDPR as far as it is able to. Requests it receives directly are forwarded without delay. Because no configuration data is stored, this usually concerns only the pseudonymous usage data.",
          "Personal data breaches: the processor notifies the customer's designated contact of a personal data breach without undue delay, at the latest within 24 hours of becoming aware of it, in text form. The notice contains the information under Art. 33(3) GDPR as far as known. The processor notifies supervisory authorities or data subjects only on the customer's instruction.",
          "Records: the processor keeps a record of processing activities under Art. 30(2) GDPR.",
          "Third-party access: if the data is put at risk by seizure, insolvency or requests from authorities, the processor informs the customer without delay where legally permitted.",
          "Contact: Ugur Koc, Managing Director, support@ugurlabs.com. Appointing a data protection officer is not required under Section 38 BDSG.",
        ],
      },
    ],
  },
  {
    id: "en-4",
    title: "4. Subprocessors, third countries, audits and termination",
    blocks: [
      {
        kind: "ol",
        items: [
          "Subprocessors: the customer approves the subprocessors listed in Annex 1. The processor announces new or replaced subprocessors at least 30 days in advance on intunedocumentation.com/subprocessors and by email to everyone who signed up for these notices. The customer may object in text form on data protection grounds within 14 days of the notice. If the parties find no solution, the customer may stop using the web app at no cost. The processor imposes the same data protection obligations on every subprocessor (Art. 28(4) GDPR) and remains liable to the customer for their compliance.",
          "Third countries: Intune configuration data, tokens and pseudonymous usage data are processed in data centers in Frankfurt. Support requests sent through the contact form are the exception: they are processed through Resend in the USA and Cloudflare's global network (Annex 1). All subprocessors are based in the USA, so access from third countries cannot be ruled out. It is covered by certification under the EU-U.S. Data Privacy Framework (Art. 45 GDPR) and additionally by the EU Standard Contractual Clauses (Art. 46(2)(c) GDPR). If the adequacy decision lapses, the Standard Contractual Clauses continue to apply and the processor informs the customer.",
          "Audits: the processor demonstrates compliance primarily through this agreement, Annex 2, the public source code of the web app and the subprocessors' certifications (SOC 2 Type II, ISO 27001). On request it answers one questionnaire from the customer per year. Further audits, including on-site audits, are possible by arrangement with 30 days' notice and at the customer's expense, at most once a year, except where there is a specific reason or a supervisory authority orders one.",
          "Deletion and return: Intune configuration data and tokens are discarded after every request. After the agreement ends, the processor deletes the customer's pseudonymous usage data on request within 30 days, as far as it can be attributed to a tenant, and confirms the deletion in text form. Hosting logs expire according to the hosting provider's retention periods.",
          "Liability: Art. 82 GDPR applies. Between the parties, each is liable according to its share of responsibility for the damage (Art. 82(5) GDPR).",
          "Final provisions: the processor may amend this agreement with 30 days' notice where law, case law or subprocessors require it, without lowering the level of protection. German law applies. Place of jurisdiction is Düsseldorf where legally permitted. The processor has no right of retention over the data (Section 273 BGB). If a provision is invalid, the remainder stays in effect.",
        ],
      },
      {
        kind: "p",
        text: "Conclusion: no signature is required. The agreement is concluded electronically when the customer accepts the Terms of Use (Art. 28(9) GDPR). The current version is available at intunedocumentation.com/dpa and can be saved as a PDF. On request, the processor provides a signed copy.",
      },
    ],
  },
];

// Annex 2, technical and organizational measures (Art. 32 GDPR).
export const TOMS: { area: string; measures: string }[] = [
  {
    area: "Physical access control",
    measures:
      "No data center of our own. Physical security is provided by Vercel and AWS (Supabase), evidenced by SOC 2 Type II and ISO 27001.",
  },
  {
    area: "System access control",
    measures:
      "Users sign in only through Microsoft Entra ID (OAuth 2.0, MSAL), so the customer's Conditional Access and MFA apply. Administrative accounts at Vercel, Supabase and GitHub are protected with MFA.",
  },
  {
    area: "Data access control",
    measures:
      "Only delegated, read-only Graph permissions, no application permissions. The app never sees more than the user's Intune role allows. Every Entra ID token is verified server-side for signature, issuer and audience. Only the Managing Director has access to production systems.",
  },
  {
    area: "Separation",
    measures:
      "Each request is processed in isolation with the requesting user's token. There is no shared store for configuration data. The browser cache is bound to account, tenant and collection options.",
  },
  {
    area: "Pseudonymization",
    measures:
      "Usage counters and DPA acceptance records store only SHA-256 hashes of user principal name and tenant ID, never the plain values.",
  },
  {
    area: "Data minimization and redaction",
    measures:
      "Script bodies, passwords, pre-shared keys, private keys, tokens, QR-code payloads and encoded configuration files are replaced with [Redacted] before display and export.",
  },
  {
    area: "Transfer control",
    measures:
      "Transport only over HTTPS (TLS 1.2 or later). Content Security Policy and security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy). PDF and DOCX files are never uploaded.",
  },
  {
    area: "Storage limitation",
    measures:
      "Graph responses and tokens are held in memory only during the request. The browser snapshot in sessionStorage expires after one hour and is cleared on sign-out. Graph responses and tokens are not written to logs.",
  },
  {
    area: "Input control",
    measures:
      "The service never writes to the tenant. Operational logs with timestamps at Vercel. Code changes only through pull requests with automated tests on GitHub.",
  },
  {
    area: "Availability and resilience",
    measures:
      "Serverless infrastructure at Vercel with automatic scaling. Rate limits on Graph requests and public endpoints. Managed database backups at Supabase. Recovery by redeploying from the Git repository.",
  },
  {
    area: "Review and assessment",
    measures:
      "Public source code (open source). Security policy with a reporting channel for vulnerabilities. Dependencies are kept up to date. These measures are reviewed once a year.",
  },
  {
    area: "Incident management",
    measures:
      "Security incidents are assessed, documented and reported to the customer within 24 hours.",
  },
  {
    area: "Privacy by default",
    measures:
      "Read-only access, no storage of configurations, redaction on by default (Art. 25 GDPR).",
  },
  {
    area: "Processor control",
    measures:
      "Subprocessors only with a data processing agreement and recognized certifications (Annex 1).",
  },
];

// Keyed by tenant too: MSAL tenant profiles of one account share a
// homeAccountId, and each tenant (organization) accepts separately.
export function dpaAcceptanceStorageKey(
  accountId: string,
  tenantId: string,
): string {
  return `intune-doc:dpa-accepted:${DPA_VERSION}:${accountId}:${tenantId}`;
}

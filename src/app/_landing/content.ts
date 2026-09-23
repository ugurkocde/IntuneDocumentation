import {
  DESKTOP_PLANS,
  DESKTOP_TRIAL_DAYS,
  formatDesktopPrice,
} from "~/lib/desktop-app";

export const SAMPLE_REPORT_URL = "/api/pdf/sample";
export const GITHUB_URL = "https://github.com/ugurkocde/IntuneDocumentation";

export const DESKTOP_STARTING_PRICE = formatDesktopPrice(
  DESKTOP_PLANS.pro.price.monthly,
);

// Roles that can grant tenant-wide consent for delegated Microsoft Graph
// permissions (Microsoft Learn: "Grant tenant-wide admin consent").
export const CONSENT_ROLES =
  "a Global Administrator, Privileged Role Administrator, or Cloud Application Administrator";

export const complianceFrameworks = [
  "ISO/IEC 27001:2022",
  "SOC 2",
  "NIST SP 800-53",
  "NIST SP 800-171",
  "NIST CSF 2.0",
  "BSI IT-Grundschutz",
  "Def Stan 05-138",
  "Cyber Essentials",
  "ASD Essential Eight",
];

export const scopeDescriptions: Record<string, string> = {
  "User.Read":
    "Basic profile and sign-in; required by the Microsoft identity platform.",
  "DeviceManagementConfiguration.Read.All":
    "Read Intune device configuration policies and settings.",
  "DeviceManagementApps.Read.All":
    "Read app configuration and app protection policies.",
  "DeviceManagementManagedDevices.Read.All":
    "Read managed device inventory for counts by platform.",
  "DeviceManagementRBAC.Read.All":
    "Read Intune RBAC roles and assignments if referenced.",
  "DeviceManagementServiceConfig.Read.All":
    "Read Intune service configuration information.",
  "DeviceManagementScripts.Read.All":
    "Read script and remediation metadata. Script bodies are redacted before display or export.",
  "Group.Read.All": "Resolve Entra group names in policy assignments.",
  "Policy.Read.All":
    "Read Conditional Access policies to include in the report.",
};

export const faqs: Array<{ question: string; answer: string }> = [
  {
    question: "Do I need admin rights to use it?",
    answer: `The first time anyone in your organization signs in, Microsoft asks for tenant-wide admin consent, because the Intune and group read permissions are admin-consent scopes. It can be approved by ${CONSENT_ROLES}. After that, anyone with read access to Intune can sign in and generate reports, unless your tenant requires user assignment for the app, in which case only assigned users can. What they see is limited by their own Intune role.`,
  },
  {
    question: "Is my Intune data secure?",
    answer:
      "We use Microsoft OAuth 2.0 with delegated, read-only access. The application server processes Graph responses transiently to collect, normalize, and redact sensitive values, but it does not persist your tenant configuration or access token. PDF and DOCX generation happens in your browser, and generated documents are not uploaded or stored by us.",
  },
  {
    question: "Is the Intune Documentation tool really free?",
    answer: `Yes. The web tool is free with no usage limits and no credit card. A separate, paid desktop app is available for teams that want collection to run entirely on their own machines and for MSPs that document many tenants. It starts at ${DESKTOP_STARTING_PRICE} per month with a ${DESKTOP_TRIAL_DAYS} day free trial.`,
  },
  {
    question:
      "Why does Defender flag 'Suspicious application consent for offline access'?",
    answer:
      "This is a common alert when an app requests the standard 'offline_access' permission from Microsoft identity (used to refresh tokens without repeatedly prompting you). It does NOT grant extra data access beyond your approved read-only scopes, and we use only delegated permissions (no application permissions). Tokens are cached in your browser session and are never stored on our server, and we do not store tenant data.",
  },
  {
    question: "What Intune policies can I export?",
    answer:
      "Coverage includes device configurations, Settings Catalog, compliance, security baselines, administrative templates, scripts and remediations, app protection and configuration, managed apps, Windows updates, enrollment and Autopilot, assignment filters, RBAC, tenant and service settings, connectors, and specialist policies. Conditional Access is optional and requested separately with Policy.Read.All.",
  },
  {
    question: "Which compliance frameworks are supported?",
    answer: `Compliance reports map your Intune configuration to ${complianceFrameworks.join(", ")}. Each mapped requirement cites the policy names, settings, values, and assignments used as evidence. Requirements that Intune configuration cannot prove stay explicitly unassessed, so the report is supporting evidence, not a certification.`,
  },
  {
    question: "Are secrets or script bodies included in the report?",
    answer:
      "No. Sensitive values such as script bodies, passwords, tokens, pre-shared keys, QR-code payloads, encoded configuration files, and large app icons are replaced with [Redacted] before data reaches the dashboard or an export. The report retains useful metadata so reviewers can still identify the resource.",
  },
  {
    question: "Can I customize the Intune PDF report?",
    answer:
      "Yes, you can customize your documentation with branding options including company logo, custom colors, headers, footers, and confidentiality notices. You can also select specific configurations to include or exclude from the report.",
  },
  {
    question: "Can I self-host Intune Documentation?",
    answer: `Yes. Intune Documentation is open source under the Elastic License 2.0. The source is at ${GITHUB_URL} and you can self-host it with a single docker compose command and your own Microsoft Entra app registration. Telemetry is disabled by default, and Graph responses are only processed by your own deployment.`,
  },
  {
    question: "What happens if Microsoft Graph cannot return a collection?",
    answer:
      "The dashboard keeps any successfully collected sections and clearly marks partial or failed collections. Warnings include the affected section, endpoint, status code, and a permission hint when available, so a failed request is not presented as a confirmed empty result.",
  },
  {
    question: "Why does the tool use Microsoft Graph beta endpoints?",
    answer:
      "A number of Intune administration resources needed for complete documentation are currently exposed through Microsoft Graph beta. The tool uses those endpoints only for delegated, read-only collection and isolates failures by resource so one unavailable endpoint does not hide the rest of the report.",
  },
  {
    question: "How long does it take to generate Intune documentation?",
    answer:
      "Collection time depends on tenant size, Graph throttling, and the resources available in your environment. The dashboard streams sections as they finish and shows live progress, then lets you export the successfully collected data even when another section reports a warning.",
  },
  {
    question: "What is the Intune Documentation Generator?",
    answer:
      "The Intune Documentation Generator is a free, read-only tool that collects your Microsoft Intune configuration through Microsoft Graph and turns it into a PDF or Word report. It covers the original policy areas plus 35 additional resource collections across updates, scripts and remediations, enrollment and provisioning, apps, assignments and RBAC, tenant settings, connectors, and specialist policies. The exact resources returned depend on your tenant, licensing, and permissions.",
  },
];

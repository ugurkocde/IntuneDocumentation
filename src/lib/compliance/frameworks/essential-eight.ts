import source from "./essential-eight-requirements.json";
import type { FrameworkDefinition } from "../types";

export type EssentialEightMaturityLevel = 1 | 2 | 3;
export function essentialEightLevel(
  value: unknown,
): EssentialEightMaturityLevel {
  if (value === undefined) return 1;
  if (value === 1 || value === 2 || value === 3) return value;
  throw new Error("Essential Eight target maturity level must be 1, 2 or 3");
}

// Exact requirement text from the versioned ASD snapshot. No keyword-based evidence detection.
const bindings: ReadonlyArray<readonly [string, string, string]> = [
  [
    "Application control restricts the execution of executables, software libraries, scripts, installers, compiled HTML, HTML applications and control panel applets to an organisation-approved set.",
    "windows-applocker-rule-collections",
    "AppLocker XML is checked for EXE, DLL, MSI and Script collections and enforcement mode. Compare the allowed rules with the approved inventory; compiled HTML, HTML applications, control-panel applets, alternate control engines and device blocking need separate verification.",
  ],
  [
    "Microsoft Office macros digitally signed by signatures other than V3 signatures cannot be enabled via the Message Bar or Backstage View.",
    "windows-office-v3-signatures",
    "Policy requires V3 signatures; publisher trust, signing processes and effective Office coverage require verification.",
  ],
  [
    "Microsoft Office macros are disabled for users that do not have a demonstrated business requirement.",
    "windows-office-macros-disabled",
    "Review business exceptions, assigned users and coverage of every Office application; only the detected settings are evidenced.",
  ],
  [
    "Microsoft Office macros are disabled for users that do not have a demonstrated business requirement.",
    "macos-office-macros-disabled",
    "Review macOS profile coverage, business exceptions and installed Office applications.",
  ],
  [
    "Microsoft Office macros in files originating from the internet are blocked.",
    "windows-office-internet-macros-blocked",
    "Evidence covers only the Office applications listed. Trusted Locations, bypasses and effective user coverage require verification.",
  ],
  [
    "Microsoft Office macro antivirus scanning is enabled.",
    "windows-office-macro-antivirus",
    "Policy enables runtime scanning. Scanner health, signatures and actual macro scanning require device or security telemetry.",
  ],
  [
    "Microsoft Office macro security settings cannot be changed by users.",
    "windows-office-macro-settings-managed",
    "The detected settings are enforced through policy. Review all other Trust Center settings, exceptions and effective user permissions.",
  ],
  [
    "Only Microsoft Office macros running from within a sandboxed environment, a Trusted Location or that are digitally signed by a trusted publisher are allowed to execute.",
    "windows-office-signed-macros",
    "Signed-macro policy is supporting evidence only. Review publisher trust, Trusted Locations, sandboxing and actual Office application coverage.",
  ],
  [
    "Internet Explorer 11 is disabled or removed.",
    "windows-ie-disabled",
    "The standalone browser is disabled by policy; removal, IE mode, COM activation and effective device state require review.",
  ],
  [
    "Web browsers do not process Java from the internet.",
    "windows-browser-java-blocked",
    "The detector checks the specified Internet Explorer zone policies. Other browsers, plugins and effective enforcement require review; JavaScript is not Java.",
  ],
  [
    "Web browsers do not process web advertisements from the internet.",
    "windows-browser-intrusive-ads-blocked",
    "Intrusive-ad blocking is only partial evidence. Blocking all advertisements, every browser and extension enforcement require separate verification.",
  ],
  [
    "Web browsers do not process web advertisements from the internet.",
    "macos-browser-intrusive-ads-blocked",
    "Intrusive-ad blocking is partial evidence only. Review full advertisement filtering and all browser coverage.",
  ],
  [
    "Web browser security settings cannot be changed by users.",
    "windows-browser-security-settings-managed",
    "Detected restrictions are mandatory policy settings. Other settings, browsers and effective user permissions need review.",
  ],
  [
    "PowerShell module logging, script block logging and transcription events are centrally logged.",
    "windows-powershell-scriptblock-logging",
    "Local script block logging supports this requirement. Module logging, forwarding, central ingestion and retention require log-platform evidence.",
  ],
  [
    "PowerShell module logging, script block logging and transcription events are centrally logged.",
    "windows-powershell-transcription",
    "Transcription policy supports local logging only. Module logging, forwarding and actual central collection require verification.",
  ],
  [
    "Multi-factor authentication uses either: something users have and something users know, or something users have that is unlocked by something users know or are.",
    "tenant-mfa-required",
    "An enforced MFA grant or authentication strength is supporting configuration evidence. Verify actual factors, exclusions and user/service coverage.",
  ],
  [
    "Multi-factor authentication is used to authenticate users to third-party online services that process, store or communicate their organisation’s sensitive data.",
    "tenant-mfa-all-apps",
    "The policy requires MFA for all Entra-integrated cloud apps in its user scope. Service inventory, privileged-user coverage, exclusions, non-Entra services and effective sign-ins require verification.",
  ],
  [
    "Multi-factor authentication (where available) is used to authenticate users to third-party online services that process, store or communicate their organisation’s non-sensitive data.",
    "tenant-mfa-all-apps",
    "The policy requires MFA for all Entra-integrated cloud apps in its user scope. Service inventory, privileged-user coverage, exclusions, non-Entra services and effective sign-ins require verification.",
  ],
  [
    "Multi-factor authentication is used to authenticate users of data repositories.",
    "tenant-mfa-all-apps",
    "The policy requires MFA for all Entra-integrated cloud apps in its user scope. Service inventory, privileged-user coverage, exclusions, non-Entra services and effective sign-ins require verification.",
  ],
  [
    "Multi-factor authentication is used to authenticate privileged users of systems.",
    "tenant-mfa-all-apps",
    "The policy requires MFA for all Entra-integrated cloud apps in its user scope. Service inventory, privileged-user coverage, exclusions, non-Entra services and effective sign-ins require verification.",
  ],
  [
    "Multi-factor authentication is used to authenticate unprivileged users of systems.",
    "tenant-mfa-all-apps",
    "The policy requires MFA for all Entra-integrated cloud apps in its user scope. Service inventory, privileged-user coverage, exclusions, non-Entra services and effective sign-ins require verification.",
  ],
  [
    "Multi-factor authentication used for authenticating users of online services is phishing-resistant.",
    "tenant-phishing-resistant-mfa",
    "A phishing-resistant strength is required for the policy targets. Confirm coverage of the named service category, users, exclusions and actual sign-ins.",
  ],
  [
    "Multi-factor authentication used for authenticating users of data repositories is phishing-resistant.",
    "tenant-phishing-resistant-mfa",
    "A phishing-resistant strength is required for the policy targets. Confirm coverage of the named service category, users, exclusions and actual sign-ins.",
  ],
  [
    "Multi-factor authentication used for authenticating users of systems is phishing-resistant.",
    "tenant-phishing-resistant-mfa",
    "A phishing-resistant strength is required for the policy targets. Confirm coverage of the named service category, users, exclusions and actual sign-ins.",
  ],

  [
    "Application control is implemented on workstations.",
    "windows-application-control",
    "Approved executables, rule coverage, exceptions and actual workstation enforcement require verification.",
  ],
  [
    "Patches, updates or other vendor mitigations for vulnerabilities in operating systems of workstations, non-internet-facing servers and non-internet-facing network devices are applied within one month of release.",
    "windows-quality-update-deadline",
    "Windows update settings support scheduling only. Release-to-install timing, vulnerability scans, servers and network devices are unassessed.",
  ],
  [
    "Patches, updates or other vendor mitigations for vulnerabilities in operating systems of workstations, non-internet-facing servers and non-internet-facing network devices are applied within one month of release when vulnerabilities are assessed as non-critical by vendors and no working exploits exist.",
    "windows-quality-update-deadline",
    "A Windows update deadline does not verify installation or vulnerability classification. Critical and exploited vulnerabilities have separate requirements; servers and network devices are unassessed.",
  ],
  [
    "Multi-factor authentication is used to authenticate users to their organisation’s online services that process, store or communicate their organisation’s sensitive data.",
    "tenant-mfa-required",
    "Conditional Access configuration does not establish coverage of every service, actual authentication, exclusions or phishing resistance. Review those separately.",
  ],
  [
    "Memory integrity functionality is enabled.",
    "windows-memory-integrity",
    "An assigned compliance requirement does not prove HVCI is enabled on devices. Device attestation and effective coverage require review.",
  ],
  [
    "Credential Guard functionality is enabled.",
    "windows-credential-guard",
    "Device activation, hardware prerequisites and effective coverage require verification. This does not establish Remote Credential Guard or LSA protection.",
  ],
  [
    "Microsoft Office macros are blocked from making Win32 API calls.",
    "windows-office-macro-win32-block",
    "ASR exclusions, software coverage and effective device enforcement require verification. This does not prove all macro restrictions.",
  ],
  [
    "Microsoft Office is blocked from creating child processes.",
    "windows-office-child-process-block",
    "ASR exclusions and effective device enforcement require verification.",
  ],
  [
    "Microsoft Office is blocked from creating executable content.",
    "windows-office-executable-block",
    "ASR exclusions and effective device enforcement require verification.",
  ],
  [
    "Microsoft Office is blocked from injecting code into other processes.",
    "windows-office-injection-block",
    "ASR exclusions and effective device enforcement require verification.",
  ],
  [
    "PDF software is blocked from creating child processes.",
    "windows-adobe-child-process-block",
    "The detector covers Adobe Reader only. Other PDF software, exclusions and effective enforcement remain unassessed.",
  ],
];

function externalEvidenceNeeded(strategy: string, requirement: string): string {
  if (strategy === "Regular backups") {
    if (requirement.includes("tested"))
      return "Requires backup restoration test reports showing a successful restore to a common point in time. Intune policy exports contain no backup recovery results.";
    if (/access|modifying|deleting/.test(requirement))
      return "Requires backup-platform access rules, account roles, immutable-storage settings and effective access tests. These are not present in the collected Intune or Conditional Access policies.";
    return "Requires backup-job configuration and execution records, retention settings and recovery-point evidence from the backup platform. Intune configuration does not report backup completion or recoverability.";
  }
  if (
    strategy === "Patch applications" ||
    strategy === "Patch operating systems"
  ) {
    if (/scanner|scanning|discovery/.test(requirement))
      return "Requires asset inventory, vulnerability-scanner configuration, database-update status and timestamped scan results. This export collects management policies, not vulnerability-management telemetry.";
    if (requirement.includes("no longer supported"))
      return "Requires installed product/version inventory and vendor support-lifecycle data. A minimum-version policy cannot establish that every installed product is supported.";
    return "Requires per-device patch installation records, vendor release dates and vulnerability severity/exploit data to verify the stated deadline. Deployment policy configuration alone does not establish installation time.";
  }
  if (strategy === "Restrict administrative privileges")
    return "Requires privileged-account and device classifications, access approvals and effective sign-in/authorization evidence. Policy assignments alone do not identify every privileged environment or prove separation of duties.";
  if (strategy === "Multi-factor authentication")
    return "Requires the named customer/service identity configuration, service inventory and actual authentication evidence. Collected workforce Conditional Access policies cannot establish coverage of external customer identity systems or unrelated services.";
  if (strategy === "Application control")
    return "Requires the deployed application-control rule set, approved application inventory, rule-path/type coverage and enforcement tests. A policy that enables application control does not establish this rule-level requirement.";
  if (strategy === "Restrict Microsoft Office macros")
    return "Requires trusted-publisher certificates, macro-signing/review records, Trusted Location permissions or signature-version evidence for this requirement. Basic macro-block policies do not establish those details.";
  return "Requires the specific device state, application settings or operational evidence described in this requirement. The collected management-policy fields do not establish those facts; review device results and the relevant application/security platform.";
}

export function essentialEightFramework(
  target: EssentialEightMaturityLevel = 1,
): FrameworkDefinition {
  const level = essentialEightLevel(target);
  const requirements = source.requirements.filter((row) => row.level === level);
  const mappings: Record<string, string[]> = {};
  const controls = Object.fromEntries(
    requirements.map((row) => {
      const matchedBindings = bindings.filter(
        ([requirement]) => requirement === row.requirement,
      );
      for (const binding of matchedBindings)
        (mappings[binding[1]] ??= []).push(row.id);
      const platforms = [
        ...new Set(
          matchedBindings.map((binding) =>
            binding[1].startsWith("windows-")
              ? ("windows" as const)
              : binding[1].startsWith("macos-")
                ? ("macos" as const)
                : ("tenant" as const),
          ),
        ),
      ];
      return [
        row.id,
        {
          id: row.id,
          title: row.strategy,
          summary: row.requirement,
          tier: `Target Maturity Level ${level}`,
          granularity: "requirement" as const,
          evidenceStrength: "supporting" as const,
          ...(platforms.length ? { platforms } : {}),
          unassessedAspects: matchedBindings.length
            ? [...new Set(matchedBindings.map((binding) => binding[2]))]
            : [externalEvidenceNeeded(row.strategy, row.requirement)],
        },
      ];
    }),
  );
  return {
    id: "essential-eight",
    name: "ASD Essential Eight",
    version: `November 2023; target Maturity Level ${level}`,
    totalRequirements: requirements.length,
    note: `Evidence against target Maturity Level ${level}; no achieved maturity level is calculated. All eight strategies are included. Local ML identifiers identify rows within the published appendix and are not official ISM control IDs. ${source.attribution} Licence: ${source.license} Configuration evidence does not prove implementation effectiveness, patch installation, backup recovery or operational processes. The model targets enterprise IT; mobile and operational technology coverage must be assessed separately.`,
    source: { url: source.source, verifiedAt: source.verifiedAt },
    controls,
    mappings,
  };
}

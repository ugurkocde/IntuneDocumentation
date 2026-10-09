import type { FrameworkDefinition } from "../types";

// The HIPAA Security Rule (45 CFR Part 164, Subpart C) is US federal
// regulation and in the public domain (17 U.S.C. 105). Titles are the official
// standard and implementation specification names; summaries are original.
// Reviewed against the eCFR text (last amended 2013, 78 FR 5694) and the key
// activities and sample questions in NIST SP 800-66 Rev. 2 on 2026-10-09.
// Tier follows Appendix A to Subpart C: "Required" for standards without
// implementation specifications, "Addressable" for addressable specifications
// and "Standard" for standards whose specifications are not mapped here.
// Patching, host firewalls and Office or browser hardening have no HIPAA
// counterpart in SP 800-66 Rev. 2 and stay unmapped. Encryption maps to
// 164.310(c) and 164.312(a)(2)(iv), not to 164.310(d)(1), whose key activities
// cover disposal, re-use, accountability and backup. The January 2025 proposed
// rule (RIN 0945-AA22) is not final and is not reflected.
export const HIPAA_SECURITY_RULE: FrameworkDefinition = {
  id: "hipaa-security-rule",
  name: "HIPAA Security Rule",
  version: "45 CFR Part 164, Subpart C",
  totalRequirements: 54,
  note: "Selected standards and implementation specifications from Appendix A to 45 CFR Part 164, Subpart C (18 standards and 36 implementation specifications). These mappings provide supporting Intune configuration evidence for safeguards on managed endpoints, not a HIPAA risk analysis or a complete assessment. Administrative and physical safeguards, ePHI scope and the documented decision for each addressable specification require separate review. The proposed rule of January 2025 is not final and is not reflected.",
  source: {
    url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C",
    verifiedAt: "2026-10-09",
  },
  controls: {
    "164.308(a)(5)(ii)(B)": {
      id: "164.308(a)(5)(ii)(B)",
      title: "Protection from Malicious Software",
      summary:
        "Antimalware requirements, real-time protection and scheduled scans support guarding against and detecting malicious software on managed devices.",
      tier: "Addressable",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "This specification sits under security awareness and training. Workforce training, procedures for reporting malicious software and the documented decision for this addressable specification require separate assessment.",
      ],
    },
    "164.308(a)(5)(ii)(D)": {
      id: "164.308(a)(5)(ii)(D)",
      title: "Password Management",
      summary:
        "Windows LAPS management supports safeguarding local administrator passwords on managed devices.",
      tier: "Addressable",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Procedures and workforce training for creating, changing and safeguarding passwords, and the documented decision for this addressable specification, require separate assessment.",
      ],
    },
    "164.310(b)": {
      id: "164.310(b)",
      title: "Workstation Use",
      summary:
        "Application control and app source restrictions support limiting the software that runs on workstations that access ePHI.",
      tier: "Required",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Policies on the functions performed at each workstation, the manner of use and the physical surroundings of workstations that access ePHI are unassessed.",
      ],
    },
    "164.310(c)": {
      id: "164.310(c)",
      title: "Workstation Security",
      summary:
        "Device encryption and unlock credentials support restricting access to workstations that access ePHI to authorized users.",
      tier: "Required",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Physical safeguards, workstation location, screen lock timing and the inventory of workstations that access ePHI require separate assessment.",
      ],
    },
    "164.312(a)(1)": {
      id: "164.312(a)(1)",
      title: "Access Control",
      summary:
        "Conditional Access that requires a compliant device and managed app data transfer restrictions support limiting ePHI access to granted devices and apps.",
      tier: "Standard",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Access rights granted under 164.308(a)(4), unique user identification, emergency access procedures, automatic logoff and the scope of systems that maintain ePHI are unassessed.",
      ],
    },
    "164.312(a)(2)(iv)": {
      id: "164.312(a)(2)(iv)",
      title: "Encryption and Decryption",
      summary:
        "Disk and storage encryption requirements provide evidence for encrypting ePHI at rest on managed devices.",
      tier: "Addressable",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Effective encryption state on each device, key management, encryption of ePHI on servers and removable media, and the documented decision for this addressable specification are unassessed.",
      ],
    },
    "164.312(b)": {
      id: "164.312(b)",
      title: "Audit Controls",
      summary:
        "Process creation auditing and PowerShell logging provide evidence that activity on managed Windows devices is recorded.",
      tier: "Required",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Audit logging in systems that contain or use ePHI, log collection, retention and the regular examination of recorded activity require separate assessment.",
      ],
    },
    "164.312(c)(1)": {
      id: "164.312(c)(1)",
      title: "Integrity",
      summary:
        "Real-time antimalware and behavior monitoring support protection against ransomware, and platform integrity requirements indirectly support protection against improper alteration of data.",
      tier: "Standard",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Platform integrity settings protect the operating system, not ePHI itself. Mechanisms to authenticate ePHI under 164.312(c)(2), backups and integrity of ePHI in applications and databases are unassessed.",
      ],
    },
    "164.312(d)": {
      id: "164.312(d)",
      title: "Person or Entity Authentication",
      summary:
        "Conditional Access MFA requirements and device unlock credentials support verifying the identity of users who seek access to ePHI.",
      tier: "Required",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "MFA coverage of every user and application that accesses ePHI, exclusions, credential strength and authentication in systems outside Microsoft Entra ID are unassessed.",
      ],
    },
  },
  mappings: {
    "windows-lsa-protection": [],
    "windows-remote-credential-guard": [],
    "windows-laps-management": ["164.308(a)(5)(ii)(D)"],
    "windows-process-creation-logging": ["164.312(b)"],
    "windows-powershell-module-logging": ["164.312(b)"],

    "windows-applocker-rule-collections": ["164.310(b)"],
    "windows-office-v3-signatures": [],
    "windows-office-macros-disabled": [],
    "windows-office-internet-macros-blocked": [],
    "windows-office-macro-antivirus": ["164.308(a)(5)(ii)(B)"],
    "windows-office-signed-macros": [],
    "macos-office-macros-disabled": [],
    "windows-office-macro-settings-managed": [],
    "windows-ie-disabled": [],
    "windows-browser-java-blocked": [],
    "windows-browser-intrusive-ads-blocked": [],
    "macos-browser-intrusive-ads-blocked": [],
    "windows-browser-security-settings-managed": [],
    "tenant-mfa-all-apps": ["164.312(d)"],
    "tenant-phishing-resistant-mfa": ["164.312(d)"],
    "windows-powershell-scriptblock-logging": ["164.312(b)"],
    "windows-powershell-transcription": ["164.312(b)"],

    "windows-office-macro-win32-block": [],
    "windows-office-child-process-block": [],
    "windows-office-executable-block": [],
    "windows-office-injection-block": [],
    "windows-adobe-child-process-block": [],

    "windows-disk-encryption": ["164.310(c)", "164.312(a)(2)(iv)"],
    "macos-disk-encryption": ["164.310(c)", "164.312(a)(2)(iv)"],
    "android-storage-encryption": ["164.310(c)", "164.312(a)(2)(iv)"],
    "windows-realtime-antimalware": ["164.308(a)(5)(ii)(B)", "164.312(c)(1)"],
    "windows-antivirus-required": ["164.308(a)(5)(ii)(B)"],
    "windows-periodic-antimalware-scan": ["164.308(a)(5)(ii)(B)"],
    "windows-behavior-monitoring": ["164.308(a)(5)(ii)(B)", "164.312(c)(1)"],
    "windows-network-inspection": ["164.308(a)(5)(ii)(B)"],
    "windows-firewall": [],
    "macos-firewall": [],
    "windows-password-required": ["164.310(c)", "164.312(d)"],
    "macos-password-required": ["164.310(c)", "164.312(d)"],
    "ios-passcode-required": ["164.310(c)", "164.312(d)"],
    "android-password-required": ["164.310(c)", "164.312(d)"],
    "tenant-mfa-required": ["164.312(d)"],
    "windows-automatic-updates": [],
    "windows-quality-update-deadline": [],
    "windows-minimum-os-version": [],
    "macos-minimum-os-version": [],
    "ios-minimum-os-version": [],
    "android-minimum-os-version": [],
    "windows-secure-boot": ["164.312(c)(1)"],
    "windows-code-integrity": ["164.312(c)(1)"],
    "windows-memory-integrity": ["164.312(c)(1)"],
    "windows-virtualization-security": ["164.312(c)(1)"],
    "windows-credential-guard": [],
    "windows-credential-theft-protection": [],
    "macos-system-integrity": ["164.312(c)(1)"],
    "ios-jailbreak-block": ["164.312(c)(1)"],
    "android-device-integrity": ["164.312(c)(1)"],
    "windows-telemetry-minimized": [],
    "windows-cortana-disabled": [],
    "windows-microsoft-account-blocked": [],
    "windows-application-control": ["164.310(b)"],
    "tenant-compliant-device-required": ["164.312(a)(1)"],
    "macos-gatekeeper": ["164.310(b)"],
    "android-app-source-restriction": ["164.310(b)"],
    "ios-app-data-transfer": ["164.312(a)(1)"],
    "android-app-data-transfer": ["164.312(a)(1)"],
  },
};

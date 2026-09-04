import type { FrameworkDefinition } from "../types";

// NIST SP 800-171 is published by the US government and is in the public
// domain. Revision 2 is used because CMMC 2.0 Level 2 (32 CFR 170.14) and
// DFARS 252.204-7012 reference that revision. Revision 2 requirements carry
// no titles, so short titles and summaries are original descriptions written
// for this device-management evidence mapping.
// Firewall activation does not establish default-deny traffic rules (3.13.6).
// App-source restrictions support user-installed software controls (3.4.9),
// not executable allow/block lists (3.4.8).
export const NIST_800_171: FrameworkDefinition = {
  id: "nist-800-171-r2",
  name: "NIST SP 800-171",
  version: "Rev. 2 (CMMC 2.0 Level 2)",
  totalRequirements: 110,
  note: "Supporting device-management evidence for selected NIST SP 800-171 Revision 2 requirements, the revision incorporated into CMMC 2.0 Level 2. Requirements without technical Intune evidence are not assessed. This report is not a complete CMMC assessment or an SPRS score.",
  source: {
    url: "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171r2.pdf",
    verifiedAt: "2026-09-04",
  },
  controls: {
    "3.1.19": {
      id: "3.1.19",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Encrypt CUI on mobile devices",
      summary:
        "Storage on laptops and mobile devices that may hold controlled unclassified information is encrypted.",
    },
    "3.4.1": {
      id: "3.4.1",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Baseline configurations",
      summary:
        "Baseline hardening settings are established and enforced on managed devices.",
    },
    "3.4.2": {
      id: "3.4.2",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Security configuration settings",
      summary:
        "Platform integrity protections are enforced as part of the security configuration.",
    },
    "3.4.6": {
      id: "3.4.6",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Least functionality",
      summary:
        "Non-essential functions and data collection are restricted on managed devices.",
    },
    "3.4.9": {
      id: "3.4.9",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "User-installed software restrictions",
      summary:
        "Software installation is restricted to trusted sources on managed platforms.",
    },
    "3.5.2": {
      id: "3.5.2",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Authenticate users and devices",
      summary:
        "A credential is required before a user can access a managed device.",
    },
    "3.13.1": {
      id: "3.13.1",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Boundary protection",
      summary:
        "Host firewalls monitor and control communications at the device boundary.",
    },
    "3.13.16": {
      id: "3.13.16",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Protect CUI at rest",
      summary:
        "Information stored on managed devices is protected through enforced encryption.",
    },
    "3.14.1": {
      id: "3.14.1",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Flaw remediation",
      summary:
        "Operating system flaws are remediated through automatic updates and enforced minimum versions.",
    },
    "3.14.2": {
      id: "3.14.2",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Malicious code protection",
      summary: "Anti-malware protection is enforced on managed endpoints.",
    },
    "3.14.5": {
      id: "3.14.5",
      evidenceStrength: "supporting",
      unassessedAspects: [
        "Actual periodic scan execution, files from external sources and scan exclusions are unassessed.",
      ],
      granularity: "requirement",
      title: "Real-time and periodic scanning",
      summary:
        "Real-time protection and periodic scans are configured on managed endpoints; scan execution is assessed separately.",
    },
  },
  mappings: {
    "windows-network-inspection": [],
    "windows-virtualization-security": [],
    "windows-credential-theft-protection": [],
    "tenant-compliant-device-required": [],
    "ios-app-data-transfer": [],
    "android-app-data-transfer": [],

    "windows-antivirus-required": ["3.14.2"],
    "windows-periodic-antimalware-scan": ["3.14.5"],
    "windows-quality-update-deadline": ["3.14.1"],
    "windows-application-control": ["3.4.9"],
    "windows-behavior-monitoring": ["3.14.2"],
    "windows-memory-integrity": ["3.4.2"],
    "windows-credential-guard": ["3.5.2"],
    "tenant-mfa-required": ["3.5.2"],

    "windows-disk-encryption": ["3.1.19", "3.13.16"],
    "macos-disk-encryption": ["3.1.19", "3.13.16"],
    "android-storage-encryption": ["3.1.19", "3.13.16"],
    "windows-realtime-antimalware": ["3.14.2", "3.14.5"],
    "windows-firewall": ["3.13.1"],
    "macos-firewall": ["3.13.1"],
    "windows-password-required": ["3.5.2"],
    "macos-password-required": ["3.5.2"],
    "ios-passcode-required": ["3.5.2"],
    "android-password-required": ["3.5.2"],
    "windows-automatic-updates": ["3.14.1"],
    "windows-minimum-os-version": ["3.14.1"],
    "macos-minimum-os-version": ["3.14.1"],
    "ios-minimum-os-version": ["3.14.1"],
    "android-minimum-os-version": ["3.14.1"],
    "windows-secure-boot": ["3.4.2"],
    "windows-code-integrity": ["3.4.2"],
    "macos-system-integrity": ["3.4.2"],
    "windows-telemetry-minimized": ["3.4.1", "3.4.6"],
    "windows-cortana-disabled": ["3.4.1", "3.4.6"],
    "windows-microsoft-account-blocked": ["3.4.1"],
    "ios-jailbreak-block": ["3.4.2"],
    "android-device-integrity": ["3.4.2"],
    "macos-gatekeeper": ["3.4.9"],
    "android-app-source-restriction": ["3.4.9"],
  },
};

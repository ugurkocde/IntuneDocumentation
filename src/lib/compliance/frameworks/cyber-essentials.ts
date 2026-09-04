import type { FrameworkDefinition } from "../types";

// The NCSC "Cyber Essentials: Requirements for IT infrastructure" document is
// Crown copyright, published under the Open Government Licence v3.0. It has no
// control identifiers, so the five control themes are used as identifiers.
// Summaries are original descriptions written for this device-management
// evidence mapping. The Cyber Essentials logo is not part of the licence and
// evidence here never indicates certification.
export const CYBER_ESSENTIALS: FrameworkDefinition = {
  id: "cyber-essentials-v3",
  name: "NCSC Cyber Essentials",
  version: "Requirements for IT infrastructure v3.3 (April 2026)",
  note: "Device-management evidence for the five Cyber Essentials control themes. Contains public sector information licensed under the Open Government Licence v3.0. Evidence here does not indicate Cyber Essentials certification.",
  source: {
    url: "https://www.ncsc.gov.uk/sites/default/files/documents/cyber-essentials-requirements-for-it-infrastructure-v3-3.pdf",
    verifiedAt: "2026-09-04",
  },
  controls: {
    Firewalls: {
      id: "Firewalls",
      evidenceStrength: "supporting",
      unassessedAspects: [
        "Network boundaries, allowed traffic, default-deny rules and effective device coverage require review.",
      ],
      granularity: "theme",
      title: "Firewalls",
      summary:
        "Every in-scope device is protected by a firewall that blocks unauthenticated inbound connections by default.",
    },
    "Secure configuration": {
      id: "Secure configuration",
      evidenceStrength: "supporting",
      granularity: "theme",
      title: "Secure configuration",
      summary:
        "Devices are configured to reduce unnecessary functionality, keep platform integrity and require a credential to unlock.",
    },
    "Security update management": {
      id: "Security update management",
      evidenceStrength: "supporting",
      unassessedAspects: [
        "Actual release-to-install timing, supported software and application updates are unassessed. A configured version floor does not prove support.",
      ],
      granularity: "theme",
      title: "Security update management",
      summary:
        "Software is supported and updated automatically, with minimum operating system versions enforced.",
    },
    "User access control": {
      id: "User access control",
      evidenceStrength: "supporting",
      unassessedAspects: [
        "MFA coverage for all in-scope cloud services, exclusions, account approvals, privileges and account removal require review.",
      ],
      granularity: "theme",
      title: "User access control",
      summary:
        "Users authenticate with a credential before gaining access to devices and the data on them.",
    },
    "Malware protection": {
      id: "Malware protection",
      evidenceStrength: "supporting",
      unassessedAspects: [
        "Protection effectiveness, signature currency, scan exclusions and approved application lists require review.",
      ],
      granularity: "theme",
      title: "Malware protection",
      summary:
        "Anti-malware protection is active on in-scope devices, or application installation is restricted to trusted sources.",
    },
  },
  mappings: {
    "windows-behavior-monitoring": [],
    "windows-network-inspection": [],
    "windows-memory-integrity": [],
    "windows-virtualization-security": [],
    "windows-credential-guard": [],
    "windows-credential-theft-protection": [],
    "tenant-compliant-device-required": [],
    "ios-app-data-transfer": [],
    "android-app-data-transfer": [],

    "windows-antivirus-required": ["Malware protection"],
    "windows-periodic-antimalware-scan": ["Malware protection"],
    "windows-quality-update-deadline": ["Security update management"],
    "windows-application-control": ["Malware protection"],
    "tenant-mfa-required": ["User access control"],

    // Cyber Essentials does not require encryption of data at rest.
    "windows-disk-encryption": [],
    "macos-disk-encryption": [],
    "android-storage-encryption": [],
    "windows-realtime-antimalware": ["Malware protection"],
    "windows-firewall": ["Firewalls"],
    "macos-firewall": ["Firewalls"],
    "windows-password-required": [
      "Secure configuration",
      "User access control",
    ],
    "macos-password-required": ["Secure configuration", "User access control"],
    "ios-passcode-required": ["Secure configuration", "User access control"],
    "android-password-required": [
      "Secure configuration",
      "User access control",
    ],
    "windows-automatic-updates": ["Security update management"],
    "windows-minimum-os-version": ["Security update management"],
    "macos-minimum-os-version": ["Security update management"],
    "ios-minimum-os-version": ["Security update management"],
    "android-minimum-os-version": ["Security update management"],
    "windows-secure-boot": ["Secure configuration"],
    "windows-code-integrity": ["Secure configuration"],
    "macos-system-integrity": ["Secure configuration"],
    "windows-telemetry-minimized": ["Secure configuration"],
    "windows-cortana-disabled": ["Secure configuration"],
    "windows-microsoft-account-blocked": ["Secure configuration"],
    "ios-jailbreak-block": ["Secure configuration"],
    "android-device-integrity": ["Secure configuration"],
    "macos-gatekeeper": ["Malware protection"],
    "android-app-source-restriction": ["Malware protection"],
  },
};

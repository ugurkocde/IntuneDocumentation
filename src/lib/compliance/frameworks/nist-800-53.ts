import type { FrameworkDefinition } from "../types";

// NIST SP 800-53 is published by the US government and is in the public domain.
export const NIST_800_53: FrameworkDefinition = {
  id: "nist-800-53-r5",
  name: "NIST SP 800-53",
  version: "Revision 5",
  note: "Device-management evidence for a subset of technical controls. Organizational and procedural aspects of each control are out of scope for an Intune tenant export.",
  source: {
    url: "https://doi.org/10.6028/NIST.SP.800-53r5",
    verifiedAt: "2026-09-04",
  },
  controls: {
    "SC-28": {
      id: "SC-28",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Protection of Information at Rest",
      summary:
        "Protect the confidentiality and integrity of information stored on devices, typically through encryption at rest.",
    },
    "SI-3": {
      id: "SI-3",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Malicious Code Protection",
      summary:
        "Employ malicious code protection mechanisms at system entry and exit points and keep them current.",
    },
    "SC-7": {
      id: "SC-7",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Boundary Protection",
      summary:
        "Monitor and control communications at managed interfaces, including host-based firewall protections.",
    },
    "IA-5": {
      id: "IA-5",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Authenticator Management",
      summary:
        "Manage system authenticators, including requiring and maintaining device unlock credentials.",
    },
    "SI-2": {
      id: "SI-2",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Flaw Remediation",
      summary:
        "Identify, report, and correct system flaws, including timely installation of security-relevant updates.",
    },
    "AC-2": {
      id: "AC-2",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Account Management",
      summary:
        "Manage system accounts, including restricting sign-in to organization-managed identities.",
    },
    "CM-6": {
      id: "CM-6",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Configuration Settings",
      summary:
        "Establish and enforce secure configuration settings, including restricting data flows to external providers.",
    },
    "CM-7": {
      id: "CM-7",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Least Functionality",
      summary:
        "Configure systems to provide only essential capabilities and disable functions that are not required.",
    },
    "CM-11": {
      id: "CM-11",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "User-Installed Software",
      summary:
        "Govern and restrict the installation of software by users, including blocking untrusted installation sources.",
    },
    "SI-7": {
      id: "SI-7",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Software, Firmware, and Information Integrity",
      summary:
        "Employ integrity verification for software, firmware, and boot processes, and respond to integrity violations.",
    },
  },
  mappings: {
    "tenant-mfa-required": [],
    "tenant-compliant-device-required": [],
    "ios-app-data-transfer": [],
    "android-app-data-transfer": [],

    "windows-antivirus-required": ["SI-3"],
    "windows-periodic-antimalware-scan": ["SI-3"],
    "windows-quality-update-deadline": ["SI-2"],
    "windows-application-control": ["CM-11"],
    "windows-behavior-monitoring": ["SI-3"],
    "windows-network-inspection": ["SI-3"],
    "windows-memory-integrity": ["SI-7"],
    "windows-virtualization-security": ["SI-7"],
    "windows-credential-guard": ["IA-5"],
    "windows-credential-theft-protection": ["IA-5"],

    "windows-disk-encryption": ["SC-28"],
    "macos-disk-encryption": ["SC-28"],
    "android-storage-encryption": ["SC-28"],
    "windows-realtime-antimalware": ["SI-3"],
    "windows-telemetry-minimized": ["CM-6"],
    "windows-cortana-disabled": ["CM-7"],
    "windows-microsoft-account-blocked": ["AC-2"],
    "macos-gatekeeper": ["CM-11"],
    "windows-firewall": ["SC-7"],
    "macos-firewall": ["SC-7"],
    "windows-password-required": ["IA-5"],
    "macos-password-required": ["IA-5"],
    "ios-passcode-required": ["IA-5"],
    "android-password-required": ["IA-5"],
    "windows-automatic-updates": ["SI-2"],
    "windows-minimum-os-version": ["SI-2"],
    "macos-minimum-os-version": ["SI-2"],
    "ios-minimum-os-version": ["SI-2"],
    "android-minimum-os-version": ["SI-2"],
    "android-app-source-restriction": ["CM-11"],
    "windows-secure-boot": ["SI-7"],
    "windows-code-integrity": ["SI-7"],
    "macos-system-integrity": ["SI-7"],
    "ios-jailbreak-block": ["SI-7"],
    "android-device-integrity": ["SI-7"],
  },
};

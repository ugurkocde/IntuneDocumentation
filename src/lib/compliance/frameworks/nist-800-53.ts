import type { FrameworkDefinition } from "../types";

// NIST SP 800-53 is published by the US government and is in the public domain.
export const NIST_800_53: FrameworkDefinition = {
  id: "nist-800-53-r5",
  name: "NIST SP 800-53",
  version: "Revision 5",
  note: "Device-management evidence for a subset of technical controls. Organizational and procedural aspects of each control are out of scope for an Intune tenant export.",
  controls: {
    "SC-28": {
      id: "SC-28",
      title: "Protection of Information at Rest",
      summary:
        "Protect the confidentiality and integrity of information stored on devices, typically through encryption at rest.",
    },
    "SI-3": {
      id: "SI-3",
      title: "Malicious Code Protection",
      summary:
        "Employ malicious code protection mechanisms at system entry and exit points and keep them current.",
    },
    "SC-7": {
      id: "SC-7",
      title: "Boundary Protection",
      summary:
        "Monitor and control communications at managed interfaces, including host-based firewall protections.",
    },
    "IA-5": {
      id: "IA-5",
      title: "Authenticator Management",
      summary:
        "Manage system authenticators, including requiring and maintaining device unlock credentials.",
    },
    "SI-2": {
      id: "SI-2",
      title: "Flaw Remediation",
      summary:
        "Identify, report, and correct system flaws, including timely installation of security-relevant updates.",
    },
    "AC-2": {
      id: "AC-2",
      title: "Account Management",
      summary:
        "Manage system accounts, including restricting sign-in to organization-managed identities.",
    },
    "CM-6": {
      id: "CM-6",
      title: "Configuration Settings",
      summary:
        "Establish and enforce secure configuration settings, including restricting data flows to external providers.",
    },
    "CM-7": {
      id: "CM-7",
      title: "Least Functionality",
      summary:
        "Configure systems to provide only essential capabilities and disable functions that are not required.",
    },
    "CM-11": {
      id: "CM-11",
      title: "User-Installed Software",
      summary:
        "Govern and restrict the installation of software by users, including blocking untrusted installation sources.",
    },
    "SI-7": {
      id: "SI-7",
      title: "Software, Firmware, and Information Integrity",
      summary:
        "Employ integrity verification for software, firmware, and boot processes, and respond to integrity violations.",
    },
  },
  mappings: {
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

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
  version: "Requirements for IT infrastructure v3.2/v3.3",
  note: "Device-management evidence for the five Cyber Essentials control themes. Contains public sector information licensed under the Open Government Licence v3.0. Evidence here does not indicate Cyber Essentials certification.",
  controls: {
    Firewalls: {
      id: "Firewalls",
      title: "Firewalls",
      summary:
        "Every in-scope device is protected by a firewall that blocks unauthenticated inbound connections by default.",
    },
    "Secure configuration": {
      id: "Secure configuration",
      title: "Secure configuration",
      summary:
        "Devices are configured to reduce unnecessary functionality, keep platform integrity and require a credential to unlock.",
    },
    "Security update management": {
      id: "Security update management",
      title: "Security update management",
      summary:
        "Software is supported and updated automatically, with minimum operating system versions enforced.",
    },
    "User access control": {
      id: "User access control",
      title: "User access control",
      summary:
        "Users authenticate with a credential before gaining access to devices and the data on them.",
    },
    "Malware protection": {
      id: "Malware protection",
      title: "Malware protection",
      summary:
        "Anti-malware protection is active on in-scope devices, or application installation is restricted to trusted sources.",
    },
  },
  mappings: {
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

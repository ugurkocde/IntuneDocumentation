import type { FrameworkDefinition } from "../types";

// ISO/IEC 27001 is referenced by control number only. Titles and summaries are
// original descriptions written for this device-management evidence mapping.
export const ISO_27001: FrameworkDefinition = {
  id: "iso-27001-2022",
  name: "ISO/IEC 27001",
  version: "2022, Annex A",
  note: "Device-management evidence for selected technological (Annex A clause 8) controls, referenced by control number with original summaries. Organizational, people, and physical controls are out of scope for an Intune tenant export.",
  controls: {
    "8.1": {
      id: "8.1",
      title: "User endpoint devices",
      summary:
        "Endpoint devices that handle organizational information are secured through managed protections.",
    },
    "8.5": {
      id: "8.5",
      title: "Secure authentication",
      summary:
        "Authentication is required before users can access managed devices, including through device-unlock controls.",
    },
    "8.7": {
      id: "8.7",
      title: "Protection against malware",
      summary:
        "Antimalware protections are implemented and maintained on managed endpoints.",
    },
    "8.8": {
      id: "8.8",
      title: "Technical vulnerability management",
      summary:
        "Technical vulnerabilities are addressed through timely operating system updates and enforced minimum versions.",
    },
    "8.9": {
      id: "8.9",
      title: "Configuration management",
      summary:
        "Secure device configurations are defined and enforced across managed platforms.",
    },
    "8.19": {
      id: "8.19",
      title: "Software installation control",
      summary:
        "Software installation on managed systems is limited to approved sources and trusted applications.",
    },
    "8.20": {
      id: "8.20",
      title: "Network security",
      summary:
        "Managed device network connections are protected with enforced host firewall controls.",
    },
    "8.24": {
      id: "8.24",
      title: "Use of cryptography",
      summary:
        "Cryptographic safeguards protect information stored on managed devices.",
    },
  },
  mappings: {
    "windows-disk-encryption": ["8.1", "8.24"],
    "macos-disk-encryption": ["8.1", "8.24"],
    "android-storage-encryption": ["8.1", "8.24"],
    "windows-realtime-antimalware": ["8.7"],
    "windows-firewall": ["8.20"],
    "macos-firewall": ["8.20"],
    "windows-password-required": ["8.5"],
    "macos-password-required": ["8.5"],
    "ios-passcode-required": ["8.5"],
    "android-password-required": ["8.5"],
    "windows-automatic-updates": ["8.8"],
    "windows-minimum-os-version": ["8.8"],
    "macos-minimum-os-version": ["8.8"],
    "ios-minimum-os-version": ["8.8"],
    "android-minimum-os-version": ["8.8"],
    "windows-secure-boot": ["8.9"],
    "windows-code-integrity": ["8.9"],
    "macos-system-integrity": ["8.9"],
    "windows-telemetry-minimized": ["8.9"],
    "windows-cortana-disabled": ["8.9"],
    "windows-microsoft-account-blocked": ["8.9"],
    "ios-jailbreak-block": ["8.1", "8.9"],
    "android-device-integrity": ["8.1", "8.9"],
    "macos-gatekeeper": ["8.19"],
    "android-app-source-restriction": ["8.19"],
  },
};

import type { FrameworkDefinition } from "../types";

// Def Stan 05-138 Issue 4 (14 May 2024) is Crown copyright and marked
// "Copying Only as Agreed with DStan". Controls are referenced by their
// four-digit identifier only; titles and summaries are original descriptions
// written for this device-management evidence mapping. The tier records the
// Cyber Risk Profile levels (Level 0 to Level 3) at which the control applies.
// Only controls with technical Intune evidence are listed; governance,
// personnel, physical and incident-response controls are intentionally absent.
// Also omitted until dedicated detectors exist: credential quality (2213),
// executable allow lists (2409), and default-deny traffic rules (2429, 2507).
// Password presence, app-source restrictions and firewall activation do not
// demonstrate those controls.

/** Control family labels keyed by the first two digits of the control id. */
export const DEF_STAN_FAMILIES: Readonly<Record<string, string>> = {
  "22": "Accounts, identities and access (22xx)",
  "23": "Protecting stored and transmitted data (23xx)",
  "24": "Hardening and system protection (24xx)",
  "25": "Network and service resilience (25xx)",
  "31": "Monitoring for security events (31xx)",
  "32": "Finding threats proactively (32xx)",
};

export const DEF_STAN_05_138: FrameworkDefinition = {
  id: "def-stan-05-138-i4",
  name: "UK MOD Def Stan 05-138",
  version: "Issue 4",
  note: "Device-management evidence for selected Objective B controls of Def Stan 05-138 Issue 4, referenced by control identifier with original summaries and the Cyber Risk Profile levels at which each applies. Cyber Essentials certification (control 0001) is required at every level and cannot be evidenced from device configuration.",
  source: {
    url: "https://www.gov.uk/government/publications/cyber-security-for-defence-suppliers-def-stan-05-138-issue-4",
    verifiedAt: "2026-09-04",
  },
  controls: {
    "2202": {
      id: "2202",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Trusted managed devices",
      summary:
        "Devices that access the network are known and trusted through integrity checks on managed platforms.",
      tier: "Level 2 to Level 3",
      riskLevels: [2, 3],
    },
    "2309": {
      id: "2309",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Data on mobile devices",
      summary:
        "Information held on mobile devices is protected through enforced storage encryption and device unlock credentials.",
      tier: "Level 2 to Level 3",
      riskLevels: [2, 3],
    },
    "2317": {
      id: "2317",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Full disk encryption on endpoints",
      summary: "Full disk encryption is enforced on managed endpoints.",
      tier: "Level 1 to Level 3",
      riskLevels: [1, 2, 3],
    },
    "2322": {
      id: "2322",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Mobile device management",
      summary:
        "Mobile devices that access organisational data are configured and controlled through the management platform.",
      tier: "Level 1 to Level 3",
      riskLevels: [1, 2, 3],
    },
    "2401": {
      id: "2401",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Platform integrity protections",
      summary:
        "Platform integrity protections such as Secure Boot, code integrity and System Integrity Protection are enforced.",
      tier: "Level 1 to Level 3",
      riskLevels: [1, 2, 3],
    },
    "2405": {
      id: "2405",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Operating system update enforcement",
      summary:
        "Operating system updates are applied automatically and minimum supported versions are enforced.",
      tier: "Level 1 to Level 3",
      riskLevels: [1, 2, 3],
    },
    "2418": {
      id: "2418",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Managed hardening baselines",
      summary:
        "Hardening settings that reduce unnecessary functionality are applied through managed baselines.",
      tier: "Level 1 to Level 3",
      riskLevels: [1, 2, 3],
    },
    "2426": {
      id: "2426",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Real-time anti-malware protection",
      summary:
        "Real-time anti-malware protection is enforced on managed endpoints.",
      tier: "Level 1 to Level 3",
      riskLevels: [1, 2, 3],
    },
  },
  mappings: {
    "windows-antivirus-required": [],
    "windows-periodic-antimalware-scan": [],
    "windows-quality-update-deadline": [],
    "windows-application-control": [],
    "windows-behavior-monitoring": [],
    "windows-network-inspection": [],
    "windows-virtualization-security": [],
    "windows-credential-guard": [],
    "windows-credential-theft-protection": [],
    "tenant-mfa-required": [],
    "ios-app-data-transfer": [],
    "android-app-data-transfer": [],

    "tenant-compliant-device-required": ["2202"],
    "windows-memory-integrity": ["2202"],

    "windows-disk-encryption": ["2317"],
    "macos-disk-encryption": ["2317"],
    "android-storage-encryption": ["2317", "2309"],
    "windows-realtime-antimalware": ["2426"],
    "windows-firewall": [],
    "macos-firewall": [],
    "windows-password-required": [],
    "macos-password-required": [],
    "ios-passcode-required": ["2309", "2322"],
    "android-password-required": ["2322"],
    "windows-automatic-updates": ["2405"],
    "windows-minimum-os-version": ["2405"],
    "macos-minimum-os-version": ["2405"],
    "ios-minimum-os-version": ["2405", "2322"],
    "android-minimum-os-version": ["2405", "2322"],
    "windows-secure-boot": ["2202", "2401"],
    "windows-code-integrity": ["2202", "2401"],
    "macos-system-integrity": ["2202", "2401"],
    "windows-telemetry-minimized": ["2418"],
    "windows-cortana-disabled": ["2418"],
    "windows-microsoft-account-blocked": ["2418"],
    "ios-jailbreak-block": ["2202", "2322"],
    "android-device-integrity": ["2202", "2322"],
    "macos-gatekeeper": [],
    "android-app-source-restriction": ["2322"],
  },
};

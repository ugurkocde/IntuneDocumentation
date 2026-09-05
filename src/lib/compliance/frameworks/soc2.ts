import type { FrameworkDefinition } from "../types";

// The AICPA Trust Services Criteria are referenced by criterion ID only.
// Titles and summaries are original descriptions written for this mapping.
export const SOC_2: FrameworkDefinition = {
  id: "soc2-tsc",
  name: "SOC 2",
  version: "Trust Services Criteria",
  note: "Device-management evidence for selected Common Criteria, referenced by criterion ID with original summaries. A SOC 2 examination covers far more than device configuration; this mapping supports evidence collection only.",
  source: {
    url: "https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022",
    verifiedAt: "2026-09-04",
  },
  controls: {
    "CC6.1": {
      id: "CC6.1",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Logical access controls",
      summary:
        "Managed systems use logical access measures, including device authentication and encryption of stored data.",
    },
    "CC6.6": {
      id: "CC6.6",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Protection against external threats",
      summary:
        "Boundary protections, including host firewalls, defend managed devices against external threats.",
    },
    "CC6.7": {
      id: "CC6.7",
      evidenceStrength: "supporting",
      unassessedAspects: [
        "Data classification, all transfer channels, managed app scope and data-loss prevention effectiveness are unassessed.",
      ],
      granularity: "requirement",
      title: "Restricted data movement",
      summary:
        "Information movement and transmission are limited by controls that reduce external data sharing.",
    },
    "CC6.8": {
      id: "CC6.8",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Unauthorized software prevention",
      summary:
        "Controls prevent or detect unauthorized and malicious software on managed devices.",
    },
    "CC7.1": {
      id: "CC7.1",
      evidenceStrength: "supporting",
      unassessedAspects: [
        "Actual vulnerability findings, detection events, alert handling and remediation outcomes are unassessed.",
      ],
      granularity: "requirement",
      title: "Vulnerability and configuration monitoring",
      summary:
        "Managed endpoint configurations and software versions are monitored and maintained to address vulnerabilities.",
    },
  },
  mappings: {
    "windows-memory-integrity": [],
    "windows-virtualization-security": [],
    "windows-credential-guard": [],
    "windows-credential-theft-protection": [],

    "windows-antivirus-required": ["CC6.8"],
    "windows-periodic-antimalware-scan": ["CC6.8"],
    "windows-quality-update-deadline": ["CC7.1"],
    "windows-application-control": ["CC6.8"],
    "windows-behavior-monitoring": ["CC7.1"],
    "windows-network-inspection": ["CC7.1"],
    "tenant-mfa-required": ["CC6.1"],
    "tenant-compliant-device-required": ["CC6.1"],
    "ios-app-data-transfer": ["CC6.7"],
    "android-app-data-transfer": ["CC6.7"],

    "windows-disk-encryption": ["CC6.1"],
    "macos-disk-encryption": ["CC6.1"],
    "android-storage-encryption": ["CC6.1"],
    "windows-password-required": ["CC6.1"],
    "macos-password-required": ["CC6.1"],
    "ios-passcode-required": ["CC6.1"],
    "android-password-required": ["CC6.1"],
    "windows-microsoft-account-blocked": ["CC6.1"],
    "windows-firewall": ["CC6.6"],
    "macos-firewall": ["CC6.6"],
    "windows-telemetry-minimized": ["CC6.7"],
    "windows-realtime-antimalware": ["CC6.8"],
    "macos-gatekeeper": ["CC6.8"],
    "android-app-source-restriction": ["CC6.8"],
    "windows-cortana-disabled": ["CC6.8"],
    "ios-jailbreak-block": ["CC6.8"],
    "android-device-integrity": ["CC6.8"],
    "windows-secure-boot": ["CC6.8"],
    "windows-code-integrity": ["CC6.8"],
    "macos-system-integrity": ["CC6.8"],
    "windows-automatic-updates": ["CC7.1"],
    "windows-minimum-os-version": ["CC7.1"],
    "macos-minimum-os-version": ["CC7.1"],
    "ios-minimum-os-version": ["CC7.1"],
    "android-minimum-os-version": ["CC7.1"],
  },
};

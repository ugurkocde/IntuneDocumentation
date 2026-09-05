import type { FrameworkDefinition } from "../types";

// The NIST Cybersecurity Framework is published by the US government and is in
// the public domain. Subcategory ids follow CSF 2.0 (February 2024).
export const NIST_CSF: FrameworkDefinition = {
  id: "nist-csf-2",
  name: "NIST Cybersecurity Framework",
  version: "2.0",
  note: "Device-management evidence for a subset of Protect and Detect subcategories. Governance, process, and organizational aspects are out of scope for an Intune tenant export.",
  source: {
    url: "https://doi.org/10.6028/NIST.CSWP.29",
    verifiedAt: "2026-09-04",
  },
  controls: {
    "PR.DS-01": {
      id: "PR.DS-01",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Data-at-rest is protected",
      summary:
        "The confidentiality, integrity, and availability of data at rest are protected, typically through device and storage encryption.",
    },
    "PR.AA-01": {
      id: "PR.AA-01",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Identities and credentials are managed",
      summary:
        "Identities and credentials for authorized users, services, and hardware are managed, including device unlock credentials.",
    },
    "PR.AA-03": {
      id: "PR.AA-03",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Users, services, and hardware are authenticated",
      summary:
        "Access to devices requires authentication, such as a required password, PIN, or passcode.",
    },
    "PR.PS-01": {
      id: "PR.PS-01",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Configuration management practices are applied",
      summary:
        "Platforms are managed with secure configuration baselines, including platform and boot integrity requirements.",
    },
    "PR.PS-02": {
      id: "PR.PS-02",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Software is maintained commensurate with risk",
      summary:
        "Operating systems and software are kept current through managed updates and minimum version requirements.",
    },
    "PR.PS-05": {
      id: "PR.PS-05",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Unauthorized software is prevented",
      summary:
        "Installation and execution of unauthorized software are prevented, including blocking untrusted app sources.",
    },
    "PR.IR-01": {
      id: "PR.IR-01",
      evidenceStrength: "supporting",
      granularity: "requirement",
      title: "Networks and environments are protected",
      summary:
        "Networks and environments are protected from unauthorized logical access, including host-based firewalls.",
    },
    "DE.CM-09": {
      id: "DE.CM-09",
      evidenceStrength: "supporting",
      unassessedAspects: [
        "Actual detection events, monitoring coverage and response processes are unassessed.",
      ],
      granularity: "requirement",
      title: "Computing hardware and software are monitored",
      summary:
        "Endpoints and their runtime environments are monitored for potentially adverse events, including malware.",
    },
  },
  mappings: {
    "windows-credential-guard": [],
    "windows-credential-theft-protection": [],
    "ios-app-data-transfer": [],
    "android-app-data-transfer": [],

    "windows-antivirus-required": ["DE.CM-09"],
    "windows-periodic-antimalware-scan": ["DE.CM-09"],
    "windows-quality-update-deadline": ["PR.PS-02"],
    "windows-application-control": ["PR.PS-05"],
    "windows-behavior-monitoring": ["DE.CM-09"],
    "windows-network-inspection": ["DE.CM-09"],
    "windows-memory-integrity": ["PR.PS-01"],
    "windows-virtualization-security": ["PR.PS-01"],
    "tenant-mfa-required": ["PR.AA-03"],
    "tenant-compliant-device-required": ["PR.AA-03"],

    "windows-disk-encryption": ["PR.DS-01"],
    "macos-disk-encryption": ["PR.DS-01"],
    "android-storage-encryption": ["PR.DS-01"],
    "windows-realtime-antimalware": ["DE.CM-09"],
    "windows-telemetry-minimized": ["PR.PS-01"],
    "windows-cortana-disabled": ["PR.PS-01"],
    "windows-microsoft-account-blocked": ["PR.AA-01"],
    "macos-gatekeeper": ["PR.PS-05"],
    "windows-firewall": ["PR.IR-01"],
    "macos-firewall": ["PR.IR-01"],
    "windows-password-required": ["PR.AA-01", "PR.AA-03"],
    "macos-password-required": ["PR.AA-01", "PR.AA-03"],
    "ios-passcode-required": ["PR.AA-01", "PR.AA-03"],
    "android-password-required": ["PR.AA-01", "PR.AA-03"],
    "windows-automatic-updates": ["PR.PS-02"],
    "windows-minimum-os-version": ["PR.PS-02"],
    "macos-minimum-os-version": ["PR.PS-02"],
    "ios-minimum-os-version": ["PR.PS-02"],
    "android-minimum-os-version": ["PR.PS-02"],
    "android-app-source-restriction": ["PR.PS-05"],
    "windows-secure-boot": ["PR.PS-01"],
    "windows-code-integrity": ["PR.PS-01"],
    "macos-system-integrity": ["PR.PS-01"],
    "ios-jailbreak-block": ["PR.PS-01"],
    "android-device-integrity": ["PR.PS-01"],
  },
};

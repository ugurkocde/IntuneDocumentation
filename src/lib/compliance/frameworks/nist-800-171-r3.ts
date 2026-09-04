import type { FrameworkDefinition } from "../types";

// Independently reviewed against NIST SP 800-171r3 (May 2024), section 3.
// This is not a renumbered Rev. 2 mapping. Withdrawn requirements are omitted:
// 03.01.19 -> 03.01.18; 03.13.16 -> 03.13.08; 03.14.05 -> 03.14.02.
// App-source restrictions alone do not establish 03.04.08 allow-by-exception.
// Organization-defined parameters and effective device state remain unassessed.
export const NIST_800_171_R3: FrameworkDefinition = {
  id: "nist-800-171-r3",
  name: "NIST SP 800-171",
  version: "Rev. 3 (May 2024)",
  totalRequirements: 97,
  note: "Selected technical requirements from NIST SP 800-171 Revision 3. These mappings provide supporting Intune configuration evidence, not a complete assessment. Organization-defined parameters, CUI scope and operational evidence require separate review. For CMMC Level 2 assessments, select Revision 2.",
  source: {
    url: "https://csrc.nist.gov/pubs/sp/800/171/r3/final",
    verifiedAt: "2026-09-05",
  },
  controls: {
    "03.01.18": {
      id: "03.01.18",
      title: "Access Control for Mobile Devices",
      summary:
        "Managed-device encryption and restrictions can support the protection of CUI on mobile endpoints.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Mobile-device authorization, connection approval, CUI scope and effective encryption require separate assessment.",
      ],
    },
    "03.04.01": {
      id: "03.04.01",
      title: "Baseline Configuration",
      summary:
        "Documented hardening settings provide evidence of a device configuration baseline.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Approved baseline completeness, change control and the organization-defined review frequency are unassessed.",
      ],
    },
    "03.04.02": {
      id: "03.04.02",
      title: "Configuration Settings",
      summary:
        "Platform integrity and hardening settings support the implementation of security configuration requirements.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Organization-defined configuration settings, operational requirements and approval of deviations need separate review.",
      ],
    },
    "03.04.06": {
      id: "03.04.06",
      title: "Least Functionality",
      summary:
        "Restrictions on optional endpoint features provide supporting evidence for reducing unnecessary functionality.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Mission-essential functions, prohibited ports and services, periodic reviews and actual removal of unnecessary components are unassessed.",
      ],
    },
    "03.04.08": {
      id: "03.04.08",
      title: "Authorized Software: Allow by Exception",
      summary:
        "Application control in enforcement mode provides supporting evidence for restricting executable software.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "The approved software list, deny-all coverage, policy exceptions and organization-defined list review frequency require separate assessment.",
      ],
    },
    "03.05.01": {
      id: "03.05.01",
      title: "User Identification and Authentication",
      summary:
        "Endpoint credential requirements support user authentication before device access.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Unique user identification, attribution of processes and organization-defined re-authentication circumstances are unassessed.",
      ],
    },
    "03.05.03": {
      id: "03.05.03",
      title: "Multi-Factor Authentication",
      summary:
        "Enabled Conditional Access policies that require MFA provide evidence for the users and applications they target.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "MFA coverage of all privileged and non-privileged accounts, exclusions, non-cloud access and effective sign-ins are unassessed.",
      ],
    },
    "03.13.01": {
      id: "03.13.01",
      title: "Boundary Protection",
      summary:
        "Host firewall configuration supports endpoint communication controls.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Network boundary architecture, managed interfaces, public-system separation and communication monitoring require separate assessment.",
      ],
    },
    "03.13.08": {
      id: "03.13.08",
      title: "Transmission and Storage Confidentiality",
      summary:
        "Device storage encryption provides evidence for the storage portion of CUI confidentiality protection.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Encryption during transmission, cryptographic suitability, key management and actual protection of all CUI storage are unassessed.",
      ],
    },
    "03.14.01": {
      id: "03.14.01",
      title: "Flaw Remediation",
      summary:
        "Update policies provide supporting evidence for operating-system flaw remediation.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Flaw identification and reporting, firmware and application updates, actual installation dates and the organization-defined remediation period are unassessed. A 14-day configuration does not establish that the required period is met.",
      ],
    },
    "03.14.02": {
      id: "03.14.02",
      title: "Malicious Code Protection",
      summary:
        "Antimalware requirements, real-time protection and scheduled scans provide supporting endpoint protection evidence.",
      evidenceStrength: "supporting",
      granularity: "requirement",
      unassessedAspects: [
        "Protection updates, organization-defined scan frequency, scan execution, external-file coverage and block or quarantine responses require separate assessment.",
      ],
    },
  },
  mappings: {
    "windows-disk-encryption": ["03.01.18", "03.13.08"],
    "macos-disk-encryption": ["03.01.18", "03.13.08"],
    "android-storage-encryption": ["03.01.18", "03.13.08"],
    "windows-realtime-antimalware": ["03.14.02"],
    "windows-antivirus-required": ["03.14.02"],
    "windows-periodic-antimalware-scan": ["03.14.02"],
    "windows-behavior-monitoring": ["03.14.02"],
    "windows-firewall": ["03.13.01"],
    "macos-firewall": ["03.13.01"],
    "windows-password-required": ["03.05.01"],
    "macos-password-required": ["03.05.01"],
    "ios-passcode-required": ["03.05.01"],
    "android-password-required": ["03.05.01"],
    "tenant-mfa-required": ["03.05.03"],
    "windows-automatic-updates": ["03.14.01"],
    "windows-quality-update-deadline": ["03.14.01"],
    "windows-minimum-os-version": ["03.14.01"],
    "macos-minimum-os-version": ["03.14.01"],
    "ios-minimum-os-version": ["03.14.01"],
    "android-minimum-os-version": ["03.14.01"],
    "windows-secure-boot": ["03.04.02"],
    "windows-code-integrity": ["03.04.02"],
    "windows-memory-integrity": ["03.04.02"],
    "windows-virtualization-security": ["03.04.02"],
    "windows-credential-guard": ["03.04.02"],
    "windows-credential-theft-protection": ["03.04.02"],
    "macos-system-integrity": ["03.04.02"],
    "ios-jailbreak-block": ["03.04.02"],
    "android-device-integrity": ["03.04.02"],
    "windows-telemetry-minimized": ["03.04.01", "03.04.06"],
    "windows-cortana-disabled": ["03.04.01", "03.04.06"],
    "windows-microsoft-account-blocked": ["03.04.01"],
    "windows-application-control": ["03.04.08"],
    "windows-network-inspection": [],
    "tenant-compliant-device-required": [],
    "macos-gatekeeper": [],
    "android-app-source-restriction": [],
    "ios-app-data-transfer": [],
    "android-app-data-transfer": [],
  },
};

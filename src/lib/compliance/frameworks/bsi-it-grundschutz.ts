import type { FrameworkDefinition } from "../types";

// The BSI IT-Grundschutz-Kompendium is published freely by the German Federal
// Office for Information Security. The client Bausteine SYS.2.2.3, SYS.2.4,
// SYS.3.2.1 and SYS.3.2.2 are mapped at requirement level, verified against
// the Edition 2023 Baustein texts; only requirements with technical Intune
// evidence are listed (organizational requirements such as SYS.3.2.2.A1 are
// out of scope for a tenant export). The remaining Bausteine are mapped at
// Baustein level until their requirement-level mappings are verified the same
// way.
export const BSI_IT_GRUNDSCHUTZ: FrameworkDefinition = {
  id: "bsi-it-grundschutz",
  name: "BSI IT-Grundschutz",
  version: "Kompendium Edition 2023",
  note: "Client Bausteine (SYS.2.2.3, SYS.2.4, SYS.3.2.1, SYS.3.2.2) are mapped at requirement level; other Bausteine at building-block level. Only requirements with technical device-management evidence are listed. Organizational requirements must be assessed separately.",
  controls: {
    "CON.1": {
      id: "CON.1",
      title: "Kryptokonzept",
      summary:
        "Cryptographic protection of stored data, including full-disk and device encryption.",
    },
    "OPS.1.1.3": {
      id: "OPS.1.1.3",
      title: "Patch- und Änderungsmanagement",
      summary:
        "Managed, timely installation of patches and updates across managed systems.",
    },
    "OPS.1.1.4": {
      id: "OPS.1.1.4",
      title: "Schutz vor Schadprogrammen",
      summary: "Protection of endpoints against malware with current tooling.",
    },
    "ORP.4": {
      id: "ORP.4",
      title: "Identitäts- und Berechtigungsmanagement",
      summary:
        "Management of identities and access, including device unlock credentials.",
    },
    "NET.3.2": {
      id: "NET.3.2",
      title: "Firewall",
      summary:
        "Firewall protection controlling network traffic to and from systems.",
    },
    "SYS.2.1": {
      id: "SYS.2.1",
      title: "Allgemeiner Client",
      summary:
        "General security requirements for all client systems regardless of operating system.",
    },
    "SYS.2.2.3.A4": {
      id: "SYS.2.2.3.A4",
      title: "Telemetrie und Datenschutzeinstellungen unter Windows",
      tier: "Basis-Anforderung",
      summary:
        "The transfer of diagnostic and usage data to Microsoft must be reduced as far as possible; telemetry level 0 (Security) must be configured.",
    },
    "SYS.2.2.3.A5": {
      id: "SYS.2.2.3.A5",
      title: "Schutz vor Schadsoftware unter Windows",
      tier: "Basis-Anforderung",
      summary:
        "A dedicated component protecting Windows clients against malware must be in place unless equivalent measures exist.",
    },
    "SYS.2.2.3.A6": {
      id: "SYS.2.2.3.A6",
      title: "Integration von Online-Konten in das Betriebssystem",
      tier: "Basis-Anforderung",
      summary:
        "Sign-in must use directory-service accounts; consumer online accounts such as Microsoft accounts must not be used.",
    },
    "SYS.2.2.3.A14": {
      id: "SYS.2.2.3.A14",
      title: "Einsatz des Sprachassistenten Cortana",
      tier: "Standard-Anforderung",
      summary: "Cortana should be disabled on managed Windows clients.",
    },
    "SYS.2.2.3.A23": {
      id: "SYS.2.2.3.A23",
      title: "Erweiterter Schutz der Anmeldeinformationen unter Windows",
      tier: "Anforderung bei erhöhtem Schutzbedarf",
      summary:
        "On UEFI-based systems Secure Boot should be used and boot integrity monitored.",
    },
    "SYS.2.4.A2": {
      id: "SYS.2.4.A2",
      title: "Nutzung der integrierten Sicherheitsfunktionen von macOS",
      tier: "Basis-Anforderung",
      summary:
        "System Integrity Protection, XProtect, and Gatekeeper must be active; Gatekeeper may only allow signed applications.",
    },
    "SYS.2.4.A4": {
      id: "SYS.2.4.A4",
      title: "Verwendung einer Festplattenverschlüsselung",
      tier: "Standard-Anforderung",
      summary:
        "macOS disks, especially on mobile Macs, should be encrypted with FileVault.",
    },
    "SYS.2.4.A6": {
      id: "SYS.2.4.A6",
      title: "Verwendung aktueller Mac-Hardware",
      tier: "Standard-Anforderung",
      summary:
        "Macs should run OS versions still supplied with security updates by Apple. Enforcing minimum OS versions provides partial technical evidence.",
    },
    "SYS.2.4.A10": {
      id: "SYS.2.4.A10",
      title: "Aktivierung der Personal Firewall unter macOS",
      tier: "Standard-Anforderung",
      summary:
        "The built-in macOS personal firewall should be enabled and configured appropriately.",
    },
    "SYS.3.2.1.A4": {
      id: "SYS.3.2.1.A4",
      title: "Verwendung eines Zugriffsschutzes",
      tier: "Basis-Anforderung",
      summary:
        "Smartphones and tablets must be protected with an adequately complex device lock code and an automatic screen lock.",
    },
    "SYS.3.2.1.A5": {
      id: "SYS.3.2.1.A5",
      title: "Updates von Betriebssystem und Apps",
      tier: "Basis-Anforderung",
      summary:
        "Mobile operating systems and apps must receive security updates; devices without updates must be replaced. Enforcing minimum OS versions provides partial technical evidence.",
    },
    "SYS.3.2.1.A8": {
      id: "SYS.3.2.1.A8",
      title: "Installation von Apps",
      tier: "Basis-Anforderung",
      summary:
        "App installation must be restricted to approved sources; installation from unapproved sources must be prevented.",
    },
    "SYS.3.2.1.A11": {
      id: "SYS.3.2.1.A11",
      title: "Verschlüsselung des Speichers",
      tier: "Standard-Anforderung",
      summary:
        "The non-volatile storage of mobile devices should be encrypted.",
    },
    "SYS.3.2.2.A2": {
      id: "SYS.3.2.2.A2",
      title: "Festlegung erlaubter mobiler Endgeräte",
      tier: "Basis-Anforderung",
      summary:
        "Only approved devices and operating systems may access organizational information. Enforcing minimum OS versions provides partial technical evidence.",
    },
    "SYS.3.2.2.A17": {
      id: "SYS.3.2.2.A17",
      title: "Kontrolle der Nutzung von mobilen Endgeräten",
      tier: "Anforderung bei erhöhtem Schutzbedarf",
      summary:
        "Device usage should be monitored against defined criteria; jailbreaks and rooted devices in particular should be detected.",
    },
    "SYS.3.2.2.A23": {
      id: "SYS.3.2.2.A23",
      title: "Durchsetzung von Compliance-Anforderungen",
      tier: "Anforderung bei erhöhtem Schutzbedarf",
      summary:
        "Violations of organizational rules and OS manipulation should be detected and answered with automatic actions such as blocking access.",
    },
  },
  mappings: {
    "windows-disk-encryption": ["CON.1", "SYS.2.1"],
    "macos-disk-encryption": ["CON.1", "SYS.2.4.A4"],
    "android-storage-encryption": ["CON.1", "SYS.3.2.1.A11"],
    "windows-realtime-antimalware": ["OPS.1.1.4", "SYS.2.2.3.A5"],
    "windows-telemetry-minimized": ["SYS.2.2.3.A4"],
    "windows-cortana-disabled": ["SYS.2.2.3.A14"],
    "windows-microsoft-account-blocked": ["SYS.2.2.3.A6"],
    "windows-firewall": ["NET.3.2", "SYS.2.1"],
    "macos-firewall": ["NET.3.2", "SYS.2.4.A10"],
    "windows-password-required": ["ORP.4", "SYS.2.1"],
    "macos-password-required": ["ORP.4", "SYS.2.1"],
    "ios-passcode-required": ["ORP.4", "SYS.3.2.1.A4"],
    "android-password-required": ["ORP.4", "SYS.3.2.1.A4"],
    "windows-automatic-updates": ["OPS.1.1.3", "SYS.2.1"],
    "windows-minimum-os-version": ["OPS.1.1.3"],
    "macos-minimum-os-version": ["OPS.1.1.3", "SYS.2.4.A6"],
    "ios-minimum-os-version": ["OPS.1.1.3", "SYS.3.2.1.A5", "SYS.3.2.2.A2"],
    "android-minimum-os-version": ["OPS.1.1.3", "SYS.3.2.1.A5", "SYS.3.2.2.A2"],
    "android-app-source-restriction": ["SYS.3.2.1.A8"],
    "windows-secure-boot": ["SYS.2.2.3.A23"],
    "windows-code-integrity": ["SYS.2.2.3.A23"],
    "macos-system-integrity": ["SYS.2.4.A2"],
    "macos-gatekeeper": ["SYS.2.4.A2"],
    "ios-jailbreak-block": ["SYS.3.2.2.A17", "SYS.3.2.2.A23"],
    "android-device-integrity": ["SYS.3.2.2.A17", "SYS.3.2.2.A23"],
  },
};

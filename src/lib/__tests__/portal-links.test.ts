import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCompliance, COMPLIANCE_CAPABILITIES } from "../compliance";
import {
  PORTAL_AREAS,
  portalAreaFor,
  portalUrlFor,
} from "../compliance/management/portal-links";
import type { ComplianceCapability } from "../compliance/types";

const ALLOWED_HOSTS = ["intune.microsoft.com", "entra.microsoft.com"];

function emptyExportData(): DetailedExportData {
  return {
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    appProtectionPolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
  };
}

/** Capability ids listed by assessed controls of every registered framework. */
function mappedCapabilityIds(): Set<string> {
  const ids = new Set<string>();
  for (const level of [1, 2, 3] as const)
    for (const framework of assessCompliance(emptyExportData(), {
      essentialEightMaturityLevel: level,
    }).frameworks)
      for (const control of framework.controls)
        for (const id of control.capabilityIds) ids.add(id);
  return ids;
}

function byId(id: string): ComplianceCapability {
  const capability = COMPLIANCE_CAPABILITIES.find((item) => item.id === id);
  if (!capability) throw new Error(`unknown capability ${id}`);
  return capability;
}

describe("portal links", () => {
  it("uses https on the Intune or Entra admin center for every area", () => {
    for (const area of Object.values(PORTAL_AREAS)) {
      const url = new URL(area.url);
      expect(url.protocol).toBe("https:");
      expect(ALLOWED_HOSTS).toContain(url.host);
      expect(area.label.en).not.toBe("");
      expect(area.label.de).not.toBe("");
    }
  });

  it("resolves every mapped capability to a specific area with an allowed host", () => {
    const mapped = mappedCapabilityIds();
    expect(mapped.size).toBeGreaterThan(0);
    for (const id of mapped) {
      const capability = byId(id);
      expect(portalAreaFor(capability)).not.toBe("intuneHome");
      expect(ALLOWED_HOSTS).toContain(new URL(portalUrlFor(capability)).host);
    }
  });

  it.each([
    ["tenant-mfa-required", "conditionalAccess"],
    ["tenant-phishing-resistant-mfa", "conditionalAccess"],
    ["windows-minimum-os-version", "compliancePolicies"],
    ["ios-jailbreak-block", "compliancePolicies"],
    ["windows-antivirus-required", "compliancePolicies"],
    ["windows-disk-encryption", "diskEncryption"],
    ["macos-disk-encryption", "diskEncryption"],
    ["windows-firewall", "firewall"],
    ["macos-firewall", "firewall"],
    ["windows-realtime-antimalware", "antivirus"],
    ["windows-periodic-antimalware-scan", "antivirus"],
    ["windows-credential-guard", "accountProtection"],
    ["windows-lsa-protection", "accountProtection"],
    ["windows-laps-management", "accountProtection"],
    ["windows-credential-theft-protection", "attackSurfaceReduction"],
    ["windows-office-child-process-block", "attackSurfaceReduction"],
    ["windows-applocker-rule-collections", "attackSurfaceReduction"],
    ["windows-application-control", "attackSurfaceReduction"],
    ["windows-automatic-updates", "windowsUpdates"],
    ["windows-quality-update-deadline", "windowsUpdates"],
    ["ios-app-data-transfer", "appProtection"],
    ["android-app-data-transfer", "appProtection"],
    ["windows-office-macros-disabled", "configurationProfiles"],
    ["android-storage-encryption", "configurationProfiles"],
  ])("routes %s to %s", (id, area) => {
    expect(portalAreaFor(byId(id))).toBe(area);
  });

  it("falls back to the admin center home for a capability without signals", () => {
    const capability: ComplianceCapability = {
      id: "synthetic",
      platform: "windows",
      name: "Synthetic",
      description: "No detector",
      signals: [],
    };
    expect(portalAreaFor(capability)).toBe("intuneHome");
    expect(portalUrlFor(capability)).toBe(PORTAL_AREAS.intuneHome.url);
  });
});

import {
  CheckSquare,
  Code,
  FileText,
  Laptop,
  Package,
  RefreshCw,
  Settings,
  Shield,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SectionCount } from "../../shared/ipc-types";

export interface FamilyMeta {
  key: string;
  label: string;
  icon: LucideIcon;
  group: "core" | "extended";
}

// Mirrors src/components/dashboard/dashboard-sidebar.tsx: everyday families
// stay visible, long tail coverage sits behind "More coverage".
export const FAMILIES: FamilyMeta[] = [
  { key: "settingsCatalog", label: "Settings Catalog", icon: Settings, group: "core" },
  { key: "deviceConfigurations", label: "Device Configs", icon: Laptop, group: "core" },
  { key: "administrativeTemplates", label: "Admin Templates", icon: FileText, group: "core" },
  { key: "conditionalAccessPolicies", label: "Conditional Access", icon: Shield, group: "core" },
  { key: "securityBaselines", label: "Security Baselines", icon: Shield, group: "core" },
  { key: "compliancePolicies", label: "Compliance", icon: CheckSquare, group: "core" },
  { key: "appProtectionPolicies", label: "App Protection", icon: Shield, group: "core" },
  { key: "scripts", label: "Scripts", icon: Code, group: "core" },
  { key: "appConfigurations", label: "App Configs", icon: Package, group: "core" },
  { key: "windowsUpdatePolicies", label: "Windows Update", icon: RefreshCw, group: "core" },
  { key: "enrollmentConfigurations", label: "Enrollment", icon: UserCheck, group: "core" },
  { key: "windowsUpdateProfiles", label: "Update profiles", icon: RefreshCw, group: "extended" },
  { key: "scriptsAndRemediations", label: "Scripts and remediation", icon: Code, group: "extended" },
  { key: "enrollmentAndProvisioning", label: "Provisioning", icon: UserCheck, group: "extended" },
  { key: "applications", label: "Applications", icon: Package, group: "extended" },
  { key: "assignmentAndRbac", label: "Assignment and RBAC", icon: Shield, group: "extended" },
  { key: "tenantAndService", label: "Tenant and service", icon: Settings, group: "extended" },
  { key: "connectors", label: "Connectors", icon: Laptop, group: "extended" },
  { key: "specialistPolicies", label: "Specialist policies", icon: FileText, group: "extended" },
];

export function familyMeta(key: string | null): FamilyMeta | undefined {
  return FAMILIES.find((family) => family.key === key);
}

export function familyCounts(
  sections: SectionCount[] | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const section of sections ?? []) {
    counts[section.familyKey] = (counts[section.familyKey] ?? 0) + section.count;
  }
  return counts;
}

const WORD_PATTERN = /[A-Z]{2,}(?=[A-Z][a-z]|\d|$)|[A-Z]?[a-z]+|\d+|[A-Z]+/g;
const SPECIAL: Record<string, string> = {
  ios: "iOS",
  aosp: "AOSP",
  vpn: "VPN",
  pkcs: "PKCS",
  scep: "SCEP",
  wifi: "Wi-Fi",
  mdm: "MDM",
  mam: "MAM",
};

// "#microsoft.graph.windows10CustomConfiguration" -> "Windows 10 custom configuration"
export function friendlyType(odataType: string | null): string | null {
  if (!odataType) return null;
  const raw = odataType.replace(/^#?microsoft\.graph\./, "");
  const words = raw.match(WORD_PATTERN) ?? [raw];
  const merged: string[] = [];
  for (const word of words) {
    const previous = merged[merged.length - 1];
    if (word === "OS" && previous?.toLowerCase() === "mac") {
      merged[merged.length - 1] = "macOS";
      continue;
    }
    merged.push(word);
  }
  return merged
    .map((word, index) => {
      const special = SPECIAL[word.toLowerCase()];
      if (special) return special;
      if (word === "macOS") return word;
      if (/^[A-Z]{2,}$/.test(word)) return word;
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(" ");
}

const PLATFORM_LABELS: Record<string, string> = {
  windows10: "Windows",
  windows: "Windows",
  macos: "macOS",
  ios: "iOS",
  android: "Android",
  androidenterprise: "Android Enterprise",
  aosp: "AOSP",
  linux: "Linux",
  windows10x: "Windows 10X",
};

export function friendlyPlatforms(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== "none")
    .map((part) => PLATFORM_LABELS[part.toLowerCase()] ?? part);
}

export function friendlyTechnologies(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== "none")
    .map((part) =>
      part.length <= 4 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1),
    );
}

// Collection shaped like the lab tenant: 818 items, of which 537 apps,
// 45 assignment and RBAC items and 23 Microsoft defaults (11 of them RBAC).
// Values mirror read only Graph beta responses; ids are synthetic.
import type { ClassifiableSection } from "../classify";

function many<T>(count: number, make: (index: number) => T): T[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

function catalog(index: number, templateFamily: string) {
  return {
    id: `catalog-${templateFamily}-${index}`,
    name: `Policy ${index}`,
    templateReference: {
      templateId: templateFamily === "none" ? "" : `template-${templateFamily}`,
      templateFamily,
    },
  };
}

const ENDPOINT_SECURITY = [
  ...Array(7).fill("endpointSecurityEndpointPrivilegeManagement"),
  ...Array(7).fill("endpointSecurityAntivirus"),
  ...Array(3).fill("endpointSecurityDiskEncryption"),
  ...Array(3).fill("endpointSecurityFirewall"),
  ...Array(4).fill("endpointSecurityAccountProtection"),
  ...Array(2).fill("endpointSecurityAttackSurfaceReduction"),
  "endpointSecurityEndpointDetectionAndResponse",
  // A template family Graph may add later still counts as endpoint security.
  "endpointSecurityApplicationControl",
] as string[];

const TENANT = "00000000-0000-0000-0000-000000000000";

export function labCollectionSections(): ClassifiableSection[] {
  return [
    {
      key: "settingsCatalog",
      familyKey: "settingsCatalog",
      label: "Settings Catalog",
      items: [
        ...many(94, (index) => catalog(index, "none")),
        ...many(2, (index) => catalog(index, "deviceConfigurationScripts")),
        ...ENDPOINT_SECURITY.map((family, index) => catalog(index, family)),
        ...many(2, (index) => catalog(index, "baseline")),
      ],
    },
    {
      key: "deviceConfigurations",
      familyKey: "deviceConfigurations",
      label: "Device configurations (templates)",
      items: many(86, (index) => ({ id: `device-${index}` })),
    },
    {
      key: "securityBaselines",
      familyKey: "securityBaselines",
      label: "Security baselines & Endpoint Security",
      items: [{ id: "intent-1", templateId: "template-filevault" }],
    },
    {
      key: "enrollmentConfigurations",
      familyKey: "enrollmentConfigurations",
      label: "Enrollment configurations",
      items: [
        ...[
          "DefaultLimit",
          "DefaultPlatformRestrictions",
          "DefaultWindowsHelloForBusiness",
          "DefaultWindows10EnrollmentCompletionPageConfiguration",
          "WindowsRestore",
        ].map((suffix) => ({
          id: `${TENANT}_${suffix}`,
          displayName: "All users and all devices",
          priority: 0,
        })),
        // An administrator's enrollment status page, priority 1.
        {
          id: "11111111-1111-1111-1111-111111111111_Windows10EnrollmentCompletionPageConfiguration",
          priority: 1,
        },
      ],
    },
    {
      key: "mobileApps",
      familyKey: "applications",
      label: "Mobile apps",
      items: many(537, (index) => ({ id: `app-${index}`, isAssigned: index < 67 })),
    },
    {
      key: "roleDefinitions",
      familyKey: "assignmentAndRbac",
      label: "Role definitions",
      items: many(17, (index) => ({
        id: `role-${index}`,
        isBuiltIn: index < 10,
        isBuiltInRoleDefinition: index < 10,
      })),
    },
    {
      key: "roleScopeTags",
      familyKey: "assignmentAndRbac",
      label: "Scope tags",
      items: many(14, (index) => ({ id: String(index), isBuiltIn: index === 0 })),
    },
    {
      key: "reusablePolicySettings",
      familyKey: "assignmentAndRbac",
      label: "Reusable policy settings",
      items: many(8, (index) => ({ id: `reusable-${index}` })),
    },
    {
      key: "roleAssignments",
      familyKey: "assignmentAndRbac",
      label: "Role assignments",
      items: many(4, (index) => ({ id: `assignment-${index}` })),
    },
    {
      key: "assignmentFilters",
      familyKey: "assignmentAndRbac",
      label: "Assignment filters",
      items: many(2, (index) => ({ id: `filter-${index}` })),
    },
    {
      key: "deviceManagementSettings",
      familyKey: "tenantAndService",
      label: "Intune tenant settings",
      items: [{ deviceComplianceCheckinThresholdDays: 30 }],
    },
    {
      key: "androidForWorkSettings",
      familyKey: "tenantAndService",
      label: "Android Enterprise settings",
      items: [{ id: "androidForWorkSettings", bindStatus: "notBound" }],
    },
    {
      key: "deviceHealthScripts",
      familyKey: "scriptsAndRemediations",
      label: "Remediations",
      items: many(10, (index) => ({
        id: `remediation-${index}`,
        publisher: index < 2 ? "Microsoft" : "Contoso",
        isGlobalScript: index < 2,
      })),
    },
    {
      key: "deviceManagementPartners",
      familyKey: "connectors",
      label: "Device-management partners",
      items: [{ id: "partner-1", partnerState: "unknown", isConfigured: false }],
    },
    {
      key: "remoteAssistancePartners",
      familyKey: "connectors",
      label: "Remote-assistance partners",
      items: many(2, (index) => ({ id: `remote-${index}`, onboardingStatus: "notOnboarded" })),
    },
    {
      key: "mobileThreatDefenseConnectors",
      familyKey: "connectors",
      label: "Mobile threat-defense connectors",
      // Configured but not responding: an administrator's connector.
      items: [{ id: "mtd-1", partnerState: "unresponsive" }],
    },
    {
      key: "depOnboardingSettings",
      familyKey: "enrollmentAndProvisioning",
      label: "Apple ADE tokens",
      items: [{ id: "ade-1" }],
    },
  ];
}

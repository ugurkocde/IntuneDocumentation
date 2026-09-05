export type CompliancePlatform =
  | "windows"
  | "macos"
  | "ios"
  | "android"
  | "tenant";

export interface AssessmentScope {
  /** Explicit scope. Omitted means all supported platforms, never inferred from policy absence. */
  platforms?: CompliancePlatform[];
  defStanRiskLevel?: 0 | 1 | 2 | 3;
}

export type EvidenceKind =
  | "configuration"
  | "complianceRequirement"
  | "accessPolicy";

export type ValueExpectation =
  | { kind: "equals"; value: string | number | boolean }
  | { kind: "oneOf"; values: ReadonlyArray<string | number | boolean> }
  | { kind: "atLeast"; value: number }
  | { kind: "atMost"; value: number }
  | { kind: "nonEmptyString" };

export interface SettingsCatalogSignal {
  source: "settingsCatalog";
  settingDefinitionId: string;
  enforcedWhen: ValueExpectation;
  disabledWhen?: ValueExpectation;
  requirementGroup?: string;
}

export interface GraphPropertySignal {
  source: "graphProperty";
  /** Graph resource types without the "#microsoft.graph." prefix. Exact match only. */
  odataTypes: readonly string[];
  /** Dot-notation path into the policy object, e.g. "firewallProfileDomain.firewallEnabled". */
  propertyPath: string;
  enforcedWhen: ValueExpectation;
  disabledWhen?: ValueExpectation;
  requirementGroup?: string;
}

/** Exact identifiers, never display-name or script-content heuristics. */
export interface LegacySettingSignal {
  source: "administrativeTemplate" | "securityBaseline" | "omaUri";
  settingId: string;
  enforcedWhen: ValueExpectation;
  disabledWhen?: ValueExpectation;
  requirementGroup?: string;
}

export interface PolicyCheckSignal {
  source: "policyCheck";
  check:
    | "scheduledAntivirusScan"
    | "qualityUpdateDeadline"
    | "conditionalAccessMfa"
    | "conditionalAccessCompliantDevice";
  requirementGroup?: string;
}

export type DetectionSignal =
  | SettingsCatalogSignal
  | GraphPropertySignal
  | LegacySettingSignal
  | PolicyCheckSignal;

export interface ComplianceCapability {
  id: string;
  platform: CompliancePlatform;
  name: string;
  description: string;
  caveat?: {
    en: string;
    de: string;
  };
  signals: readonly DetectionSignal[];
  /** All groups must be present on the same assigned policy. Signals within a group are alternatives. */
  requiredGroups?: readonly string[];
  documentationUrl?: string;
}

export interface AssignmentSummary {
  state: "assigned" | "notAssigned" | "unknown";
  targets: string[];
  exclusions: string[];
  filters: Array<{ target: string; id: string; mode: string }>;
  coverage: "unverified";
}

export interface CapabilityEvidence {
  capabilityId: string;
  policyId: string;
  policyName: string;
  policyType: string;
  familyKey?: string;
  source: DetectionSignal["source"];
  /** The setting definition id or "<odataType>.<propertyPath>" that produced this evidence. */
  settingId: string;
  observedValue: string;
  verdict: "enforced" | "disabled";
  assignment: AssignmentSummary;
  note?: string;
  kind: EvidenceKind;
  requirementGroup?: string;
  policyVersion?: string;
  policyModifiedAt?: string;
}

export type CapabilityStatus =
  | "enforced"
  | "requirementAssigned"
  | "assignmentUnknown"
  | "conflictingEvidence"
  | "partialConfiguration"
  | "collectionIncomplete"
  | "notApplicable"
  | "configuredNotAssigned"
  | "disabledByPolicy"
  | "noEvidence";

export interface CapabilityResult {
  capability: ComplianceCapability;
  status: CapabilityStatus;
  evidence: CapabilityEvidence[];
  limitations: string[];
}

export interface FrameworkControl {
  id: string;
  title: string;
  summary: string;
  /** Requirement tier where the framework defines one (e.g. BSI Basis/Standard). */
  tier?: string;
  evidenceStrength?: "direct" | "supporting";
  unassessedAspects?: readonly string[];
  platforms?: readonly CompliancePlatform[];
  riskLevels?: readonly number[];
  granularity?: "requirement" | "buildingBlock" | "theme";
}

export interface FrameworkDefinition {
  id: string;
  name: string;
  version: string;
  /** Published requirement count, separate from the selected technical mappings. */
  totalRequirements?: number;
  /** Explains the granularity of the mapping, shown alongside any report. */
  note?: string;
  controls: Record<string, FrameworkControl>;
  /** capability id -> control ids that the capability provides evidence for */
  mappings: Record<string, readonly string[]>;
  source?: { url: string; verifiedAt: string };
}

export type ControlStatus =
  | "evidenceFound"
  | "partialEvidence"
  | "noEvidence"
  | "notApplicable"
  | "notAssessed"
  | "conflictingEvidence";

export interface ControlAssessment {
  control: FrameworkControl;
  capabilityIds: string[];
  enforcedCapabilityIds: string[];
  status: ControlStatus;
  unassessedAspects: string[];
  excludedCapabilityIds: string[];
}

export interface FrameworkAssessment {
  framework: Pick<
    FrameworkDefinition,
    "id" | "name" | "version" | "note" | "source" | "totalRequirements"
  >;
  controls: ControlAssessment[];
  summary: {
    totalControls: number;
    withEvidence: number;
    partial: number;
    withoutEvidence: number;
    notApplicable: number;
    notAssessed: number;
    conflicting: number;
    applicableControls: number;
  };
}

export interface CollectionCoverage {
  family: string;
  collectedPolicies: number;
  recognizedPolicies: number;
  unsupportedPolicies: number;
  status: "complete" | "incomplete" | "unknown" | "notCollected";
  errors: string[];
}

export interface ComplianceAssessment {
  generatedAt: string;
  disclaimer: string;
  capabilities: CapabilityResult[];
  frameworks: FrameworkAssessment[];
  scope: AssessmentScope;
  collectionCoverage: CollectionCoverage[];
  provenance: {
    rulesetVersion: string;
    collectedAt?: string;
    collectionStartedAt?: string;
    deviceState: "notCollected";
    effectiveAccess: "unverified";
  };
}

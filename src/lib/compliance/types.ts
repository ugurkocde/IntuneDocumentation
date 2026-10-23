export type CompliancePlatform =
  | "windows"
  | "macos"
  | "ios"
  | "android"
  | "tenant";

export interface AssessmentScope {
  /** Explicit scope. Omitted means all supported platforms, never inferred from policy absence. */
  platforms?: CompliancePlatform[];
  essentialEightMaturityLevel?: 1 | 2 | 3;
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
  /** A child option is valid only while its exact parent option is enabled. */
  prerequisites?: readonly {
    settingDefinitionId: string;
    values: readonly string[];
  }[];
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
  /** Exact Graph presentation identifier, never a display label. */
  presentationId?: string;
  enforcedWhen: ValueExpectation;
  disabledWhen?: ValueExpectation;
  requirementGroup?: string;
}

export interface PolicyCheckSignal {
  source: "policyCheck";
  check:
    | "appLockerRuleCollections"
    | "scheduledAntivirusScan"
    | "qualityUpdateDeadline"
    | "conditionalAccessMfaAllApps"
    | "conditionalAccessPhishingResistantMfa"
    | "conditionalAccessMfa"
    | "conditionalAccessCompliantDevice";
  requirementGroup?: string;
}

/**
 * Tenant-wide Entra policy read from `tenantIdentityPolicies`. These policies
 * have no assignment relation; evidence is always supporting.
 */
export interface TenantPolicySignal {
  source: "tenantPolicy";
  policy: TenantIdentityPolicyName;
  check:
    | "phishingResistantMethodEnabled"
    | "weakMethodsDisabled"
    | "securityDefaultsEnabled";
  requirementGroup?: string;
}

export type DetectionSignal =
  | SettingsCatalogSignal
  | GraphPropertySignal
  | LegacySettingSignal
  | PolicyCheckSignal
  | TenantPolicySignal;

export type TenantIdentityPolicyName =
  | "authenticationMethods"
  | "securityDefaults";

export type TenantPolicyCollectionStatus =
  | "collected"
  | "permissionDenied"
  | "failed"
  | "skipped";

/**
 * Entra tenant policies read with the Conditional Access token. Kept apart
 * from configuration sections, so they never change configuration counts,
 * search, classification or the documentation export.
 */
export interface TenantIdentityPolicies {
  authenticationMethods?: Record<string, unknown>;
  securityDefaults?: Record<string, unknown>;
  status: Partial<
    Record<TenantIdentityPolicyName, TenantPolicyCollectionStatus>
  >;
  /** Short reason per policy when it was not collected. */
  errors?: Partial<Record<TenantIdentityPolicyName, string>>;
}

export type PolicyStatusSource =
  | "configurationPolicies"
  | "compliancePolicies"
  | "deviceConfigurations";

/**
 * Device status counts per policy as summarised by Intune. An annex only:
 * never a field on CapabilityEvidence and never input to any status.
 */
export interface PolicyDeviceStatus {
  collectedAt: string;
  sources: Record<PolicyStatusSource, TenantPolicyCollectionStatus>;
  /** Short reason per source when it was not collected. */
  errors?: Partial<Record<PolicyStatusSource, string>>;
  rows: PolicyDeviceStatusRow[];
}

export interface PolicyDeviceStatusRow {
  policyId: string;
  policyName: string;
  source: PolicyStatusSource;
  succeeded: number | null;
  error: number | null;
  conflict: number | null;
  notApplicable: number | null;
  pending: number | null;
}

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
  /**
   * Capabilities that deliver this safeguard another way. While one of them
   * has assigned enforcing evidence, this capability without evidence is not
   * a gap; while one cannot be read, it is a data gap (see
   * CapabilityResult.alternative and README "Alternative capabilities").
   */
  alternativeTo?: readonly string[];
  /**
   * The capability cannot be turned on while any Conditional Access policy
   * exists, disabled ones included (security defaults). It is then not
   * applicable, and nothing is claimed as set up.
   */
  exclusiveWithConditionalAccess?: boolean;
}

/**
 * Why a capability without evidence is not an ordinary gap. `inUse`: an
 * alternative is enforced or requirementAssigned; `capabilityIds` names only
 * those. `notCombinable`: Conditional Access policies exist (in any state),
 * so the capability cannot be turned on; `capabilityIds` is empty.
 * `unknown`: an alternative or the Conditional Access policies could not be
 * read, or the effective targeting of an alternative could not be
 * resolved; a data gap. `targetingUnresolved`: with `unknown`, every
 * alternative it names is unknown only because its assignments, read
 * completely, could not be resolved (AssignmentSummary.uncertainty
 * "unresolved") and no other data it depends on is unread, so a review of
 * them settles it, not a refresh.
 */
export interface CapabilityAlternative {
  state: "inUse" | "notCombinable" | "unknown";
  capabilityIds: string[];
  targetingUnresolved?: true;
  // With `unknown`: an alternative it names is unknown also because its
  // assignments could not be resolved, beside assignments or data that
  // could not be read, so both a refresh and a review of the overlapping
  // assignments are needed. Never set with targetingUnresolved.
  targetingPartlyUnresolved?: true;
}

export interface AssignmentSummary {
  state: "assigned" | "notAssigned" | "unknown";
  targets: string[];
  exclusions: string[];
  // Assignments with a removal intent (assignments.ts assignmentRole),
  // labelled with it ("Remove: Group: ..."), which target nobody. Absent
  // when there are none.
  removals?: string[];
  filters: Array<{ target: string; id: string; mode: string }>;
  coverage: "unverified";
  // Why the state is unknown (assignments.ts resolveAssignments):
  // assignments not fully collected or not readable ("incomplete"), or a
  // complete, readable list whose targeting conflicts cannot be resolved
  // without group memberships ("unresolved"). Absent otherwise.
  uncertainty?: "incomplete" | "unresolved";
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
  checks: TechnicalCheck[];
  /**
   * Set only on a `noEvidence` capability with `alternativeTo` or
   * `exclusiveWithConditionalAccess`. It is then no next action and has no
   * different or missing check result. `inUse` and `notCombinable` are not
   * counted as safeguards; `unknown` is counted and is a data gap.
   */
  alternative?: CapabilityAlternative;
}

/** Configuration comparisons are independent of assignment and audit coverage. */
export interface TechnicalCheck {
  assessmentStatus: "checked" | "unableToCheck" | "outsideScope";
  result: "matches" | "missing" | "different" | null;
  settingId: string;
  expectedValue: string;
  actualValue: string | null;
  reason?: string;
  policyId?: string;
  policyName?: string;
  assignment?: AssignmentSummary;
}

export interface FrameworkControl {
  id: string;
  title: string;
  /** German title for German reports, where the framework has an official German text. */
  titleDe?: string;
  summary: string;
  /** Requirement tier where the framework defines one (e.g. Def Stan risk levels). */
  tier?: string;
  evidenceStrength?: "direct" | "supporting";
  unassessedAspects?: readonly string[];
  platforms?: readonly CompliancePlatform[];
  riskLevels?: readonly number[];
  granularity?: "requirement" | "theme";
  /** Equivalent identifiers in national transpositions, e.g. scheme "DE". */
  aliases?: readonly { scheme: string; id: string }[];
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
  /** Explicit result for requirements without a configuration detector. */
  unavailableCheck?: TechnicalCheck;
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
    /** Per-device state is never collected. */
    deviceState: "notCollected";
    /** Intune's per-policy status counts, shown as an annex only. */
    policyStatusSummary?: "collected" | "notCollected";
    effectiveAccess: "unverified";
  };
}

export type CompliancePlatform = "windows" | "macos" | "ios" | "android";

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
}

export interface GraphPropertySignal {
  source: "graphProperty";
  /** Graph resource types without the "#microsoft.graph." prefix. Exact match only. */
  odataTypes: readonly string[];
  /** Dot-notation path into the policy object, e.g. "firewallProfileDomain.firewallEnabled". */
  propertyPath: string;
  enforcedWhen: ValueExpectation;
  disabledWhen?: ValueExpectation;
}

export type DetectionSignal = SettingsCatalogSignal | GraphPropertySignal;

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
}

export interface AssignmentSummary {
  state: "assigned" | "notAssigned";
  targets: string[];
}

export interface CapabilityEvidence {
  capabilityId: string;
  policyId: string;
  policyName: string;
  policyType: string;
  source: DetectionSignal["source"];
  /** The setting definition id or "<odataType>.<propertyPath>" that produced this evidence. */
  settingId: string;
  observedValue: string;
  verdict: "enforced" | "disabled";
  assignment: AssignmentSummary;
  note?: string;
}

export type CapabilityStatus =
  | "enforced"
  | "configuredNotAssigned"
  | "disabledByPolicy"
  | "noEvidence";

export interface CapabilityResult {
  capability: ComplianceCapability;
  status: CapabilityStatus;
  evidence: CapabilityEvidence[];
}

export interface FrameworkControl {
  id: string;
  title: string;
  summary: string;
  /** Requirement tier where the framework defines one (e.g. BSI Basis/Standard). */
  tier?: string;
}

export interface FrameworkDefinition {
  id: string;
  name: string;
  version: string;
  /** Explains the granularity of the mapping, shown alongside any report. */
  note?: string;
  controls: Record<string, FrameworkControl>;
  /** capability id -> control ids that the capability provides evidence for */
  mappings: Record<string, readonly string[]>;
}

export type ControlStatus = "evidenceFound" | "partialEvidence" | "noEvidence";

export interface ControlAssessment {
  control: FrameworkControl;
  capabilityIds: string[];
  enforcedCapabilityIds: string[];
  status: ControlStatus;
}

export interface FrameworkAssessment {
  framework: Pick<FrameworkDefinition, "id" | "name" | "version" | "note">;
  controls: ControlAssessment[];
  summary: {
    totalControls: number;
    withEvidence: number;
    partial: number;
    withoutEvidence: number;
  };
}

export interface ComplianceAssessment {
  generatedAt: string;
  disclaimer: string;
  capabilities: CapabilityResult[];
  frameworks: FrameworkAssessment[];
}

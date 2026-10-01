import type { ControlStatus } from "../types";

// Shared contract for the management summary, the baseline file, the customer
// crosswalk and the one-page management report. Everything here is derived
// from a ComplianceAssessment and contains identifiers, statuses and counts,
// never policy names or setting values.

export type ManagementLocale = "en" | "de";

/** Highest priority first. The order is documented in the README. */
export type NextActionTier =
  | "conflicting"
  | "assignedDeviation"
  | "partial"
  | "unassigned"
  | "missing";

export type PortalAreaId =
  | "configurationProfiles"
  | "compliancePolicies"
  | "diskEncryption"
  | "firewall"
  | "antivirus"
  | "accountProtection"
  | "attackSurfaceReduction"
  | "windowsUpdates"
  | "appProtection"
  | "conditionalAccess"
  | "intuneHome";

export interface ManagementMetrics {
  /** evidenceFound + partialEvidence + noEvidence + conflictingEvidence */
  assessable: number;
  /** evidenceFound + partialEvidence */
  withEvidence: number;
  /** floor(withEvidence / assessable * 100); null when nothing is assessable. */
  coveragePct: number | null;
  /** noEvidence */
  withoutEvidence: number;
  conflicting: number;
  /** Mapped capabilities configured on a policy that is not assigned. */
  unassignedConfigs: number;
  /** Published requirements without an Intune evidence mapping, when known. */
  outsideIntuneScope: number | null;
  /** Mapped capabilities whose evidence could not be read (re-collect). */
  dataGaps: number;
}

export interface NextAction {
  capabilityId: string;
  name: string;
  tier: NextActionTier;
  /** Framework controls that list the capability and lack full evidence. */
  controlIds: string[];
  area: PortalAreaId;
  url: string;
  /** Zero-based position after sorting. Never shown as a score. */
  rank: number;
}

export interface OutsideScopeMeasure {
  id: string;
  title: { en: string; de: string };
}

export interface ManagementSummary {
  frameworkId: string;
  frameworkName: string;
  frameworkVersion: string;
  generatedAt: string;
  rulesetVersion: string;
  /** Stable key of the assessment scope (platforms, Essential Eight level, Def Stan risk level). */
  scopeKey: string;
  metrics: ManagementMetrics;
  nextActions: NextAction[];
  /** Control id -> status for every assessed control. */
  controls: Record<string, ControlStatus>;
  outsideScope: OutsideScopeMeasure[];
}

export const BASELINE_SCHEMA = "intunedoc.baseline/1" as const;

export interface BaselineFile {
  schema: typeof BASELINE_SCHEMA;
  frameworkId: string;
  frameworkVersion: string;
  rulesetVersion: string;
  scopeKey: string;
  generatedAt: string;
  tenant: { id: string; label?: string };
  controls: Record<string, ControlStatus>;
  metrics: ManagementMetrics;
  /**
   * SHA-256 over the canonical JSON of every other field. Detects accidental
   * edits and corruption only; anyone can recompute it, so it is not proof of
   * origin.
   */
  checksum: { algorithm: "sha-256"; value: string };
}

export interface BaselineDelta {
  /** Current coverage minus baseline coverage in percentage points. */
  coverageDeltaPoints: number | null;
  /** Controls without evidence in the baseline that now have evidence. */
  newlyEvidenced: string[];
  /** Controls with evidence in the baseline that no longer have it. */
  regressions: string[];
  /** Controls assessed now but not in the baseline. */
  added: string[];
  /** Controls in the baseline that are no longer assessed. */
  removed: string[];
  /** Rules changed between the two runs, so some movement may come from the mapping. */
  rulesetChanged: boolean;
  baselineDate: string;
}

export type BaselineRejection =
  | "schema"
  | "checksum"
  | "tenant"
  | "framework"
  | "scope"
  | "future";

export interface CrosswalkRow {
  /** Normalized ISO/IEC 27001:2022 Annex A control, e.g. "8.1". */
  iso?: string;
  /** Normalized NIS2 measure, e.g. "21.2.j". */
  nis2?: string;
  /** Customer-supplied CIS Controls safeguard identifier, e.g. "4.1". */
  cis: string;
  notes?: string;
}

export interface CrosswalkIssue {
  /** One-based line number in the imported file. */
  line: number;
  message: string;
}

export interface Crosswalk {
  rows: CrosswalkRow[];
  issues: CrosswalkIssue[];
}

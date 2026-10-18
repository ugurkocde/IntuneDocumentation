import { assignmentDetails } from "../assignments";
import {
  ASSESSMENT_LABELS,
  CHECK_RESULT_LABELS,
  displayCheckValue,
} from "../check-results";
import { COMPLIANCE_DISCLAIMER } from "../engine";
import {
  CAPABILITY_STATUS_LABELS,
  CONTROL_STATUS_LABELS,
} from "../presentation";
import type {
  AssessmentScope,
  AssignmentSummary,
  CapabilityEvidence,
  CapabilityResult,
  CapabilityStatus,
  ComplianceAssessment,
  ControlAssessment,
  ControlStatus,
  TechnicalCheck,
} from "../types";
import { toCsv, type CellValue } from "./csv";
import { buildXlsx, type XlsxSheet } from "./xlsx";

/** One control of one framework. */
export interface ControlRegisterRow {
  frameworkId: string;
  frameworkName: string;
  controlId: string;
  controlTitle: string;
  controlStatus: string;
  capabilityCount: number;
  /** Enforcing values on assigned policies. */
  assignedEvidence: number;
  /** Non-enforcing values, assigned or not. */
  counterEvidence: number;
  /** Enforcing values on unassigned policies or with unknown assignment. */
  unassignedEvidence: number;
  unassessedAspects: string;
}

/**
 * One technical check per control it supports. A control without any check
 * gets one row with the reason, so no control is silently missing.
 */
export interface CheckRegisterRow {
  frameworkId: string;
  controlId: string;
  capabilityId: string;
  capabilityName: string;
  capabilityStatus: string;
  checkResult: string;
  assessmentStatus: string;
  policyName: string;
  policyId: string;
  settingId: string;
  expectedValue: string;
  actualValue: string;
  assignment: string;
  note: string;
}

export interface EvidenceRegister {
  /** Assessment scope in words, from `assessment.scope`. */
  scope: string;
  controls: ControlRegisterRow[];
  checks: CheckRegisterRow[];
}

/**
 * The assessment scope in words: platforms, the Essential Eight target level
 * when that framework is included, and the Def Stan risk level when set.
 */
export function assessmentScopeText(
  scope: AssessmentScope,
  frameworkIds: readonly string[],
): string {
  const parts = [
    scope.platforms?.length
      ? `platforms ${scope.platforms.join(", ")}`
      : "all supported platforms",
  ];
  if (frameworkIds.includes("essential-eight"))
    parts.push(
      `target Maturity Level ${scope.essentialEightMaturityLevel ?? 1}`,
    );
  if (scope.defStanRiskLevel !== undefined)
    parts.push(`Def Stan risk level ${scope.defStanRiskLevel}`);
  return parts.join("; ");
}

/** Device status counts per policy, as reported by Intune. */
export interface PolicyStatusRow {
  policyId: string;
  policyName: string;
  source: string;
  collectedAt: string;
  succeeded: number | null;
  error: number | null;
  conflict: number | null;
  notApplicable: number | null;
  pending: number | null;
  /** The report had no row for the policy. This is never a count of zero. */
  noStatusReported: boolean;
}

type Columns<Row> = ReadonlyArray<readonly [keyof Row, string]>;

export const CONTROL_COLUMNS: Columns<ControlRegisterRow> = [
  ["frameworkId", "Framework ID"],
  ["frameworkName", "Framework"],
  ["controlId", "Control ID"],
  ["controlTitle", "Control title"],
  ["controlStatus", "Control status"],
  ["capabilityCount", "Capabilities"],
  ["assignedEvidence", "Assigned evidence"],
  ["counterEvidence", "Counter-evidence"],
  ["unassignedEvidence", "Evidence not assigned or unknown"],
  ["unassessedAspects", "Not established by this evidence"],
];

export const CHECK_COLUMNS: Columns<CheckRegisterRow> = [
  ["frameworkId", "Framework ID"],
  ["controlId", "Control ID"],
  ["capabilityId", "Capability ID"],
  ["capabilityName", "Capability"],
  ["capabilityStatus", "Capability status"],
  ["checkResult", "Check result"],
  ["assessmentStatus", "Assessment status"],
  ["policyName", "Policy"],
  ["policyId", "Policy ID"],
  ["settingId", "Setting ID"],
  ["expectedValue", "Expected value"],
  ["actualValue", "Actual value"],
  ["assignment", "Assignment"],
  ["note", "Note"],
];

export const POLICY_STATUS_COLUMNS: Columns<PolicyStatusRow> = [
  ["policyId", "Policy ID"],
  ["policyName", "Policy"],
  ["source", "Source"],
  ["collectedAt", "Collected at"],
  ["succeeded", "Succeeded"],
  ["error", "Error"],
  ["conflict", "Conflict"],
  ["notApplicable", "Not applicable"],
  ["pending", "Pending"],
  ["noStatusReported", "Status"],
];

export interface EvidenceRegisterOptions {
  /** Limits the register to one framework; all assessed frameworks otherwise. */
  frameworkId?: string;
}

export function assignmentText(assignment?: AssignmentSummary): string {
  if (!assignment) return "";
  const details = assignmentDetails(assignment);
  return assignment.state === "notAssigned"
    ? ["Not assigned", ...details].join("; ")
    : details.join("; ");
}

/** Evidence the capabilities of a control cite, without duplicates. */
export function controlEvidence(
  control: ControlAssessment,
  capabilities: ReadonlyMap<string, CapabilityResult>,
): CapabilityEvidence[] {
  const seen = new Set<string>();
  const evidence: CapabilityEvidence[] = [];
  for (const id of control.capabilityIds)
    for (const item of capabilities.get(id)?.evidence ?? []) {
      const key = JSON.stringify([
        item.capabilityId,
        item.policyId,
        item.settingId,
        item.verdict,
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push(item);
    }
  return evidence;
}

export interface ControlEvidenceCounts {
  assigned: number;
  counter: number;
  unassigned: number;
}

/**
 * The cited evidence of a control split by meaning, so counter-evidence and
 * unassigned configurations never read as support.
 */
export function controlEvidenceCounts(
  control: ControlAssessment,
  capabilities: ReadonlyMap<string, CapabilityResult>,
): ControlEvidenceCounts {
  const counts: ControlEvidenceCounts = {
    assigned: 0,
    counter: 0,
    unassigned: 0,
  };
  for (const item of controlEvidence(control, capabilities))
    if (item.verdict === "disabled") counts.counter += 1;
    else if (item.assignment.state === "assigned") counts.assigned += 1;
    else counts.unassigned += 1;
  return counts;
}

function checkRow(
  frameworkId: string,
  controlId: string,
  capability: CapabilityResult | undefined,
  check: TechnicalCheck | undefined,
  note: string,
): CheckRegisterRow {
  return {
    frameworkId,
    controlId,
    capabilityId: capability?.capability.id ?? "",
    capabilityName: capability?.capability.name ?? "",
    capabilityStatus: capability
      ? CAPABILITY_STATUS_LABELS[capability.status]
      : "",
    checkResult: check?.result ? CHECK_RESULT_LABELS[check.result] : "",
    assessmentStatus: check ? ASSESSMENT_LABELS[check.assessmentStatus] : "",
    policyName: check?.policyName ?? "",
    policyId: check?.policyId ?? "",
    settingId: check?.settingId ?? "",
    expectedValue: check ? displayCheckValue(check.expectedValue) : "",
    actualValue:
      check?.actualValue === null || check?.actualValue === undefined
        ? ""
        : displayCheckValue(check.actualValue),
    assignment: assignmentText(check?.assignment),
    note,
  };
}

/**
 * Flattens a precomputed assessment into a controls table and a checks
 * table. Capability limitations are part of each control's unassessed
 * aspects, so the checks table carries only the per-check reason.
 */
export function buildEvidenceRegister(
  assessment: ComplianceAssessment,
  options: EvidenceRegisterOptions = {},
): EvidenceRegister {
  const capabilities = new Map(
    assessment.capabilities.map((result) => [result.capability.id, result]),
  );
  const frameworks = options.frameworkId
    ? assessment.frameworks.filter(
        (framework) => framework.framework.id === options.frameworkId,
      )
    : assessment.frameworks;
  if (options.frameworkId && !frameworks.length)
    throw new Error(`Unknown compliance framework: ${options.frameworkId}`);
  const register: EvidenceRegister = {
    scope: assessmentScopeText(
      assessment.scope,
      frameworks.map((framework) => framework.framework.id),
    ),
    controls: [],
    checks: [],
  };
  for (const framework of frameworks) {
    const frameworkId = framework.framework.id;
    for (const control of framework.controls) {
      const controlId = control.control.id;
      const counts = controlEvidenceCounts(control, capabilities);
      register.controls.push({
        frameworkId,
        frameworkName: framework.framework.name,
        controlId,
        controlTitle: control.control.title,
        controlStatus: CONTROL_STATUS_LABELS[control.status],
        capabilityCount: control.capabilityIds.length,
        assignedEvidence: counts.assigned,
        counterEvidence: counts.counter,
        unassignedEvidence: counts.unassigned,
        unassessedAspects: control.unassessedAspects.join(" "),
      });
      const before = register.checks.length;
      for (const capabilityId of control.capabilityIds) {
        const capability = capabilities.get(capabilityId);
        if (!capability) continue;
        if (!capability.checks.length)
          register.checks.push(
            checkRow(frameworkId, controlId, capability, undefined, ""),
          );
        for (const check of capability.checks)
          register.checks.push(
            checkRow(
              frameworkId,
              controlId,
              capability,
              check,
              check.reason ?? "",
            ),
          );
      }
      if (register.checks.length === before)
        register.checks.push(
          checkRow(
            frameworkId,
            controlId,
            undefined,
            control.unavailableCheck,
            control.status === "notApplicable"
              ? CONTROL_STATUS_LABELS.notApplicable
              : (control.unavailableCheck?.reason ??
                  control.unassessedAspects.join(" ")),
          ),
        );
    }
  }
  return register;
}

function table<Row>(columns: Columns<Row>, rows: readonly Row[]) {
  return [
    columns.map(([, header]) => header),
    ...rows.map((row) => columns.map(([key]) => row[key] as CellValue)),
  ];
}

function policyStatusTable(rows: readonly PolicyStatusRow[]): CellValue[][] {
  return table(
    POLICY_STATUS_COLUMNS,
    rows.map((row) => ({
      ...row,
      noStatusReported: row.noStatusReported ? "No status reported" : "",
    })) as unknown as readonly PolicyStatusRow[],
  );
}

/** The checks table as CSV, with a UTF-8 byte order mark for Excel. */
export function registerToCsv(register: EvidenceRegister): string {
  return toCsv(table(CHECK_COLUMNS, register.checks), { bom: true });
}

/** The controls table as CSV, with a UTF-8 byte order mark for Excel. */
export function registerControlsToCsv(register: EvidenceRegister): string {
  return toCsv(table(CONTROL_COLUMNS, register.controls), { bom: true });
}

export interface RegisterMeta {
  tenant?: string;
  collectedAt?: string;
  rulesetVersion: string;
  /** Framework name and version; derived from the controls when omitted. */
  framework?: string;
  generatedAt: string;
  /** Adds a Policy status sheet with device status counts per policy. */
  policyStatus?: readonly PolicyStatusRow[];
}

const CONTROL_STATUS_DEFINITIONS: Record<ControlStatus, string> = {
  evidenceFound:
    "Every mapped capability has an enforcing setting on an assigned policy, and the mapping is direct with no open limitation.",
  partialEvidence:
    "Some mapped capabilities have enforcing settings on assigned policies, or the mapping supports only part of the control.",
  noEvidence:
    "No matching Intune policy was detected. The requirement may still be met through other means.",
  notApplicable:
    "The control or all its mapped capabilities are outside the selected platform or risk scope.",
  notAssessed:
    "The requirement needs evidence outside the collected settings, or collection or assignment data was incomplete.",
  conflictingEvidence:
    "Assigned policies hold both enforcing and non-enforcing values. This is mixed policy evidence, not proof of an effective conflict on a device.",
};

const CAPABILITY_STATUS_DEFINITIONS: Record<CapabilityStatus, string> = {
  enforced: "An enforcing value was found on a policy with an assignment.",
  requirementAssigned:
    "An assigned compliance policy requires the setting. Compliance policies report state and do not configure devices.",
  configuredNotAssigned:
    "An enforcing value was found, but the policy has no assignment or only exclusions.",
  disabledByPolicy:
    "A policy sets the non-enforcing value of the setting, and no enforcing value was found.",
  noEvidence: "No recognized setting for the capability was found.",
  assignmentUnknown:
    "Policy evidence was found, but its assignments could not be read completely.",
  conflictingEvidence:
    "Assigned policies hold both enforcing and non-enforcing values.",
  partialConfiguration:
    "Some settings that must occur together on one assigned policy are missing.",
  collectionIncomplete:
    "No evidence was found, and a policy family needed for this capability was not collected completely.",
  notApplicable: "The capability's platform is outside the selected scope.",
};

const CHECK_DEFINITIONS: ReadonlyArray<readonly [string, string]> = [
  [
    CHECK_RESULT_LABELS.matches,
    "The configured value meets the expected value.",
  ],
  [CHECK_RESULT_LABELS.missing, "The setting was not found on the policy."],
  [
    CHECK_RESULT_LABELS.different,
    "The setting is configured with a value other than the expected value.",
  ],
  [
    "Empty check result",
    "Compared or read without a result, for example a value that is not a gap because an alternative is configured and assigned, or a setting that cannot be combined with Conditional Access; the note gives the reason.",
  ],
  [ASSESSMENT_LABELS.checked, "The configuration was compared."],
  [
    ASSESSMENT_LABELS.unableToCheck,
    "The configuration could not be compared; the note gives the reason.",
  ],
  [
    ASSESSMENT_LABELS.outsideScope,
    "The check belongs to a platform outside the selected scope.",
  ],
];

function aboutSheet(
  meta: RegisterMeta,
  framework: string,
  scope: string,
): XlsxSheet {
  const rows: CellValue[][] = [
    ["Field", "Value"],
    ["Tenant", meta.tenant ?? ""],
    ["Collected at", meta.collectedAt ?? ""],
    ["Ruleset version", meta.rulesetVersion],
    ["Framework", framework],
    ["Assessment scope", scope],
    ["Generated at", meta.generatedAt],
    ["Disclaimer", COMPLIANCE_DISCLAIMER],
    [],
  ];
  const boldRows: number[] = [];
  const block = (
    title: string,
    entries: Iterable<readonly [string, string]>,
  ) => {
    boldRows.push(rows.length);
    rows.push([title, "Meaning"]);
    for (const entry of entries) rows.push([...entry]);
    rows.push([]);
  };
  block(
    "Control status",
    (Object.keys(CONTROL_STATUS_LABELS) as ControlStatus[]).map(
      (status) =>
        [
          CONTROL_STATUS_LABELS[status],
          CONTROL_STATUS_DEFINITIONS[status],
        ] as const,
    ),
  );
  block(
    "Capability status",
    (Object.keys(CAPABILITY_STATUS_LABELS) as CapabilityStatus[]).map(
      (status) =>
        [
          CAPABILITY_STATUS_LABELS[status],
          CAPABILITY_STATUS_DEFINITIONS[status],
        ] as const,
    ),
  );
  block("Check result and assessment status", CHECK_DEFINITIONS);
  if (meta.policyStatus)
    block("Policy status", [
      [
        "No status reported",
        "Intune returned no status row for the policy. This is not a count of zero devices.",
      ],
      [
        "Counts",
        "Device status counts never change a control or capability status; statuses are based on configuration.",
      ],
    ]);
  return {
    name: "About",
    rows,
    columnWidths: [34, 110],
    autoFilter: false,
    boldRows,
  };
}

/** Workbook with About, Controls, Checks and, when given, Policy status. */
export function registerToXlsx(
  register: EvidenceRegister,
  meta: RegisterMeta,
): Promise<Uint8Array> {
  const framework =
    meta.framework ??
    [...new Set(register.controls.map((row) => row.frameworkName))].join("; ");
  const sheets: XlsxSheet[] = [
    aboutSheet(meta, framework, register.scope),
    {
      name: "Controls",
      rows: table(CONTROL_COLUMNS, register.controls),
      columnWidths: [18, 26, 14, 40, 26, 12, 14, 14, 18, 80],
    },
    {
      name: "Checks",
      rows: table(CHECK_COLUMNS, register.checks),
      columnWidths: [18, 14, 28, 32, 28, 22, 18, 32, 38, 48, 40, 40, 36, 60],
    },
  ];
  if (meta.policyStatus)
    sheets.push({
      name: "Policy status",
      rows: policyStatusTable(meta.policyStatus),
      columnWidths: [38, 36, 22, 22, 11, 9, 10, 14, 10, 20],
    });
  return buildXlsx(sheets);
}

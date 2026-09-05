import type {
  CapabilityStatus,
  ControlStatus,
  FrameworkAssessment,
} from "./types";

export function frameworkCoverageLabel(
  assessment: FrameworkAssessment,
): string | undefined {
  const total = assessment.framework.totalRequirements;
  if (total === undefined) return undefined;
  return `${assessment.summary.totalControls} of ${total} published requirements have Intune evidence mappings. Supporting evidence only; this is not a full assessment or compliance score.`;
}

export const CONTROL_STATUS_LABELS: Record<ControlStatus, string> = {
  evidenceFound: "Configuration evidence",
  partialEvidence: "Supporting or partial evidence",
  noEvidence: "No recognized evidence",
  notApplicable: "Outside selected scope",
  notAssessed: "Not assessed",
  conflictingEvidence: "Mixed policy evidence",
};

export const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, string> = {
  enforced: "Setting configured and assigned",
  requirementAssigned: "Compliance requirement assigned",
  configuredNotAssigned: "Configured, not assigned",
  disabledByPolicy: "Non-enforcing setting detected",
  noEvidence: "No recognized evidence",
  assignmentUnknown: "Assignment unknown",
  conflictingEvidence: "Mixed policy evidence",
  partialConfiguration: "Some required settings missing",
  collectionIncomplete: "Collection incomplete",
  notApplicable: "Outside selected scope",
};

export const CONTROL_STATUS_ORDER: Record<ControlStatus, number> = {
  conflictingEvidence: 0,
  notAssessed: 1,
  noEvidence: 2,
  partialEvidence: 3,
  evidenceFound: 4,
  notApplicable: 5,
};

export const CONTROL_STATUS_COLORS: Record<
  ControlStatus,
  [number, number, number]
> = {
  evidenceFound: [31, 133, 83],
  partialEvidence: [196, 113, 31],
  noEvidence: [100, 116, 139],
  notApplicable: [100, 116, 139],
  notAssessed: [196, 113, 31],
  conflictingEvidence: [185, 28, 28],
};

export const CAPABILITY_STATUS_COLORS: Record<
  CapabilityStatus,
  [number, number, number]
> = {
  enforced: [31, 133, 83],
  requirementAssigned: [37, 99, 235],
  configuredNotAssigned: [196, 113, 31],
  disabledByPolicy: [185, 28, 28],
  noEvidence: [100, 116, 139],
  assignmentUnknown: [196, 113, 31],
  conflictingEvidence: [185, 28, 28],
  partialConfiguration: [196, 113, 31],
  collectionIncomplete: [196, 113, 31],
  notApplicable: [100, 116, 139],
};

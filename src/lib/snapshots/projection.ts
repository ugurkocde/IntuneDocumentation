// History snapshots: an allowlist projection of a collection, never the raw
// Graph data. Only what the compliance engine reads and what a change report
// compares is kept; script bodies, app payloads and every property not named
// here are dropped. Desktop only (Node).
import { createHash } from "node:crypto";
import {
  getItemLabel,
  getStableItemId,
  type ConfigurationSectionData,
} from "../configuration-sections";
import { COMPLIANCE_CAPABILITIES } from "../compliance/capabilities";
import { isAssessedFramework, normalizeOdataType } from "../compliance/engine";
import {
  canonicalPlatforms,
  canonicalRecordValue,
  isKeyValuePair,
  MAX_ITEM_JSON_DEPTH,
  MAX_SETTING_DEPTH,
  METADATA_KEYS,
  normalizeTargetType,
  settingsLayout,
  TARGET_FIELDS,
  unreadableOmaValue,
} from "../compliance/graph-rows";
import { canonicalOmaUri } from "../compliance/oma-uri";
import { frameworkCoverageLabel } from "../compliance/presentation";
import { FAMILY_ITEM_TYPES } from "../compliance/graph-property-types";
import { REDACTED_VALUE, redactedDigests } from "../intune-policy-registry";
import type { StoredBenchmarkRun } from "../benchmarks/history";
import type {
  AssessmentScope,
  CapabilityStatus,
  ComplianceAssessment,
  ControlStatus,
  FrameworkAssessment,
  TechnicalCheck,
} from "../compliance/types";

export const SNAPSHOT_FORMAT = "intunedoc.snapshot/1";

export type SnapshotSectionStatus = "complete" | "failed" | "skipped";

export interface SnapshotItem {
  // getStableItemId of the item in its section.
  id: string;
  // Allowlisted Graph properties in the shape the engine reads.
  data: Record<string, unknown>;
  // Details or assignments were not fully collected.
  incomplete?: true;
  // Keyed digests of content that is never stored, such as script bodies
  // and secret values (see VALUE_FINGERPRINT and SnapshotFingerprint).
  fingerprints?: Record<string, string>;
}

export interface SnapshotSection {
  key: string;
  familyKey: string;
  label: string;
  status: SnapshotSectionStatus;
  error?: string;
  items: SnapshotItem[];
}

export interface SnapshotFetchError {
  policyId: string;
  policyName: string;
  policyType: string;
  familyKey?: string;
  error: string;
  statusCode?: number;
  endpoint?: string;
  partial?: boolean;
}

export interface SnapshotPermissionError {
  resource: string;
  message: string;
  requiredPermission: string;
}

export interface StoredEvidence {
  policyId: string;
  policyName: string;
  settingId: string;
  observedValue: string;
  // SHA-256 of the full value when observedValue was shortened to
  // MAX_CHECK_VALUE, so a change past it is still a change. Absent in
  // snapshots saved before it was kept.
  observedValueSha256?: string;
  verdict: "enforced" | "disabled";
  assignment: "assigned" | "notAssigned" | "unknown";
}

export interface StoredCheck {
  settingId: string;
  policyId?: string;
  policyName?: string;
  assessmentStatus: TechnicalCheck["assessmentStatus"];
  result: TechnicalCheck["result"];
  actualValue: string | null;
  // SHA-256 of the full value when actualValue was shortened.
  actualValueSha256?: string;
  // Assignment state of the policy checked, when the check names one.
  // Absent in snapshots saved before ruleset 2026.10.8.
  assignment?: "assigned" | "notAssigned" | "unknown";
}

export interface StoredCapability {
  id: string;
  name: string;
  platform: string;
  status: CapabilityStatus;
  evidence: StoredEvidence[];
  checks: StoredCheck[];
}

export interface StoredControl {
  id: string;
  title: string;
  status: ControlStatus;
  capabilityIds: string[];
}

export interface StoredFramework {
  id: string;
  name: string;
  version: string;
  totalRequirements?: number;
  coverageLabel?: string;
  summary: FrameworkAssessment["summary"];
  controls: StoredControl[];
}

// The assessment made at collection time, so history never depends on a
// later ruleset.
export interface StoredAssessment {
  rulesetVersion: string;
  generatedAt: string;
  scope: AssessmentScope;
  capabilities: StoredCapability[];
  frameworks: StoredFramework[];
}

type CollectionStatus = "collected" | "permissionDenied" | "failed" | "skipped";

export interface SnapshotTenantIdentityPolicies {
  authenticationMethods?: Record<string, unknown>;
  securityDefaults?: Record<string, unknown>;
  status: Record<string, CollectionStatus>;
  errors?: Record<string, string>;
}

export interface SnapshotPolicyDeviceStatus {
  collectedAt: string;
  sources: Record<string, CollectionStatus>;
  errors?: Record<string, string>;
  rows: Array<{
    policyId: string;
    policyName: string;
    source: string;
    succeeded: number | null;
    error: number | null;
    conflict: number | null;
    notApplicable: number | null;
    pending: number | null;
  }>;
}

export interface SnapshotProjection {
  format: typeof SNAPSHOT_FORMAT;
  collectedAt: string;
  collectionStartedAt?: string;
  rulesetVersion: string;
  // Some family, policy or permission could not be collected.
  partial: boolean;
  collectionSkippedFamilies: string[];
  fetchErrors: SnapshotFetchError[];
  permissionErrors: SnapshotPermissionError[];
  sections: SnapshotSection[];
  groupNames: Record<string, string>;
  tenantIdentityPolicies?: SnapshotTenantIdentityPolicies;
  policyDeviceStatus?: SnapshotPolicyDeviceStatus;
  assessment: StoredAssessment;
  // Benchmark runs assessed on this collection, added after the snapshot was
  // saved. Ids, result codes, open setting ids and a pack digest only, never
  // titles or values (validateStoredRun rejects anything else). Absent in
  // snapshots saved before benchmark runs existed.
  benchmarks?: StoredBenchmarkRun[];
}

// What projectSnapshot reads from a collection.
export interface SnapshotSource {
  collectedAt?: string;
  collectionStartedAt?: string;
  collectionSkippedFamilies?: string[];
  sections?: ConfigurationSectionData[];
  fetchErrors?: Array<{
    policyId: string;
    policyName: string;
    policyType: string;
    familyKey?: string;
    error: string;
    statusCode?: number;
    endpoint?: string;
    partial?: boolean;
  }>;
  permissionErrors?: SnapshotPermissionError[];
  tenantIdentityPolicies?: unknown;
  policyDeviceStatus?: unknown;
}

type Json = Record<string, unknown>;
type Primitive = string | number | boolean;

const MAX_TEXT = 1000;
// Stored check and evidence values are shortened to this length, with the
// digest of the full value (storedValue).
export const MAX_CHECK_VALUE = 500;

// Item metadata kept for every family: identity, type, timing and the
// collection state the engine and the change report read.
const ITEM_KEYS = [
  "id",
  "policyId",
  "templateId",
  "displayName",
  "name",
  "@odata.type",
  "platforms",
  "platformType",
  "technologies",
  "lastModifiedDateTime",
  "version",
  "configType",
  "priority",
  "settingCount",
  "hasFetchError",
  // Script settings, never the script body.
  "fileName",
  "runAsAccount",
  "runAs32Bit",
  "enforceSignatureCheck",
  "executionFrequency",
  "retryCount",
  "blockExecutionNotifications",
] as const;

// Content compared by fingerprint only.
export const FINGERPRINT_LABELS: Readonly<Record<string, string>> = {
  scriptContent: "Script content",
  detectionScriptContent: "Detection script",
  remediationScriptContent: "Remediation script",
};

// Fingerprint keys of setting values that are never stored (secret Settings
// Catalog values and dropped custom OMA-URI values):
// value:<setting definition id or OMA-URI>#<occurrence>.
export const VALUE_FINGERPRINT = "value:";

// Called with each value that is dropped, so it is compared by fingerprint,
// with the type of the custom OMA-URI row that holds it (omaValueDigest).
type DroppedValue = (
  settingId: string,
  content: string,
  type?: unknown,
) => void;

// Turns the SHA-256 digest of content that is not stored into the stored
// fingerprint. The desktop keys it (HMAC-SHA256 with a key derived from the
// history master key), so a low entropy secret such as a Wi-Fi key cannot be
// found by hashing guesses. Without one, no fingerprints are kept.
export type SnapshotFingerprint = (digest: string) => string;

// The digest the collector takes of a value before it redacts it, and the
// one taken here of content the projection drops.
export function contentDigest(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// The digest a custom OMA-URI value that is not stored is fingerprinted
// from, with the type of its row (graph-rows.ts), so a value whose type
// changed, such as the text "1" of a secret URI that became the integer 1,
// reads as changed in History although both texts are the same. A value of
// the String type, which most values that are not stored have, keeps the
// digest of its text, as snapshots saved before took it, so they stay
// comparable; the digest of a value of another type is named by its type,
// which a bare digest never is. Other records keep the digest: their values
// are compared with their type in their rows (settings-flatten.ts).
function omaValueDigest(type: unknown, digest: string): string {
  const name = normalizeTargetType(type);
  return !name.startsWith("omasetting") || name === "omasettingstring"
    ? digest
    : `${name}:${digest}`;
}

// Fields the compound policy checks read, by normalized @odata.type. Each
// type has one of the two scan day properties (Graph beta schema).
const POLICY_CHECK_FIELDS: Readonly<Record<string, readonly string[]>> = {
  windows10generalconfiguration: [
    "defenderSystemScanSchedule",
    "defenderScanType",
    "defenderScheduledScanTime",
  ],
  windows10endpointprotectionconfiguration: [
    "defenderScheduledScanDay",
    "defenderScanType",
    "defenderScheduledScanTime",
  ],
  windowsupdateforbusinessconfiguration: [
    "qualityUpdatesDeferralPeriodInDays",
    "deadlineForQualityUpdatesInDays",
    "deadlineGracePeriodInDays",
    "qualityUpdatesPaused",
    "automaticUpdateMode",
  ],
};

// The registry section of reusable policy settings (intune-policy-registry.ts).
const REUSABLE_SETTINGS = "reusablePolicySettings";

// Families listed from a polymorphic Graph collection, which returns the
// @odata.type of every item (deviceConfigurations, deviceCompliancePolicies
// and deviceEnrollmentConfigurations, lab tenant, 23 October 2026). The
// fields kept and the types they are read by follow that type, so an item
// without one of the types Graph documents for its family
// (graph-property-types.ts FAMILY_ITEM_TYPES) is incomplete: its kept
// fields would read as missing instead of unknown. Conditional Access is
// typed by its family (graph-property-types.ts); Settings Catalog, intent
// and administrative template rows carry their own identifiers; the app
// protection lists return no type at all (lab tenant, 23 October 2026), so
// a missing one there is how Graph returns them, not a gap.
const undocumentedItemType = (familyKey: string, raw: Json) =>
  Object.hasOwn(FAMILY_ITEM_TYPES, familyKey) &&
  !FAMILY_ITEM_TYPES[familyKey]!.has(normalizeTargetType(raw["@odata.type"]));

// The platforms of a Settings Catalog policy select the platform Compare
// groups its settings under, so a value that is no set of documented
// deviceManagementConfigurationPlatforms members leaves them unknown. Graph
// returns them on every Settings Catalog policy (the collector selects
// them), so one without them is unknown too.
const undocumentedPlatforms = (familyKey: string, raw: Json) =>
  familyKey === "settingsCatalog" ||
  (raw.platforms !== undefined && raw.platforms !== null)
    ? canonicalPlatforms(raw.platforms) === null
    : false;

const APPLOCKER_NODE =
  /^\.\/Vendor\/MSFT\/AppLocker\/ApplicationLaunchRestrictions\/[^/]+\/(EXE|DLL|MSI|Script)\/(Policy|EnforcementMode)$/;

// Built from the capability definitions, so new detectors are kept without
// touching this file.
let engineSignals:
  | { paths: Map<string, Set<string>>; omaUris: Set<string> }
  | undefined;

function signals() {
  if (engineSignals) return engineSignals;
  const paths = new Map<string, Set<string>>();
  const omaUris = new Set<string>();
  for (const capability of COMPLIANCE_CAPABILITIES) {
    for (const signal of capability.signals) {
      if (signal.source === "graphProperty") {
        for (const type of signal.odataTypes) {
          const key = type.toLowerCase();
          const set = paths.get(key) ?? new Set<string>();
          set.add(signal.propertyPath);
          paths.set(key, set);
        }
      } else if (signal.source === "omaUri") {
        const uri = canonicalOmaUri(signal.settingId);
        if (uri) omaUris.add(uri);
      }
    }
  }
  engineSignals = { paths, omaUris };
  return engineSignals;
}

// Conditional Access fields Graph beta returns on every policy (lab tenant,
// 21 and 23 October 2026): the state, the required conditions, the grant
// lists and the target lists, and
// the allowlisted fields of an authentication strength that is not null
// (the authenticationStrengthPolicy resource returns each of them, lab
// tenant, 21 October 2026). Each child follows its parent, so an omitted
// strength is marked field by field under the keys real values have.
const CA_EXPECTED_PATHS = [
  "state",
  // Required in conditionalAccessConditionSet (Graph beta reference); the
  // lab tenant returns them as lists.
  "conditions.clientAppTypes",
  "conditions.signInRiskLevels",
  "conditions.userRiskLevels",
  ...[
    "operator",
    "builtInControls",
    "customAuthenticationFactors",
    "termsOfUse",
    "authenticationStrength",
    ...[
      "id",
      "displayName",
      "policyType",
      "requirementsSatisfied",
      "allowedCombinations",
    ].map((key) => `authenticationStrength.${key}`),
  ].map((key) => `grantControls.${key}`),
  ...["include", "exclude"].flatMap((mode) => [
    ...["Users", "Groups", "Roles"].map(
      (target) => `conditions.users.${mode}${target}`,
    ),
    `conditions.applications.${mode}Applications`,
  ]),
];

/**
 * The paths of fields a stored policy lacks although Graph returns them for
 * its family or template type (null when not set): their values are
 * unknown. A field under a parent returned as null is not configured, so it
 * is not listed.
 */
export function omittedFields(familyKey: string, data: Json): string[] {
  const type = normalizeOdataType(data["@odata.type"]);
  const paths =
    familyKey === "conditionalAccessPolicies"
      ? CA_EXPECTED_PATHS
      : [
          ...new Set([
            ...(POLICY_CHECK_FIELDS[type] ?? []),
            ...(signals().paths.get(type) ?? []),
          ]),
        ];
  return paths.filter((path) => {
    let current: unknown = data;
    for (const segment of path.split(".")) {
      if (current === null) return false;
      if (!isRecord(current) || !Object.hasOwn(current, segment)) return true;
      current = current[segment];
    }
    return false;
  });
}

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPrimitive(value: unknown): value is Primitive {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function text(value: unknown, max = MAX_TEXT): string | undefined {
  return typeof value === "string" ? value.slice(0, max) : undefined;
}

// An id as Graph returned it, never shortened, so two settings stay apart.
function idText(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// A primitive or a list of primitives; anything else is dropped.
function plainValue(
  value: unknown,
): Primitive | Primitive[] | null | undefined {
  if (value === null) return null;
  if (isPrimitive(value)) return value;
  if (Array.isArray(value) && value.every(isPrimitive)) return [...value];
  return undefined;
}

// A plain property value the projection keeps: a primitive, a list of
// primitives or null. A value of another shape, such as a record or a list
// holding one, is kept as a list holding an empty record, which no
// documented type reads (graph-rows.ts unreadableProperties), so it reads
// as unreadable instead of as a property Graph did not return.
function keptValue(
  value: unknown,
): Primitive | Primitive[] | Json[] | null | undefined {
  const kept = plainValue(value);
  return kept === undefined && value !== undefined ? [{}] : kept;
}

// A nested allowlist: true keeps a plain property value (keptValue); an
// object keeps the named fields of a nested object, or null.
interface Shape {
  readonly [key: string]: true | Shape;
}

// Keys in source order, so a restored policy reads like the collected one.
function projectShape(
  value: unknown,
  shape: Shape,
): Json | Json[] | null | undefined {
  if (value === null || value === undefined) return value;
  if (!isRecord(value)) return [{}];
  const out: Json = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!Object.hasOwn(shape, key)) continue;
    const rule = shape[key]!;
    const kept = rule === true ? keptValue(entry) : projectShape(entry, rule);
    if (kept !== undefined) out[key] = kept;
  }
  return out;
}

// Conditional Access: what the policy checks read (state, grant operator,
// built in controls, authentication strength, users and applications) and
// the documented conditions the engine shows as the policy's scope. Field
// names from the Graph conditionalAccessConditionSet and
// conditionalAccessGrantControls schemas, checked against a beta response
// in the lab tenant (2026-10-18). Anything else is dropped.
const CA_FILTER: Shape = { mode: true, rule: true };
const CA_GUESTS: Shape = {
  guestOrExternalUserTypes: true,
  externalTenants: { "@odata.type": true, membershipKind: true, members: true },
};
const CA_CONDITIONS: Shape = {
  userRiskLevels: true,
  signInRiskLevels: true,
  servicePrincipalRiskLevels: true,
  insiderRiskLevels: true,
  agentIdRiskLevels: true,
  clientAppTypes: true,
  // Deprecated or not yet documented; kept only while Graph returns null.
  times: true,
  agents: true,
  users: {
    includeUsers: true,
    excludeUsers: true,
    includeGroups: true,
    excludeGroups: true,
    includeRoles: true,
    excludeRoles: true,
    includeGuestsOrExternalUsers: CA_GUESTS,
    excludeGuestsOrExternalUsers: CA_GUESTS,
  },
  applications: {
    includeApplications: true,
    excludeApplications: true,
    includeUserActions: true,
    includeAgentActions: true,
    includeAuthenticationContextClassReferences: true,
    applicationFilter: CA_FILTER,
  },
  platforms: { includePlatforms: true, excludePlatforms: true },
  locations: { includeLocations: true, excludeLocations: true },
  deviceStates: { includeStates: true, excludeStates: true },
  devices: {
    includeDevices: true,
    excludeDevices: true,
    includeDeviceStates: true,
    excludeDeviceStates: true,
    deviceFilter: CA_FILTER,
  },
  clientApplications: {
    includeServicePrincipals: true,
    excludeServicePrincipals: true,
    includeAgentIdServicePrincipals: true,
    excludeAgentIdServicePrincipals: true,
    servicePrincipalFilter: CA_FILTER,
    agentIdServicePrincipalFilter: CA_FILTER,
  },
  authenticationFlows: { transferMethods: true },
};
const CA_GRANT_CONTROLS: Shape = {
  operator: true,
  builtInControls: true,
  customAuthenticationFactors: true,
  termsOfUse: true,
  authenticationStrength: {
    id: true,
    displayName: true,
    policyType: true,
    requirementsSatisfied: true,
    allowedCombinations: true,
  },
};

/**
 * Every plain property path the projection keeps, by normalized resource
 * type, with "" for the item keys of every item: what
 * compliance/graph-property-types.ts must type (graph-property-types.test.ts).
 */
export function keptPlainProperties(): Record<string, string[]> {
  const leaves = (shape: Shape, prefix: string): string[] =>
    Object.entries(shape).flatMap(([key, rule]) =>
      rule === true ? [`${prefix}${key}`] : leaves(rule, `${prefix}${key}.`),
    );
  const out: Record<string, string[]> = {
    "": ITEM_KEYS.filter((key) => !METADATA_KEYS.has(key)),
    conditionalaccesspolicy: [
      "state",
      ...leaves(CA_CONDITIONS, "conditions."),
      ...leaves(CA_GRANT_CONTROLS, "grantControls."),
    ],
  };
  for (const [type, fields] of Object.entries(POLICY_CHECK_FIELDS))
    out[type] = [...fields];
  for (const [type, paths] of signals().paths)
    out[type] = [...new Set([...(out[type] ?? []), ...paths])];
  return out;
}

function pick(source: Json, keys: readonly string[]): Json {
  const out: Json = {};
  for (const key of keys) {
    const value = plainValue(source[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function setPath(target: Json, path: string, value: unknown): void {
  const segments = path.split(".");
  let current = target;
  segments.slice(0, -1).forEach((segment) => {
    if (!isRecord(current[segment])) current[segment] = {};
    current = current[segment] as Json;
  });
  current[segments[segments.length - 1]!] = value;
}

// The value at path, or the first parent on the way that is null.
function nullablePath(
  source: unknown,
  path: string,
): { path: string; value: unknown } {
  const segments = path.split(".");
  let current = source;
  for (const [index, segment] of segments.entries()) {
    if (current === null && index > 0)
      return { path: segments.slice(0, index).join("."), value: null };
    if (!isRecord(current)) return { path, value: undefined };
    current = current[segment];
  }
  return { path, value: current };
}

function getPath(source: unknown, path: string): unknown {
  let current = source;
  for (const segment of path.split(".")) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function projectAssignments(value: unknown): Json[] | undefined {
  if (value === undefined) return undefined;
  // Assignments Graph returned as a value that is not a list (an object,
  // null, a string or a number) may hold any assignment, so they are kept
  // as a list holding one assignment without a target: a restored snapshot
  // reads them as unreadable (graph-rows.ts), never as no assignments.
  return asRecords(Array.isArray(value) ? value : [{}]).map((assignment) => {
    const target = isRecord(assignment.target) ? assignment.target : {};
    const keys = [
      "@odata.type",
      ...TARGET_FIELDS,
      "groupName",
      "deviceAndAppManagementAssignmentFilterId",
      "deviceAndAppManagementAssignmentFilterType",
    ];
    return {
      // An intent Graph returned as no text is kept empty, so it reads as
      // unreadable (graph-rows.ts) instead of as an assignment without one.
      ...(assignment.intent !== undefined &&
      assignment.intent !== null &&
      typeof assignment.intent !== "string"
        ? { intent: "" }
        : pick(assignment, ["intent"])),
      // Every field that says what a documented target type targets
      // (graph-rows.ts), so history compares each of them. A field Graph
      // returned as a value that is not kept is kept empty, so it reads as
      // unreadable instead of absent.
      target: {
        ...Object.fromEntries(
          keys
            .filter((key) => target[key] !== undefined)
            .map((key) => [key, ""]),
        ),
        ...pick(target, keys),
      },
    };
  });
}

function projectCollectionStatus(value: unknown): Json | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value).filter(([, status]) => typeof status === "string"),
  );
}

// --- Settings Catalog ---------------------------------------------------------

function projectSimpleValue(
  value: unknown,
  dropped?: (content: string) => void,
): Json | undefined {
  if (!isRecord(value)) return undefined;
  const type = text(value["@odata.type"]);
  // Secret values are never stored, also when Graph returned one.
  const secret = Boolean(type && /secretsettingvalue$/i.test(type));
  if (secret && isPrimitive(value.value)) dropped?.(String(value.value));
  return {
    ...(type ? { "@odata.type": type } : {}),
    ...(!secret && isPrimitive(value.value) ? { value: value.value } : {}),
  };
}

function projectInstance(
  instance: unknown,
  depth = 0,
  dropped?: DroppedValue,
): Json | undefined {
  if (!isRecord(instance) || depth > MAX_SETTING_DEPTH) return undefined;
  const definitionId = idText(instance.settingDefinitionId);
  const drop =
    dropped && definitionId
      ? (content: string) => dropped(definitionId, content)
      : undefined;
  // A child that is no instance, or too deep to keep, is kept as an empty
  // one, so the instance reads as holding a setting without its id instead
  // of one setting fewer. A child list, or a value that holds one, that
  // Graph returned as another shape is kept as one such child, so it reads
  // as unknown (graph-rows.ts) instead of as holding no setting.
  const unknownChild = [{}];
  const children = (list: unknown) =>
    Array.isArray(list)
      ? list.map((child) => projectInstance(child, depth + 1, dropped) ?? {})
      : list == null
        ? undefined
        : unknownChild;
  const choice = (value: unknown) => {
    if (!isRecord(value)) return { children: unknownChild };
    const kept = children(value.children);
    return {
      ...(typeof value.value === "string" ? { value: value.value } : {}),
      ...(kept ? { children: kept } : {}),
    };
  };
  const group = (value: unknown) => ({
    children: (isRecord(value) && children(value.children)) || unknownChild,
  });
  const entries = (value: unknown, entry: (item: unknown) => Json) =>
    Array.isArray(value) ? value.map(entry) : [entry(undefined)];
  const out: Json = pick(instance, ["@odata.type", "settingDefinitionId"]);
  // Every value property Graph returned is kept, also on a type that does
  // not document it, so a stray one keeps the instance unreadable
  // (graph-rows.ts instanceValueKey) instead of reading as a valid instance
  // of its type. A simple value that is no record is kept as an empty one,
  // which has no readable value.
  if (instance.simpleSettingValue != null)
    out.simpleSettingValue =
      projectSimpleValue(instance.simpleSettingValue, drop) ?? {};
  if (instance.simpleSettingCollectionValue != null)
    out.simpleSettingCollectionValue = entries(
      instance.simpleSettingCollectionValue,
      (entry) => projectSimpleValue(entry, drop) ?? {},
    );
  if (instance.choiceSettingValue != null)
    out.choiceSettingValue = choice(instance.choiceSettingValue);
  if (instance.choiceSettingCollectionValue != null)
    out.choiceSettingCollectionValue = entries(
      instance.choiceSettingCollectionValue,
      choice,
    );
  if (instance.groupSettingValue != null)
    out.groupSettingValue = group(instance.groupSettingValue);
  if (instance.groupSettingCollectionValue != null)
    out.groupSettingCollectionValue = entries(
      instance.groupSettingCollectionValue,
      group,
    );
  return out;
}

// Names only, so the change report can show readable setting names.
function projectDefinitions(value: unknown): Json[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((definition) => ({
    ...pick(definition, ["id", "displayName"]),
    ...(Array.isArray(definition.options)
      ? {
          options: definition.options
            .filter(isRecord)
            .map((option) => pick(option, ["itemId", "name", "displayName"])),
        }
      : {}),
  }));
}

function projectSettings(
  value: unknown,
  family: string,
  dropped?: DroppedValue,
): Json[] | undefined {
  // An empty list is kept: Graph returned the settings and there are none,
  // which is not the same as settings it did not return (graph-rows.ts).
  if (!Array.isArray(value)) return undefined;
  // The layout comes from the family where it has one (graph-rows.ts). A
  // row of the layout that is no record, or lacks its instance or
  // definition id, is kept with an empty one, so it reads as a setting
  // without its id instead of one setting fewer.
  const layout = settingsLayout(family, value);
  if (layout === "settingsCatalog") {
    return asRecords(value).map((setting) => {
      const definitions = projectDefinitions(setting.settingDefinitions);
      return {
        ...pick(setting, ["id"]),
        settingInstance:
          projectInstance(setting.settingInstance, 0, dropped) ?? {},
        ...(definitions ? { settingDefinitions: definitions } : {}),
      };
    });
  }
  // Security baseline and endpoint security intents. Other layouts, such as
  // app configuration keys and values, are not kept.
  // A value of another shape is kept as a list holding an empty record
  // (keptValue), which no intent type reads, so it stays unreadable. Null
  // with the JSON text "null" is a setting that is not configured, so an
  // unreadable value is never kept as null.
  return layout === "intent"
    ? asRecords(value).map((setting) => {
        const kept = keptValue(setting.value);
        return {
          ...pick(setting, ["@odata.type", "definitionId"]),
          ...(kept !== undefined ? { value: kept } : {}),
          ...pick(setting, ["valueJson"]),
          definitionId:
            typeof setting.definitionId === "string"
              ? setting.definitionId
              : "",
        };
      })
    : undefined;
}

// --- Other setting layouts ----------------------------------------------------

// A row that is no record is kept as an empty one, here and for custom
// OMA-URI rows, assignments and method configurations, so it reads as a row
// without its identifier instead of one row fewer.
const asRecords = (value: unknown[]): Json[] =>
  value.map((entry) => (isRecord(entry) ? entry : {}));

// The name and value pairs of a list presentation are not kept: they are
// stored as one redacted value and compared by fingerprint, under the
// definition and presentation ids. Only a presentation typed as a list holds
// pairs, each a name of text with a value of text or null
// (graph-rows.ts isKeyValuePair). Values of any other shape, or a pair
// without them, are kept as null, which a list reads as unreadable. Values
// on a presentation type that holds one value are unreadable in any form
// they are kept in (graph-rows.ts unreadablePresentationValue), so they
// never read as a list that is not stored or as no values at all. The pairs
// are a set of named values (the ADMX list element,
// which Graph documents in no order), so the digest is taken of them sorted
// and a reordered list is no change.
function projectPresentationValues(
  type: unknown,
  values: unknown,
  settingId: string,
  dropped?: DroppedValue,
): unknown {
  if (values === undefined) return undefined;
  if (
    normalizeTargetType(type) === "grouppolicypresentationvaluelist" &&
    Array.isArray(values) &&
    values.length > 0 &&
    values.every(isKeyValuePair)
  ) {
    const pairs = values
      .map((pair) => JSON.stringify([pair.name, pair.value]))
      .sort();
    dropped?.(settingId, JSON.stringify(pairs));
    return [REDACTED_VALUE];
  }
  return plainValue(values) ?? null;
}

function projectDefinitionValues(
  value: unknown,
  dropped?: DroppedValue,
): Json[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return asRecords(value).map((row) => {
    const definition = isRecord(row.definition) ? row.definition : {};
    // Presentation values Graph returned as another shape than a list of
    // records, or not at all (the collector reads them for every value),
    // were not read, as when their fetch failed.
    const unread =
      !Array.isArray(row.presentationValues) ||
      !row.presentationValues.every(isRecord);
    return {
      ...pick(row, ["enabled", "presentationFetchError"]),
      ...(unread ? { presentationFetchError: true } : {}),
      definition: pick(definition, [
        "id",
        "displayName",
        "categoryPath",
        "classType",
      ]),
      presentationValues: (Array.isArray(row.presentationValues)
        ? row.presentationValues
        : []
      )
        .filter(isRecord)
        .map((presentationValue) => {
          const presentation = isRecord(presentationValue.presentation)
            ? presentationValue.presentation
            : {};
          const values = projectPresentationValues(
            presentationValue["@odata.type"],
            presentationValue.values,
            `${idText(definition.id) ?? ""}/${idText(presentation.id) ?? ""}`,
            dropped,
          );
          return {
            ...pick(presentationValue, ["@odata.type", "value"]),
            ...(values !== undefined ? { values } : {}),
            presentation: pick(presentation, ["@odata.type", "id", "label"]),
          };
        }),
    };
  });
}

// Custom OMA-URI values are kept for the URIs the engine reads (including
// AppLocker); other strings may be free-form secrets and are dropped.
function projectOmaSettings(
  value: unknown,
  dropped?: DroppedValue,
): Json[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const { omaUris } = signals();
  return asRecords(value).map((setting) => {
    const uri = canonicalOmaUri(setting.omaUri) ?? "";
    const read = omaUris.has(uri) || APPLOCKER_NODE.test(uri);
    const keep =
      setting.isEncrypted !== true &&
      (read ||
        typeof setting.value === "number" ||
        typeof setting.value === "boolean");
    // A value Graph did not return, or returned with another type than its
    // row documents, is kept as null, so it reads as unreadable
    // (graph-rows.ts) instead of as a value that is not stored.
    const unread =
      setting.isEncrypted !== true &&
      (!Object.hasOwn(setting, "value") || unreadableOmaValue(setting));
    // The fingerprint is of the canonical form of a typed value
    // (graph-rows.ts canonicalRecordValue) with its type (omaValueDigest),
    // so another text of the same date and time or XML is the same value in
    // History and a value of another type is not.
    if (!keep && !unread && isPrimitive(setting.value))
      dropped?.(
        idText(setting.omaUri) ?? "",
        String(canonicalRecordValue(setting["@odata.type"], setting.value)),
        setting["@odata.type"],
      );
    return {
      ...pick(setting, ["@odata.type", "omaUri", "displayName", "isEncrypted"]),
      ...(unread
        ? { value: null }
        : keep && isPrimitive(setting.value)
          ? { value: setting.value }
          : {}),
    };
  });
}

function projectScheduledActions(value: unknown): Json[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((rule) => ({
    ...pick(rule, ["ruleName"]),
    scheduledActionConfigurations: (Array.isArray(
      rule.scheduledActionConfigurations,
    )
      ? rule.scheduledActionConfigurations
      : []
    )
      .filter(isRecord)
      .map((action) => pick(action, ["actionType", "gracePeriodHours"])),
  }));
}

// The setting a nested record belongs to, by its stable id where it has
// one, so a renamed label never moves its fingerprint: a presentation is
// named by its id, its label only when Graph returned no id.
function settingName(record: Json): string | undefined {
  const presentation = isRecord(record.presentation)
    ? record.presentation
    : undefined;
  return (
    idText(record.settingDefinitionId) ??
    idText(record.omaUri) ??
    idText(record.appConfigKey) ??
    idText(presentation?.id) ??
    idText(presentation?.label) ??
    idText(record.name)
  );
}

// Every digest the collector took of a value it redacted on this item, with
// the nearest setting the value belongs to; undefined on the item itself.
// False when the item nests deeper than any value a stored item holds
// (MAX_ITEM_JSON_DEPTH): a redacted value below it would go unseen, so the
// item is incomplete.
function walkRedacted(
  value: unknown,
  owner: string | undefined,
  depth: number,
  found: (owner: string | undefined, field: string, digest: string) => void,
): boolean {
  if (value === null || typeof value !== "object") return true;
  if (depth > MAX_ITEM_JSON_DEPTH) return false;
  if (Array.isArray(value))
    return value.every((entry) => walkRedacted(entry, owner, depth + 1, found));
  const name = depth === 0 ? undefined : (settingName(value as Json) ?? owner);
  for (const [field, digest] of redactedDigests(value))
    found(
      name,
      field,
      field === "value"
        ? omaValueDigest((value as Json)["@odata.type"], digest)
        : digest,
    );
  return Object.values(value).every((nested) =>
    walkRedacted(nested, name, depth + 1, found),
  );
}

function projectItem(
  section: ConfigurationSectionData,
  raw: Json,
  index: number,
  itemErrors: ReadonlySet<string>,
  fingerprint?: SnapshotFingerprint,
): SnapshotItem {
  // The item's own Graph id (getStableItemId); without one it keeps only
  // its position.
  const id = getStableItemId(section, raw, index);
  const data: Json = {};
  for (const key of ITEM_KEYS) {
    // Metadata is never compared; the other item keys are plain properties.
    const value = METADATA_KEYS.has(key)
      ? plainValue(raw[key])
      : keptValue(raw[key]);
    if (value !== undefined) data[key] = value;
  }
  const odataType = normalizeOdataType(raw["@odata.type"]);
  const message = text(raw.fetchErrorMessage);
  if (message) data.fetchErrorMessage = message;
  if (isRecord(raw.templateReference))
    data.templateReference = pick(raw.templateReference, [
      "templateId",
      "templateFamily",
      "templateDisplayName",
      "templateDisplayVersion",
    ]);
  const collectionStatus = projectCollectionStatus(raw.collectionStatus);
  if (collectionStatus) data.collectionStatus = collectionStatus;
  const assignments = projectAssignments(raw.assignments);
  if (assignments) data.assignments = assignments;

  if (section.familyKey === "conditionalAccessPolicies") {
    const state = keptValue(raw.state);
    if (state !== undefined) data.state = state;
    const conditions = projectShape(raw.conditions, CA_CONDITIONS);
    if (conditions !== undefined) data.conditions = conditions;
    const grants = projectShape(raw.grantControls, CA_GRANT_CONTROLS);
    if (grants !== undefined) data.grantControls = grants;
  }
  const fingerprints: Record<string, string> = {};
  const occurrences = new Map<string, number>();
  const valueFingerprint = (settingId: string, digest: string) => {
    if (!fingerprint) return;
    const occurrence = occurrences.get(settingId) ?? 0;
    occurrences.set(settingId, occurrence + 1);
    fingerprints[`${VALUE_FINGERPRINT}${settingId}#${occurrence}`] =
      fingerprint(digest);
  };
  // A value the collector redacted is fingerprinted from its digest below.
  const dropped: DroppedValue = (settingId, content, type) => {
    if (content !== REDACTED_VALUE)
      valueFingerprint(settingId, omaValueDigest(type, contentDigest(content)));
  };
  const settings = projectSettings(raw.settings, section.familyKey, dropped);
  if (settings) data.settings = settings;
  // A reusable policy setting holds one Settings Catalog instance, kept with
  // the same checks as a policy's settings. An instance of another shape is
  // kept as an empty one, which has no definition id (graph-rows.ts).
  const reusable = section.key === REUSABLE_SETTINGS;
  if (reusable && raw.settingInstance != null)
    data.settingInstance =
      projectInstance(raw.settingInstance, 0, dropped) ?? {};
  // Categories or category settings Graph returned as another shape than a
  // list are kept as a list holding a row without its identifier, so they
  // read as unknown (graph-rows.ts) instead of as holding no setting.
  const categorySettings = (value: unknown) =>
    projectSettings(
      Array.isArray(value) || value == null ? value : [{}],
      section.familyKey,
      dropped,
    ) ?? [];
  if (raw.categories != null)
    data.categories = Array.isArray(raw.categories)
      ? raw.categories.map((category) =>
          isRecord(category)
            ? {
                ...pick(category, ["id", "displayName"]),
                settings: categorySettings(category.settings),
              }
            : { settings: categorySettings({}) },
        )
      : [{ settings: categorySettings({}) }];
  const definitionValues = projectDefinitionValues(
    raw.definitionValues,
    dropped,
  );
  if (definitionValues) data.definitionValues = definitionValues;
  const omaSettings = projectOmaSettings(raw.omaSettings, dropped);
  if (omaSettings) data.omaSettings = omaSettings;
  const scheduled = projectScheduledActions(raw.scheduledActionsForRule);
  if (scheduled) data.scheduledActionsForRule = scheduled;
  for (const key of POLICY_CHECK_FIELDS[odataType] ?? []) {
    const value = keptValue(raw[key]);
    if (value !== undefined) data[key] = value;
  }
  for (const path of signals().paths.get(odataType) ?? []) {
    // A parent Graph returned as null (not configured) is kept as null, so
    // the restored policy does not read as one that omitted the property.
    const found = nullablePath(raw, path);
    const value = keptValue(found.value);
    if (value !== undefined) setPath(data, found.path, value);
  }

  for (const key of Object.keys(FINGERPRINT_LABELS)) {
    const content = raw[key];
    if (
      fingerprint &&
      typeof content === "string" &&
      content &&
      content !== REDACTED_VALUE
    )
      fingerprints[key] = fingerprint(contentDigest(content));
  }
  const walked = walkRedacted(raw, undefined, 0, (owner, field, digest) => {
    if (!fingerprint) return;
    if (owner === undefined && Object.hasOwn(FINGERPRINT_LABELS, field))
      fingerprints[field] = fingerprint(digest);
    else valueFingerprint(owner ?? field, digest);
  });
  const incomplete =
    raw.hasFetchError === true ||
    Object.values(collectionStatus ?? {}).includes("incomplete") ||
    (definitionValues ?? []).some(
      (row) => row.presentationFetchError === true,
    ) ||
    itemErrors.has(id) ||
    // The content of a reusable setting Graph did not return is unknown,
    // never no setting.
    (reusable && !isRecord(raw.settingInstance)) ||
    undocumentedItemType(section.familyKey, raw) ||
    undocumentedPlatforms(section.familyKey, raw) ||
    !walked;
  return {
    id,
    data,
    ...(incomplete ? { incomplete: true as const } : {}),
    ...(Object.keys(fingerprints).length ? { fingerprints } : {}),
  };
}

// A family failed when the list itself could not be read: the top level
// fetch rejected ("N/A"), a list request failed ("collection-..."), or a
// registry section reported an error.
function familyFailed(
  section: ConfigurationSectionData,
  errors: NonNullable<SnapshotSource["fetchErrors"]>,
): boolean {
  if (section.error) return true;
  return errors.some(
    (error) =>
      error.policyId === section.key ||
      (error.familyKey === section.familyKey &&
        (error.policyId === "N/A" || error.policyId.startsWith("collection-"))),
  );
}

function statusRecord(value: unknown, known: readonly string[]) {
  const out: Record<string, CollectionStatus> = {};
  if (!isRecord(value)) return out;
  for (const [key, status] of Object.entries(value)) {
    if (
      typeof status === "string" &&
      ["collected", "permissionDenied", "failed", "skipped"].includes(status) &&
      (known.length === 0 || known.includes(key))
    )
      out[key] = status as CollectionStatus;
  }
  return out;
}

function errorRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .filter(([, message]) => typeof message === "string")
    .map(([key, message]) => [key, (message as string).slice(0, 300)]);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

const IDENTITY_POLICIES = [
  "authenticationMethods",
  "securityDefaults",
] as const;

// Fields verified against Graph beta in the lab tenant (2026-10-18).
function projectIdentity(
  value: unknown,
): SnapshotTenantIdentityPolicies | undefined {
  if (!isRecord(value)) return undefined;
  const out: SnapshotTenantIdentityPolicies = {
    status: statusRecord(value.status, IDENTITY_POLICIES),
  };
  const errors = errorRecord(value.errors);
  if (errors) out.errors = errors;
  const methods = value.authenticationMethods;
  if (isRecord(methods)) {
    // A target list is kept only when Graph returned one, so an omitted list
    // stays unreadable instead of reading as empty. An entry that is no
    // object is kept as an empty one, so the list stays unreadable instead
    // of reading as one target fewer.
    const targets = (
      key: string,
      source: Json,
      fields: readonly string[] = ["targetType", "id"],
    ): Json =>
      Array.isArray(source[key])
        ? {
            [key]: (source[key] as unknown[]).map((target) =>
              isRecord(target) ? pick(target, fields) : {},
            ),
          }
        : {};
    out.authenticationMethods = {
      ...pick(methods, ["policyMigrationState"]),
      ...(Array.isArray(methods.authenticationMethodConfigurations)
        ? {
            authenticationMethodConfigurations: asRecords(
              methods.authenticationMethodConfigurations,
            ).map((configuration) => ({
              ...pick(configuration, ["@odata.type", "id", "state"]),
              ...targets("includeTargets", configuration),
              ...targets("excludeTargets", configuration),
              // The X.509 default mode the engine reports with the method.
              ...(isRecord(configuration.authenticationModeConfiguration)
                ? {
                    authenticationModeConfiguration: pick(
                      configuration.authenticationModeConfiguration,
                      ["x509CertificateAuthenticationDefaultMode"],
                    ),
                  }
                : {}),
            })),
          }
        : {}),
    };
    // The registration campaign, compared by the change report (fields
    // checked against Graph beta in the lab tenant, 2026-10-18).
    const campaign = getPath(
      methods,
      "registrationEnforcement.authenticationMethodsRegistrationCampaign",
    );
    if (isRecord(campaign))
      out.authenticationMethods.registrationEnforcement = {
        authenticationMethodsRegistrationCampaign: {
          ...pick(campaign, [
            "state",
            "snoozeDurationInDays",
            "enforceRegistrationAfterAllowedSnoozes",
          ]),
          ...targets("includeTargets", campaign, [
            "targetType",
            "id",
            "targetedAuthenticationMethod",
          ]),
          ...targets("excludeTargets", campaign),
        },
      };
  }
  if (isRecord(value.securityDefaults))
    out.securityDefaults = pick(value.securityDefaults, ["isEnabled"]);
  return out;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function projectDeviceStatus(
  value: unknown,
): SnapshotPolicyDeviceStatus | undefined {
  if (!isRecord(value) || typeof value.collectedAt !== "string")
    return undefined;
  const errors = errorRecord(value.errors);
  return {
    collectedAt: value.collectedAt,
    sources: statusRecord(value.sources, []),
    ...(errors ? { errors } : {}),
    rows: (Array.isArray(value.rows) ? value.rows : [])
      .filter(isRecord)
      .filter((row) => typeof row.policyId === "string")
      .map((row) => ({
        policyId: row.policyId as string,
        policyName: text(row.policyName, 300) ?? "",
        source: text(row.source, 100) ?? "",
        succeeded: count(row.succeeded),
        error: count(row.error),
        conflict: count(row.conflict),
        notApplicable: count(row.notApplicable),
        pending: count(row.pending),
      })),
  };
}

// A check or evidence value as stored: shortened to MAX_CHECK_VALUE, with
// the digest of the full value, so the history diff compares the full
// value. A value of exactly that length gets one too, so only a snapshot
// saved before digests were kept holds one without (diff.ts).
function storedValue(value: string): { value: string; sha256?: string } {
  return value.length >= MAX_CHECK_VALUE
    ? { value: value.slice(0, MAX_CHECK_VALUE), sha256: contentDigest(value) }
    : { value };
}

// The Conditional Access compound checks report the policy's state, grant
// controls and conditions as JSON; only their allowlisted fields are kept.
function storedActualValue(check: TechnicalCheck): string | null {
  let value = check.actualValue;
  if (value && check.settingId.startsWith("conditionalAccess")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (isRecord(parsed)) {
        value = JSON.stringify(
          projectShape(parsed, {
            state: true,
            grantControls: CA_GRANT_CONTROLS,
            conditions: CA_CONDITIONS,
          }),
        );
      }
    } catch {
      // Plain text, as the engine reports it for other checks.
    }
  }
  return value ?? null;
}

// A snapshot saved by an earlier version can hold a framework that was
// removed since. It is dropped on read, so History, Compare and Portfolio
// never show or count it.
export function withAssessedFrameworks(
  projection: SnapshotProjection,
): SnapshotProjection {
  const frameworks = projection.assessment?.frameworks;
  if (!Array.isArray(frameworks)) return projection;
  return {
    ...projection,
    assessment: {
      ...projection.assessment,
      frameworks: frameworks.filter((framework) =>
        isAssessedFramework(framework?.id),
      ),
    },
  };
}

// The stored assessment keeps statuses, evidence and check results, not the
// capability or control definitions.
export function compactAssessment(
  assessment: ComplianceAssessment,
): StoredAssessment {
  return {
    rulesetVersion: assessment.provenance.rulesetVersion,
    generatedAt: assessment.generatedAt,
    scope: assessment.scope,
    capabilities: assessment.capabilities.map((result) => ({
      id: result.capability.id,
      name: result.capability.name,
      platform: result.capability.platform,
      status: result.status,
      evidence: result.evidence.map((evidence) => {
        const observed = storedValue(evidence.observedValue);
        return {
          policyId: evidence.policyId,
          policyName: evidence.policyName,
          settingId: evidence.settingId,
          observedValue: observed.value,
          ...(observed.sha256 ? { observedValueSha256: observed.sha256 } : {}),
          verdict: evidence.verdict,
          assignment: evidence.assignment.state,
        };
      }),
      checks: result.checks.map((check) => {
        const full = storedActualValue(check);
        const actual = full === null ? null : storedValue(full);
        return {
          settingId: check.settingId,
          ...(check.policyId ? { policyId: check.policyId } : {}),
          ...(check.policyName ? { policyName: check.policyName } : {}),
          assessmentStatus: check.assessmentStatus,
          result: check.result,
          actualValue: actual?.value ?? null,
          ...(actual?.sha256 ? { actualValueSha256: actual.sha256 } : {}),
          ...(check.assignment ? { assignment: check.assignment.state } : {}),
        };
      }),
    })),
    frameworks: assessment.frameworks.map((framework) => {
      const coverageLabel = frameworkCoverageLabel(framework);
      return {
        id: framework.framework.id,
        name: framework.framework.name,
        version: framework.framework.version,
        ...(framework.framework.totalRequirements !== undefined
          ? { totalRequirements: framework.framework.totalRequirements }
          : {}),
        ...(coverageLabel ? { coverageLabel } : {}),
        summary: framework.summary,
        controls: framework.controls.map((control) => ({
          id: control.control.id,
          title: control.control.title,
          status: control.status,
          capabilityIds: [...control.capabilityIds],
        })),
      };
    }),
  };
}

export function projectSnapshot(
  collection: SnapshotSource,
  assessment: ComplianceAssessment,
  groupNames: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
  fingerprint?: SnapshotFingerprint,
): SnapshotProjection {
  const fetchErrors = collection.fetchErrors ?? [];
  const skipped = collection.collectionSkippedFamilies ?? [];
  const sections: SnapshotSection[] = (collection.sections ?? []).map(
    (section) => {
      const itemErrors = new Set(
        fetchErrors
          .filter(
            (error) =>
              !error.familyKey || error.familyKey === section.familyKey,
          )
          .map((error) => error.policyId),
      );
      const status: SnapshotSectionStatus = familyFailed(section, fetchErrors)
        ? "failed"
        : skipped.includes(section.familyKey)
          ? "skipped"
          : "complete";
      const error = text(section.error?.message);
      return {
        key: section.key,
        familyKey: section.familyKey,
        label: section.label,
        status,
        ...(error ? { error } : {}),
        // An item Graph returned as no record is kept without an id, which
        // names no item in any section (isItemIdentity), and incomplete,
        // so it reads as an unknown policy (diff.ts), never as one policy
        // fewer or as a removed singleton.
        items: section.items.map((item, index) =>
          isRecord(item)
            ? projectItem(section, item, index, itemErrors, fingerprint)
            : { id: "", data: {}, incomplete: true },
        ),
      };
    },
  );
  const names =
    groupNames instanceof Map
      ? Object.fromEntries(groupNames)
      : { ...(groupNames as Record<string, string>) };
  const identity = projectIdentity(collection.tenantIdentityPolicies);
  const deviceStatus = projectDeviceStatus(collection.policyDeviceStatus);
  const permissionErrors = (collection.permissionErrors ?? []).map((error) => ({
    resource: text(error.resource, 200) ?? "",
    message: text(error.message) ?? "",
    requiredPermission: text(error.requiredPermission, 200) ?? "",
  }));
  return {
    format: SNAPSHOT_FORMAT,
    collectedAt: collection.collectedAt ?? assessment.generatedAt,
    ...(collection.collectionStartedAt
      ? { collectionStartedAt: collection.collectionStartedAt }
      : {}),
    rulesetVersion: assessment.provenance.rulesetVersion,
    partial:
      fetchErrors.length > 0 ||
      permissionErrors.length > 0 ||
      skipped.length > 0 ||
      sections.some((section) => section.status !== "complete") ||
      Object.values(identity?.status ?? {}).some(
        (status) => status !== "collected",
      ),
    collectionSkippedFamilies: [...skipped],
    fetchErrors: fetchErrors.map((error) => ({
      policyId: error.policyId,
      policyName: text(error.policyName, 300) ?? "",
      policyType: text(error.policyType, 200) ?? "",
      ...(error.familyKey ? { familyKey: error.familyKey } : {}),
      error: text(error.error) ?? "",
      ...(typeof error.statusCode === "number"
        ? { statusCode: error.statusCode }
        : {}),
      ...(error.endpoint ? { endpoint: text(error.endpoint, 500) } : {}),
      ...(error.partial ? { partial: true } : {}),
    })),
    permissionErrors,
    sections,
    groupNames: Object.fromEntries(
      Object.entries(names).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    ...(identity ? { tenantIdentityPolicies: identity } : {}),
    ...(deviceStatus ? { policyDeviceStatus: deviceStatus } : {}),
    assessment: compactAssessment(assessment),
  };
}

// Legacy per type arrays the engine falls back to, by section key.
const LEGACY_ARRAYS = [
  "settingsCatalog",
  "deviceConfigurations",
  "administrativeTemplates",
  "securityBaselines",
  "compliancePolicies",
  "appProtectionPolicies",
  "appConfigurations",
  "windowsUpdatePolicies",
  "enrollmentConfigurations",
  "conditionalAccessPolicies",
] as const;

// A collection shaped like DetailedExportData from a stored snapshot, for the
// engine and the change report. Script bodies and dropped properties stay
// absent.
export function restoreCollection(projection: SnapshotProjection) {
  const sections: ConfigurationSectionData[] = projection.sections.map(
    (section) => ({
      key: section.key,
      familyKey: section.familyKey,
      label: section.label,
      selectionPrefix: section.key,
      items: section.items.map((item) => ({ ...item.data })),
      ...(section.error ? { error: { message: section.error } } : {}),
    }),
  );
  const itemsOf = (key: string) =>
    sections.find((section) => section.key === key)?.items ?? [];
  const legacy = Object.fromEntries(
    LEGACY_ARRAYS.map((key) => [key, itemsOf(key)]),
  ) as Record<(typeof LEGACY_ARRAYS)[number], unknown[]>;
  return {
    collectedAt: projection.collectedAt,
    collectionStartedAt: projection.collectionStartedAt,
    collectionSkippedFamilies: [...projection.collectionSkippedFamilies],
    ...legacy,
    scripts: {
      windows: itemsOf("windowsScripts"),
      macOS: itemsOf("macOSScripts"),
    },
    sections,
    fetchErrors: projection.fetchErrors.map((error) => ({ ...error })),
    permissionErrors: projection.permissionErrors.map((error) => ({
      ...error,
    })),
    groupNames: new Map(Object.entries(projection.groupNames)),
    ...(projection.tenantIdentityPolicies
      ? { tenantIdentityPolicies: projection.tenantIdentityPolicies }
      : {}),
    ...(projection.policyDeviceStatus
      ? { policyDeviceStatus: projection.policyDeviceStatus }
      : {}),
  };
}

// Display name of a stored item, as the documentation shows it.
export function snapshotItemLabel(
  section: Pick<SnapshotSection, "label">,
  item: SnapshotItem,
): string {
  return getItemLabel(section, item.data);
}

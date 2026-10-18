// Golden baseline: a settings only reference of one tenant, saved as a file
// and compared with the current collection or another tenant's snapshot.
// Both sides go through the snapshot projection, so secrets, script bodies
// and properties the engine does not read never reach a reference. The
// checksum detects damage, not authorship: anyone can recompute it.
// Desktop only (Node).
import { createHash } from "node:crypto";
import { sha256 } from "../compliance/manifest";
import { flattenItemSettings } from "../settings-flatten";
import {
  snapshotItemLabel,
  type SnapshotItem,
  type SnapshotProjection,
} from "./projection";

import {
  COMPARISON_ORDER,
  GENERAL_PLATFORM,
  type CompareGroup,
  type CompareValue,
  type ComparisonCounts,
  type NotComparedSettingsFamily,
  type SettingComparison,
  type SettingsComparison,
} from "./reference-types";

export * from "./reference-types";

export const REFERENCE_SCHEMA = "intunedoc.reference/1";
export const REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
export const REFERENCE_MAX_SETTINGS = 100_000;
// Longer values are stored shortened, with a digest of the full value.
export const REFERENCE_MAX_VALUE = 1000;

const REDACTED = "[Redacted]";
// Setting ids that name a secret, matched as the last word as the collector
// does; their values are never stored, also when a collection kept one.
const SECRET_SETTING =
  /(apikey|password|passphrase|passcode|secret|token|privatekey|presharedkey|credentials?)$/i;

// Conditional Access conditions that name users, groups, roles or apps by
// object id are tenant specific, so a reference leaves them out.
const OBJECT_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ID_FAMILIES: ReadonlySet<string> = new Set(["conditionalAccessPolicies"]);

export interface ReferenceSetting {
  platform: string;
  // Section key of the configuration family, for example settingsCatalog.
  family: string;
  // Settings Catalog definition id, or the property path.
  setting: string;
  name: string;
  path?: string[];
  // Absent when the value is redacted or not kept.
  value?: string;
  // SHA-256 of the full value when value was shortened.
  sha256?: string;
  redacted?: true;
  // Name of the policy that configures it; a hint only, never compared.
  policy: string;
}

export interface ReferenceFamily {
  key: string;
  label: string;
}

export interface ReferenceFile {
  schema: typeof REFERENCE_SCHEMA;
  createdAt: string;
  rulesetVersion: string;
  // The source tenant as a shortened label only.
  source: { label: string };
  // Families collected completely; only these are compared.
  families: ReferenceFamily[];
  // Families whose collection failed, was skipped or is incomplete.
  notCompared: ReferenceFamily[];
  settings: ReferenceSetting[];
  checksum: { algorithm: "sha-256"; value: string };
}

// What a comparison reads: settings rows and which families are complete.
export interface SettingSet {
  rulesetVersion: string;
  families: ReferenceFamily[];
  notCompared: ReferenceFamily[];
  settings: ReferenceSetting[];
}

export type ReferenceRejection = "schema" | "checksum" | "size";

export const REFERENCE_REJECTION_MESSAGES: Record<ReferenceRejection, string> =
  {
    schema: "This file is not a valid IntuneDoc reference.",
    checksum: "This reference was changed or damaged after it was saved.",
    size: "The reference file is larger than 10 MB.",
  };

type Json = Record<string, unknown>;

const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  windows10: "Windows",
  windows81: "Windows",
  windows10x: "Windows",
  macos: "macOS",
  ios: "iOS",
  android: "Android",
  androidenterprise: "Android",
  androidforwork: "Android",
  androidworkprofile: "Android",
  aosp: "Android",
  linux: "Linux",
};

const TYPE_PLATFORMS: Array<[RegExp, string]> = [
  [/^(windows|win32|windows10|windows81|sharedpc|editionupgrade)/i, "Windows"],
  [/^macos/i, "macOS"],
  [/^(ios|iosipad)/i, "iOS"],
  [/^(android|aosp)/i, "Android"],
  [/^linux/i, "Linux"],
];


// The platforms value of Settings Catalog policies, or the platform in the
// type name of template resources.
export function platformOf(data: Json): string {
  const labels = new Set<string>();
  const platforms = typeof data.platforms === "string" ? data.platforms : "";
  for (const part of platforms.split(/[,\s]+/)) {
    const token = part.trim().toLowerCase();
    if (token && token !== "none") labels.add(PLATFORM_LABELS[token] ?? part.trim());
  }
  if (labels.size === 0 && typeof data["@odata.type"] === "string") {
    const raw = data["@odata.type"].replace(/^#?microsoft\.graph\./, "");
    const match = TYPE_PLATFORMS.find(([pattern]) => pattern.test(raw));
    if (match) labels.add(match[1]);
  }
  return labels.size ? [...labels].sort().join(", ") : GENERAL_PLATFORM;
}

function isCatalog(data: Json): boolean {
  return (
    (Array.isArray(data.settings) &&
      data.settings.some(
        (setting) =>
          Boolean(setting) &&
          typeof setting === "object" &&
          "settingInstance" in setting,
      )) ||
    Boolean(data.settingInstance && typeof data.settingInstance === "object")
  );
}

// Secret Settings Catalog values have no value in a projection; they are
// marked so they read as redacted instead of as an empty value.
function markSecrets(value: unknown, depth = 0): unknown {
  if (depth > 32 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => markSecrets(entry, depth + 1));
  const record = value as Json;
  const out: Json = {};
  for (const [key, entry] of Object.entries(record)) out[key] = markSecrets(entry, depth + 1);
  const type = typeof record["@odata.type"] === "string" ? record["@odata.type"] : "";
  if (/secretsettingvalue$/i.test(type)) out.value = REDACTED;
  return out;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function itemRows(
  sectionKey: string,
  sectionLabel: string,
  item: SnapshotItem,
): ReferenceSetting[] {
  const data = markSecrets(item.data) as Json;
  const platform = platformOf(data);
  const catalog = isCatalog(data);
  const policy = snapshotItemLabel({ label: sectionLabel }, item);
  const rows = flattenItemSettings(sectionKey, data)
    .filter((row) => !(ID_FAMILIES.has(sectionKey) && OBJECT_ID.test(row.value)))
    .map((row) => {
    const id = row.definitionId ?? row.name;
    const setting = catalog ? id : [...row.path, id].join(" / ");
    const redacted = row.value.includes(REDACTED) || SECRET_SETTING.test(id);
    const entry: ReferenceSetting = {
      platform,
      family: sectionKey,
      setting,
      name: row.name,
      ...(row.path.length ? { path: [...row.path] } : {}),
      policy,
    };
    if (redacted) entry.redacted = true;
    else if (row.value.length > REFERENCE_MAX_VALUE) {
      entry.value = `${row.value.slice(0, REFERENCE_MAX_VALUE)}...`;
      entry.sha256 = digest(row.value);
    } else entry.value = row.value;
    return entry;
  });
  // Custom OMA-URI strings the projection does not keep may be secrets; the
  // export lists none of them, so they are added as not comparable.
  for (const oma of Array.isArray(data.omaSettings) ? data.omaSettings : []) {
    if (!oma || typeof oma !== "object" || "value" in oma) continue;
    const uri = typeof (oma as Json).omaUri === "string" ? ((oma as Json).omaUri as string) : "";
    if (!uri) continue;
    const name = (oma as Json).displayName;
    rows.push({
      platform,
      family: sectionKey,
      setting: uri,
      name: typeof name === "string" && name ? name : uri,
      redacted: true,
      policy,
    });
  }
  return rows;
}

// Settings of every family collected completely. A family with a failed or
// skipped collection, or with an item whose details are incomplete, is not
// compared, so a gap never reads as a missing setting.
export function projectionSettings(projection: SnapshotProjection): SettingSet {
  const families: ReferenceFamily[] = [];
  const notCompared: ReferenceFamily[] = [];
  const settings: ReferenceSetting[] = [];
  for (const section of projection.sections) {
    const family = { key: section.key, label: section.label };
    if (
      section.status !== "complete" ||
      section.items.some((item) => item.incomplete)
    ) {
      notCompared.push(family);
      continue;
    }
    families.push(family);
    for (const item of section.items) {
      settings.push(...itemRows(section.key, section.label, item));
    }
  }
  return {
    rulesetVersion: projection.rulesetVersion,
    families,
    notCompared,
    settings,
  };
}

type ReferenceBody = Omit<ReferenceFile, "checksum">;

export async function createReference(
  projection: SnapshotProjection,
  options: { createdAt: string; sourceLabel: string },
): Promise<ReferenceFile> {
  const set = projectionSettings(projection);
  if (set.settings.length > REFERENCE_MAX_SETTINGS) {
    throw new Error(
      `This tenant has more than ${REFERENCE_MAX_SETTINGS.toLocaleString("en-US")} settings, too many for one reference file.`,
    );
  }
  const body: ReferenceBody = {
    schema: REFERENCE_SCHEMA,
    createdAt: options.createdAt,
    rulesetVersion: set.rulesetVersion,
    source: { label: options.sourceLabel.slice(0, 100) },
    families: set.families,
    notCompared: set.notCompared,
    settings: set.settings,
  };
  return {
    ...body,
    checksum: { algorithm: "sha-256", value: await sha256(body) },
  };
}

export function serializeReference(file: ReferenceFile): string {
  return `${JSON.stringify(file)}\n`;
}

export function referenceFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `intunedoc-reference-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

// --- Strict parsing -----------------------------------------------------------

const FILE_KEYS = new Set([
  "schema",
  "createdAt",
  "rulesetVersion",
  "source",
  "families",
  "notCompared",
  "settings",
  "checksum",
]);

const SETTING_KEYS = new Set([
  "platform",
  "family",
  "setting",
  "name",
  "path",
  "value",
  "sha256",
  "redacted",
  "policy",
]);

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const HEX_64 = /^[0-9a-f]{64}$/;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max;

function onlyKeys(value: Json, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function isFamilyList(value: unknown): value is ReferenceFamily[] {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(
      (family) =>
        isRecord(family) &&
        Object.keys(family).length === 2 &&
        isText(family.key, 200) &&
        family.key.length > 0 &&
        isText(family.label, 200),
    )
  );
}

function isSetting(value: unknown): value is ReferenceSetting {
  if (!isRecord(value) || !onlyKeys(value, SETTING_KEYS)) return false;
  if (
    !isText(value.platform, 100) ||
    !isText(value.family, 200) ||
    !isText(value.setting, 4000) ||
    !value.setting ||
    !isText(value.name, 2000) ||
    !isText(value.policy, 2000)
  )
    return false;
  if (
    value.path !== undefined &&
    !(
      Array.isArray(value.path) &&
      value.path.length <= 50 &&
      value.path.every((part) => isText(part, 2000))
    )
  )
    return false;
  if (value.redacted !== undefined) {
    // A redacted setting carries no value.
    return (
      value.redacted === true &&
      value.value === undefined &&
      value.sha256 === undefined
    );
  }
  if (!isText(value.value, REFERENCE_MAX_VALUE + 3)) return false;
  return (
    value.sha256 === undefined ||
    (typeof value.sha256 === "string" && HEX_64.test(value.sha256))
  );
}

function isReferenceFile(value: unknown): value is ReferenceFile {
  if (!isRecord(value) || !onlyKeys(value, FILE_KEYS)) return false;
  if (value.schema !== REFERENCE_SCHEMA) return false;
  if (
    !isText(value.createdAt, 64) ||
    !ISO_DATE.test(value.createdAt) ||
    Number.isNaN(Date.parse(value.createdAt))
  )
    return false;
  if (!isText(value.rulesetVersion, 100) || !value.rulesetVersion) return false;
  const { source, checksum } = value;
  if (
    !isRecord(source) ||
    Object.keys(source).length !== 1 ||
    !isText(source.label, 100)
  )
    return false;
  if (!isFamilyList(value.families) || !isFamilyList(value.notCompared))
    return false;
  if (
    !Array.isArray(value.settings) ||
    value.settings.length > REFERENCE_MAX_SETTINGS ||
    !value.settings.every(isSetting)
  )
    return false;
  return (
    isRecord(checksum) &&
    Object.keys(checksum).length === 2 &&
    checksum.algorithm === "sha-256" &&
    typeof checksum.value === "string" &&
    HEX_64.test(checksum.value)
  );
}

export async function parseReference(
  text: string,
): Promise<
  { ok: true; file: ReferenceFile } | { ok: false; reason: ReferenceRejection }
> {
  if (typeof text !== "string") return { ok: false, reason: "schema" };
  if (
    text.length > REFERENCE_MAX_BYTES ||
    new TextEncoder().encode(text).length > REFERENCE_MAX_BYTES
  )
    return { ok: false, reason: "size" };
  try {
    const parsed: unknown = JSON.parse(text.replace(/^﻿/, ""));
    if (!isReferenceFile(parsed)) return { ok: false, reason: "schema" };
    const { checksum, ...body } = parsed;
    if ((await sha256(body)) !== checksum.value)
      return { ok: false, reason: "checksum" };
    return { ok: true, file: parsed };
  } catch {
    return { ok: false, reason: "schema" };
  }
}

export function referenceSettings(file: ReferenceFile): SettingSet {
  return {
    rulesetVersion: file.rulesetVersion,
    families: file.families,
    notCompared: file.notCompared,
    settings: file.settings,
  };
}

// --- Comparison ---------------------------------------------------------------


const SEPARATOR = "\u0000";

function emptyCounts(): ComparisonCounts {
  return { different: 0, missing: 0, extra: 0, notComparable: 0, matching: 0 };
}

// Equality token of one value. Long values are shortened with a digest of
// the full value, so the digest is what is compared.
function token(setting: ReferenceSetting): string | null {
  if (setting.redacted || setting.value === undefined) return null;
  return setting.sha256 ?? digest(setting.value);
}

function byKey(settings: readonly ReferenceSetting[], compared: ReadonlySet<string>) {
  const map = new Map<string, ReferenceSetting[]>();
  for (const setting of settings) {
    if (!compared.has(setting.family)) continue;
    const key = [setting.platform, setting.family, setting.setting].join(SEPARATOR);
    const list = map.get(key);
    if (list) list.push(setting);
    else map.set(key, [setting]);
  }
  return map;
}

function values(list: readonly ReferenceSetting[] | undefined): CompareValue[] {
  return (list ?? []).map((setting) => ({
    value: setting.redacted ? null : (setting.value ?? null),
    policy: setting.policy,
  }));
}

function statusOf(
  expected: readonly ReferenceSetting[] | undefined,
  actual: readonly ReferenceSetting[] | undefined,
): SettingComparison {
  if (!actual?.length) return "missing";
  if (!expected?.length) return "extra";
  const all = [...expected, ...actual];
  if (all.some((setting) => token(setting) === null)) return "notComparable";
  const a = new Set(expected.map(token));
  const b = new Set(actual.map(token));
  return a.size === b.size && [...a].every((value) => b.has(value))
    ? "matching"
    : "different";
}

// A setting matches when the same values are configured for it in the same
// platform and family, whichever policies carry them. Assignments are not
// compared. Families incomplete on either side are listed as not compared.
export function compareSettings(
  reference: SettingSet,
  current: SettingSet,
): SettingsComparison {
  const referenceComplete = new Set(reference.families.map((family) => family.key));
  const currentComplete = new Set(current.families.map((family) => family.key));
  const labels = new Map<string, string>();
  for (const family of [
    ...reference.families,
    ...reference.notCompared,
    ...current.families,
    ...current.notCompared,
  ])
    if (!labels.has(family.key)) labels.set(family.key, family.label);

  const compared = new Set(
    [...referenceComplete].filter((key) => currentComplete.has(key)),
  );
  const notCompared: NotComparedSettingsFamily[] = [];
  for (const key of labels.keys()) {
    if (compared.has(key)) continue;
    const inReference = referenceComplete.has(key);
    const inCurrent = currentComplete.has(key);
    notCompared.push({
      family: key,
      label: labels.get(key) ?? key,
      side: inReference ? "current" : inCurrent ? "reference" : "both",
    });
  }

  const expected = byKey(reference.settings, compared);
  const actual = byKey(current.settings, compared);
  const groups = new Map<string, CompareGroup>();
  const totals = emptyCounts();
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const a = expected.get(key);
    const b = actual.get(key);
    const sample = (b ?? a)![0]!;
    const status = statusOf(a, b);
    const groupKey = [sample.platform, sample.family].join(SEPARATOR);
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        platform: sample.platform,
        family: sample.family,
        familyLabel: labels.get(sample.family) ?? sample.family,
        counts: emptyCounts(),
        rows: [],
        rowsTotal: 0,
      };
      groups.set(groupKey, group);
    }
    group.counts[status] += 1;
    totals[status] += 1;
    group.rows.push({
      status,
      setting: sample.setting,
      name: sample.name,
      path: sample.path ?? [],
      expected: values(a),
      actual: values(b),
    });
  }
  const order = (status: SettingComparison) => COMPARISON_ORDER.indexOf(status);
  const list = [...groups.values()]
    .map((group) => ({
      ...group,
      rows: group.rows.sort(
        (x, y) =>
          order(x.status) - order(y.status) || x.name.localeCompare(y.name),
      ),
      rowsTotal: group.rows.length,
    }))
    .sort(
      (x, y) =>
        x.platform.localeCompare(y.platform) ||
        x.familyLabel.localeCompare(y.familyLabel),
    );
  return {
    groups: list,
    totals,
    notCompared: notCompared.sort((x, y) => x.label.localeCompare(y.label)),
    rulesetChanged: reference.rulesetVersion !== current.rulesetVersion,
  };
}

export interface ComparisonLimits {
  maxRowsPerGroup: number;
  maxRows: number;
  maxValuesPerRow: number;
  maxValueLength: number;
}

export const DEFAULT_COMPARISON_LIMITS: ComparisonLimits = {
  maxRowsPerGroup: 200,
  maxRows: 3000,
  maxValuesPerRow: 10,
  maxValueLength: 1000,
};

// What leaves the main process: rows capped per group and overall, counts
// unchanged.
export function capComparison(
  comparison: SettingsComparison,
  limits: ComparisonLimits = DEFAULT_COMPARISON_LIMITS,
): SettingsComparison {
  let budget = limits.maxRows;
  const clip = (list: CompareValue[]) =>
    list.slice(0, limits.maxValuesPerRow).map((entry) => ({
      ...entry,
      value:
        entry.value !== null && entry.value.length > limits.maxValueLength
          ? `${entry.value.slice(0, limits.maxValueLength)}...`
          : entry.value,
    }));
  return {
    ...comparison,
    groups: comparison.groups.map((group) => {
      const take = Math.max(0, Math.min(limits.maxRowsPerGroup, budget));
      budget -= Math.min(take, group.rows.length);
      return {
        ...group,
        rows: group.rows.slice(0, take).map((row) => ({
          ...row,
          expected: clip(row.expected),
          actual: clip(row.actual),
        })),
      };
    }),
  };
}

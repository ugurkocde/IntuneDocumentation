// Golden baseline: a settings only reference of one tenant, saved as a file
// and compared with the current collection or another tenant's snapshot.
// Both sides go through the snapshot projection, so secrets, script bodies
// and properties the engine does not read never reach a reference. The
// checksum detects damage, not authorship: anyone can recompute it.
// Desktop only (Node).
import { createHash } from "node:crypto";
import {
  canonicalPlatforms,
  MAX_ITEM_JSON_DEPTH,
  unidentifiedSources,
  unreadableProperties,
} from "../compliance/graph-rows";
import { sha256 } from "../compliance/manifest";
import { flattenItemSettings } from "../settings-flatten";
import {
  identityCollected,
  identityRows,
  IDENTITY_POLICY_LABELS,
  type IdentityPolicyName,
} from "./identity";
import { inComparisonOrder } from "./order";
import {
  omittedFields,
  snapshotItemLabel,
  type SnapshotItem,
  type SnapshotProjection,
} from "./projection";

import {
  COMPARISON_ORDER,
  GENERAL_PLATFORM,
  IDENTITY_PLATFORM,
  type CompareGroup,
  type CompareValue,
  type ComparisonCounts,
  type ComparisonPart,
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
// Marks a field Graph omitted while a reference row is built; never stored.
const OMITTED = "[Not returned by Graph]";
const SEPARATOR = "\u0000";
// Setting ids that name a secret, matched as the last word as the collector
// does; their values are never stored, also when a collection kept one.
const SECRET_SETTING =
  /(apikey|password|passphrase|passcode|secret|token|privatekey|presharedkey|credentials?)$/i;

// Conditional Access conditions that name users, groups, roles or apps by
// object id are tenant specific, so a reference keeps them without their
// value: not comparable, never missing against a side that names none.
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
  // SHA-256 of the value as Graph returned it when value shows it by name
  // (settings-flatten.ts token): the option ids of a Settings Catalog
  // choice, or an administrative template value by presentation id. It is
  // compared instead of value, so a renamed option or label is no
  // difference; value is display only.
  token?: string;
  // SHA-256 of the group instance the setting is part of (its sibling and
  // child settings with their values), for settings inside a Settings
  // Catalog group such as one firewall rule.
  group?: string;
  redacted?: true;
  // Name of the policy that configures it; a hint only, never compared.
  policy: string;
}

export interface ReferenceFamily {
  key: string;
  label: string;
}

// Entra tenant identity settings, compared on their own and never counted
// with the configuration settings. Families are the identity policies.
export interface ReferenceIdentity {
  families: ReferenceFamily[];
  notCompared: ReferenceFamily[];
  settings: ReferenceSetting[];
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
  // Absent in files saved before identity settings were kept.
  identity?: ReferenceIdentity;
  checksum: { algorithm: "sha-256"; value: string };
}

// What a comparison reads: settings rows and which families are complete.
export interface SettingSet {
  rulesetVersion: string;
  families: ReferenceFamily[];
  notCompared: ReferenceFamily[];
  settings: ReferenceSetting[];
  identity?: ReferenceIdentity;
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


// The platforms value of Settings Catalog policies in its canonical form
// (graph-rows.ts canonicalPlatforms), or the platform in the type name of
// template resources. A platforms value that is no set of documented
// members names no platform; the projection marks its item incomplete, so
// its family is not compared.
export function platformOf(data: Json): string {
  const labels = new Set<string>();
  for (const part of (canonicalPlatforms(data.platforms) ?? "").split(",")) {
    const token = part.toLowerCase();
    if (token && token !== "none") labels.add(PLATFORM_LABELS[token] ?? part);
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
// marked so they read as redacted instead of as an empty value, as deep as
// a stored item holds values.
function markSecrets(value: unknown, depth = 0): unknown {
  if (depth > MAX_ITEM_JSON_DEPTH || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => markSecrets(entry, depth + 1));
  const record = value as Json;
  const out: Json = {};
  for (const [key, entry] of Object.entries(record)) out[key] = markSecrets(entry, depth + 1);
  const type = typeof record["@odata.type"] === "string" ? record["@odata.type"] : "";
  if (/secretsettingvalue$/i.test(type)) out.value = REDACTED;
  return out;
}

function setPath(target: Json, path: string, value: unknown): void {
  const segments = path.split(".");
  let current = target;
  for (const segment of segments.slice(0, -1)) {
    if (!isRecord(current[segment])) current[segment] = {};
    current = current[segment] as Json;
  }
  current[segments[segments.length - 1]!] = value;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// A value as a reference stores it: longer values shortened, with the
// digest of the full value, which is then what is compared.
function shortened(value: string): { value: string; sha256?: string } {
  return value.length > REFERENCE_MAX_VALUE
    ? { value: `${value.slice(0, REFERENCE_MAX_VALUE)}...`, sha256: digest(value) }
    : { value };
}

function itemRows(
  section: { key: string; familyKey: string; label: string },
  item: SnapshotItem,
): ReferenceSetting[] {
  const { key: sectionKey, label: sectionLabel } = section;
  // Collections whose order Graph gives no meaning are compared as
  // multisets (order.ts).
  const data = inComparisonOrder(section.familyKey, markSecrets(item.data) as Json);
  const platform = platformOf(data);
  const catalog = isCatalog(data);
  const policy = snapshotItemLabel({ label: sectionLabel }, item);
  // A field Graph omitted is unknown: it is filled with a marker, so its
  // rows get the ids real values would have and read as not comparable
  // rather than missing or extra. A setting whose value Graph did not
  // return readably (graph-rows.ts) is not comparable the same way.
  const omitted = omittedFields(section.familyKey, data);
  const filled = omitted.length ? structuredClone(data) : data;
  for (const path of omitted) setPath(filled, path, OMITTED);
  const rows = flattenItemSettings(sectionKey, filled).map((row) => {
    const id = row.definitionId ?? row.name;
    const setting = catalog ? id : [...row.path, id].join(" / ");
    const redacted =
      row.unreadable ||
      (ID_FAMILIES.has(sectionKey) && OBJECT_ID.test(row.value)) ||
      row.value.includes(REDACTED) ||
      row.value.includes(OMITTED) ||
      SECRET_SETTING.test(id);
    const entry: ReferenceSetting = {
      platform,
      family: sectionKey,
      setting,
      name: row.name,
      ...(row.path.length ? { path: [...row.path] } : {}),
      policy,
    };
    if (redacted) entry.redacted = true;
    else {
      Object.assign(entry, shortened(row.value));
      if (row.token !== undefined) entry.token = digest(row.token);
    }
    return entry;
  });
  if (catalog) groupInstances(rows);
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

// Settings inside a group instance, such as the action of one firewall rule,
// get the digest of that whole instance: its settings with the same path and
// the ones below it. Several instances of a setting are then compared as
// tuples, so swapping the actions of two rules is a difference.
function groupInstances(rows: ReferenceSetting[]): void {
  const members = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.path?.length) continue;
    const key = row.path.join(SEPARATOR);
    const list = members.get(key) ?? [];
    list.push([row.setting, row.redacted ? REDACTED : (row.token ?? row.sha256 ?? row.value ?? "")].join(SEPARATOR));
    members.set(key, list);
  }
  // Sorted, the paths below a path follow it directly, so each instance
  // reads only its own settings.
  const paths = [...members.keys()].sort();
  const digests = new Map<string, string>();
  paths.forEach((key, index) => {
    const inside: string[] = [];
    for (let next = index; next < paths.length; next++) {
      const other = paths[next]!;
      if (other !== key && !other.startsWith(`${key}${SEPARATOR}`)) break;
      for (const entry of members.get(other)!) inside.push(`${other}${SEPARATOR}${entry}`.slice(key.length));
    }
    digests.set(key, digest(inside.sort().join("\n")));
  });
  for (const row of rows) {
    if (row.path?.length) row.group = digests.get(row.path.join(SEPARATOR));
  }
}

// Settings of every family collected completely. A family with a failed or
// skipped collection, or with an item whose details are incomplete, with a
// setting row Graph returned without its identifier or with a record Graph
// did not return as one (graph-rows.ts unreadableProperties), is not
// compared, so a gap never reads as a missing setting.
export function projectionSettings(projection: SnapshotProjection): SettingSet {
  const families: ReferenceFamily[] = [];
  const notCompared: ReferenceFamily[] = [];
  const settings: ReferenceSetting[] = [];
  for (const section of projection.sections) {
    const family = { key: section.key, label: section.label };
    if (
      section.status !== "complete" ||
      section.items.some(
        (item) =>
          item.incomplete ||
          unidentifiedSources(item.data, section.familyKey).size > 0 ||
          unreadableProperties(item.data, section.familyKey).some(
            (property) => property.container,
          ),
      )
    ) {
      notCompared.push(family);
      continue;
    }
    // A row a reference file cannot hold (isSetting), such as a name
    // longer than a file allows, would make the file unreadable or read as
    // a missing setting, so its family is not compared, on both paths.
    const rows = section.items.flatMap((item) => itemRows(section, item));
    if (!rows.every(isSetting)) {
      notCompared.push(family);
      continue;
    }
    families.push(family);
    settings.push(...rows);
  }
  return {
    rulesetVersion: projection.rulesetVersion,
    families,
    notCompared,
    settings,
    identity: identitySettings(projection),
  };
}

const IDENTITY_POLICIES = Object.keys(
  IDENTITY_POLICY_LABELS,
) as IdentityPolicyName[];

// The identity policies collected in the snapshot as settings rows. Targets
// that name a group or user of the tenant mean nothing elsewhere, so they
// are not comparable; "All users" is. A setting Graph did not return
// readably carries no value either, so it is not comparable rather than
// missing or extra.
export function identitySettings(
  projection: Pick<SnapshotProjection, "tenantIdentityPolicies">,
): ReferenceIdentity {
  const identity = projection.tenantIdentityPolicies;
  const families: ReferenceFamily[] = [];
  const notCompared: ReferenceFamily[] = [];
  for (const policy of IDENTITY_POLICIES) {
    const family = { key: policy, label: IDENTITY_POLICY_LABELS[policy] };
    (identityCollected(identity, policy) ? families : notCompared).push(family);
  }
  const settings = identityRows(identity).map(
    (row): ReferenceSetting => ({
      platform: IDENTITY_PLATFORM,
      family: row.policy,
      setting: row.setting,
      name: row.name,
      ...(row.path.length ? { path: [...row.path] } : {}),
      ...(row.tenantObject || row.unreadable
        ? { redacted: true as const }
        : shortened(row.display)),
      policy: IDENTITY_POLICY_LABELS[row.policy],
    }),
  );
  return { families, notCompared, settings };
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
    ...(set.identity ? { identity: set.identity } : {}),
  };
  return {
    ...body,
    checksum: { algorithm: "sha-256", value: await sha256(body) },
  };
}

export function serializeReference(file: ReferenceFile): string {
  return `${JSON.stringify(file)}\n`;
}

export const REFERENCE_TOO_LARGE =
  "This reference would be larger than 10 MB, the most a reference file can hold. Reduce the collection, for example by leaving out families, and export again.";

// The file as saved. Refused above the size parseReference accepts, so an
// exported reference can always be loaded again.
export function encodeReference(
  file: ReferenceFile,
  maxBytes = REFERENCE_MAX_BYTES,
): Uint8Array {
  const bytes = new TextEncoder().encode(serializeReference(file));
  if (bytes.length > maxBytes) throw new Error(REFERENCE_TOO_LARGE);
  return bytes;
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
  "identity",
  "checksum",
]);

const IDENTITY_KEYS = new Set(["families", "notCompared", "settings"]);

const SETTING_KEYS = new Set([
  "platform",
  "family",
  "setting",
  "name",
  "path",
  "value",
  "sha256",
  "token",
  "redacted",
  "group",
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
  if (
    value.group !== undefined &&
    !(typeof value.group === "string" && HEX_64.test(value.group) && value.path)
  )
    return false;
  if (value.redacted !== undefined) {
    // A redacted setting carries no value.
    return (
      value.redacted === true &&
      value.value === undefined &&
      value.sha256 === undefined &&
      value.token === undefined
    );
  }
  if (
    value.token !== undefined &&
    !(typeof value.token === "string" && HEX_64.test(value.token))
  )
    return false;
  if (!isText(value.value, REFERENCE_MAX_VALUE + 3)) return false;
  // A digest belongs to a shortened value and every longer value is
  // shortened, exactly as createReference writes them.
  if (value.sha256 === undefined) return value.value.length <= REFERENCE_MAX_VALUE;
  return (
    typeof value.sha256 === "string" &&
    HEX_64.test(value.sha256) &&
    value.value.length === REFERENCE_MAX_VALUE + 3 &&
    value.value.endsWith("...")
  );
}

// A family is either compared or not, never both or listed twice, and
// settings only come from compared families.
function isConsistent(file: ReferenceFile): boolean {
  const keys = [...file.families, ...file.notCompared].map((family) => family.key);
  if (new Set(keys).size !== keys.length) return false;
  const compared = new Set(file.families.map((family) => family.key));
  return file.settings.every((setting) => compared.has(setting.family));
}

function isIdentity(value: unknown): value is ReferenceIdentity {
  if (!isRecord(value) || !onlyKeys(value, IDENTITY_KEYS)) return false;
  if (!isFamilyList(value.families) || !isFamilyList(value.notCompared))
    return false;
  const known = new Set<string>(IDENTITY_POLICIES);
  const keys = [...value.families, ...value.notCompared].map(
    (family) => family.key,
  );
  if (new Set(keys).size !== keys.length || !keys.every((key) => known.has(key)))
    return false;
  const compared = new Set(value.families.map((family) => family.key));
  return (
    Array.isArray(value.settings) &&
    value.settings.length <= REFERENCE_MAX_SETTINGS &&
    value.settings.every(
      (setting) =>
        isSetting(setting) &&
        setting.platform === IDENTITY_PLATFORM &&
        compared.has(setting.family),
    )
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
  if (value.identity !== undefined && !isIdentity(value.identity)) return false;
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
    if (!isReferenceFile(parsed) || !isConsistent(parsed))
      return { ok: false, reason: "schema" };
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
    ...(file.identity ? { identity: file.identity } : {}),
  };
}

// --- Value tokens -------------------------------------------------------------

// Equality token of one value: the digest of the value as Graph returned it
// where value shows it by name, otherwise of the value. Long values are
// shortened with a digest of the full value, so the digest is what is
// compared. Where a setting has a token, the token decides: value is only
// shown, so a value edited in a reference file (and its checksum
// recomputed) changes what Compare displays, never whether it matches.
function token(setting: ReferenceSetting): string | null {
  if (setting.redacted || setting.value === undefined) return null;
  return setting.token ?? setting.sha256 ?? digest(setting.value);
}

// The id a setting is compared under. An administrative template value is
// named by its definition id; its category path is display only (Graph
// returns null for some definitions, lab tenant, 23 October 2026), so a
// category Graph returned on one side only never reads as a missing and an
// extra setting. Files saved earlier hold the same setting ids.
function settingKey(setting: ReferenceSetting): string {
  const prefix = setting.path?.length ? `${setting.path.join(" / ")} / ` : "";
  return setting.family === "administrativeTemplates" && prefix && setting.setting.startsWith(prefix)
    ? setting.setting.slice(prefix.length)
    : setting.setting;
}

function byKey(settings: readonly ReferenceSetting[], compared: ReadonlySet<string>) {
  const map = new Map<string, ReferenceSetting[]>();
  for (const setting of settings) {
    if (!compared.has(setting.family)) continue;
    const key = [setting.platform, setting.family, settingKey(setting)].join(SEPARATOR);
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

// --- Group instances ----------------------------------------------------------

// One group instance, such as one firewall rule, on one side: the policy it
// is in, its path and the digest of its content.
function instanceOf(setting: ReferenceSetting): string | null {
  return setting.group && setting.path?.length
    ? [setting.platform, setting.family, setting.policy, setting.path.join(SEPARATOR), setting.group].join(
        SEPARATOR,
      )
    : null;
}

interface Instance {
  group: string;
  // Setting and value tokens of the settings directly in the instance.
  tokens: Map<string, number>;
}

function instancesOf(settings: readonly ReferenceSetting[]): Map<string, Instance> {
  const instances = new Map<string, Instance>();
  for (const setting of settings) {
    const key = instanceOf(setting);
    if (!key) continue;
    let instance = instances.get(key);
    if (!instance) instances.set(key, (instance = { group: setting.group!, tokens: new Map() }));
    const entry = `${setting.setting}${SEPARATOR}${token(setting) ?? REDACTED}`;
    instance.tokens.set(entry, (instance.tokens.get(entry) ?? 0) + 1);
  }
  return instances;
}

function overlap(a: Instance, b: Instance): number {
  let shared = 0;
  for (const [entry, count] of a.tokens) shared += Math.min(count, b.tokens.get(entry) ?? 0);
  return shared;
}

// Leftover instances paired with every candidate up to this many pairs;
// beyond it each instance only considers the instances that share its
// rarest settings and values, so the work stays linear.
const FULL_PAIRING = 250_000;
const NEAR_CANDIDATES = 16;

type Candidate = { i: number; j: number; score: number };

function allCandidates(
  expected: readonly string[],
  actual: readonly string[],
  a: ReadonlyMap<string, Instance>,
  b: ReadonlyMap<string, Instance>,
): Candidate[] {
  const candidates: Candidate[] = [];
  expected.forEach((left, i) =>
    actual.forEach((right, j) => candidates.push({ i, j, score: overlap(a.get(left)!, b.get(right)!) })),
  );
  return candidates;
}

function nearCandidates(
  expected: readonly string[],
  actual: readonly string[],
  a: ReadonlyMap<string, Instance>,
  b: ReadonlyMap<string, Instance>,
): Candidate[] {
  const index = new Map<string, number[]>();
  actual.forEach((right, j) => {
    for (const entry of b.get(right)!.tokens.keys()) {
      const list = index.get(entry);
      if (list) list.push(j);
      else index.set(entry, [j]);
    }
  });
  const candidates: Candidate[] = [];
  expected.forEach((left, i) => {
    const instance = a.get(left)!;
    const lists = [...instance.tokens.keys()]
      .map((entry) => index.get(entry) ?? [])
      .sort((x, y) => x.length - y.length);
    const near = new Set<number>();
    for (const list of lists) {
      for (const j of list) {
        if (near.size >= NEAR_CANDIDATES) break;
        near.add(j);
      }
    }
    for (const j of near) candidates.push({ i, j, score: overlap(instance, b.get(actual[j]!)!) });
  });
  return candidates;
}

// Instances of both sides paired by the most settings they share; ties go
// to the same position, so swapping one value between two rules pairs each
// rule with itself and only that value differs. Instances without a
// candidate are paired in order.
function pairInstances(
  expected: readonly string[],
  actual: readonly string[],
  a: ReadonlyMap<string, Instance>,
  b: ReadonlyMap<string, Instance>,
): Array<[string, string]> {
  const candidates = (
    expected.length * actual.length <= FULL_PAIRING ? allCandidates : nearCandidates
  )(expected, actual, a, b);
  candidates.sort((x, y) => y.score - x.score || Math.abs(x.i - x.j) - Math.abs(y.i - y.j) || x.i - y.i);
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  const pairs: Array<[string, string]> = [];
  for (const { i, j } of candidates) {
    if (usedLeft.has(i) || usedRight.has(j)) continue;
    usedLeft.add(i);
    usedRight.add(j);
    pairs.push([expected[i]!, actual[j]!]);
  }
  const restRight = actual.filter((_, j) => !usedRight.has(j));
  expected
    .filter((_, i) => !usedLeft.has(i))
    .forEach((left, k) => {
      if (k < restRight.length) pairs.push([left, restRight[k]!]);
    });
  return pairs;
}

// The policy and path of a setting in a group instance.
function placeOf(setting: ReferenceSetting): string {
  return [setting.platform, setting.family, setting.policy, ...(setting.path ?? [])].join(SEPARATOR);
}

// Group instances, by policy and path, that hold a setting without a value
// to compare (redacted, unreadable or not kept), directly or in an instance
// below them. Their content is unknown, so they may be the same as another
// instance or not: deduplicating or pairing them would guess.
function uncertainInstances(settings: readonly ReferenceSetting[]): Set<string> {
  const places = new Set<string>();
  for (const setting of settings) {
    if (token(setting) !== null || !setting.path?.length) continue;
    for (let depth = 1; depth <= setting.path.length; depth++)
      places.add(placeOf({ ...setting, path: setting.path.slice(0, depth) }));
  }
  return places;
}

interface InstanceContext {
  expected: Map<string, Instance>;
  actual: Map<string, Instance>;
  // uncertainInstances of each side.
  uncertain: { expected: Set<string>; actual: Set<string> };
  // Pairings by candidate instances, shared by the settings of one group.
  pairs: Map<string, Array<[string, string]>>;
}

// The instances a setting is in, one per distinct content in setting order:
// the same rule carried twice, or by two policies, counts once, as a value
// configured by two policies does.
function distinctInstances(list: readonly ReferenceSetting[]): Map<string, string> {
  const instances = new Map<string, string>();
  for (const setting of list) if (!instances.has(setting.group!)) instances.set(setting.group!, instanceOf(setting)!);
  return instances;
}

// The values a setting has in each instance it is in.
function ownValues(list: readonly ReferenceSetting[]): Map<string, string> {
  const own = new Map<string, string[]>();
  for (const setting of list) {
    const key = instanceOf(setting)!;
    const tokens = own.get(key);
    if (tokens) tokens.push(token(setting)!);
    else own.set(key, [token(setting)!]);
  }
  return new Map([...own].map(([key, tokens]) => [key, tokens.sort().join(SEPARATOR)]));
}

// A setting differs only when its own values differ. Inside group
// instances, instances with the same content on both sides match; the
// others are paired, so a swapped value is a difference, while the other
// settings of a changed instance stay matching and are marked as part of a
// changed instance. An instance left without a counterpart, such as an
// added rule whose values each exist in other rules, is a difference. When
// an instance holding the setting holds a value that cannot be compared,
// which instances are the same is unknown, so the setting is not comparable
// unless its own values already differ.
function statusOf(
  expected: readonly ReferenceSetting[] | undefined,
  actual: readonly ReferenceSetting[] | undefined,
  context: InstanceContext,
): { status: SettingComparison; instanceChanged?: true } {
  // A value that is redacted or not kept cannot be compared, also when only
  // one side has the setting, so this is checked before presence.
  const all = [...(expected ?? []), ...(actual ?? [])];
  if (all.some((setting) => token(setting) === null)) return { status: "notComparable" };
  if (!actual?.length) return { status: "missing" };
  if (!expected?.length) return { status: "extra" };
  // A value compared by its token on one side only, such as a list whose
  // entries hold separators against a reference file saved before such
  // lists had one (settings-flatten.ts rawToken), is the same value only if
  // their shown values tell it: equal shown values may hide two different
  // lists, so the setting is not comparable.
  const tokened = (list: readonly ReferenceSetting[]) => list.some((setting) => setting.token !== undefined);
  if (tokened(expected) !== tokened(actual)) {
    const shown = (list: readonly ReferenceSetting[]) =>
      [...new Set(list.map((setting) => setting.sha256 ?? setting.value))].sort().join(SEPARATOR);
    return { status: shown(expected) === shown(actual) ? "notComparable" : "different" };
  }
  // A Settings Catalog choice is compared by its option id (token), so it
  // is the same choice whether Graph returned the option names with it or
  // not.
  const a = new Set(expected.map(token));
  const b = new Set(actual.map(token));
  if (a.size !== b.size || ![...a].every((value) => b.has(value))) return { status: "different" };
  if (!all.every(instanceOf)) return { status: "matching" };
  if (
    expected.some((setting) => context.uncertain.expected.has(placeOf(setting))) ||
    actual.some((setting) => context.uncertain.actual.has(placeOf(setting)))
  )
    return { status: "notComparable" };
  const leftAll = distinctInstances(expected);
  const rightAll = distinctInstances(actual);
  const left = [...leftAll].filter(([group]) => !rightAll.has(group)).map(([, key]) => key);
  const right = [...rightAll].filter(([group]) => !leftAll.has(group)).map(([, key]) => key);
  if (left.length !== right.length) return { status: "different" };
  if (!left.length) return { status: "matching" };
  const cacheKey = JSON.stringify([left, right]);
  let pairs = context.pairs.get(cacheKey);
  if (!pairs) {
    pairs = pairInstances(left, right, context.expected, context.actual);
    context.pairs.set(cacheKey, pairs);
  }
  const from = ownValues(expected);
  const to = ownValues(actual);
  for (const [x, y] of pairs) if (from.get(x) !== to.get(y)) return { status: "different" };
  return { status: "matching", instanceChanged: true };
}

// --- Comparison ---------------------------------------------------------------

function emptyCounts(): ComparisonCounts {
  return { different: 0, missing: 0, extra: 0, notComparable: 0, matching: 0 };
}

type ComparedSide = Pick<SettingSet, "families" | "notCompared" | "settings">;

function compareSides(reference: ComparedSide, current: ComparedSide): ComparisonPart {
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
  const context: InstanceContext = {
    expected: instancesOf([...expected.values()].flat()),
    actual: instancesOf([...actual.values()].flat()),
    uncertain: {
      expected: uncertainInstances([...expected.values()].flat()),
      actual: uncertainInstances([...actual.values()].flat()),
    },
    pairs: new Map(),
  };
  const groups = new Map<string, CompareGroup>();
  const totals = emptyCounts();
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    const a = expected.get(key);
    const b = actual.get(key);
    const sample = (b ?? a)![0]!;
    const { status, instanceChanged } = statusOf(a, b, context);
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
      ...(instanceChanged ? { instanceChanged } : {}),
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
  };
}

const NO_IDENTITY: ReferenceIdentity = { families: [], notCompared: [], settings: [] };

// A setting matches when the same values are configured for it in the same
// platform and family, whichever policies carry them. Assignments are not
// compared. Families incomplete on either side are listed as not compared.
// Entra identity settings are compared the same way but reported on their
// own, outside the configuration counts.
export function compareSettings(
  reference: SettingSet,
  current: SettingSet,
): SettingsComparison {
  return {
    ...compareSides(reference, current),
    identity: compareSides(reference.identity ?? NO_IDENTITY, current.identity ?? NO_IDENTITY),
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
  const cap = (groups: CompareGroup[]) =>
    groups.map((group) => {
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
    });
  const groups = cap(comparison.groups);
  // Identity settings are few; they get their own budget.
  budget = limits.maxRows;
  return {
    ...comparison,
    groups,
    identity: { ...comparison.identity, groups: cap(comparison.identity.groups) },
  };
}

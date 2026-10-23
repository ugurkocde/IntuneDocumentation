// Shape checks for the rows of collected Graph data, one per row family.
// Every engine reads collected policies through these checks: the
// compliance engine and its fix packs, the benchmark comparison, the
// snapshot projection, the history diff, the reference comparison, the
// documentation and the settings search. A row that fails its check is
// unidentified or unreadable, so each consumer treats what it may hold as
// unknown, never as a pass, a difference, a missing setting or a draft.
// Normal Graph rows always pass.

import { REDACTED_VALUE } from "../intune-policy-registry";
import {
  DOCUMENTED_VALUES,
  isDocumented,
  type DocumentedField,
} from "./documented-values";
import {
  FAMILY_RESOURCE_TYPES,
  GRAPH_PROPERTY_TYPES,
  ITEM_PROPERTY_TYPES,
  type GraphTypeName,
} from "./graph-property-types";

/** An identifier Graph returned: a nonempty string. An empty one names nothing. */
export const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && value !== "";

/** A Graph Int32: an integer from -2147483648 to 2147483647. */
export const isInt32 = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= -2147483648 &&
  value <= 2147483647;

const isString = (value: unknown) => typeof value === "string";
const isBoolean = (value: unknown) => typeof value === "boolean";
// A JSON number holds a Graph Int64 exactly only as a safe integer.
const isUnsigned = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) >= 0;

// The Edm primitive syntax below follows the OData CSDL ABNF (OData v4.01,
// odata-abnf-construction-rules) and keeps every form Graph returns, such as
// "02:00:00.0000000", "2026-10-23T10:00:00.0000000Z" and "PT0S".
// Seconds run to 60 for a leap second; their fraction has 1 to 12 digits.
const SECONDS = "(:([0-5]\\d|60)(\\.\\d{1,12})?)?";

const TIME_OF_DAY = new RegExp(`^([01]\\d|2[0-3]):[0-5]\\d${SECONDS}$`);

/**
 * An Edm.TimeOfDay: hour and minute, with optional seconds and fractional
 * seconds ("02:00", "02:00:00", "02:00:00.0000000" as Graph returns it).
 */
export const isTimeOfDay = (value: unknown): boolean =>
  typeof value === "string" && TIME_OF_DAY.test(value);

// An Edm.Date ("2026-10-23") that names a day of the calendar.
const isDate = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

// An Edm.DateTimeOffset: a date, T, hour and minute with optional seconds
// and fractional seconds, and Z or an offset ("2026-10-23T10:00:00Z",
// "2026-10-23T10:00:00.0000000Z", "2026-10-23T12:00:00+02:00").
const DATE_TIME_OFFSET = new RegExp(
  `^.{10}T([01]\\d|2[0-3]):[0-5]\\d${SECONDS}(Z|[+-]([01]\\d|2[0-3]):[0-5]\\d)$`,
);
const isDateTimeOffset = (value: unknown) =>
  typeof value === "string" &&
  isDate(value.slice(0, 10)) &&
  DATE_TIME_OFFSET.test(value);

// An Edm.Duration is a day-time duration: an optional sign, P, days, and
// after T hours, minutes and seconds, with at least one component ("PT0S",
// "P1D", "PT1H30M", "PT0.5S"). Years, months and weeks are no Edm.Duration.
const isDuration = (value: unknown) =>
  typeof value === "string" &&
  /^[+-]?P(?=\d|T\d)(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(
    value,
  );

const isGuid = (value: unknown) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// An Edm.Binary as JSON carries it: base64url text (OData JSON format),
// padded or not, or the base64 text Graph returns for some properties. The
// last character of a partial group carries no bits beyond the bytes it
// encodes (CSDL ABNF base64b8end and base64b16end).
const isBinary = (value: unknown) => {
  if (typeof value !== "string") return false;
  const body = value.replace(/={1,2}$/, "");
  const padded = body.length !== value.length;
  const rest = body.length % 4;
  const last = body.slice(-1);
  return (
    (/^[A-Za-z0-9+/]*$/.test(body) || /^[A-Za-z0-9_-]*$/.test(body)) &&
    (padded
      ? value.length % 4 === 0 && value.length - body.length === 4 - rest
      : rest !== 1) &&
    (rest !== 2 || /[AQgw]/.test(last)) &&
    (rest !== 3 || /[AEIMQUYcgkosw048]/.test(last))
  );
};

/**
 * The XML text of an omaSettingStringXml value. Graph documents the value
 * as Edm.Binary, "UTF8 encoded byte array" (Microsoft Learn,
 * omaSettingStringXml), which OData JSON carries as base64url or base64
 * text (isBinary), so it is decoded as UTF-8. Bytes that start with a
 * UTF-16 byte order mark, as Windows PowerShell 5.1 writes XML files, are
 * decoded as UTF-16 in that byte order. Undefined when the value is no
 * such text or its bytes are not valid in their encoding; a byte order
 * mark is dropped.
 */
export function decodedXmlValue(value: unknown): string | undefined {
  if (!isBinary(value)) return undefined;
  const body = (value as string)
    .replace(/=+$/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  try {
    const binary = atob(body.padEnd(Math.ceil(body.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const encoding =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? "utf-16le"
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? "utf-16be"
          : "utf-8";
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

// Edm.Double and Edm.Single as OData JSON carries them: a number, or one of
// the strings NaN, INF and -INF. A Single is within its range.
const SPECIAL_FLOATS = ["NaN", "INF", "-INF"];
const isDouble = (value: unknown) =>
  (typeof value === "number" && Number.isFinite(value)) ||
  SPECIAL_FLOATS.includes(value as string);
// A number a binary32 rounds to a finite value, so the shortest decimal
// form of its largest value ("3.4028235e38") is a Single too.
const isSingle = (value: unknown) =>
  isDouble(value) &&
  (typeof value !== "number" || Number.isFinite(Math.fround(value)));

/**
 * A name and value pair of an administrative template list presentation.
 * keyValuePair types both as String (msgraph skill schema and Graph beta
 * reference, 23 October 2026). Neither marks value as required, and an
 * OData property is nullable unless $metadata says Nullable="false", so a
 * null value is a documented value. The name names the pair.
 */
export const isKeyValuePair = (pair: unknown): boolean =>
  isObject(pair) &&
  isString(pair.name) &&
  (isString(pair.value) || pair.value === null);

// The documented type of the value of every typed Graph record a setting
// value is read from, by normalized @odata.type (Graph beta $metadata and
// the msgraph skill schemas, checked 23 October 2026; the lab tenant
// returns the type on every one of them): Settings Catalog simple setting
// values, every subtype of omaSetting (value Int32, Boolean, String,
// Single, DateTimeOffset, String for omaSettingBase64 and Binary for
// omaSettingStringXml), intent setting instances and administrative
// template presentation values. Secret values are not listed, so they are
// never read.
const VALUE_TYPES: Readonly<Record<string, (value: unknown) => boolean>> = {
  devicemanagementconfigurationintegersettingvalue: isInt32,
  devicemanagementconfigurationstringsettingvalue: isString,
  devicemanagementconfigurationreferencesettingvalue: isString,
  omasettinginteger: isInt32,
  omasettingboolean: isBoolean,
  omasettingstring: isString,
  omasettingfloatingpoint: isSingle,
  omasettingdatetime: isDateTimeOffset,
  omasettingbase64: isString,
  // Edm.Binary holding UTF-8 XML: bytes that are no UTF-8 text are no
  // value of the type (decodedXmlValue).
  omasettingstringxml: (value) => decodedXmlValue(value) !== undefined,
  devicemanagementintegersettinginstance: isInt32,
  devicemanagementbooleansettinginstance: isBoolean,
  devicemanagementstringsettinginstance: isString,
  // Decimal presentation values are unsigned.
  grouppolicypresentationvaluedecimal: isUnsigned,
  grouppolicypresentationvaluelongdecimal: isUnsigned,
  grouppolicypresentationvalueboolean: isBoolean,
  grouppolicypresentationvaluetext: isString,
};

/**
 * Whether a value has the documented type of the typed Graph record that
 * holds it, named by the record's @odata.type: an integer is an integer in
 * its range, a boolean a boolean and a string a string. A value of another
 * type, out of range, of a secret, or of a record whose type is missing or
 * not documented is unreadable, never evidence.
 */
export function documentedValue(type: unknown, value: unknown): boolean {
  const name = normalizeTargetType(type);
  return Object.hasOwn(VALUE_TYPES, name) && VALUE_TYPES[name]!(value);
}

// A value the collector redacted, like a secret Settings Catalog value, is
// not stored: it is compared by fingerprint or not at all, never read.
const redacted = (value: unknown) =>
  value === REDACTED_VALUE ||
  (Array.isArray(value) && value.includes(REDACTED_VALUE));
const SECRET_VALUE = "devicemanagementconfigurationsecretsettingvalue";

// The documented subtypes of deviceManagementConfigurationSimpleSettingValue
// that hold a readable value (Graph beta $metadata, 23 October 2026), by
// normalized @odata.type. A record of another type, such as a custom
// OMA-URI or intent value, is no Settings Catalog simple value.
const SIMPLE_VALUE_TYPES: ReadonlySet<string> = new Set([
  "devicemanagementconfigurationintegersettingvalue",
  "devicemanagementconfigurationstringsettingvalue",
  "devicemanagementconfigurationreferencesettingvalue",
]);

/**
 * Whether a Settings Catalog simple value record is unreadable: no record,
 * or a type that is not a documented simple value type, or a value that
 * does not have the type its record documents. A secret value is not
 * stored and a redacted value is compared by fingerprint, so neither is
 * unreadable here; readers that cannot use them, such as the compliance
 * engine and the benchmark comparison, treat them as unknown themselves.
 */
export const unreadableSimpleValue = (entry: unknown): boolean => {
  if (!isObject(entry)) return true;
  const type = normalizeTargetType(entry["@odata.type"]);
  if (type === SECRET_VALUE) return false;
  if (!SIMPLE_VALUE_TYPES.has(type)) return true;
  return !redacted(entry.value) && !documentedValue(type, entry.value);
};
const unreadableSimple = unreadableSimpleValue;

// A Settings Catalog choice value: an option id.
const unreadableChoice = (entry: unknown) =>
  !isObject(entry) || (!redacted(entry.value) && !isIdentifier(entry.value));

const unreadableEntries = (
  value: unknown,
  check: (entry: unknown) => boolean,
) => !Array.isArray(value) || value.some(check);

/**
 * How deep Settings Catalog child settings are kept and read, the root
 * instance at depth 0. The snapshot projection, the checks here, the
 * compliance engine, the benchmark comparison, the documentation, flattening
 * (settings-flatten.ts), Compare and History share it: a child below it is
 * kept as an instance without its id, so it reads as an unknown setting,
 * never as no setting.
 */
export const MAX_SETTING_DEPTH = 16;

/**
 * The JSON nesting depth of the deepest value a stored item holds: a
 * Settings Catalog value in a group collection entry at MAX_SETTING_DEPTH
 * (each level nests an instance, its value, an entry and its children)
 * below the item, its setting list and a category. Readers that walk an
 * item, such as the redacted value fingerprints and the secret marks of
 * Compare, go this deep, so no kept value is out of their reach.
 */
export const MAX_ITEM_JSON_DEPTH = 4 * (MAX_SETTING_DEPTH + 1) + 8;

// The value properties of Settings Catalog instances.
const INSTANCE_VALUE_KEYS = [
  "simpleSettingValue",
  "simpleSettingCollectionValue",
  "choiceSettingValue",
  "choiceSettingCollectionValue",
  "groupSettingValue",
  "groupSettingCollectionValue",
] as const;
type InstanceValueKey = (typeof INSTANCE_VALUE_KEYS)[number];

// Every documented subtype of deviceManagementConfigurationSettingInstance
// (Graph beta $metadata, 23 October 2026; the lab tenant returns the type on
// every instance and child), by normalized @odata.type, with the one
// property it holds its value in. The setting group types
// (...SettingGroupInstance and ...SettingGroupCollectionInstance) hold none;
// the engine reads them as present without a value.
const INSTANCE_VALUES: Readonly<Record<string, InstanceValueKey | null>> = {
  devicemanagementconfigurationsimplesettinginstance: "simpleSettingValue",
  devicemanagementconfigurationsimplesettingcollectioninstance:
    "simpleSettingCollectionValue",
  devicemanagementconfigurationchoicesettinginstance: "choiceSettingValue",
  devicemanagementconfigurationchoicesettingcollectioninstance:
    "choiceSettingCollectionValue",
  devicemanagementconfigurationgroupsettinginstance: "groupSettingValue",
  devicemanagementconfigurationgroupsettingcollectioninstance:
    "groupSettingCollectionValue",
  devicemanagementconfigurationsettinggroupinstance: null,
  devicemanagementconfigurationsettinggroupcollectioninstance: null,
};

/**
 * The value property a Settings Catalog instance's type holds its value
 * in, null for a type that holds none, or undefined when the instance is
 * no record, its type is not documented, or it holds a value in a property
 * another type documents: its @odata.type selects how it is read, so such
 * an instance cannot be read. Every reader of instances (the compliance
 * engine, the benchmark comparison, the projection, flattening and the
 * documentation) reads a value only from this property.
 */
export function instanceValueKey(
  instance: unknown,
): InstanceValueKey | null | undefined {
  if (!isObject(instance)) return undefined;
  const type = normalizeTargetType(instance["@odata.type"]);
  if (!Object.hasOwn(INSTANCE_VALUES, type)) return undefined;
  const key = INSTANCE_VALUES[type]!;
  return INSTANCE_VALUE_KEYS.some(
    (other) => other !== key && instance[other] != null,
  )
    ? undefined
    : key;
}

const OWN_VALUE_CHECKS: Readonly<
  Record<InstanceValueKey, (value: unknown) => boolean>
> = {
  simpleSettingValue: unreadableSimple,
  simpleSettingCollectionValue: (value) =>
    unreadableEntries(value, unreadableSimple),
  choiceSettingValue: unreadableChoice,
  choiceSettingCollectionValue: (value) =>
    unreadableEntries(value, unreadableChoice),
  // A group's value is its children, read as settings of their own.
  groupSettingValue: (value) => !isObject(value),
  groupSettingCollectionValue: (value) => !Array.isArray(value),
};

/**
 * Whether the own value of a Settings Catalog instance, without its child
 * instances, is unreadable, as the compliance engine reads it: an instance
 * of a type Graph does not document, or with a value in another type's
 * property (instanceValueKey); no value in the property its type documents;
 * a simple value of another type than its record documents, a choice value
 * that is no option id, or a value collection that is no list or holds such
 * an entry. The setting group types hold no value. Secret and redacted
 * values are not stored rather than unreadable. A valid empty collection is
 * readable.
 */
export function unreadableCatalogValue(instance: unknown): boolean {
  const key = instanceValueKey(instance);
  if (key === undefined) return true;
  if (key === null) return false;
  const value = (instance as Record<string, unknown>)[key];
  return value == null || OWN_VALUE_CHECKS[key](value);
}

/**
 * Whether the value of a custom OMA-URI row is unreadable: a value of
 * another type than its record documents (Graph returns the value on every
 * row, lab tenant, 23 October 2026). A row without a value holds one that
 * is not stored: the snapshot projection drops the values it does not keep
 * and keeps one Graph did not return readably as null. Encrypted and
 * redacted values are not stored either.
 */
export const unreadableOmaValue = (row: unknown): boolean =>
  !isObject(row) ||
  (Object.hasOwn(row, "value") &&
    row.isEncrypted !== true &&
    !redacted(row.value) &&
    !documentedValue(row["@odata.type"], row.value));

/**
 * The value of a readable custom OMA-URI row as it is shown and read: an
 * omaSettingStringXml value as its XML text (decodedXmlValue), any other
 * as Graph returned it. Compare and History compare the value Graph
 * returned in canonical form (canonicalRecordValue), not this text.
 */
export const shownOmaValue = (row: Record<string, unknown>): unknown =>
  normalizeTargetType(row["@odata.type"]) === "omasettingstringxml"
    ? (decodedXmlValue(row.value) ?? row.value)
    : row.value;

// Intent setting instances that hold their value only as JSON text
// (deviceManagementCollectionSettingInstance, ...ComplexSettingInstance and
// ...AbstractComplexSettingInstance, Graph beta reference).
const JSON_INTENT_TYPES: ReadonlySet<string> = new Set([
  "devicemanagementcollectionsettinginstance",
  "devicemanagementcomplexsettinginstance",
  "devicemanagementabstractcomplexsettinginstance",
]);

const COLLECTION_INTENT = "devicemanagementcollectionsettinginstance";

const parsedJson = (text: unknown): { value: unknown } | null => {
  if (typeof text !== "string") return null;
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
};

/**
 * Whether the value of an intent setting row is unreadable. A boolean,
 * integer or string instance holds a value of its documented type, or null
 * with the JSON text "null" for a setting that is not configured (lab
 * tenant, 23 October 2026); without a value its JSON text is read, as the
 * engine does. A collection or complex instance holds JSON text and no
 * value, so a value beside it is unreadable. A row of another or no type is
 * unreadable; a redacted value is not stored.
 */
export function unreadableIntentValue(row: unknown): boolean {
  if (!isObject(row)) return true;
  if (redacted(row.value)) return false;
  const type = normalizeTargetType(row["@odata.type"]);
  if (JSON_INTENT_TYPES.has(type)) {
    // These types document no value property, only valueJson. A value
    // beside it would be read instead of the JSON text (configuration
    // parser), so a stray one is unreadable.
    if (row.value !== undefined && row.value !== null) return true;
    const parsed = parsedJson(row.valueJson);
    // A collection holds a JSON list, or null when it is not configured.
    return (
      !parsed ||
      (type === COLLECTION_INTENT &&
        parsed.value !== null &&
        !Array.isArray(parsed.value))
    );
  }
  const value =
    row.value !== undefined ? row.value : parsedJson(row.valueJson)?.value;
  if (value === null) return row.valueJson !== "null";
  return !documentedValue(type, value);
}

// Presentation values that hold a list (Graph beta reference).
const MULTI_TEXT = "grouppolicypresentationvaluemultitext";
const LIST = "grouppolicypresentationvaluelist";

/**
 * Whether an administrative template presentation value has no value of
 * its documented type: a boolean, a decimal, a long decimal or text, a list
 * of text lines, or a list of name and value pairs (isKeyValuePair), which
 * may be empty (the snapshot projection keeps pairs as one redacted value,
 * compared by fingerprint, only when every pair is one). A list
 * presentation without its list, as in snapshots saved before the pairs
 * were fingerprinted, is unreadable: its pairs are unknown. The other types
 * hold one value and no values property (msgraph skill schemas of the
 * groupPolicyPresentationValue types, 23 October 2026), so values on them
 * in any form, null
 * included (the projection keeps a list of another shape as null), are
 * unreadable. A redacted value is not stored.
 */
export function unreadablePresentationValue(entry: unknown): boolean {
  if (!isObject(entry)) return true;
  const type = normalizeTargetType(entry["@odata.type"]);
  const listed = type === MULTI_TEXT || type === LIST;
  if (!listed && entry.values !== undefined) return true;
  if (redacted(entry.value) || redacted(entry.values)) return false;
  if (type === MULTI_TEXT)
    return unreadableEntries(entry.values, (line) => typeof line !== "string");
  if (type === LIST)
    return unreadableEntries(entry.values, (pair) => !isKeyValuePair(pair));
  return !documentedValue(type, entry.value);
}

// A presentation value Compare and History can name: Graph returns the
// presentation, with its id and its label (null when it has none), on every
// presentation value it expands. The documentation shows a value without
// it as a plain value; a comparison cannot tell it apart or show it as the
// other side does.
const unnamedPresentation = (entry: unknown) =>
  !isObject(entry) ||
  !isObject(entry.presentation) ||
  !isIdentifier(entry.presentation.id) ||
  (entry.presentation.label !== null &&
    typeof entry.presentation.label !== "string");

/**
 * Whether an administrative template definition value is unreadable for a
 * comparison: its state is no boolean, or a presentation value has no value
 * of its documented type or no presentation that names it. Presentation
 * values Graph returned as no list, or did not return, make the policy
 * incomplete instead (snapshot projection).
 */
export const unreadableTemplateValue = (row: unknown): boolean =>
  !isObject(row) ||
  typeof row.enabled !== "boolean" ||
  (Array.isArray(row.presentationValues) &&
    row.presentationValues.some(
      (entry) =>
        unreadablePresentationValue(entry) || unnamedPresentation(entry),
    ));

export type IdentifiedSource =
  | "settingsCatalog"
  | "securityBaseline"
  | "omaUri"
  | "administrativeTemplate";

/** Settings Catalog rows hold an instance, intent rows a definition id. */
export type SettingsLayout = "settingsCatalog" | "intent";

const isObject = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// Families whose settings rows have one layout, whatever the rows show, so a
// row without its instance or definition id is still a row of that layout.
// Settings Catalog policies come from /configurationPolicies/{id}/settings,
// security baseline and endpoint security intents from
// /intents/{id}/settings. App configuration keys and values carry no
// identifier read here.
const FAMILY_LAYOUTS: Readonly<Record<string, SettingsLayout | null>> = {
  settingsCatalog: "settingsCatalog",
  securityBaselines: "intent",
  appConfigurations: null,
};

/**
 * The layout of a settings list: fixed by the policy family where it has
 * one, otherwise read from its rows.
 */
export function settingsLayout(
  family: unknown,
  rows: readonly unknown[],
): SettingsLayout | undefined {
  if (typeof family === "string" && Object.hasOwn(FAMILY_LAYOUTS, family))
    return FAMILY_LAYOUTS[family] ?? undefined;
  const has = (key: string) => rows.some((row) => isObject(row) && key in row);
  if (has("settingInstance")) return "settingsCatalog";
  if (has("definitionId")) return "intent";
  return undefined;
}

// A defined value that is no list where Graph returns one (null reads as
// absent, as the snapshot projection drops it).
const malformedList = (value: unknown) =>
  value !== undefined && value !== null && !Array.isArray(value);

/**
 * The child lists of a Settings Catalog instance, read from the value its
 * type documents (instanceValueKey), or null when they are unknown: an
 * instance of a type that cannot be read, or a value or child list that
 * can hold child settings and is not of its documented shape. A choice
 * value's children may be omitted; a group value's children are always
 * returned. Every reader walks children only through these lists.
 */
export function childLists(instance: unknown): unknown[][] | null {
  const key = instanceValueKey(instance);
  if (key === undefined) return null;
  const value =
    key === null ? undefined : (instance as Record<string, any>)[key];
  const choices =
    key === "choiceSettingValue"
      ? [value]
      : key === "choiceSettingCollectionValue"
        ? value
        : [];
  const groups =
    key === "groupSettingValue"
      ? [value]
      : key === "groupSettingCollectionValue"
        ? value
        : [];
  if (!Array.isArray(choices) || !Array.isArray(groups)) return null;
  if (
    choices.some(
      (choice) => !isObject(choice) || malformedList(choice.children),
    ) ||
    groups.some((group) => !isObject(group) || !Array.isArray(group.children))
  )
    return null;
  return [
    ...choices.map((choice) => list(choice.children)),
    ...groups.map((group) => group.children),
  ];
}

// A Settings Catalog instance, or one of its child instances, without a
// definition id, of a type that cannot be read, with a child list Graph did
// not return as a list, or below MAX_SETTING_DEPTH: it may hold any setting.
function unidentifiedInstance(instance: unknown, depth = 0): boolean {
  if (
    depth > MAX_SETTING_DEPTH ||
    !isObject(instance) ||
    !isIdentifier(instance.settingDefinitionId)
  )
    return true;
  const children = childLists(instance);
  return (
    !children ||
    children.some((rows) =>
      rows.some((child) => unidentifiedInstance(child, depth + 1)),
    )
  );
}

/**
 * The root instance of a Settings Catalog row, or null for a row without
 * an instance or one whose root has no definition id.
 */
export function catalogRoot(row: unknown): Record<string, any> | null {
  return isObject(row) &&
    isObject(row.settingInstance) &&
    isIdentifier(row.settingInstance.settingDefinitionId)
    ? row.settingInstance
    : null;
}

/** A Settings Catalog row whose instance or a child of it has no definition id. */
export const unidentifiedCatalogRow = (row: unknown): boolean =>
  !isObject(row) || unidentifiedInstance(row.settingInstance);

/** An intent setting row without its definition id. */
export const unidentifiedIntentRow = (row: unknown): boolean =>
  !isObject(row) || !isIdentifier(row.definitionId);

/** A custom OMA-URI row without its URI. */
export const unidentifiedOmaRow = (row: unknown): boolean =>
  !isObject(row) || !isIdentifier(row.omaUri);

/** An administrative template value without its definition id. */
export const unidentifiedDefinitionValue = (row: unknown): boolean =>
  !isObject(row) || !isIdentifier(row.definition?.id);

const LAYOUT_SOURCES: Readonly<Record<SettingsLayout, IdentifiedSource>> = {
  settingsCatalog: "settingsCatalog",
  intent: "securityBaseline",
};

/**
 * The setting sources of a configuration whose setting list Graph did not
 * return as a list: the settings of a Settings Catalog policy or an intent,
 * the definition values of an administrative template, the custom OMA-URI
 * rows of a custom profile (OMA_TYPES; Graph returns each on every such item,
 * checked in the lab tenant, 21 and 23 October 2026), or an intent category
 * that is no record or holds settings that are no list. Such a source may
 * hold any setting, so a setting the configuration does not show is unknown
 * there, never missing. A list Graph returned empty holds no setting.
 */
// Every type with custom OMA-URI rows (omaSettings in the Graph beta
// $metadata, 23 October 2026).
const OMA_TYPES: ReadonlySet<string> = new Set([
  "androidcustomconfiguration",
  "androidforworkcustomconfiguration",
  "androidworkprofilecustomconfiguration",
  "windows10customconfiguration",
  "windowsphone81customconfiguration",
]);

export function unlistedSources(
  config: Record<string, unknown>,
  family: unknown = config.__evidenceFamily,
): Set<IdentifiedSource> {
  const found = new Set<IdentifiedSource>();
  const layout =
    typeof family === "string" && Object.hasOwn(FAMILY_LAYOUTS, family)
      ? FAMILY_LAYOUTS[family]
      : undefined;
  if (
    layout &&
    (!Array.isArray(config.settings) ||
      malformedList(config.categories) ||
      list(config.categories).some(
        (category) => !isObject(category) || malformedList(category.settings),
      ))
  )
    found.add(LAYOUT_SOURCES[layout]);
  if (
    family === "administrativeTemplates" &&
    !Array.isArray(config.definitionValues)
  )
    found.add("administrativeTemplate");
  if (
    OMA_TYPES.has(normalizeTargetType(config["@odata.type"])) &&
    !Array.isArray(config.omaSettings)
  )
    found.add("omaUri");
  return found;
}

/**
 * The setting sources of a configuration that hold a row Graph returned
 * without its identifier: a Settings Catalog instance without a definition
 * id or with a child list that is no list, an intent setting without a
 * definition id, a custom OMA-URI row without a URI or an administrative
 * template value without a definition. Such a row may be any setting of its
 * source, so a setting the configuration does not show is unknown there,
 * never missing. The sources whose list Graph did not return at all
 * (unlistedSources) are included. The family is the collection family of
 * the configuration (collectConfigurations sets it as __evidenceFamily);
 * without one the layout is read from the rows.
 */
export function unidentifiedSources(
  config: Record<string, unknown>,
  family: unknown = config.__evidenceFamily,
): Set<IdentifiedSource> {
  const found = unlistedSources(config, family);
  for (const rows of [
    list(config.settings),
    ...list(config.categories).map((category) =>
      list(isObject(category) ? category.settings : undefined),
    ),
  ]) {
    const layout = settingsLayout(family, rows);
    if (layout === "settingsCatalog" && rows.some(unidentifiedCatalogRow))
      found.add("settingsCatalog");
    else if (layout === "intent" && rows.some(unidentifiedIntentRow))
      found.add("securityBaseline");
  }
  // Reusable policy settings hold one instance; one Graph returned as
  // another value than a record holds an unknown setting too.
  if (
    config.settingInstance !== undefined &&
    config.settingInstance !== null &&
    unidentifiedInstance(config.settingInstance)
  )
    found.add("settingsCatalog");
  if (list(config.omaSettings).some(unidentifiedOmaRow)) found.add("omaUri");
  if (list(config.definitionValues).some(unidentifiedDefinitionValue))
    found.add("administrativeTemplate");
  return found;
}

// A Settings Catalog instance or one of its child instances with an
// unreadable own value (unreadableCatalogValue).
function unreadableInstance(instance: unknown, depth = 0): boolean {
  if (unreadableCatalogValue(instance)) return true;
  // Children below the limit are unidentified (unidentifiedInstance).
  if (depth >= MAX_SETTING_DEPTH) return false;
  return (childLists(instance) ?? []).some((rows) =>
    rows.some((child) => unreadableInstance(child, depth + 1)),
  );
}

/**
 * The setting sources of a configuration that hold an identified setting
 * whose value Graph did not return readably: a Settings Catalog instance or
 * child instance (unreadableCatalogValue), an intent setting
 * (unreadableIntentValue), a custom OMA-URI row (unreadableOmaValue) or an
 * administrative template value (unreadableTemplateValue). Such a value is
 * unknown, so the setting is not compared, never changed, added, removed,
 * matching or different. Rows without their identifier are
 * unidentifiedSources.
 */
export function unreadableSources(
  config: Record<string, unknown>,
  family: unknown = config.__evidenceFamily,
): Set<IdentifiedSource> {
  const found = new Set<IdentifiedSource>();
  for (const rows of [
    list(config.settings),
    ...list(config.categories).map((category) =>
      list(isObject(category) ? category.settings : undefined),
    ),
  ]) {
    const layout = settingsLayout(family, rows);
    if (
      layout === "settingsCatalog" &&
      rows.some(
        (row) =>
          !unidentifiedCatalogRow(row) &&
          unreadableInstance((row as Record<string, unknown>).settingInstance),
      )
    )
      found.add("settingsCatalog");
    else if (
      layout === "intent" &&
      rows.some(
        (row) => !unidentifiedIntentRow(row) && unreadableIntentValue(row),
      )
    )
      found.add("securityBaseline");
  }
  // Reusable policy settings hold one instance.
  if (
    isObject(config.settingInstance) &&
    unreadableInstance(config.settingInstance)
  )
    found.add("settingsCatalog");
  if (
    list(config.omaSettings).some(
      (row) => !unidentifiedOmaRow(row) && unreadableOmaValue(row),
    )
  )
    found.add("omaUri");
  if (
    list(config.definitionValues).some(
      (row) =>
        !unidentifiedDefinitionValue(row) && unreadableTemplateValue(row),
    )
  )
    found.add("administrativeTemplate");
  return found;
}

/** Item level metadata the documentation never lists as a setting. */
export const METADATA_KEYS: ReadonlySet<string> = new Set([
  "@odata.type",
  "@odata.context",
  "id",
  "name",
  "displayName",
  "description",
  "createdDateTime",
  "lastModifiedDateTime",
  "modifiedDateTime",
  "assignments",
  "roleScopeTagIds",
  "supportsScopeTags",
  "version",
  "configType",
  "collectionStatus",
  "settingCount",
  "platforms",
  "technologies",
  "templateReference",
  "hasFetchError",
  "fetchErrorMessage",
  "creationSource",
  "isAssigned",
]);

// Item keys that hold setting rows read by the checks above, or that no
// comparison reads (compliance actions), rather than a plain property.
const ROW_KEYS: ReadonlySet<string> = new Set([
  "settings",
  "categories",
  "omaSettings",
  "definitionValues",
  "settingInstance",
  "settingDefinitions",
  "settingDefinitionId",
  "scheduledActionsForRule",
]);

// Every Edm primitive by its syntax, so text that is no value of its type
// is unreadable (Graph beta $metadata, OData JSON format).
export const EDM_TYPES: Readonly<Record<string, (value: unknown) => boolean>> =
  {
    Boolean: isBoolean,
    Int32: isInt32,
    Int64: (value) => Number.isSafeInteger(value),
    Double: isDouble,
    Single: isSingle,
    String: isString,
    Duration: isDuration,
    TimeOfDay: isTimeOfDay,
    Date: isDate,
    DateTimeOffset: isDateTimeOffset,
    Guid: isGuid,
    Binary: isBinary,
    // Not an Edm primitive: the String entries of a Conditional Access
    // list of directory objects or applications (graph-property-types.ts),
    // an id or a documented keyword, which CANONICAL_EDM compares ignoring
    // case.
    DirectoryObjectId: isString,
  };

// One text per value of the Edm primitives whose JSON text is not unique,
// so equal values compare equal: OData JSON (v4.01 section 7.1) writes
// TimeOfDay, DateTimeOffset, Duration, Guid and Binary as strings of the
// OData ABNF rules, which allow several texts of one value, and Single and
// Double as JSON numbers. The canonical text is the one Graph returns where
// it has one, so a value Graph returned keeps its text:
//
// - TimeOfDay (CSDL: a clock time): seconds are added and fractional
//   seconds written with at least seven digits, "02:00" and "02:00:00" are
//   "02:00:00.0000000" as Graph returns it (the forms above); digits past
//   the seventh are kept without trailing zeros.
// - DateTimeOffset (CSDL: a date and time with a time-zone offset): seconds
//   are added, trailing fractional zeros dropped and the zero offset
//   "+00:00" or "-00:00" written Z, as Graph returns it
//   ("2024-08-01T12:44:11.08861Z", lab tenant, 23 October 2026). Another
//   offset is part of the value, so the same instant with another offset
//   stays another value.
// - Duration (CSDL: a signed duration in days, hours, minutes and
//   seconds): a day is 24 hours, so the value is its number of seconds and
//   "PT60M" is "PT1H" and "PT24H" is "P1D". Written normalized, days, hours
//   below 24, minutes and seconds below 60, as Graph returns it ("PT0S",
//   lab tenant deviceShellScripts, 23 October 2026).
// - Guid: hexadecimal digits in either case are one value (ABNF HEXDIG);
//   lower case, as Graph returns it.
// - Binary: base64url (ABNF binaryValue) or base64, padded or not, of the
//   same bytes; written as padded base64, the text Graph returns.
// - Single (IEEE 754 binary32): two numbers that round to the same binary32
//   value are one value; Single and Double read -0 as 0 (eq).
// - Boolean, Int32, Int64, Date and String have one JSON text per value
//   (true and false, an integer number, the ABNF dateValue, the text
//   itself), and an enum member is its name, so they are kept.
// A value that is no readable value of its type is kept as it is.
const pad2 = (part: string | undefined) => part ?? "00";
const trimZeros = (digits: string | undefined) =>
  (digits ?? "").replace(/0+$/, "");

const CA_KEYWORDS = [
  "All",
  "None",
  "GuestsOrExternalUsers",
  "Office365",
  "MicrosoftAdminPortals",
  "AllTrusted",
];

const CANONICAL_EDM: Readonly<Record<string, (value: any) => unknown>> = {
  TimeOfDay: (value: string) => {
    const [, hour, minute, second, fraction] =
      /^(\d\d):(\d\d)(?::(\d\d)(?:\.(\d+))?)?$/.exec(value)!;
    const digits = trimZeros(fraction);
    return `${hour}:${minute}:${pad2(second)}.${digits.padEnd(7, "0")}`;
  },
  DateTimeOffset: (value: string) => {
    const [, date, hour, minute, second, fraction, offset] =
      /^(.{10})T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d+))?)?(Z|[+-]\d\d:\d\d)$/.exec(
        value,
      )!;
    const digits = trimZeros(fraction);
    const zone = offset === "+00:00" || offset === "-00:00" ? "Z" : offset;
    return `${date}T${hour}:${minute}:${pad2(second)}${digits ? `.${digits}` : ""}${zone}`;
  },
  Duration: (value: string) => {
    const [, sign, days, hours, minutes, seconds, fraction] =
      /^([+-]?)P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.(\d+))?S)?)?$/.exec(
        value,
      )!;
    const big = (part: string | undefined) => BigInt(part ?? "0");
    let total =
      big(days) * 86400n +
      big(hours) * 3600n +
      big(minutes) * 60n +
      big(seconds);
    const digits = trimZeros(fraction);
    if (!total && !digits) return "PT0S";
    const day = total / 86400n;
    total %= 86400n;
    const hour = total / 3600n;
    total %= 3600n;
    const minute = total / 60n;
    const second = total % 60n;
    const time = [
      hour ? `${hour}H` : "",
      minute ? `${minute}M` : "",
      second || digits ? `${second}${digits ? `.${digits}` : ""}S` : "",
    ].join("");
    return `${sign === "-" ? "-" : ""}P${day ? `${day}D` : ""}${time ? `T${time}` : ""}`;
  },
  Guid: (value: string) => value.toLowerCase(),
  // A Conditional Access id or keyword: a GUID is lower case (Guid), and a
  // keyword Microsoft Learn documents for these lists (conditionalAccessUsers
  // None, All and GuestsOrExternalUsers; conditionalAccessApplications All,
  // Office365 and MicrosoftAdminPortals; conditionalAccessLocations All and
  // AllTrusted) is written as documented, matched ignoring case. Other text
  // is kept.
  DirectoryObjectId: (value: string) =>
    isGuid(value)
      ? value.toLowerCase()
      : (CA_KEYWORDS.find(
          (keyword) => keyword.toLowerCase() === value.toLowerCase(),
        ) ?? value),
  Binary: (value: string) => {
    const body = value.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
    return body.padEnd(Math.ceil(body.length / 4) * 4, "=");
  },
  Single: (value: number | string) =>
    typeof value === "number" ? Math.fround(value) || 0 : value,
  Double: (value: number | string) =>
    typeof value === "number" ? value || 0 : value,
};

/**
 * The canonical form of a value of a documented Graph type (see
 * CANONICAL_EDM), element by element for a collection, for comparing only:
 * equal values of the type have one form. A value of another type, or one
 * that is no readable value of its type, is returned as it is.
 */
export function canonicalEdmValue(type: string, value: unknown): unknown {
  const collection = /^Collection\((.+)\)$/.exec(type);
  if (collection)
    return Array.isArray(value)
      ? value.map((entry) => canonicalEdmValue(collection[1]!, entry))
      : value;
  return Object.hasOwn(CANONICAL_EDM, type) && EDM_TYPES[type]!(value)
    ? CANONICAL_EDM[type]!(value)
    : value;
}

// The Edm type of the value of the typed Graph records VALUE_TYPES reads
// whose values have more than one JSON form: custom OMA-URI floating point
// (Single) and date and time (DateTimeOffset) values. XML values are
// compared by their text (canonicalRecordValue). The other records hold
// integers, booleans and text, whose form is unique.
const VALUE_EDM_TYPES: Readonly<Record<string, string>> = {
  omasettingfloatingpoint: "Single",
  omasettingdatetime: "DateTimeOffset",
};

/**
 * The canonical form (canonicalEdmValue) of the value of a typed Graph
 * record, named by its @odata.type, for comparing only.
 */
export function canonicalRecordValue(type: unknown, value: unknown): unknown {
  const name = normalizeTargetType(type);
  // An XML value is its text: the same XML with or without a byte order
  // mark, or in UTF-16, is one value, written as base64 of its UTF-8 bytes,
  // the form Graph returns for UTF-8 XML without a mark.
  if (name === "omasettingstringxml") {
    const text = decodedXmlValue(value);
    if (text === undefined) return value;
    let binary = "";
    for (const byte of new TextEncoder().encode(text))
      binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return Object.hasOwn(VALUE_EDM_TYPES, name) && documentedValue(type, value)
    ? canonicalEdmValue(VALUE_EDM_TYPES[name]!, value)
    : value;
}

// Enum types whose members documented-values.ts lists, by Graph enum type.
// Every enum type graph-property-types.ts uses is listed: a type without
// members reads no value (graph-property-types.test.ts).
export const ENUM_MEMBERS: Readonly<Record<string, DocumentedField>> = {
  automaticUpdateMode: "automaticUpdateMode",
  defenderScanType: "defenderScanType",
  weeklySchedule: "weeklySchedule",
  managedAppDataTransferLevel: "allowedOutboundDataTransferDestinations",
  macOSGatekeeperAppSources: "gatekeeperAllowedAppSource",
  appLockerApplicationControlType: "appLockerApplicationControl",
  defenderProtectionType: "defenderAdobeReaderLaunchChildProcess",
  defenderAttackSurfaceType: "defenderOfficeAppsLaunchChildProcessType",
  deviceGuardLocalSystemAuthorityCredentialGuardType:
    "deviceGuardLocalSystemAuthorityCredentialGuardSettings",
  stateManagementSetting: "firewallProfileDomain.firewallEnabled",
  diagnosticDataSubmissionMode: "diagnosticsDataSubmissionMode",
  conditionalAccessGrantControl: "conditionalAccessGrantControl",
  authenticationStrengthRequirements: "authenticationStrengthRequirements",
  authenticationMethodModes: "authenticationMethodModes",
  conditionalAccessPolicyState: "conditionalAccessPolicyState",
  riskLevel: "riskLevel",
  conditionalAccessInsiderRiskLevels: "conditionalAccessInsiderRiskLevels",
  conditionalAccessAgentIdRiskLevels: "conditionalAccessAgentIdRiskLevels",
  conditionalAccessClientApp: "conditionalAccessClientApp",
  conditionalAccessDevicePlatform: "conditionalAccessDevicePlatform",
  conditionalAccessGuestOrExternalUserTypes:
    "conditionalAccessGuestOrExternalUserTypes",
  conditionalAccessExternalTenantsMembershipKind:
    "conditionalAccessExternalTenantsMembershipKind",
  filterMode: "filterMode",
  conditionalAccessTransferMethods: "conditionalAccessTransferMethods",
  authenticationStrengthPolicyType: "authenticationStrengthPolicyType",
  runAsAccountType: "runAsAccountType",
  deviceManagementConfigurationPlatforms:
    "deviceManagementConfigurationPlatforms",
};

// Abstract Graph types a property holds a subtype of, named by its
// @odata.type, with their documented concrete subtypes, normalized (Graph
// beta $metadata, 23 October 2026). The type selects how the record is
// read, so another one is unreadable.
export const DERIVED_TYPES: Readonly<Record<string, ReadonlySet<string>>> = {
  conditionalAccessExternalTenants: new Set([
    "conditionalaccessallexternaltenants",
    "conditionalaccessenumeratedexternaltenants",
  ]),
};

// Subtypes Graph documents with the value a property of theirs always has
// (Graph beta reference, conditionalAccessExternalTenants: the enumerated
// membership kind references a conditionalAccessEnumeratedExternalTenants
// object). A record whose type and that value disagree is not of either.
const TYPE_IMPLIES: Readonly<Record<string, readonly [string, string]>> = {
  conditionalaccessallexternaltenants: ["membershipKind", "all"],
  conditionalaccessenumeratedexternaltenants: ["membershipKind", "enumerated"],
};

const contradictsType = (record: Record<string, unknown>) => {
  const type = normalizeTargetType(record["@odata.type"]);
  if (!Object.hasOwn(TYPE_IMPLIES, type)) return false;
  const [key, value] = TYPE_IMPLIES[type]!;
  return record[key] !== value;
};

// Flags enums hold several members, comma separated ("password,sms"), in no
// order (IsFlags in the Graph beta $metadata).
export const FLAGS_ENUMS: ReadonlySet<string> = new Set([
  "authenticationMethodModes",
  "authenticationStrengthRequirements",
  "conditionalAccessInsiderRiskLevels",
  "conditionalAccessAgentIdRiskLevels",
  "conditionalAccessGuestOrExternalUserTypes",
  "conditionalAccessTransferMethods",
  "deviceManagementConfigurationPlatforms",
]);

// A primitive, or a list of primitives of one type: the values the
// projection keeps of a property no table types.
const plainValue = (value: unknown) => {
  const kind = (entry: unknown) =>
    ["string", "number", "boolean"].includes(typeof entry) ? typeof entry : "";
  if (!Array.isArray(value)) return kind(value) !== "";
  return value.every(
    (entry) => kind(entry) !== "" && kind(entry) === kind(value[0]),
  );
};

/**
 * Whether a value has its documented Graph type, by type name
 * (graph-property-types.ts): every Edm primitive by its syntax (EDM_TYPES),
 * a collection as a list of values of its element type, the @odata.type of
 * a record as a documented subtype (DERIVED_TYPES), and an enum as
 * members Graph documents (ENUM_MEMBERS), never the evolvable enum sentinel
 * unknownFutureValue. A type with no validator reads no value, so nothing
 * falls back to accepting any text. An Untyped property, one Graph does not
 * document, reads only as an empty list: its other values are of a type no
 * one documents.
 */
export function documentedPropertyValue(type: string, value: unknown): boolean {
  const collection = /^Collection\((.+)\)$/.exec(type);
  if (collection)
    return (
      Array.isArray(value) &&
      value.every(
        (entry) =>
          entry !== null && documentedPropertyValue(collection[1]!, entry),
      )
    );
  if (type === "Untyped") return Array.isArray(value) && value.length === 0;
  if (Object.hasOwn(EDM_TYPES, type)) return EDM_TYPES[type]!(value);
  if (Object.hasOwn(DERIVED_TYPES, type))
    return (
      typeof value === "string" &&
      DERIVED_TYPES[type]!.has(normalizeTargetType(value))
    );
  if (FLAGS_ENUMS.has(type)) return canonicalFlags(type, value) !== null;
  return (
    Object.hasOwn(ENUM_MEMBERS, type) &&
    value !== "unknownFutureValue" &&
    isDocumented(ENUM_MEMBERS[type]!, value)
  );
}

/**
 * The one form of a value of a flags enum (FLAGS_ENUMS) every reader
 * compares, groups and keys it by, or null when it is unreadable. Graph
 * returns the members comma separated without spaces, in the order of
 * their bits ("android,iOS", lab tenant, 23 October 2026), and the value is
 * the set of them, so the canonical form holds each documented member once,
 * in the documented order, without the zero member none beside others.
 * An empty member, the sentinel unknownFutureValue or a member Graph does
 * not document makes the whole value unreadable.
 */
export function canonicalFlags(type: string, value: unknown): string | null {
  if (!FLAGS_ENUMS.has(type) || typeof value !== "string") return null;
  const field = ENUM_MEMBERS[type]!;
  const parts = value.split(",");
  if (
    parts.some(
      (member) =>
        member === "" ||
        member === "unknownFutureValue" ||
        !isDocumented(field, member),
    )
  )
    return null;
  const members: readonly string[] = DOCUMENTED_VALUES[field];
  const set = new Set(parts);
  if (set.size > 1) set.delete("none");
  return [...set]
    .sort((a, b) => members.indexOf(a) - members.indexOf(b))
    .join(",");
}

/**
 * The platforms of a Settings Catalog policy or template
 * (deviceManagementConfigurationPlatforms) in canonical form
 * (canonicalFlags), or null when Graph did not return them readably.
 */
export const canonicalPlatforms = (value: unknown): string | null =>
  canonicalFlags("deviceManagementConfigurationPlatforms", value);

/** Whether every type name the table uses has a strict validator. */
export function hasValidator(type: string): boolean {
  const collection = /^Collection\((.+)\)$/.exec(type);
  if (collection) return hasValidator(collection[1]!);
  return (
    type === "Untyped" ||
    Object.hasOwn(EDM_TYPES, type) ||
    Object.hasOwn(DERIVED_TYPES, type) ||
    Object.hasOwn(ENUM_MEMBERS, type)
  );
}

// How deep plain properties are read; every documented path is shallower.
const MAX_PROPERTY_DEPTH = 16;

/** A plain property whose value Graph did not return readably. */
export interface UnreadableProperty {
  // Property path from the item, such as conditions, users, includeUsers.
  path: string[];
  // The value stands for a record or for values of an unknown type, so it
  // may hold any setting below it, not one unreadable value.
  container: boolean;
}

/**
 * The documented property types of an item by path
 * (graph-property-types.ts): the item keys and those of its resource type,
 * named by its @odata.type or, for families Graph returns without one, by
 * its family.
 */
export function propertyTypes(
  config: Record<string, unknown>,
  family: unknown = config.__evidenceFamily,
): Record<string, GraphTypeName> {
  const resource =
    normalizeTargetType(config["@odata.type"]) ||
    (typeof family === "string" && Object.hasOwn(FAMILY_RESOURCE_TYPES, family)
      ? FAMILY_RESOURCE_TYPES[family]!
      : "");
  return {
    ...ITEM_PROPERTY_TYPES,
    ...(Object.hasOwn(GRAPH_PROPERTY_TYPES, resource)
      ? GRAPH_PROPERTY_TYPES[resource]
      : {}),
  };
}

/**
 * The plain properties of an item whose value contradicts its documented
 * Graph type (graph-property-types.ts): a typed property of another type,
 * out of range or an undocumented enum member, a record Graph documents
 * holding no record, or an untyped property holding anything but an empty
 * list (documentedPropertyValue). A
 * property of a type the table does not know is unreadable only as a list
 * of primitives of different types, which no Graph type is. Null is a
 * value: Graph returns it for a property that is not configured. Setting
 * rows and metadata are read by the checks above, not here.
 */
export function unreadableProperties(
  config: Record<string, unknown>,
  family: unknown = config.__evidenceFamily,
): UnreadableProperty[] {
  const types = propertyTypes(config, family);
  // Paths Graph documents as records: the parents of typed paths.
  const records = new Set(
    Object.keys(types).flatMap((path) =>
      path
        .split(".")
        .slice(0, -1)
        .map((_, index, parts) => parts.slice(0, index + 1).join(".")),
    ),
  );
  const found: UnreadableProperty[] = [];
  const visit = (value: unknown, path: string[]) => {
    if (value === null || value === undefined) return;
    // A value nested deeper than any documented property is not read, so it
    // may hold any setting.
    if (path.length > MAX_PROPERTY_DEPTH) {
      found.push({ path, container: true });
      return;
    }
    const name = path.join(".");
    if (Object.hasOwn(types, name)) {
      if (documentedPropertyValue(types[name]!, value)) return;
      // A record's @odata.type selects how the record is read, so a record
      // of a type Graph does not document may hold any setting.
      const discriminator = path[path.length - 1] === "@odata.type";
      found.push(
        discriminator
          ? { path: path.slice(0, -1), container: true }
          : { path, container: types[name] === "Untyped" },
      );
    } else if (isObject(value)) {
      if (contradictsType(value)) {
        found.push({ path, container: true });
        return;
      }
      for (const [key, nested] of Object.entries(value))
        visit(nested, [...path, key]);
    } else if (records.has(name)) found.push({ path, container: true });
    else if (
      Array.isArray(value) &&
      value.every((entry) => !isObject(entry) && !Array.isArray(entry)) &&
      !plainValue(value) &&
      value.length > 0
    )
      found.push({ path, container: false });
  };
  for (const [key, value] of Object.entries(config))
    if (!METADATA_KEYS.has(key) && !ROW_KEYS.has(key) && !key.startsWith("__"))
      visit(value, [key]);
  return found;
}

/** A Graph type name, such as an assignment target type, without the namespace, in lower case. */
export const normalizeTargetType = (value: unknown) =>
  typeof value === "string"
    ? value.replace(/^#?(microsoft\.graph\.)?/, "").toLowerCase()
    : "";

/** A field that says what an assignment target targets. */
export type TargetField =
  | "groupId"
  | "collectionId"
  | "organizationalUnitId"
  | "entraObjectId"
  | "targetType";

// The documented scopeTagTargetType values that name who in the group a
// scope tag applies to. none ("unused value, do not use") and the
// unknownFutureValue sentinel name neither, so they leave the target
// unknown.
const SCOPE_TAG_TARGETS = ["user", "device"];

/**
 * Every documented subtype of deviceAndAppManagementAssignmentTarget, by
 * normalized type, with the fields that say what it targets. Sources: the
 * Graph beta and v1.0 $metadata (allDevicesAssignmentTarget,
 * allLicensedUsersAssignmentTarget, groupAssignmentTarget,
 * exclusionGroupAssignmentTarget, configurationManagerCollectionAssignmentTarget)
 * and Microsoft Learn, intune-shared-organizationalunitassignmenttarget
 * (beta) and intune-shared-scopetaggroupassignmenttarget (beta and v1.0),
 * the target of roleScopeTagAutoAssignment. A type outside this table may
 * target anyone, so its assignment is unreadable. Cloud PC targets derive
 * from cloudPcManagementAssignmentTarget, which no collected policy uses.
 */
export const ASSIGNMENT_TARGET_FIELDS: Readonly<
  Record<string, readonly TargetField[]>
> = {
  alldevicesassignmenttarget: [],
  alllicensedusersassignmenttarget: [],
  groupassignmenttarget: ["groupId"],
  exclusiongroupassignmenttarget: ["groupId"],
  configurationmanagercollectionassignmenttarget: ["collectionId"],
  organizationalunitassignmenttarget: ["organizationalUnitId"],
  scopetaggroupassignmenttarget: ["entraObjectId", "targetType"],
};

/** Every field of ASSIGNMENT_TARGET_FIELDS, for projections and keys. */
export const TARGET_FIELDS: readonly TargetField[] = [
  ...new Set(Object.values(ASSIGNMENT_TARGET_FIELDS).flat()),
];

/**
 * The text an identifier is compared and keyed by: a GUID, such as an Entra
 * object id or an assignment filter id, is one id in either case (Edm.Guid,
 * canonicalEdmValue), so it is lower case. Other ids, such as a
 * Configuration Manager collection id, are compared as Graph returned them.
 * Labels keep the text Graph returned.
 */
export const comparedId = (value: unknown): unknown =>
  isGuid(value) ? (value as string).toLowerCase() : value;

// Target fields that hold an Entra object id, which compares ignoring case
// whatever its form.
const OBJECT_ID_FIELDS: ReadonlySet<string> = new Set([
  "groupId",
  "entraObjectId",
]);

/**
 * The text a field of an assignment target (ASSIGNMENT_TARGET_FIELDS) is
 * compared and keyed by: an Entra group id in lower case, another id by
 * comparedId, an enum such as targetType as Graph returned it.
 */
export const comparedTargetField = (field: string, value: unknown): unknown =>
  OBJECT_ID_FIELDS.has(field) && typeof value === "string"
    ? value.toLowerCase()
    : comparedId(value);

/**
 * The Entra group an assignment target names, for group name lookup: the
 * entraObjectId of a scope tag target, otherwise the groupId. Empty ids name
 * nothing.
 */
export function targetGroupId(target: unknown): string | undefined {
  if (!isObject(target)) return undefined;
  const id =
    normalizeTargetType(target["@odata.type"]) ===
    "scopetaggroupassignmenttarget"
      ? target.entraObjectId
      : target.groupId;
  return isIdentifier(id) ? id : undefined;
}

/**
 * The Entra groups an item's assignments name (targetGroupId), for group
 * name lookup. Assignments that are not a list name none.
 */
export function assignmentGroupIds(item: unknown): string[] {
  if (!isObject(item)) return [];
  return list(item.assignments).flatMap((assignment) => {
    const id = targetGroupId(isObject(assignment) ? assignment.target : null);
    return id ? [id] : [];
  });
}

const readableField = (field: TargetField, value: unknown) =>
  field === "targetType"
    ? SCOPE_TAG_TARGETS.includes(value as string)
    : isIdentifier(value);

// The documented deviceAndAppManagementAssignmentFilterType values that
// apply a filter.
const FILTER_MODES = ["include", "exclude"];

/**
 * An assignment Graph returned without what tells it apart: a target of a
 * documented type (ASSIGNMENT_TARGET_FIELDS) with every field that says
 * what it targets, a filter type Graph documents (none, include or exclude,
 * or no filter at all) with the filter id of a filter that applies, and an
 * intent, where it has one, that Graph documents. Such an assignment may
 * target anyone, so its policy's targeting is unknown and two snapshots of
 * it are not compared.
 */
export function unreadableAssignment(entry: unknown): boolean {
  if (!isObject(entry) || !isObject(entry.target)) return true;
  const target = entry.target;
  const type = normalizeTargetType(target["@odata.type"]);
  if (!Object.hasOwn(ASSIGNMENT_TARGET_FIELDS, type)) return true;
  if (
    !ASSIGNMENT_TARGET_FIELDS[type]!.every((field) =>
      readableField(field, target[field]),
    )
  )
    return true;
  const filterId = target.deviceAndAppManagementAssignmentFilterId;
  const filterType = target.deviceAndAppManagementAssignmentFilterType;
  const filtered = FILTER_MODES.includes(filterType);
  if (
    filterType !== undefined &&
    filterType !== null &&
    filterType !== "none" &&
    !filtered
  )
    return true;
  // A filter id needs the type that says how it applies, and a filter that
  // applies needs its id.
  if (
    filtered
      ? !isIdentifier(filterId)
      : filterType !== "none" && isIdentifier(filterId)
  )
    return true;
  // An intent, where the assignment has one, is a documented member.
  return (
    entry.intent !== undefined &&
    entry.intent !== null &&
    !isDocumented("assignmentIntent", entry.intent)
  );
}

/**
 * Plain text forms of Settings Catalog values for the benchmark views: the
 * tenant's current value next to the recommended value, with choice options
 * by their display name where the setting definitions name them (collected
 * settingDefinitions or the Graph definition lookup), otherwise by the
 * option id. Shared by the assessment, the fix plan, the screen, the PDF and
 * the CSV, so every view words a value the same way.
 */
import { MAX_SETTING_DEPTH, childLists } from "../compliance/graph-rows";
import { isRedactedValue } from "../intune-policy-registry";
import { readableOwnValue, record, type Json, type RecordJson } from "./policies";
import type { SettingNames } from "./tenant-settings";

/** Why a value cannot be read, where the engine can tell. */
export type UnreadableCause = "secret" | "redacted" | "wrongType" | "undocumented";

/** A value as text, with the instance it was read from for the raw view. */
export interface ValueText {
  text: string;
  /** The instance of the setting, as collected or delivered; null when not set. */
  raw: RecordJson | null;
  /** Set when the value cannot be read and the engine knows why. */
  cause?: UnreadableCause;
}

export const NOT_CONFIGURED = "Not configured";
export const NOT_READABLE = "Not readable";
/** For a setting no collected policy holds while absence is not proven. */
export const NOT_FOUND = "Not found in the collected Settings Catalog policies";

/**
 * The instance of a definition id inside a root, the root itself included,
 * found through the child lists the shared instance rules read
 * (graph-rows.ts childLists) to MAX_SETTING_DEPTH, as the comparison does.
 */
export function findInstance(
  value: Json | undefined,
  id: string,
  depth = 0,
): RecordJson | null {
  if (!record(value) || depth > MAX_SETTING_DEPTH) return null;
  if (value.settingDefinitionId === id) return value;
  for (const children of childLists(value) ?? [])
    for (const child of children) {
      const found = findInstance(child as Json, id, depth + 1);
      if (found) return found;
    }
  return null;
}

/** A choice option by its display name, or its id without the definition prefix. */
function choiceText(value: Json, id: string, names?: SettingNames): string {
  const raw =
    record(value) && typeof value.value === "string" ? value.value : "";
  const named = raw ? names?.[id]?.options[raw] : undefined;
  if (named) return named;
  return raw.startsWith(`${id}_`) ? raw.slice(id.length + 1) : raw;
}

function simpleText(value: Json): string {
  if (!record(value)) return "";
  const { value: own } = value;
  return typeof own === "string" ||
    typeof own === "number" ||
    typeof own === "boolean"
    ? String(own)
    : "";
}

/** A short readable form of one instance's own value. */
export function valueText(
  instance: RecordJson | null,
  names?: SettingNames,
): string {
  if (!instance) return "Not set";
  if (!readableOwnValue(instance)) return NOT_READABLE;
  const text = (value: Json | undefined) =>
    typeof value === "string" ? value : "";
  const id = text(instance.settingDefinitionId);
  const list = (value: Json | undefined) => (Array.isArray(value) ? value : []);
  const type = text(instance["@odata.type"]).toLowerCase();
  let shown: string;
  if (type.endsWith("choicesettinginstance"))
    shown = choiceText(instance.choiceSettingValue ?? null, id, names);
  else if (type.endsWith("choicesettingcollectioninstance"))
    shown = list(instance.choiceSettingCollectionValue)
      .map((entry) => choiceText(entry, id, names))
      .join(", ");
  else if (type.endsWith("simplesettinginstance"))
    shown = simpleText(instance.simpleSettingValue ?? null);
  else if (type.endsWith("simplesettingcollectioninstance"))
    shown = list(instance.simpleSettingCollectionValue)
      .map(simpleText)
      .join(", ");
  else if (type.endsWith("groupsettingcollectioninstance")) {
    const count = list(instance.groupSettingCollectionValue).length;
    shown = `${count} ${count === 1 ? "entry" : "entries"}`;
  } else shown = "Group of settings";
  if (!shown) return "Empty";
  return shown.length > 160 ? `${shown.slice(0, 157)}...` : shown;
}

const DOCUMENTED_TYPES: ReadonlySet<string> = new Set(
  [
    "ChoiceSettingInstance",
    "ChoiceSettingCollectionInstance",
    "SimpleSettingInstance",
    "SimpleSettingCollectionInstance",
    "GroupSettingInstance",
    "GroupSettingCollectionInstance",
  ].map((name) => `devicemanagementconfiguration${name.toLowerCase()}`),
);

const typeName = (value: unknown) =>
  typeof value === "string"
    ? value
        .replace(/^#/, "")
        .replace(/^microsoft\.graph\./, "")
        .toLowerCase()
    : "";

/** Whether a value record or list (not child instances) holds the form. */
function holds(value: Json | undefined, test: (entry: Json) => boolean): boolean {
  if (value === undefined) return false;
  if (test(value)) return true;
  if (Array.isArray(value)) return value.some((entry) => holds(entry, test));
  if (!record(value)) return false;
  return Object.entries(value).some(
    ([key, entry]) => key !== "children" && holds(entry, test),
  );
}

/** Why one instance's own value cannot be read; null when it can. */
function ownCause(instance: RecordJson): UnreadableCause | null {
  if (readableOwnValue(instance)) return null;
  if (!DOCUMENTED_TYPES.has(typeName(instance["@odata.type"])))
    return "undocumented";
  const values = Object.entries(instance)
    .filter(([key]) => key.endsWith("Value"))
    .map(([, value]) => value);
  if (
    values.some((value) =>
      holds(
        value,
        (entry) =>
          record(entry) &&
          typeName(entry["@odata.type"]) ===
            "devicemanagementconfigurationsecretsettingvalue",
      ),
    )
  )
    return "secret";
  if (values.some((value) => holds(value, (entry) => isRedactedValue(entry))))
    return "redacted";
  return "wrongType";
}

/**
 * Why the value of a setting, or of a setting below it, cannot be read: the
 * first unreadable instance at or below it decides. Null when everything is
 * readable or no cause is known.
 */
export function unreadableCause(
  instance: RecordJson | null,
  depth = 0,
): UnreadableCause | null {
  if (!instance) return null;
  if (depth > MAX_SETTING_DEPTH) return "undocumented";
  const own = ownCause(instance);
  if (own) return own;
  const lists = childLists(instance);
  if (lists === null) return "wrongType";
  for (const children of lists)
    for (const child of children) {
      if (!record(child)) return "wrongType";
      const found = unreadableCause(child, depth + 1);
      if (found) return found;
    }
  return null;
}

/**
 * The value of one setting inside a root as text: the instance at the
 * setting id, Not configured when the root is read whole and does not hold
 * it, and Not readable with the cause when it, or a part of the root that
 * may hold it, cannot be read.
 */
export function settingValue(
  root: RecordJson | null,
  settingId: string,
  names?: SettingNames,
): ValueText {
  const instance = root ? findInstance(root, settingId) : null;
  if (!instance) {
    // A root whose children cannot all be read may hold the setting unseen.
    const hidden = root ? unreadableCause(root) : null;
    return hidden
      ? { text: NOT_READABLE, raw: root, cause: hidden }
      : { text: NOT_CONFIGURED, raw: null };
  }
  const text = valueText(instance, names);
  const cause = text === NOT_READABLE ? unreadableCause(instance) : null;
  return cause ? { text, raw: instance, cause } : { text, raw: instance };
}

/** The display name of a setting, or its id when no definition names it. */
export function settingName(names: SettingNames | undefined, id: string): string {
  return names?.[id]?.name ?? id;
}

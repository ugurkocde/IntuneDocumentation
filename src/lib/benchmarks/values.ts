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
import {
  differingSettings,
  readableOwnValue,
  record,
  unreadableRecommendationPart,
  type Json,
  type RecordJson,
} from "./policies";
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

/** How many characters of a value the views show. */
const VALUE_SHOWN = 160;

const shortened = (text: string) =>
  text.length > VALUE_SHOWN ? `${text.slice(0, VALUE_SHOWN - 3)}...` : text;

/** A short readable form of one instance's own value. */
export function valueText(
  instance: RecordJson | null,
  names?: SettingNames,
): string {
  return shortened(fullValueText(instance, names));
}

/**
 * A current and a recommended value side by side, shortened as valueText
 * does, so that two values that differ never read alike: where their
 * shortened forms are the same, each shows its part from shortly before the
 * first character where they differ, with where that part starts and the
 * length. Takes the full texts (fullValueText).
 */
export function contrastedTexts(
  current: string,
  recommended: string,
): { current: string; recommended: string } {
  const pair = { current: shortened(current), recommended: shortened(recommended) };
  if (current === recommended || pair.current !== pair.recommended) return pair;
  let at = 0;
  while (current[at] === recommended[at]) at += 1;
  const start = Math.max(0, at - 30);
  const end = start + 90;
  const part = (text: string) =>
    `${start ? "..." : ""}${text.slice(start, end)}${text.length > end ? "..." : ""} (from character ${start + 1} of ${text.length})`;
  return { current: part(current), recommended: part(recommended) };
}

/** The own value of one instance as text, in full. */
export function fullValueText(
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
  return shown || "Empty";
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

/**
 * The recommended value of one setting inside a delivered pack root, as every
 * view shows it. A readable value with an unreadable parent above it or an
 * unreadable setting below it is not readable as a whole
 * (readableRecommendation), so it says which part is not: "5 (parent not
 * readable)". A value that cannot be read itself is Not readable.
 */
export function recommendedValue(
  root: RecordJson,
  settingId: string,
  names?: SettingNames,
): ValueText {
  const value = settingValue(root, settingId, names);
  if (value.text === NOT_READABLE) return value;
  const part = unreadableRecommendationPart(root, settingId);
  if (!part) return value;
  if (part === "value") return { text: NOT_READABLE, raw: value.raw };
  return {
    ...value,
    text: `${value.text} (${part === "parent" ? "parent not readable" : "a setting below it is not readable"})`,
  };
}

/**
 * The display name of a setting, or its id when no definition names it. A
 * definition without a display name of its own (a setting below another,
 * definitionNames) is named within the setting it belongs to: "Root name:
 * DefinitionName".
 */
export function settingName(names: SettingNames | undefined, id: string): string {
  const entry = names?.[id];
  if (!entry) return id;
  const root = entry.within ? names?.[entry.within] : undefined;
  return root && !root.within ? `${root.name}: ${entry.name}` : entry.name;
}

/** A setting below a result's setting whose tenant value differs, as text. */
export interface SettingDifference {
  settingId: string;
  /** The tenant's value; Not configured when the policy does not hold it. */
  current: string;
  recommended: string;
}

/** How many differing settings below a setting are named in one line. */
export const DIFFERENCES_SHOWN = 3;

/**
 * The settings below one setting of a root whose tenant value definitely
 * differs while the setting's own value matches (policies.ts
 * differingSettings), with both values as text. Empty when the own value
 * differs, a parent option differs, or no difference below it is readable.
 */
export function settingDifferences(
  recommended: Json,
  observed: Json,
  settingId: string,
  names?: SettingNames,
): SettingDifference[] {
  return differingSettings(recommended, observed, settingId).map(
    (difference) => {
      const wanted = fullValueText(difference.recommended, names);
      return {
        settingId: difference.settingId,
        ...(difference.observed
          ? contrastedTexts(fullValueText(difference.observed, names), wanted)
          : { current: NOT_CONFIGURED, recommended: shortened(wanted) }),
      };
    },
  );
}

const more = (rest: number) =>
  `${rest} more ${rest === 1 ? "setting" : "settings"}`;

/**
 * The first limit differences in words, the rest as a count: "a, b and c"
 * or "a, b, c and 2 more settings" with ", ", "a; b; and 2 more settings"
 * with "; ".
 */
function listed(
  differences: readonly SettingDifference[],
  part: (difference: SettingDifference) => string,
  separator: ", " | "; ",
  limit: number,
): string {
  const shown = differences.slice(0, Math.max(1, limit)).map(part);
  const rest = differences.length - shown.length;
  if (separator === "; ")
    return [...shown, ...(rest > 0 ? [`and ${more(rest)}`] : [])].join(separator);
  const items = rest > 0 ? [...shown, more(rest)] : shown;
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(separator)} and ${items.at(-1)}`;
}

/**
 * The differing settings below one policy's setting as a change, for a fix
 * step: "S1 from A to B, S2 from Not configured to D and 1 more setting".
 * Null when no difference below it is known.
 */
export function differenceText(
  observation: { differences?: readonly SettingDifference[] },
  names?: SettingNames,
  limit = DIFFERENCES_SHOWN,
): string | null {
  const differences = observation.differences ?? [];
  if (!differences.length) return null;
  return listed(
    differences,
    (difference) =>
      `${settingName(names, difference.settingId)} from ${difference.current} to ${difference.recommended}`,
    ", ",
    limit,
  );
}

/**
 * The differing settings below one policy's setting as they are, for the
 * views: "S1 (current A, recommended B); S2 (current Not configured,
 * recommended D)". Null when no difference below it is known.
 */
export function differenceStates(
  observation: { differences?: readonly SettingDifference[] },
  names?: SettingNames,
  limit = DIFFERENCES_SHOWN,
): string | null {
  const differences = observation.differences ?? [];
  if (!differences.length) return null;
  return listed(
    differences,
    (difference) =>
      `${settingName(names, difference.settingId)} (current ${difference.current}, recommended ${difference.recommended})`,
    "; ",
    limit,
  );
}

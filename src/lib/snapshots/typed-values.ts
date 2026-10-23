// Typed values as Compare and History compare them. A value of a type whose
// JSON text is not unique, such as an Edm.TimeOfDay "02:00:00" and
// "02:00:00.0000000", is one value (graph-rows.ts canonicalEdmValue), so it
// is compared in its canonical form while the row shows the text Graph
// returned. Only values the type table names are canonicalized: the plain
// properties of graph-property-types.ts by resource type and path, and the
// custom OMA-URI values by the type of their record (canonicalRecordValue).
// Settings Catalog, intent and administrative template values are integers,
// booleans and text, whose JSON form is unique, so they are compared as
// Graph returned them.
import {
  canonicalEdmValue,
  canonicalRecordValue,
  propertyTypes,
} from "../compliance/graph-rows";
import { flattenItemSettings, type FlatSettingRow } from "../settings-flatten";

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The item with every typed value in its canonical form, for comparing
 * only; the item itself is not changed. Returns the item when nothing
 * changes.
 */
export function canonicalTypedValues(family: string, data: Json): Json {
  let copy: Json | undefined;
  const writable = () => (copy ??= structuredClone(data));
  for (const [path, type] of Object.entries(propertyTypes(data, family))) {
    const segments = path.split(".");
    let parent: unknown = data;
    for (const segment of segments.slice(0, -1))
      parent = isRecord(parent) ? parent[segment] : undefined;
    const key = segments[segments.length - 1]!;
    if (!isRecord(parent) || !Object.hasOwn(parent, key)) continue;
    const next = canonicalEdmValue(type, parent[key]);
    if (same(next, parent[key])) continue;
    let target = writable();
    for (const segment of segments.slice(0, -1))
      target = target[segment] as Json;
    target[key] = next;
  }
  if (Array.isArray(data.omaSettings))
    data.omaSettings.forEach((setting, index) => {
      if (!isRecord(setting) || !Object.hasOwn(setting, "value")) return;
      const next = canonicalRecordValue(setting["@odata.type"], setting.value);
      if (same(next, setting.value)) return;
      (writable().omaSettings as Json[])[index]!.value = next;
    });
  return copy ?? data;
}

/**
 * The setting rows of an item as Compare and History read it: shown as
 * Graph returned it, with a token holding the canonical value where a typed
 * value is not in its canonical form. The canonical item flattens to the
 * same rows, as a value keeps its JSON type and stays readable; rows that
 * do not line up are returned without tokens.
 */
export function comparedRows(
  sectionKey: string,
  family: string,
  data: Json,
): FlatSettingRow[] {
  const rows = flattenItemSettings(sectionKey, data);
  const canonical = canonicalTypedValues(family, data);
  if (canonical === data) return rows;
  const compared = flattenItemSettings(sectionKey, canonical);
  if (
    compared.length !== rows.length ||
    compared.some(
      (row, index) =>
        row.name !== rows[index]!.name ||
        row.definitionId !== rows[index]!.definitionId,
    )
  )
    return rows;
  return rows.map((row, index) => {
    const token = compared[index]!.token ?? compared[index]!.value;
    return token === (row.token ?? row.value) ? row : { ...row, token };
  });
}

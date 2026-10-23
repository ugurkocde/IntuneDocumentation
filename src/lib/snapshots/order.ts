// The order Compare and History read collections in. A collection whose
// order Graph gives no meaning is compared as a multiset: its entries are
// sorted before the item is flattened, so a reordered list is no change
// while an added or removed entry still is. Decided per collection from the
// Graph beta reference and $metadata (checked 23 October 2026):
//
// - Every Conditional Access collection (graph-property-types.ts
//   conditionalaccesspolicy) is a scope or control list: the users, groups,
//   roles, applications, user actions, authentication contexts, platforms,
//   locations, devices, service principals and external tenants a policy
//   includes or excludes, its client app types and risk levels, and its
//   grant controls, terms of use and authentication strength combinations.
//   The reference documents none of them as ordered; the grant operator,
//   not the order, says how controls combine.
// - Flags enums (graph-rows.ts FLAGS_ENUMS, IsFlags in $metadata) hold
//   members in no order, also inside a collection entry such as an allowed
//   combination "password,sms".
// - Settings Catalog value collections (simple, choice and group setting
//   collections) keep their order: Graph documents none as unordered and
//   several CSPs behind them are ordered lists, such as Defender signature
//   update fallback order or TLS cipher suites. Administrative template
//   multi text values keep their order too (REG_MULTI_SZ is an ordered
//   list); list presentations are a set of named values, compared by a
//   digest of the sorted pairs (projection.ts).
// - Assignments and Entra identity targets are already compared as sets
//   (diff.ts, identity.ts).
import {
  canonicalEdmValue,
  canonicalFlags,
  FLAGS_ENUMS,
  normalizeTargetType,
  propertyTypes,
} from "../compliance/graph-rows";
import { FAMILY_RESOURCE_TYPES } from "../compliance/graph-property-types";
import { canonicalJson } from "../canonical-json";

type Json = Record<string, unknown>;

// Resource types whose collections are all unordered.
const UNORDERED_RESOURCES: ReadonlySet<string> = new Set([
  FAMILY_RESOURCE_TYPES.conditionalAccessPolicies!,
]);

const isRecord = (value: unknown): value is Json =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

// A flags value in its canonical form (graph-rows.ts canonicalFlags), so the
// same set of members compares equal however Graph lists them. A value that
// is no set of documented members is kept: it reads as unreadable.
const flags = (type: string, value: unknown) =>
  canonicalFlags(type, value) ?? value;

// Primitives sort by type and text, so a list of mixed entries, which reads
// as unreadable anyway, still sorts the same way on both sides. The text is
// the canonical form of the element type (typed-values.ts), so entries
// Graph wrote in another form of the same value sort alike too, and an
// entry that is a record is written with its keys sorted (canonical-json.ts).
const sorted = (list: unknown[], element: string) => {
  const key = (entry: unknown) => {
    const value = canonicalEdmValue(element, entry);
    return `${typeof value}:${canonicalJson(value)}`;
  };
  return [...list].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
};

/**
 * The item with every collection whose order Graph gives no meaning sorted
 * and every flags value's members sorted, for Compare and History only. The
 * stored item is not changed, and its readability is checked on it as Graph
 * returned it.
 */
export function inComparisonOrder(family: string, data: Json): Json {
  const types = propertyTypes(data, family);
  const unordered = UNORDERED_RESOURCES.has(
    normalizeTargetType(data["@odata.type"]) ||
      (Object.hasOwn(FAMILY_RESOURCE_TYPES, family)
        ? FAMILY_RESOURCE_TYPES[family]!
        : ""),
  );
  let copy: Json | undefined;
  for (const [path, type] of Object.entries(types)) {
    const collection = /^Collection\((.+)\)$/.exec(type);
    const element = collection?.[1];
    if (!(collection ? unordered : FLAGS_ENUMS.has(type))) continue;
    const segments = path.split(".");
    let parent: unknown = data;
    for (const segment of segments.slice(0, -1))
      parent = isRecord(parent) ? parent[segment] : undefined;
    const key = segments[segments.length - 1]!;
    if (!isRecord(parent) || parent[key] === undefined || parent[key] === null)
      continue;
    const value = parent[key];
    const next = collection
      ? Array.isArray(value)
        ? sorted(
            FLAGS_ENUMS.has(element!)
              ? value.map((entry) => flags(element!, entry))
              : value,
            element!,
          )
        : value
      : flags(type, value);
    if (JSON.stringify(next) === JSON.stringify(value)) continue;
    copy ??= structuredClone(data);
    let target: Json = copy;
    for (const segment of segments.slice(0, -1))
      target = target[segment] as Json;
    target[key] = next;
  }
  return copy ?? data;
}

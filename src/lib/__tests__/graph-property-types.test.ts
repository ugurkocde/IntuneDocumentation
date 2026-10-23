import { describe, expect, it } from "vitest";
import { documentedPropertyValue } from "../compliance/graph-rows";
import {
  GRAPH_PROPERTY_TYPES,
  ITEM_PROPERTY_TYPES,
} from "../compliance/graph-property-types";
import { keptPlainProperties } from "../snapshots/projection";

// The typed property table stays in sync with what the snapshot projection
// keeps: a property Compare or History reads without a documented type
// would be read as a value of any type.
describe("graph property types", () => {
  it("types every plain property the projection keeps", () => {
    const untyped: string[] = [];
    for (const [type, paths] of Object.entries(keptPlainProperties())) {
      const table =
        type === "" ? ITEM_PROPERTY_TYPES : GRAPH_PROPERTY_TYPES[type];
      for (const path of paths)
        if (!table || !Object.hasOwn(table, path))
          untyped.push(`${type || "item"}: ${path}`);
    }
    expect(untyped).toEqual([]);
  });

  it("names a type the shared check reads for every entry", () => {
    const tables = [
      ITEM_PROPERTY_TYPES,
      ...Object.values(GRAPH_PROPERTY_TYPES),
    ];
    for (const table of tables)
      for (const [path, type] of Object.entries(table)) {
        // Every type reads null as not configured upstream; here a value of
        // no type at all must never pass, and the type name must be one the
        // check knows or an enum name.
        expect(
          documentedPropertyValue(type, { synthetic: true }),
          `${path}: ${type}`,
        ).toBe(false);
        expect(type, path).toMatch(/^(Collection\()?[A-Za-z0-9]+\)?$/);
      }
  });
});

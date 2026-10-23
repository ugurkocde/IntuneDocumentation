import { describe, expect, it } from "vitest";
import { DOCUMENTED_VALUES } from "../compliance/documented-values";
import {
  documentedPropertyValue,
  EDM_TYPES,
  ENUM_MEMBERS,
  hasValidator,
} from "../compliance/graph-rows";
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

  // Round 33: no type falls back to accepting any value. Every type name
  // the table uses has a strict validator (an Edm syntax or the members
  // Graph documents), and only String reads arbitrary text.
  it("has a strict validator for every type name the table uses", () => {
    const names = new Set(
      [ITEM_PROPERTY_TYPES, ...Object.values(GRAPH_PROPERTY_TYPES)].flatMap(
        (table) => Object.values(table),
      ),
    );
    const missing = [...names].filter((type) => !hasValidator(type));
    expect(missing).toEqual([]);
    for (const type of names) {
      if (type === "String") continue;
      for (const value of ["garbage", "", "unknownFutureValue", 1.5])
        expect(documentedPropertyValue(type, value), `${type}: ${value}`).toBe(
          false,
        );
    }
    // Each enum's members come from documented-values.ts.
    for (const [type, field] of Object.entries(ENUM_MEMBERS))
      expect(Object.hasOwn(DOCUMENTED_VALUES, field), type).toBe(true);
  });

  it("reads every Edm primitive by its syntax", () => {
    const cases: Record<string, [unknown[], unknown[]]> = {
      TimeOfDay: [
        // CSDL ABNF: seconds are optional, 60 is a leap second, fractional
        // seconds have 1 to 12 digits.
        ["02:00:00", "02:00:00.0000000", "23:59:59.5", "02:00", "23:59:60"],
        [
          "garbage",
          "24:00:00",
          "2:00:00",
          "02:00:61",
          "02:00:00.1234567890123",
          "02:00:00.",
          7200,
        ],
      ],
      Duration: [
        // A day-time duration: days, hours, minutes and seconds only.
        ["PT1H", "P1D", "PT0.5S", "P3DT4H5M6S", "PT0S", "-PT1M", "+P1D"],
        [
          "garbage",
          "P",
          "PT",
          "P1DT",
          "1H",
          "P1Y",
          "P1M",
          "P1W",
          "P1Y2M3DT4H5M6S",
          3600,
        ],
      ],
      Date: [
        ["2026-10-23", "2024-02-29"],
        ["2026-02-30", "2026-13-01", "20261023", "2026-10-23T00:00:00Z"],
      ],
      DateTimeOffset: [
        [
          "2026-10-23T09:00:00Z",
          "2026-10-23T09:00:00.1234567+02:00",
          "2026-10-23T09:00Z",
          // As Graph returns it, seven fractional digits.
          "2026-10-23T10:00:00.0000000Z",
          "2026-12-31T23:59:60Z",
        ],
        [
          "garbage",
          "2026-10-23",
          "2026-10-23T25:00:00Z",
          "2026-02-30T09:00:00Z",
          "2026-10-23T09:00:00",
          "2026-10-23T09:00:00.1234567890123Z",
          "2026-10-23T09:00:00+24:00",
        ],
      ],
      Guid: [
        ["00000000-0000-0000-0000-000000000001"],
        ["garbage", "00000000-0000-0000-0000-00000000000g"],
      ],
      Binary: [
        // base64 and base64url, padded or not.
        ["", "c3ludGhldGlj", "c3ludA==", "c3ludA", "-_8", "a+8="],
        [
          "garbage!",
          "a",
          "abcde",
          "ab=",
          "a+b_",
          "c3ludA===",
          // A last character with bits beyond the bytes it encodes.
          "a+/=",
          "c3ludB",
          "c3ludA=",
        ],
      ],
      Int64: [
        [0, -5, 2 ** 40],
        [1.5, "1", 2 ** 60],
      ],
      // OData JSON: a number, or NaN, INF and -INF as strings.
      Double: [
        [0, 1.5, -2, 1e300, "NaN", "INF", "-INF"],
        [Number.NaN, Number.POSITIVE_INFINITY, "1.5", "Infinity"],
      ],
      Single: [
        [0, 1.5, -2, 3.4e38, 3.4028235e38, "INF"],
        [1e39, Number.NaN, "1.5"],
      ],
    };
    for (const [type, [valid, invalid]] of Object.entries(cases)) {
      for (const value of valid)
        expect(EDM_TYPES[type]!(value), `${type}: ${String(value)}`).toBe(true);
      for (const value of invalid)
        expect(EDM_TYPES[type]!(value), `${type}: ${String(value)}`).toBe(
          false,
        );
    }
  });
});

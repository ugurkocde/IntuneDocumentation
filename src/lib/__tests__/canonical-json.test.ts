import { describe, expect, it } from "vitest";
import { canonicalJson } from "../canonical-json";

describe("canonicalJson", () => {
  it("writes the keys of every object sorted, also nested ones", () => {
    expect(canonicalJson({ b: 2, a: { d: [{ f: 1, e: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[{"e":2,"f":1}]},"b":2}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("keeps array order, primitive types and values", () => {
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: "1" }));
    expect(canonicalJson({ a: true })).not.toBe(canonicalJson({ a: "true" }));
    expect(canonicalJson({ a: null })).not.toBe(canonicalJson({}));
    for (const value of ["text", 1, 0.5, false, null, [1, "1", [true]]])
      expect(canonicalJson(value)).toBe(JSON.stringify(value));
  });

  it("drops what JSON cannot hold as JSON.stringify does", () => {
    expect(canonicalJson({ b: undefined, a: 1 })).toBe('{"a":1}');
    expect(canonicalJson(undefined)).toBe("undefined");
  });

  it("keeps an own __proto__ key as a value", () => {
    const value = JSON.parse('{"__proto__":{"a":1},"b":2}');
    expect(canonicalJson(value)).toBe('{"__proto__":{"a":1},"b":2}');
  });
});

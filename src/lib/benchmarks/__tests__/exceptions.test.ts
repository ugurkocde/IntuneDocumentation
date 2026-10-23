import { describe, expect, it } from "vitest";
import {
  appliesOn,
  exceptionKey,
  isActive,
  isDateOnly,
  localDate,
  validateExceptions,
  validateNewException,
} from "../exceptions";

const stored = {
  id: "exception-1",
  benchmark: "synthetic-bench",
  version: "1.0.0",
  level: 1,
  settingId: "synthetic_bench_alpha",
  owner: "  Synthetic owner ",
  reason: "Synthetic reason",
  expiresOn: "2026-12-31",
  createdAt: "2026-10-01T09:00:00.000Z",
};

describe("benchmark exception validation", () => {
  it("accepts a valid list and trims text fields", () => {
    expect(validateExceptions([stored])).toEqual([
      { ...stored, owner: "Synthetic owner" },
    ]);
  });

  it("rejects invalid stored data", () => {
    expect(() => validateExceptions({})).toThrow("must be an array");
    expect(() => validateExceptions([{ ...stored, level: 3 }])).toThrow(
      "level must be 1 or 2",
    );
    expect(() =>
      validateExceptions([{ ...stored, expiresOn: "2026-02-30" }]),
    ).toThrow("expiresOn");
    expect(() =>
      validateExceptions([{ ...stored, createdAt: "later" }]),
    ).toThrow("createdAt");
    expect(() => validateExceptions([stored, stored])).toThrow("duplicate id");
    expect(() =>
      validateExceptions(
        Array.from({ length: 501 }, (_, index) => ({
          ...stored,
          id: `e${index}`,
        })),
      ),
    ).toThrow("at most 500");
  });

  it("is keyed by ids only: a policy name or any other field is refused", () => {
    expect(() =>
      validateExceptions([{ ...stored, policyName: "Synthetic pack policy" }]),
    ).toThrow("unknown field policyName");
    expect(() =>
      validateNewException({ ...stored, id: undefined, createdAt: undefined }),
    ).toThrow("unknown field");
  });

  it("validates one new exception input", () => {
    const input = {
      benchmark: stored.benchmark,
      version: stored.version,
      level: stored.level,
      settingId: stored.settingId,
      owner: stored.owner,
      reason: stored.reason,
      expiresOn: stored.expiresOn,
    };
    expect(validateNewException(input)).toEqual({
      ...input,
      owner: "Synthetic owner",
    });
    expect(() => validateNewException({ ...input, owner: " " })).toThrow(
      "owner must not be empty",
    );
  });

  it("strips control characters including newlines from text fields", () => {
    expect(
      validateExceptions([{ ...stored, reason: "line\none\u0007" }])[0]!.reason,
    ).toBe("lineone");
  });

  it("builds a stable key and treats the expiry date as the last active day", () => {
    expect(
      exceptionKey("synthetic-bench", "1.0.0", 1, "synthetic_bench_alpha"),
    ).toBe(
      JSON.stringify(["synthetic-bench", "1.0.0", 1, "synthetic_bench_alpha"]),
    );
    expect(isActive(stored, "2026-12-31")).toBe(true);
    expect(isActive(stored, "2027-01-01T00:00:00Z")).toBe(false);
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(localDate("2026-10-21")).toBe("2026-10-21");
  });

  it("applies from its local creation date through its expiry date", () => {
    const exception = {
      createdAt: new Date(2026, 9, 10, 23, 30).toISOString(),
      expiresOn: "2026-10-20",
    };
    expect(appliesOn(exception, "2026-10-09")).toBe(false);
    expect(appliesOn(exception, "2026-10-10")).toBe(true);
    expect(appliesOn(exception, "2026-10-20")).toBe(true);
    expect(appliesOn(exception, "2026-10-21")).toBe(false);
  });
});

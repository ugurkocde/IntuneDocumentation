import { afterEach, describe, expect, it } from "vitest";
import {
  allowed,
  canDelegate,
  price,
  type Member,
  type Snapshot,
} from "../domain";
import { canonical, diffSnapshots, evaluate } from "../analysis";
import { decrypt, encrypt } from "../crypto";
import { nextSchedule, publicAddress } from "../delivery";
const member: Member = {
  user_id: "user",
  role: "admin",
  customer_scope: ["a"],
  expires_at: null,
};
const snapshot = (
  data: unknown[],
  status: "complete" | "failed" = "complete",
): Snapshot => ({
  version: 1,
  capturedAt: "2026-09-01T00:00:00Z",
  sections: { policies: { status, data } },
});
describe("workspace authorization", () => {
  it("separates permissions from customer scope", () => {
    expect(allowed(member, "manage", "a")).toBe(true);
    expect(allowed(member, "manage", "b")).toBe(false);
    expect(allowed(member, "billing", "a")).toBe(false);
  });
  it("does not delegate future-customer or owner access from scoped admin", () => {
    expect(canDelegate(member, "viewer", null)).toBe(false);
    expect(canDelegate(member, "owner", ["a"])).toBe(false);
    expect(canDelegate(member, "analyst", ["a", "b"])).toBe(false);
    expect(canDelegate(member, "viewer", ["a"])).toBe(true);
  });
  it("expires auditor access on the next request", () => {
    expect(
      allowed(
        { ...member, role: "auditor", expires_at: "2020-01-01T00:00:00Z" },
        "read",
        "a",
      ),
    ).toBe(false);
  });
});
describe("commercial contract", () => {
  it("includes the agreed tenant allowances", () => {
    expect(price("enterprise", 1, "month").cents).toBe(14900);
    expect(price("enterprise", 2, "month").cents).toBe(24800);
    expect(price("msp", 10, "month").cents).toBe(24900);
    expect(price("msp", 11, "month").cents).toBe(26900);
  });
  it("uses exact annual and founders amounts without stacking", () => {
    expect(price("enterprise", 2, "year").cents).toBe(252960);
    expect(price("msp", 11, "month", true).cents).toBe(13450);
    expect(() => price("msp", 10, "year", true)).toThrow();
  });
  it("rejects fractional and unbounded quantities", () => {
    expect(() => price("msp", 1.2, "month")).toThrow();
    expect(() => price("msp", -1, "month")).toThrow();
  });
});
describe("configuration evidence", () => {
  it("never turns an incomplete read into a removal", () => {
    const result = diffSnapshots(
      snapshot([{ id: "a", enabled: true }]),
      snapshot([], "failed"),
    );
    expect(result.changes).toEqual([]);
    expect(result.skipped).toEqual(["policies"]);
  });
  it("records setting and assignment changes", () => {
    const result = diffSnapshots(
      snapshot([{ id: "a", enabled: true, assignments: [{ id: "g1" }] }]),
      snapshot([{ id: "a", enabled: false, assignments: [] }]),
    );
    expect(result.changes.map((c) => c.path)).toEqual([
      "/enabled",
      "/assignments",
    ]);
  });
  it("ignores server bookkeeping without dropping settings", () => {
    expect(
      diffSnapshots(
        snapshot([
          { id: "a", lastModifiedDateTime: "yesterday", enabled: true },
        ]),
        snapshot([{ id: "a", lastModifiedDateTime: "today", enabled: true }]),
      ).changes,
    ).toEqual([]);
  });
  it("preserves ordered arrays where elements have no stable IDs", () => {
    expect(canonical(["deny", "allow"])).not.toEqual(
      canonical(["allow", "deny"]),
    );
  });
  it("keeps missing standards evidence unknown", () => {
    const result = evaluate(snapshot([{ id: "a" }]), {
      name: "Policy",
      description: "",
      rules: [
        {
          id: "00000000-0000-4000-8000-000000000000",
          name: "Enabled",
          section: "policies",
          path: "/enabled",
          operator: "equals",
          expected: true,
          severity: "high",
        },
      ],
    });
    expect(result[0]?.status).toBe("unknown");
  });
});
describe("encrypted isolation", () => {
  afterEach(() => {
    delete process.env.ENTERPRISE_ENCRYPTION_KEYS;
    delete process.env.ENTERPRISE_ACTIVE_KEY;
  });
  it("binds ciphertext to workspace, customer, and record", () => {
    process.env.ENTERPRISE_ENCRYPTION_KEYS = JSON.stringify({
      a: Buffer.alloc(32, 7).toString("base64"),
    });
    process.env.ENTERPRISE_ACTIVE_KEY = "a";
    const encrypted = encrypt({ policy: "secret" }, "w/a/record");
    expect(encrypted).not.toContain("secret");
    expect(decrypt(encrypted, "w/a/record")).toEqual({ policy: "secret" });
    expect(() => decrypt(encrypted, "w/b/record")).toThrow();
  });
});
describe("delivery safety", () => {
  it("rejects local, metadata, mapped IPv6 and multicast addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.1.2",
      "169.254.169.254",
      "172.16.1.1",
      "192.168.1.2",
      "100.64.0.1",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "224.0.0.1",
    ])
      expect(publicAddress(ip), ip).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
  });
  it("keeps local reporting time across European DST", () => {
    expect(
      nextSchedule(
        new Date("2026-10-24T07:00:00Z"),
        "daily",
        8,
        "Europe/Berlin",
      ).toISOString(),
    ).toBe("2026-10-25T07:00:00.000Z");
  });
  it("supports half-hour timezones at the requested local hour", () => {
    expect(
      nextSchedule(
        new Date("2026-09-09T00:00:00Z"),
        "daily",
        8,
        "Asia/Kolkata",
      ).toISOString(),
    ).toBe("2026-09-09T02:30:00.000Z");
  });
});

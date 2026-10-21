import { describe, expect, it } from "vitest";
import type { SnapshotProjection } from "../../../../src/lib/snapshots/projection";
import type { HistoryEntry } from "../shared/ipc-types";
import {
  historyDiffView,
  managementChanges,
  NEEDS_TWO_SNAPSHOTS,
  parseHistoryDiffRequest,
  parseSnapshotId,
  pickPair,
  previousSnapshot,
  type ComparedSnapshots,
} from "./history";

function entry(id: string, collectedAt: string): HistoryEntry {
  return { id, collectedAt, items: 1, partial: false, rulesetVersion: "1", bytes: 10 };
}

const LATEST = entry("20261018T100000Z-aaaaaaaa", "2026-10-18T10:00:00Z");
const PREVIOUS = entry("20261017T100000Z-bbbbbbbb", "2026-10-17T10:00:00Z");
const OLDEST = entry("20261016T100000Z-cccccccc", "2026-10-16T10:00:00Z");
// Newest first, as history:list returns them.
const ENTRIES = [LATEST, PREVIOUS, OLDEST];

describe("history requests", () => {
  it("accepts snapshot ids and framework ids only", () => {
    expect(parseSnapshotId(LATEST.id)).toBe(LATEST.id);
    expect(() => parseSnapshotId("../key")).toThrow("Unknown snapshot");
    expect(() => parseSnapshotId(42)).toThrow("Unknown snapshot");
    expect(parseHistoryDiffRequest(undefined)).toEqual({});
    expect(
      parseHistoryDiffRequest({ fromId: OLDEST.id, frameworkId: "nis2-2022-2555" }),
    ).toEqual({ fromId: OLDEST.id, frameworkId: "nis2-2022-2555" });
    expect(() => parseHistoryDiffRequest({ frameworkId: "<script>" })).toThrow(
      "Unknown compliance framework",
    );
    expect(() => parseHistoryDiffRequest("x")).toThrow();
  });

  it("compares the previous with the latest snapshot by default", () => {
    expect(pickPair(ENTRIES, {})).toEqual({ from: PREVIOUS, to: LATEST });
    expect(pickPair(ENTRIES, { fromId: OLDEST.id })).toEqual({ from: OLDEST, to: LATEST });
    expect(pickPair(ENTRIES, { toId: PREVIOUS.id })).toEqual({ from: OLDEST, to: PREVIOUS });
  });

  it("orders a reversed pair oldest first and rejects bad pairs", () => {
    expect(pickPair(ENTRIES, { fromId: LATEST.id, toId: OLDEST.id })).toEqual({
      from: OLDEST,
      to: LATEST,
    });
    expect(() => pickPair(ENTRIES, { fromId: LATEST.id, toId: LATEST.id })).toThrow(
      "two different snapshots",
    );
    expect(() => pickPair(ENTRIES, { fromId: "20200101T000000Z-00000000" })).toThrow(
      "not in the history",
    );
    expect(() => pickPair([LATEST], {})).toThrow(NEEDS_TWO_SNAPSHOTS);
  });
});

describe("historyDiffView", () => {
  const change = (controlId: string) => ({
    controlId,
    title: controlId,
    before: "noEvidence" as const,
    after: "evidenceFound" as const,
    causes: [],
    mappingChanged: false,
    incomplete: { before: false, after: false },
  });
  const compared: ComparedSnapshots = {
    snapshots: {
      policies: [],
      notCompared: [],
      notComparedItems: [],
      totals: {
        policies: 0,
        added: 0,
        removed: 0,
        renamed: 0,
        changed: 0,
        settingChanges: 0,
        assignmentChanges: 0,
        notComparedFamilies: 0,
        notComparedItems: 0,
      },
      identity: {
        changes: Array.from({ length: 205 }, (_, index) => ({
          policy: "authenticationMethods" as const,
          policyLabel: "Authentication methods policy",
          key: `k${index}`,
          name: "State",
          path: ["SMS"],
          change: "changed" as const,
          before: "disabled",
          after: "enabled",
        })),
        notCompared: [{ policy: "securityDefaults", label: "Security defaults", side: "to" }],
        total: 205,
      },
    },
    assessments: {
      fromRuleset: "1",
      toRuleset: "2",
      rulesetChanged: true,
      frameworks: [
        { id: "a", name: "A", changes: [] },
        { id: "b", name: "B", changes: [change("B-1"), change("B-2")] },
      ],
    },
  };

  it("selects the first framework with changes unless one is asked for", () => {
    const view = historyDiffView(PREVIOUS, LATEST, compared);
    expect(view.controls).toMatchObject({
      rulesetChanged: true,
      frameworkId: "b",
      total: 2,
      frameworks: [
        { id: "a", name: "A", changed: 0 },
        { id: "b", name: "B", changed: 2 },
      ],
    });
    expect(historyDiffView(PREVIOUS, LATEST, compared, "a").controls).toMatchObject({
      frameworkId: "a",
      changes: [],
      total: 0,
    });
    expect(historyDiffView(PREVIOUS, LATEST, compared, "zz").controls.frameworkId).toBe("b");
  });

  it("passes the Entra setting changes capped, with their own total", () => {
    const view = historyDiffView(PREVIOUS, LATEST, compared);
    expect(view.identity.changes).toHaveLength(200);
    expect(view.identity.total).toBe(205);
    expect(view.identity.notCompared).toEqual([
      { policy: "securityDefaults", label: "Security defaults", side: "to" },
    ]);
    expect(view.totals.policies).toBe(0);
  });
});

describe("previousSnapshot", () => {
  it("picks the newest snapshot collected before the current data", () => {
    expect(previousSnapshot(ENTRIES, LATEST.collectedAt)).toBe(PREVIOUS);
    expect(previousSnapshot(ENTRIES, "2026-10-19T00:00:00Z")).toBe(LATEST);
    expect(previousSnapshot(ENTRIES, OLDEST.collectedAt)).toBeNull();
    expect(previousSnapshot([], LATEST.collectedAt)).toBeNull();
    expect(previousSnapshot(ENTRIES, "not a date")).toBeNull();
  });
});

describe("managementChanges", () => {
  const change = (
    controlId: string,
    before: string | null,
    after: string | null,
    incomplete = { before: false, after: false },
  ) => ({
    controlId,
    title: controlId,
    before: before as never,
    after: after as never,
    causes: [],
    mappingChanged: false,
    incomplete,
  });
  const compared: ComparedSnapshots = {
    snapshots: {
      policies: [],
      notCompared: [],
      notComparedItems: [],
      totals: {
        policies: 4,
        added: 1,
        removed: 1,
        renamed: 1,
        changed: 2,
        settingChanges: 7,
        assignmentChanges: 3,
        notComparedFamilies: 1,
        notComparedItems: 2,
      },
      identity: {
        changes: [],
        notCompared: [{ policy: "securityDefaults", label: "Security defaults", side: "from" }],
        total: 4,
      },
    },
    assessments: {
      fromRuleset: "1",
      toRuleset: "2",
      rulesetChanged: true,
      frameworks: [
        {
          id: "nis2",
          name: "NIS2",
          changes: [
            change("21.2.a", "noEvidence", "evidenceFound"),
            change("21.2.b", "evidenceFound", "partialEvidence"),
            change("21.2.c", "partialEvidence", "noEvidence"),
            change("21.2.d", null, "notAssessed"),
          ],
        },
        { id: "iso", name: "ISO", changes: [change("5.1", "noEvidence", "evidenceFound")] },
      ],
    },
  };

  it("summarizes counts and the selected framework's control changes", () => {
    const read = (securityDefaults: "collected" | "failed") => ({
      status: { authenticationMethods: "collected", securityDefaults },
    }) as SnapshotProjection["tenantIdentityPolicies"];
    const result = managementChanges(
      { collectedAt: "2026-10-10T10:00:00Z", partial: false, tenantIdentityPolicies: read("failed") },
      { collectedAt: "2026-10-18T10:00:00Z", partial: true, tenantIdentityPolicies: read("collected") },
      compared,
      "nis2",
    );
    expect(result).toEqual({
      since: "2026-10-10T10:00:00Z",
      until: "2026-10-18T10:00:00Z",
      policies: {
        added: 1,
        removed: 1,
        renamed: 1,
        changed: 2,
        settingChanges: 7,
        assignmentChanges: 3,
        notComparedFamilies: 1,
        notComparedItems: 2,
      },
      // Counted before capping; only the methods policy was read on both sides.
      identity: { compared: 1, changes: 4, notCompared: 1 },
      controls: [
        { id: "21.2.a", before: "noEvidence", after: "evidenceFound" },
        { id: "21.2.b", before: "evidenceFound", after: "partialEvidence" },
        { id: "21.2.c", before: "partialEvidence", after: "noEvidence" },
        { id: "21.2.d", before: null, after: "notAssessed" },
      ],
      improved: 1,
      regressed: 1,
      collectionGaps: { opened: 0, closed: 0 },
      rulesetChanged: true,
      fromRuleset: "1",
      toRuleset: "2",
      partial: true,
    });
  });

  it("has no control changes for a framework without any", () => {
    const result = managementChanges(
      { collectedAt: "2026-10-10T10:00:00Z", partial: false },
      { collectedAt: "2026-10-18T10:00:00Z", partial: false },
      compared,
      "missing",
    );
    expect(result).toMatchObject({ controls: [], improved: 0, regressed: 0, partial: false });
  });

  it("counts a status move on an incomplete collection as a collection gap", () => {
    const one = (changes: ReturnType<typeof change>[]): ComparedSnapshots => ({
      ...compared,
      assessments: { ...compared.assessments, frameworks: [{ id: "nist", name: "NIST", changes }] },
    });
    const side = (collectedAt: string) => ({ collectedAt, partial: false });
    const run = (item: ReturnType<typeof change>) =>
      managementChanges(side("2026-10-10T10:00:00Z"), side("2026-10-18T10:00:00Z"), one([item]), "nist");
    // The disabling BitLocker policy failed with HTTP 403: the conflict is hidden.
    expect(
      run(change("SC-28", "conflictingEvidence", "partialEvidence", { before: false, after: true })),
    ).toMatchObject({ improved: 0, regressed: 0, collectionGaps: { opened: 1, closed: 0 } });
    // Read again: the conflict returns without a tenant change.
    expect(
      run(change("SC-28", "partialEvidence", "conflictingEvidence", { before: true, after: false })),
    ).toMatchObject({ improved: 0, regressed: 0, collectionGaps: { opened: 0, closed: 1 } });
    // Both collections complete: a real improvement.
    expect(run(change("SC-28", "conflictingEvidence", "partialEvidence"))).toMatchObject({
      improved: 1,
      regressed: 0,
      collectionGaps: { opened: 0, closed: 0 },
    });
    // Complete before, nothing comparable after.
    expect(
      run(change("SC-28", "evidenceFound", "notAssessed", { before: false, after: true })),
    ).toMatchObject({ improved: 0, regressed: 0, collectionGaps: { opened: 1, closed: 0 } });
  });

  it("counts moves to and from not assessed as collection gaps, not evidence lost or gained", () => {
    const gaps = (changes: ReturnType<typeof change>[]): ComparedSnapshots => ({
      ...compared,
      assessments: { ...compared.assessments, frameworks: [{ id: "nist", name: "NIST", changes }] },
    });
    const side = (collectedAt: string) => ({ collectedAt, partial: false });
    // Security defaults read in the first collection, HTTP 403 in the second.
    const lost = managementChanges(
      side("2026-10-10T10:00:00Z"),
      side("2026-10-18T10:00:00Z"),
      gaps([change("IA-2", "partialEvidence", "notAssessed"), change("IA-5", "evidenceFound", "notAssessed")]),
      "nist",
    );
    expect(lost).toMatchObject({ improved: 0, regressed: 0, collectionGaps: { opened: 2, closed: 0 } });
    expect(lost.controls).toHaveLength(2);
    // Read again in the next collection: no false improvement.
    const recovered = managementChanges(
      side("2026-10-18T10:00:00Z"),
      side("2026-10-19T10:00:00Z"),
      gaps([change("IA-2", "notAssessed", "partialEvidence"), change("AC-2", "noEvidence", "evidenceFound")]),
      "nist",
    );
    expect(recovered).toMatchObject({ improved: 1, regressed: 0, collectionGaps: { opened: 0, closed: 1 } });
    // Mapping and scope changes are neither evidence nor collection gaps.
    const other = managementChanges(
      side("2026-10-18T10:00:00Z"),
      side("2026-10-19T10:00:00Z"),
      gaps([
        change("AC-3", null, "evidenceFound"),
        change("AC-4", "evidenceFound", "notApplicable"),
        change("AC-5", "notAssessed", null),
      ]),
      "nist",
    );
    expect(other).toMatchObject({ improved: 0, regressed: 0, collectionGaps: { opened: 0, closed: 0 } });
  });
});


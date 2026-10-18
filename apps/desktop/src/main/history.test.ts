import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "../shared/ipc-types";
import {
  historyDiffView,
  NEEDS_TWO_SNAPSHOTS,
  parseHistoryDiffRequest,
  parseSnapshotId,
  pickPair,
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
});

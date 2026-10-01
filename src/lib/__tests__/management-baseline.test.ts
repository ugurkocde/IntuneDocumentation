import { describe, expect, it } from "vitest";
import {
  BASELINE_MAX_BYTES,
  BASELINE_REJECTION_MESSAGES,
  baselineFileName,
  compareBaseline,
  createBaseline,
  parseBaseline,
  serializeBaseline,
} from "../compliance/management/baseline";
import { sha256 } from "../compliance/manifest";
import type {
  BaselineFile,
  ManagementSummary,
} from "../compliance/management/types";

const TENANT = "11111111-2222-3333-4444-555555555555";

function summary(
  overrides: Partial<ManagementSummary> = {},
): ManagementSummary {
  return {
    frameworkId: "synthetic-fw",
    frameworkName: "Synthetic Framework",
    frameworkVersion: "1.0",
    generatedAt: "2026-09-01T08:00:00.000Z",
    rulesetVersion: "2026.09.8",
    scopeKey: "windows",
    metrics: {
      assessable: 4,
      withEvidence: 2,
      coveragePct: 50,
      withoutEvidence: 1,
      conflicting: 1,
      unassignedConfigs: 3,
      outsideIntuneScope: 2,
      dataGaps: 0,
      safeguardsTotal: 9,
      safeguardsInPlace: 3,
      safeguardPct: 33,
    },
    nextActions: [
      {
        capabilityId: "windows.secret-policy-capability",
        name: "Secret Policy Name",
        tier: "missing",
        controlIds: ["1.2"],
        area: "diskEncryption",
        url: "https://intune.microsoft.com/",
        rank: 0,
      },
    ],
    controls: {
      "1.1": "evidenceFound",
      "1.2": "noEvidence",
      "1.10": "partialEvidence",
      "2.1": "conflictingEvidence",
      "3.1": "notAssessed",
    },
    safeguards: {
      "1.1": { inPlace: 2, total: 2 },
      "1.2": { inPlace: 0, total: 3 },
      "1.10": { inPlace: 1, total: 4 },
      "2.1": { inPlace: 0, total: 1 },
      "3.1": { inPlace: 0, total: 2 },
    },
    outsideScope: [{ id: "x", title: { en: "Outside", de: "Ausserhalb" } }],
    ...overrides,
  };
}

async function baselineText(
  overrides: Partial<ManagementSummary> = {},
): Promise<string> {
  return serializeBaseline(
    await createBaseline(summary(overrides), { id: TENANT, label: "Lab" }),
  );
}

async function file(
  overrides: Partial<ManagementSummary> = {},
): Promise<BaselineFile> {
  const result = await parseBaseline(await baselineText(overrides));
  if (!result.ok) throw new Error(result.reason);
  return result.file;
}

describe("baseline file", () => {
  it("round trips through serialize and parse", async () => {
    const created = await createBaseline(summary(), { id: TENANT });
    const parsed = await parseBaseline(serializeBaseline(created));
    expect(parsed).toEqual({ ok: true, file: created });
    expect(created.checksum.algorithm).toBe("sha-256");
    expect(created.checksum.value).toMatch(/^[0-9a-f]{64}$/);
    expect(created.tenant).toEqual({ id: TENANT });
  });

  it("contains ids, statuses and counts only", async () => {
    const created = await createBaseline(summary(), {
      id: TENANT,
      label: "Lab",
    });
    expect(Object.keys(created).sort()).toEqual(
      [
        "checksum",
        "controls",
        "frameworkId",
        "frameworkVersion",
        "generatedAt",
        "metrics",
        "rulesetVersion",
        "safeguards",
        "schema",
        "scopeKey",
        "tenant",
      ].sort(),
    );
    const text = serializeBaseline(created);
    expect(text).not.toContain("Secret Policy Name");
    expect(text).not.toContain("secret-policy-capability");
    expect(text).not.toContain("intune.microsoft.com");
    expect(text).not.toContain("Synthetic Framework");
  });

  it("carries the safeguard counts and metrics", async () => {
    const created = await createBaseline(summary(), { id: TENANT });
    expect(created.safeguards).toEqual(summary().safeguards);
    expect(created.metrics).toMatchObject({
      safeguardsTotal: 9,
      safeguardsInPlace: 3,
      safeguardPct: 33,
    });
  });

  it("rejects edits to safeguard counts with a checksum error", async () => {
    const text = await baselineText();
    for (const edited of [
      text.replace(
        '"1.2": {\n      "inPlace": 0',
        '"1.2": {\n      "inPlace": 3',
      ),
      text.replace('"safeguardPct": 33', '"safeguardPct": 90'),
    ]) {
      expect(edited).not.toBe(text);
      expect(await parseBaseline(edited)).toEqual({
        ok: false,
        reason: "checksum",
      });
    }
  });

  it("names the file after framework and local date", () => {
    expect(baselineFileName(summary(), new Date(2026, 9, 1, 23, 30))).toBe(
      "intunedoc-baseline-synthetic-fw-2026-10-01.json",
    );
    expect(
      baselineFileName({ frameworkId: "A/B C" }, new Date(2026, 0, 5)),
    ).toBe("intunedoc-baseline-a-b-c-2026-01-05.json");
  });

  it("rejects any edit to the controls with a checksum error", async () => {
    const text = await baselineText();
    const edits = [
      text.replace('"1.2": "noEvidence"', '"1.2": "evidenceFound"'),
      text.replace('"1.10"', '"1.11"'),
      text.replace('"2.1": "conflictingEvidence"', '"2.1": "noEvidence"'),
    ];
    for (const edited of edits) {
      expect(edited).not.toBe(text);
      expect(await parseBaseline(edited)).toEqual({
        ok: false,
        reason: "checksum",
      });
    }
  });

  it("rejects edits to metrics and tenant with a checksum error", async () => {
    const text = await baselineText();
    for (const edited of [
      text.replace('"coveragePct": 50', '"coveragePct": 90'),
      text.replace('"label": "Lab"', '"label": "Other"'),
    ]) {
      expect(edited).not.toBe(text);
      expect((await parseBaseline(edited)).ok).toBe(false);
    }
  });

  it("rejects malformed input as schema without throwing", async () => {
    const valid = JSON.parse(await baselineText());
    const variant = (patch: (value: any) => void) => {
      const copy = structuredClone(valid);
      patch(copy);
      return JSON.stringify(copy);
    };
    const inputs = [
      "",
      "not json",
      "{",
      "null",
      "[]",
      '"text"',
      variant((value) => (value.schema = "intunedoc.baseline/2")),
      variant((value) => delete value.frameworkId),
      variant((value) => delete value.metrics.dataGaps),
      variant((value) => (value.metrics.assessable = "4")),
      variant((value) => (value.metrics.assessable = null)),
      variant((value) => (value.controls["1.1"] = "compliant")),
      variant((value) => (value.controls["1.1"] = 1)),
      variant((value) => (value.tenant.id = "")),
      variant((value) => (value.tenant = TENANT)),
      variant((value) => (value.generatedAt = "yesterday")),
      variant((value) => (value.generatedAt = "2026-13-45T99:00:00Z")),
      variant((value) => (value.checksum.algorithm = "md5")),
      variant((value) => (value.checksum.value = "abc")),
      variant((value) => delete value.checksum),
      variant((value) => (value.policies = ["Secret Policy Name"])),
      variant((value) => (value.metrics.safeguardsTotal = "9")),
      variant((value) => (value.metrics.safeguardsInPlace = null)),
      variant((value) => (value.metrics.safeguardPct = "33")),
      variant((value) => (value.safeguards = [])),
      variant((value) => (value.safeguards = null)),
      variant((value) => (value.safeguards["1.1"] = 2)),
      variant((value) => (value.safeguards["1.1"].inPlace = -1)),
      variant((value) => (value.safeguards["1.1"].total = 1.5)),
      variant((value) => (value.safeguards["1.1"].total = "2")),
      variant((value) => delete value.safeguards["1.1"].total),
      variant((value) => (value.safeguards["1.1"].name = "Secret")),
      " ".repeat(BASELINE_MAX_BYTES + 1),
      `${await baselineText()}${" ".repeat(BASELINE_MAX_BYTES)}`,
    ];
    for (const input of inputs)
      expect(await parseBaseline(input)).toEqual({
        ok: false,
        reason: "schema",
      });
    expect(await parseBaseline(undefined as unknown as string)).toEqual({
      ok: false,
      reason: "schema",
    });
  });

  it("accepts a leading byte order mark", async () => {
    expect((await parseBaseline(`﻿${await baselineText()}`)).ok).toBe(true);
  });
});

/** A file in the 0.2.x shape: no safeguard metrics and no safeguards map. */
async function legacyBaselineText(): Promise<string> {
  const metrics: Record<string, unknown> = { ...summary().metrics };
  delete metrics.safeguardsTotal;
  delete metrics.safeguardsInPlace;
  delete metrics.safeguardPct;
  const body = {
    schema: "intunedoc.baseline/1",
    frameworkId: "synthetic-fw",
    frameworkVersion: "1.0",
    rulesetVersion: "2026.09.8",
    scopeKey: "windows",
    generatedAt: "2026-09-01T08:00:00.000Z",
    tenant: { id: TENANT, label: "Lab" },
    controls: { ...summary().controls },
    metrics,
  };
  return `${JSON.stringify(
    {
      ...body,
      checksum: { algorithm: "sha-256", value: await sha256(body) },
    },
    null,
    2,
  )}\n`;
}

describe("0.2.x baselines without safeguard fields", () => {
  it("parse, verify and compare with no safeguard movement", async () => {
    const parsed = await parseBaseline(await legacyBaselineText());
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.file.safeguards).toBeUndefined();
    expect(parsed.file.metrics.safeguardPct).toBeUndefined();
    const result = compareBaseline(
      summary({ generatedAt: "2026-10-01T08:00:00.000Z" }),
      TENANT,
      parsed.file,
    );
    expect(result.ok && result.delta.safeguardDeltaPoints).toBeNull();
    expect(result.ok && result.delta.safeguardChanges).toEqual([]);
    expect(result.ok && result.delta.coverageDeltaPoints).toBe(0);
  });

  it("still detects edits by checksum", async () => {
    const text = await legacyBaselineText();
    const edited = text.replace('"coveragePct": 50', '"coveragePct": 90');
    expect(edited).not.toBe(text);
    expect(await parseBaseline(edited)).toEqual({
      ok: false,
      reason: "checksum",
    });
  });
});

describe("compareBaseline", () => {
  const later = { generatedAt: "2026-10-01T08:00:00.000Z" };

  it("rejects another tenant, framework, scope or a future baseline", async () => {
    const baseline = await file();
    expect(compareBaseline(summary(later), "other-tenant", baseline)).toEqual({
      ok: false,
      reason: "tenant",
    });
    expect(
      compareBaseline(
        summary({ ...later, frameworkId: "other" }),
        TENANT,
        baseline,
      ),
    ).toEqual({ ok: false, reason: "framework" });
    expect(
      compareBaseline(
        summary({ ...later, scopeKey: "macos" }),
        TENANT,
        baseline,
      ),
    ).toEqual({ ok: false, reason: "scope" });
    expect(
      compareBaseline(
        summary({ generatedAt: "2026-08-01T08:00:00.000Z" }),
        TENANT,
        baseline,
      ),
    ).toEqual({ ok: false, reason: "future" });
  });

  it("matches the tenant id case-insensitively", async () => {
    const result = compareBaseline(
      summary(later),
      TENANT.toUpperCase(),
      await file(),
    );
    expect(result.ok).toBe(true);
  });

  it("classifies every control into the right bucket", async () => {
    const baseline = await file({
      controls: {
        "1.1": "evidenceFound",
        "1.2": "noEvidence",
        "1.10": "partialEvidence",
        "2.1": "conflictingEvidence",
        "3.1": "notAssessed",
        "4.1": "evidenceFound",
        "5.1": "noEvidence",
        "6.1": "partialEvidence",
      },
    });
    const current = summary({
      ...later,
      metrics: { ...summary().metrics, coveragePct: 63 },
      controls: {
        "1.1": "partialEvidence",
        "1.2": "evidenceFound",
        "1.10": "noEvidence",
        "2.1": "partialEvidence",
        "3.1": "evidenceFound",
        "5.1": "conflictingEvidence",
        "6.1": "conflictingEvidence",
        "7.2": "evidenceFound",
        "7.10": "noEvidence",
      },
    });
    expect(compareBaseline(current, TENANT, baseline)).toEqual({
      ok: true,
      delta: {
        coverageDeltaPoints: 13,
        newlyEvidenced: ["1.2", "2.1", "3.1"],
        regressions: ["1.10", "6.1"],
        added: ["7.2", "7.10"],
        removed: ["4.1"],
        safeguardDeltaPoints: 0,
        safeguardChanges: [],
        rulesetChanged: false,
        baselineDate: "2026-09-01T08:00:00.000Z",
      },
    });
  });

  it("reports a changed ruleset and null coverage deltas", async () => {
    const baseline = await file({
      metrics: { ...summary().metrics, coveragePct: null },
    });
    const result = compareBaseline(
      summary({ ...later, rulesetVersion: "2026.10.1" }),
      TENANT,
      baseline,
    );
    expect(result.ok && result.delta.rulesetChanged).toBe(true);
    expect(result.ok && result.delta.coverageDeltaPoints).toBeNull();
  });

  it("reports safeguard points and per-control changes in control order", async () => {
    const baseline = await file();
    const current = summary({
      ...later,
      metrics: {
        ...summary().metrics,
        safeguardsInPlace: 5,
        safeguardsTotal: 10,
        safeguardPct: 50,
      },
      safeguards: {
        "1.1": { inPlace: 1, total: 2 },
        "1.2": { inPlace: 2, total: 4 },
        "1.10": { inPlace: 1, total: 4 },
        "2.1": { inPlace: 1, total: 1 },
        "9.1": { inPlace: 3, total: 3 },
      },
    });
    const result = compareBaseline(current, TENANT, baseline);
    expect(result.ok && result.delta.safeguardDeltaPoints).toBe(17);
    expect(result.ok && result.delta.safeguardChanges).toEqual([
      { controlId: "1.1", from: 2, to: 1, total: 2 },
      { controlId: "1.2", from: 0, to: 2, total: 4 },
      { controlId: "2.1", from: 0, to: 1, total: 1 },
    ]);
  });

  it("reports null safeguard points when either percentage is unknown", async () => {
    const baseline = await file({
      metrics: { ...summary().metrics, safeguardPct: null },
    });
    const result = compareBaseline(summary(later), TENANT, baseline);
    expect(result.ok && result.delta.safeguardDeltaPoints).toBeNull();
  });

  it("accepts a baseline from the same moment", async () => {
    expect(compareBaseline(summary(), TENANT, await file()).ok).toBe(true);
  });
});

describe("rejection messages", () => {
  it("has English and German text without verdict wording", () => {
    for (const message of Object.values(BASELINE_REJECTION_MESSAGES)) {
      expect(message.en).toBeTruthy();
      expect(message.de).toBeTruthy();
      expect(`${message.en} ${message.de}`).not.toMatch(
        /compliant|konform|erfüllt/i,
      );
    }
    expect(BASELINE_REJECTION_MESSAGES.tenant.en).toBe(
      "This baseline belongs to a different tenant.",
    );
  });
});

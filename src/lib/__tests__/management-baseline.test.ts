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

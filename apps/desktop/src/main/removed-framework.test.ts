import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessCompliance, isAssessedFramework } from "../../../../src/lib/compliance/engine";
import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import { projectSnapshot, type SnapshotProjection } from "../../../../src/lib/snapshots/projection";
import { frameworkOption } from "../renderer/lib/compliance-frameworks";
import type { ComplianceFrameworkId } from "../shared/ipc-types";
import { parseComplianceRequest, parseFrameworkId } from "./compliance";
import { compareProjections, historyDiffView } from "./history";

// Desktop 0.3.0 assessed BSI IT-Grundschutz and stored it in every history
// snapshot and the snapshot index. 0.4.0 no longer includes it: that stored
// data must still load, and the framework is never shown or counted.

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "keychain",
    encryptString: (text: string) => Buffer.from(`wrapped:${Buffer.from(text).toString("hex")}`),
    decryptString: (bytes: Buffer) => Buffer.from(bytes.toString().replace(/^wrapped:/, ""), "hex").toString(),
  },
}));
vi.mock("./logger", () => ({ log: () => undefined }));

const { SnapshotStore } = await import("./snapshots");

const TENANT = "11111111-2222-3333-4444-555555555555";
const OLD_ID = "bsi-it-grundschutz";
const DAY = 24 * 60 * 60_000;

let dir = "";
let clock = Date.UTC(2026, 9, 1, 10, 0, 0);

function exportData(): DetailedExportData {
  return {
    collectedAt: new Date(clock).toISOString(),
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    fetchErrors: [],
  };
}

// A snapshot as 0.3.0 saved it: the current assessment plus the old
// framework, whose control status differs between the two snapshots.
function savedBy030(status: "partialEvidence" | "noEvidence"): SnapshotProjection {
  const data = exportData();
  const projection = projectSnapshot(data, assessCompliance(data), new Map());
  projection.rulesetVersion = "2026.10.8";
  projection.assessment.rulesetVersion = "2026.10.8";
  projection.assessment.frameworks.splice(2, 0, {
    id: OLD_ID,
    name: "BSI IT-Grundschutz",
    version: "Kompendium Edition 2023",
    summary: {
      totalControls: 1,
      withEvidence: 0,
      partial: status === "partialEvidence" ? 1 : 0,
      withoutEvidence: status === "noEvidence" ? 1 : 0,
      notApplicable: 0,
      notAssessed: 0,
      conflicting: 0,
      applicableControls: 1,
    },
    controls: [
      { id: "SYS.2.1", title: "Allgemeiner Client", status, capabilityIds: ["windows-disk-encryption"] },
    ],
  });
  return projection;
}

function store() {
  return new SnapshotStore({ dir: () => dir, limits: {}, now: () => clock });
}

function guard(target: InstanceType<typeof SnapshotStore>) {
  return { generation: target.begin(), isCurrent: () => true };
}

beforeEach(() => {
  dir = path.join(mkdtempSync(path.join(tmpdir(), "intunedoc-removed-framework-")), "snapshots");
  clock = Date.UTC(2026, 9, 1, 10, 0, 0);
});

afterEach(() => {
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe("history saved with a framework that was removed since", () => {
  it("is no framework the engine assesses", () => {
    expect(isAssessedFramework(OLD_ID)).toBe(false);
    expect(assessCompliance(exportData()).frameworks.map((framework) => framework.framework.id)).not.toContain(
      OLD_ID,
    );
  });

  it("loads the snapshots and the index without the framework", async () => {
    const writer = store();
    const older = await writer.save(TENANT, savedBy030("partialEvidence"), guard(writer));
    clock += DAY;
    const newer = await writer.save(TENANT, savedBy030("noEvidence"), guard(writer));
    expect(older && newer).toBeTruthy();

    // A new process, as after the update to 0.4.0.
    const history = store();
    expect((await history.list(TENANT)).map((entry) => entry.id)).toEqual([newer!.id, older!.id]);

    const [tenant] = await history.tenants();
    const portfolio = tenant!.latest!.frameworks.map((framework) => framework.id);
    expect(portfolio).not.toContain(OLD_ID);
    expect(portfolio).toContain("iso-27001-2022");

    const from = await history.read(TENANT, older!.id);
    const to = await history.read(TENANT, newer!.id);
    for (const projection of [from, to]) {
      expect(projection.assessment.frameworks.every((framework) => isAssessedFramework(framework.id))).toBe(true);
    }

    // Without the filter the old framework is the first with a change, so
    // History would open on it and count its control.
    const view = historyDiffView(older!, newer!, compareProjections(from, to));
    expect(view.controls.frameworks.map((framework) => framework.id)).not.toContain(OLD_ID);
    expect(view.controls.frameworks.reduce((sum, framework) => sum + framework.changed, 0)).toBe(0);
    expect(view.controls.frameworkId).not.toBe(OLD_ID);
    expect(view.controls.total).toBe(0);
  });

  it("compares a 0.3.0 snapshot with a 0.4.0 snapshot without counting the framework", async () => {
    const writer = store();
    const older = await writer.save(TENANT, savedBy030("partialEvidence"), guard(writer));
    clock += DAY;
    const data = exportData();
    const current = projectSnapshot(data, assessCompliance(data), new Map());
    const newer = await writer.save(TENANT, current, guard(writer));

    const history = store();
    const view = historyDiffView(
      older!,
      newer!,
      compareProjections(await history.read(TENANT, older!.id), await history.read(TENANT, newer!.id)),
      OLD_ID,
    );
    expect(view.controls.frameworks.map((framework) => framework.id)).not.toContain(OLD_ID);
    expect(view.controls.frameworkId).not.toBe(OLD_ID);
    expect(view.controls.total).toBe(0);
  });

  it("does not offer the removed framework and refuses requests for it", () => {
    expect(frameworkOption(OLD_ID as ComplianceFrameworkId)).toBeUndefined();
    expect(() => parseFrameworkId(OLD_ID)).toThrow("Unknown compliance framework.");
    expect(() => parseComplianceRequest({ frameworkId: OLD_ID }, true)).toThrow("Unknown compliance framework.");
  });
});

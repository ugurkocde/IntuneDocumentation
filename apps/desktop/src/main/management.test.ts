import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import { assessCompliance } from "../../../../src/lib/compliance";
import {
  BASELINE_MAX_BYTES,
  BASELINE_REJECTION_MESSAGES,
  createBaseline,
  serializeBaseline,
} from "../../../../src/lib/compliance/management/baseline";
import { parseCrosswalkCsv } from "../../../../src/lib/compliance/management/crosswalk";
import {
  managementSummaryFor,
  parseComplianceRequest,
  parseFrameworkId,
  toView,
} from "./compliance";
import {
  acceptBaseline,
  clearBaseline,
  clearCrosswalk,
  clearManagementState,
  crosswalkTemplate,
  importCrosswalk,
  loadBaseline,
  managementContext,
  managementReportInput,
  parseManagementLocale,
  portalLink,
} from "./management";

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER_TENANT = "99999999-8888-7777-6666-555555555555";
const noToken = async () => "unused";

function exportData(assigned = false): DetailedExportData {
  return {
    settingsCatalog: [
      {
        id: "bitlocker-policy",
        name: "BitLocker baseline",
        configType: "Settings Catalog",
        platforms: "windows10",
        settings: [
          {
            id: "0",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
              settingDefinitionId:
                "device_vendor_msft_bitlocker_requiredeviceencryption",
              choiceSettingValue: {
                value: "device_vendor_msft_bitlocker_requiredeviceencryption_1",
                children: [],
              },
            },
          },
        ],
        assignments: assigned
          ? [
              {
                target: {
                  "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
                },
              },
            ]
          : [],
      },
    ],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    appProtectionPolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
  } as unknown as DetailedExportData;
}

const assessment = assessCompliance(exportData());

let dir = "";

function writeTemp(name: string, content: string): string {
  const file = path.join(dir, name);
  writeFileSync(file, content);
  return file;
}

// Obviously synthetic safeguard ids; the product ships no CIS content.
function crosswalkCsv(isoControl: string): string {
  return `iso27001_control,nis2_measure,cis_safeguard,notes\n${isoControl},,99.1+99.2,synthetic\n`;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "intunedoc-management-"));
  clearManagementState();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("request validation", () => {
  it("accepts English and German only", () => {
    expect(parseManagementLocale("en")).toBe("en");
    expect(parseManagementLocale("de")).toBe("de");
    for (const value of ["EN", "fr", "", null, undefined, 1, { en: true }]) {
      expect(() => parseManagementLocale(value)).toThrow();
    }
  });

  it("knows NIS2 and rejects unknown frameworks", () => {
    expect(
      parseComplianceRequest({ frameworkId: "nis2-2022-2555" }, true)
        .frameworkId,
    ).toBe("nis2-2022-2555");
    expect(parseFrameworkId("nis2-2022-2555")).toBe("nis2-2022-2555");
    expect(() => parseFrameworkId("cis-controls-v8")).toThrow(
      "Unknown compliance framework.",
    );
    expect(() => parseComplianceRequest({ frameworkId: "x" }, true)).toThrow();
    expect(() => parseComplianceRequest({}, true)).toThrow();
  });
});

describe("per-owner state", () => {
  it("drops the crosswalk and baselines when the owner changes", async () => {
    const result = await importCrosswalk("alice|tenant", async () =>
      writeTemp("map.csv", crosswalkCsv("8.1")),
    );
    expect(result).toEqual({ ok: true, rows: 2, issues: [] });
    expect(managementContext("alice|tenant", TENANT).crosswalk?.fileName).toBe(
      "map.csv",
    );

    expect(managementContext("bob|tenant", TENANT).crosswalk).toBeNull();
    // Switching back does not bring the old state back.
    expect(managementContext("alice|tenant", TENANT).crosswalk).toBeNull();
  });

  it("clears everything on sign-out and reset", async () => {
    await importCrosswalk("alice|tenant", async () =>
      writeTemp("map.csv", crosswalkCsv("8.1")),
    );
    clearManagementState();
    expect(managementContext("alice|tenant", TENANT).crosswalk).toBeNull();
  });

  it("does not store a file opened before a clear", async () => {
    const file = writeTemp("map.csv", crosswalkCsv("8.1"));
    const result = await importCrosswalk("alice|tenant", async () => {
      clearManagementState();
      return file;
    });
    expect(result).toMatchObject({ ok: false });
    expect(managementContext("alice|tenant", TENANT).crosswalk).toBeNull();
  });

  it("does not let a late import replace another account's state", async () => {
    const file = writeTemp("map.csv", crosswalkCsv("8.1"));
    await importCrosswalk("alice|tenant", async () => {
      managementContext("bob|tenant", TENANT);
      return file;
    });
    expect(managementContext("bob|tenant", TENANT).crosswalk).toBeNull();
  });

  it("clears the crosswalk and a single baseline on request", async () => {
    await importCrosswalk("alice|tenant", async () =>
      writeTemp("map.csv", crosswalkCsv("8.1")),
    );
    clearCrosswalk("alice|tenant");
    expect(managementContext("alice|tenant", TENANT).crosswalk).toBeNull();
    clearBaseline("alice|tenant", "iso-27001-2022");
    expect(managementContext("alice|tenant", TENANT).baselines.size).toBe(0);
  });
});

describe("crosswalk import", () => {
  it("returns canceled without a file", async () => {
    expect(await importCrosswalk("alice|tenant", async () => null)).toEqual({
      canceled: true,
    });
  });

  it("turns format errors into a message and stores nothing", async () => {
    const result = await importCrosswalk("alice|tenant", async () =>
      writeTemp("bad.csv", "control,safeguard\n8.1,99.1\n"),
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toMatch(/header/);
    expect(managementContext("alice|tenant", TENANT).crosswalk).toBeNull();
  });

  it("checks the size before reading", async () => {
    const result = await importCrosswalk("alice|tenant", async () =>
      writeTemp("big.csv", "x".repeat(1_000_001)),
    );
    expect(result).toEqual({
      ok: false,
      message: "The crosswalk file is larger than 1 MB.",
    });
  });

  it("reports a file with only bad rows", async () => {
    const result = await importCrosswalk("alice|tenant", async () =>
      writeTemp("rows.csv", "iso27001_control,cis_safeguard\n9.9,99.1\n"),
    );
    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toMatch(/Line 2/);
  });

  it("offers a template without safeguard content", () => {
    const template = crosswalkTemplate();
    expect(template.fileName).toBe("intunedoc-crosswalk-template.csv");
    const text = new TextDecoder().decode(template.bytes);
    expect(
      text.startsWith("iso27001_control,nis2_measure,cis_safeguard,notes"),
    ).toBe(true);
  });
});

describe("baseline load", () => {
  const summary = managementSummaryFor(assessment, "iso-27001-2022");

  it("accepts a baseline of the same tenant, ignoring case", async () => {
    const file = await createBaseline(summary, { id: TENANT });
    const result = await acceptBaseline(
      serializeBaseline(file),
      summary,
      TENANT.toUpperCase(),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a baseline of another tenant", async () => {
    const file = await createBaseline(summary, { id: OTHER_TENANT });
    expect(
      await acceptBaseline(serializeBaseline(file), summary, TENANT),
    ).toEqual({ ok: false, message: BASELINE_REJECTION_MESSAGES.tenant.en });
  });

  it("rejects an edited baseline", async () => {
    const file = await createBaseline(summary, { id: TENANT });
    const edited = serializeBaseline(file).replace(
      `"assessable": ${summary.metrics.assessable}`,
      `"assessable": ${summary.metrics.assessable + 1}`,
    );
    expect(await acceptBaseline(edited, summary, TENANT)).toEqual({
      ok: false,
      message: BASELINE_REJECTION_MESSAGES.checksum.en,
    });
  });

  it("returns canceled without a file and rejects oversized files before reading", async () => {
    const request = {
      frameworkId: "iso-27001-2022" as const,
      scope: {},
    };
    expect(
      await loadBaseline(
        "alice|tenant",
        noToken,
        request,
        TENANT,
        async () => null,
      ),
    ).toEqual({ canceled: true });
    const big = writeTemp("big.json", " ".repeat(BASELINE_MAX_BYTES + 1));
    expect(
      await loadBaseline(
        "alice|tenant",
        noToken,
        request,
        TENANT,
        async () => big,
      ),
    ).toEqual({ ok: false, message: BASELINE_REJECTION_MESSAGES.schema.en });
    expect(managementContext("alice|tenant", TENANT).baselines.size).toBe(0);
  });
});

describe("view", () => {
  const iso = assessment.frameworks.find(
    (framework) => framework.framework.id === "iso-27001-2022",
  )!;
  const isoControl = iso.controls[0]!.control.id;

  it("adds the management summary, unassigned configs and NIS2", () => {
    const view = toView(assessment, "iso-27001-2022");
    expect(view.frameworks.map((framework) => framework.id)).toContain(
      "nis2-2022-2555",
    );
    const selected = view.selected!;
    expect(selected.management.frameworkId).toBe("iso-27001-2022");
    expect(selected.unassigned.map((item) => item.capabilityId)).toContain(
      "windows-disk-encryption",
    );
    expect(selected.unassigned).toHaveLength(
      selected.management.metrics.unassignedConfigs,
    );
    expect(selected).toMatchObject({
      delta: null,
      baseline: null,
      crosswalk: null,
      crosswalkCis: {},
    });

    const nis2 = toView(assessment, "nis2-2022-2555").selected!;
    expect(nis2.management.outsideScope.length).toBeGreaterThan(0);
  });

  it("applies the crosswalk to ISO controls only", () => {
    const crosswalk = parseCrosswalkCsv(crosswalkCsv(isoControl));
    const context = {
      tenantId: TENANT,
      baselines: new Map(),
      crosswalk: { crosswalk, fileName: "map.csv" },
    };
    const selected = toView(assessment, "iso-27001-2022", context).selected!;
    expect(selected.crosswalk).toEqual({
      rows: 2,
      issues: 0,
      fileName: "map.csv",
    });
    expect(selected.crosswalkCis).toEqual({ [isoControl]: ["99.1", "99.2"] });

    const soc2 = toView(assessment, "soc2-tsc", context).selected!;
    expect(soc2.crosswalkCis).toEqual({});
    expect(soc2.crosswalk?.rows).toBe(2);
  });

  it("shows the delta only for a baseline that still matches", async () => {
    const summary = managementSummaryFor(assessment, "iso-27001-2022");
    const file = await createBaseline(summary, { id: TENANT });
    const baselines = new Map([["iso-27001-2022", file]]);

    const matching = toView(assessment, "iso-27001-2022", {
      tenantId: TENANT,
      baselines,
      crosswalk: null,
    }).selected!;
    expect(matching.delta?.coverageDeltaPoints).toBe(0);
    expect(matching.baseline).toEqual({
      generatedAt: file.generatedAt,
      rulesetChanged: false,
      mismatch: null,
    });

    const otherTenant = toView(assessment, "iso-27001-2022", {
      tenantId: OTHER_TENANT,
      baselines,
      crosswalk: null,
    }).selected!;
    expect(otherTenant.delta).toBeNull();
    expect(otherTenant.baseline?.mismatch).toBe(
      "This baseline belongs to a different tenant.",
    );

    const otherFramework = toView(assessment, "soc2-tsc", {
      tenantId: TENANT,
      baselines,
      crosswalk: null,
    }).selected!;
    expect(otherFramework.baseline).toBeNull();
  });
});

describe("report input", () => {
  const context = {
    tenantId: TENANT,
    baselines: new Map(),
    crosswalk: null,
  };

  function diskEncryption(input: ReturnType<typeof managementReportInput>) {
    const control = input.controls.find((item) =>
      item.safeguards.some(
        (safeguard) => safeguard.capabilityId === "windows-disk-encryption",
      ),
    )!;
    return {
      control,
      safeguard: control.safeguards.find(
        (item) => item.capabilityId === "windows-disk-encryption",
      )!,
    };
  }

  it("lists every mapped safeguard with its state and policies", () => {
    const summary = managementSummaryFor(assessment, "iso-27001-2022");
    const input = managementReportInput(
      assessment,
      summary,
      "iso-27001-2022",
      context,
      "de",
    );
    const iso = assessment.frameworks.find(
      (framework) => framework.framework.id === "iso-27001-2022",
    )!;
    expect(input.controls).toHaveLength(iso.controls.length);
    for (const control of input.controls) {
      const mapped = iso.controls.find((item) => item.control.id === control.id)!;
      expect(control.safeguards.map((item) => item.capabilityId)).toEqual([
        ...new Set(mapped.capabilityIds),
      ]);
    }
    const { control, safeguard } = diskEncryption(input);
    expect(safeguard).toMatchObject({
      state: "notAssigned",
      policies: [{ name: "BitLocker baseline", assigned: false }],
    });
    expect(safeguard.name.length).toBeGreaterThan(0);
    const others = control.safeguards.filter((item) => item !== safeguard);
    expect(others.every((item) => item.state === "notConfigured")).toBe(true);
    expect(others.every((item) => item.policies.length === 0)).toBe(true);
    expect(input).toMatchObject({
      locale: "de",
      tenantLabel: "11111111...",
      crosswalkLoaded: false,
    });
    expect(input.delta).toBeUndefined();
  });

  it("marks an assigned policy as in place", () => {
    const assignedAssessment = assessCompliance(exportData(true));
    const summary = managementSummaryFor(assignedAssessment, "nis2-2022-2555");
    const input = managementReportInput(
      assignedAssessment,
      summary,
      "nis2-2022-2555",
      context,
      "en",
    );
    const { control, safeguard } = diskEncryption(input);
    expect(safeguard).toMatchObject({
      state: "inPlace",
      policies: [{ name: "BitLocker baseline", assigned: true }],
    });
    expect(summary.safeguards[control.id]?.inPlace).toBe(1);
    expect(input.unassigned).toEqual([]);
    expect(control.title).toBe("Cryptography and encryption");
  });

  it("uses German measure titles in a German report", () => {
    const summary = managementSummaryFor(assessment, "nis2-2022-2555");
    const input = managementReportInput(
      assessment,
      summary,
      "nis2-2022-2555",
      context,
      "de",
    );
    expect(input.controls.find((item) => item.id === "21.2.h")?.title).toBe(
      "Kryptografie und Verschlüsselung",
    );
  });
});

describe("portal links", () => {
  it("opens https Intune and Entra admin center pages", () => {
    const intune =
      "https://intune.microsoft.com/#view/Microsoft_Intune_DeviceSettings/DevicesMenu/~/configuration";
    expect(portalLink(intune)).toBe(intune);
    expect(portalLink("https://entra.microsoft.com/")).toBe(
      "https://entra.microsoft.com/",
    );
  });

  it.each([
    "http://intune.microsoft.com/",
    "https://intune.microsoft.com.evil.com/",
    "https://evil.com/intune.microsoft.com",
    "https://intune.microsoft.com@evil.com/",
    "https://user:pass@intune.microsoft.com/",
    "https://user@entra.microsoft.com/",
    "https://evil.com\\@intune.microsoft.com/",
    "https://intune.microsoft.com:8443/",
    "https://intune.microsoft.com./",
    "https://portal.azure.com/",
    "https://xintune.microsoft.com/",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "intune.microsoft.com",
    "",
  ])("refuses %s", (url) => {
    expect(() => portalLink(url)).toThrow(
      "Refused to open an unexpected link.",
    );
  });

  it("refuses non-strings and very long URLs", () => {
    expect(() => portalLink(null)).toThrow();
    expect(() =>
      portalLink({ href: "https://intune.microsoft.com/" }),
    ).toThrow();
    expect(() =>
      portalLink(`https://intune.microsoft.com/${"a".repeat(2100)}`),
    ).toThrow();
  });
});

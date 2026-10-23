import { inflateSync } from "node:zlib";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance/engine";
import {
  buildEvidenceRegister,
  registerToXlsx,
} from "../compliance/export/register";
import { generateFixPack } from "../compliance/fix-pack";
import {
  buildManagementSummary,
  safeguardState,
} from "../compliance/management/management-summary";
import { generateManagementReportPDF } from "../compliance/management/management-report-pdf";
import { MANAGEMENT_REPORT_STRINGS } from "../compliance/management/management-report-strings";
import type {
  CapabilityResult,
  ComplianceAssessment,
} from "../compliance/types";
import type { DetailedExportData } from "../configuration-analyzer";

// Round 44 review finding 2. Names and ids are synthetic. A complete
// assignment list whose effective targeting cannot be resolved (apply to a
// group beside a remove from all devices, uncertainty "unresolved") is not
// unavailable assignment data: every output says the targeting could not
// be resolved and advises reviewing the overlapping assignments, never a
// refresh. Assignments not read completely keep the refresh advice.

const GROUP = "0f0e0d0c-0000-4000-8000-00000000004a";
const FRAMEWORK = "nis2-2022-2555";
const CAPABILITY = "windows-firewall";

const unresolvedAssignments = [
  {
    id: "synthetic-apply",
    intent: "apply",
    target: {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId: GROUP,
    },
  },
  {
    id: "synthetic-remove-all-devices",
    intent: "remove",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

const exportData = (assignments: unknown): DetailedExportData =>
  ({
    collectedAt: "2026-10-23T09:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: [
      {
        id: "synthetic-firewall",
        displayName: "Synthetic firewall",
        "@odata.type":
          "#microsoft.graph.windows10EndpointProtectionConfiguration",
        firewallProfileDomain: { firewallEnabled: "allowed" },
        firewallProfilePrivate: { firewallEnabled: "allowed" },
        firewallProfilePublic: { firewallEnabled: "allowed" },
        ...(assignments === undefined ? {} : { assignments }),
      },
    ],
    administrativeTemplates: [],
    compliancePolicies: [],
    appProtectionPolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
    fetchErrors: [],
  }) as DetailedExportData;

const unresolved = assessCompliance(exportData(unresolvedAssignments));
// Assignments Graph did not return are not read completely.
const incomplete = assessCompliance(exportData(undefined));

const firewall = (assessment: ComplianceAssessment): CapabilityResult =>
  assessment.capabilities.find(
    (result) => result.capability.id === CAPABILITY,
  )!;

const REFRESH = /refresh|collect the data again|collect the tenant again/i;
const REVIEW = /review (their |the )?overlapping assignments/i;
const UNREADABLE = /Assignment data (is unavailable|could not be read)/;

function decodedPdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const pdf = raw.toString("latin1");
  const texts: string[] = [];
  for (const match of pdf.matchAll(
    /<<([^>]*?\/Length (\d+)[^>]*?)>>\s*stream\n/g,
  )) {
    const start = (match.index ?? 0) + match[0].length;
    const data = raw.subarray(start, start + Number(match[2]));
    let stream: string;
    try {
      stream = (
        match[1]?.includes("/FlateDecode") ? inflateSync(data) : data
      ).toString("latin1");
    } catch {
      continue;
    }
    for (const text of stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g))
      texts.push((text[1] ?? "").replace(/\\(.)/g, "$1"));
  }
  return texts.join(" ").replace(/\s+/g, " ");
}

describe("round 44 finding 2: unresolved targeting is explained as such", () => {
  it("assesses the synthetic firewall with the recorded uncertainty", () => {
    expect(firewall(unresolved).status).toBe("assignmentUnknown");
    expect(firewall(unresolved).evidence[0]?.assignment.uncertainty).toBe(
      "unresolved",
    );
    expect(firewall(incomplete).status).toBe("assignmentUnknown");
    expect(firewall(incomplete).evidence[0]?.assignment.uncertainty).toBe(
      "incomplete",
    );
  });

  it("words the engine limitation by uncertainty", () => {
    const limitations = firewall(unresolved).limitations.join(" ");
    expect(limitations).toMatch(/effective targeting could not be resolved/);
    expect(limitations).toMatch(REVIEW);
    expect(limitations).not.toMatch(UNREADABLE);
    expect(limitations).not.toMatch(REFRESH);
    expect(firewall(incomplete).limitations.join(" ")).toMatch(UNREADABLE);
  });

  it("carries the wording into the register controls and its glossary", async () => {
    const control = buildEvidenceRegister(unresolved, {
      frameworkId: FRAMEWORK,
    }).controls.find((row) =>
      row.unassessedAspects.includes("could not be resolved"),
    );
    expect(control?.unassessedAspects).toMatch(REVIEW);
    expect(control?.unassessedAspects).not.toMatch(UNREADABLE);
    const register = buildEvidenceRegister(unresolved, {
      frameworkId: FRAMEWORK,
    });
    const bytes = await registerToXlsx(register, {
      tenant: "Synthetic tenant",
      collectedAt: unresolved.provenance.collectedAt,
      rulesetVersion: unresolved.provenance.rulesetVersion,
      generatedAt: "2026-10-23T09:00:00Z",
    });
    const zip = await JSZip.loadAsync(bytes);
    const workbook = (
      await Promise.all(
        Object.values(zip.files)
          .filter((file) => file.name.endsWith(".xml"))
          .map((file) => file.async("string")),
      )
    ).join(" ");
    expect(workbook).toMatch(
      /its assignments could not be read completely, or were read completely but their effective targeting could not be resolved/,
    );
  });

  it("advises reviewing the overlapping assignments in the fix pack", () => {
    const reason = (assessment: ComplianceAssessment) => {
      // A capability the fix pack can generate, with the firewall's
      // evidence and status.
      const source = firewall(assessment);
      const target = assessment.capabilities.find(
        (result) => result.capability.id === "windows-remote-credential-guard",
      )!;
      const pack = generateFixPack(
        {
          ...assessment,
          capabilities: assessment.capabilities.map((result) =>
            result === target
              ? {
                  ...target,
                  status: source.status,
                  evidence: source.evidence,
                }
              : result,
          ),
        },
        { collection: exportData([]) },
      );
      return pack.notGeneratable.find(
        (gap) => gap.capabilityId === "windows-remote-credential-guard",
      )?.reason;
    };
    expect(reason(unresolved)).toMatch(REVIEW);
    expect(reason(unresolved)).not.toMatch(REFRESH);
    expect(reason(unresolved)).not.toMatch(/could not be read/);
    expect(reason(incomplete)).toMatch(
      /Assignment data could not be read.*Refresh the policies/,
    );
  });

  it("states targeting unresolved in the management summary and report", async () => {
    expect(safeguardState(firewall(unresolved))).toBe("targetingUnresolved");
    expect(safeguardState(firewall(incomplete))).toBe("dataMissing");
    const summary = buildManagementSummary(unresolved, FRAMEWORK);
    expect(summary.metrics.dataGaps).toBeGreaterThan(0);
    expect(summary.targetingUnresolved).toBe(1);
    expect(
      buildManagementSummary(incomplete, FRAMEWORK).targetingUnresolved,
    ).toBeUndefined();

    const en = MANAGEMENT_REPORT_STRINGS.en;
    expect(en.dataGapsNote(0, 1)).toMatch(REVIEW);
    expect(en.dataGapsNote(0, 1)).not.toMatch(REFRESH);
    expect(en.dataGapsNote(1)).toMatch(/collect the data again/);
    expect(en.dataGapsNote(2, 1)).toMatch(
      /^2 safeguards could not be read and 1 safeguard could not be assessed/,
    );
    expect(MANAGEMENT_REPORT_STRINGS.de.dataGapsNote(0, 1)).not.toMatch(
      /erneut zu erfassen/,
    );

    const fa = unresolved.frameworks.find(
      (item) => item.framework.id === FRAMEWORK,
    )!;
    const results = new Map(
      unresolved.capabilities.map((result) => [result.capability.id, result]),
    );
    const bytes = await generateManagementReportPDF({
      summary,
      controls: fa.controls.map(({ control, status, capabilityIds }) => ({
        id: control.id,
        title: control.title,
        status,
        safeguards: [...new Set(capabilityIds)].flatMap((id) => {
          const result = results.get(id);
          return result
            ? [
                {
                  capabilityId: id,
                  name: result.capability.name,
                  state: safeguardState(result),
                  policies: [],
                },
              ]
            : [];
        }),
      })),
      unassigned: [],
      disclaimer: unresolved.disclaimer,
      locale: "en",
    });
    const text = decodedPdfText(bytes);
    expect(text).toContain("Targeting could not be resolved");
    expect(text).toMatch(/Safeguards whose targeting could not be/);
    expect(text).toMatch(/review the overlapping assignments/);
  });
});

describe("round 44 finding 2: both reasons in one capability are both explained", () => {
  // Two firewall profiles: one whose assignments cannot be resolved, one
  // whose assignments Graph did not return.
  const data = exportData(unresolvedAssignments);
  const [profile] = data.deviceConfigurations as Array<Record<string, unknown>>;
  const { assignments: _ignored, ...unread } = profile!;
  const mixed = assessCompliance({
    ...data,
    deviceConfigurations: [
      profile,
      {
        ...unread,
        id: "synthetic-firewall-2",
        displayName: "Synthetic firewall 2",
      },
    ],
  } as DetailedExportData);
  const both = /Refresh the policies.*review the overlapping assignments/i;

  it("records both reasons on the capability", () => {
    expect(
      [
        ...new Set(
          firewall(mixed).evidence.map((item) => item.assignment.uncertainty),
        ),
      ].sort(),
    ).toEqual(["incomplete", "unresolved"]);
    const limitations = firewall(mixed).limitations.join(" ");
    expect(limitations).toMatch(UNREADABLE);
    expect(limitations).toMatch(REVIEW);
  });

  it("advises a refresh and a review in the fix pack", () => {
    const source = firewall(mixed);
    const pack = generateFixPack(
      {
        ...mixed,
        capabilities: mixed.capabilities.map((result) =>
          result.capability.id === "windows-remote-credential-guard"
            ? { ...result, status: source.status, evidence: source.evidence }
            : result,
        ),
      },
      { collection: exportData([]) },
    );
    expect(
      pack.notGeneratable.find(
        (gap) => gap.capabilityId === "windows-remote-credential-guard",
      )?.reason,
    ).toMatch(both);
  });

  it("reads an alternative with both reasons as a data gap to collect again and review", () => {
    // The fix pack lists no capability with an alternative, so only the
    // management summary words it.
    const target = mixed.capabilities.find(
      (result) => result.capability.id === "windows-remote-credential-guard",
    )!;
    const alternative = {
      state: "unknown" as const,
      capabilityIds: [CAPABILITY],
      targetingPartlyUnresolved: true as const,
    };
    expect(safeguardState({ ...target, alternative })).toBe("dataMissing");
    expect(
      safeguardState({
        ...target,
        alternative: {
          state: "unknown",
          capabilityIds: [CAPABILITY],
          targetingUnresolved: true,
        },
      }),
    ).toBe("targetingUnresolved");
  });

  it("counts the capability as partly unresolved in the management summary", () => {
    expect(safeguardState(firewall(mixed))).toBe("dataMissing");
    const summary = buildManagementSummary(mixed, FRAMEWORK);
    expect(summary.targetingUnresolved).toBeUndefined();
    expect(summary.targetingPartlyUnresolved).toBe(1);
    expect(
      buildManagementSummary(incomplete, FRAMEWORK).targetingPartlyUnresolved,
    ).toBeUndefined();
    for (const locale of ["en", "de"] as const) {
      const note = MANAGEMENT_REPORT_STRINGS[locale].dataGapsNote;
      expect(note(2, 0, 1), locale).not.toBe(note(2));
      expect(note(1, 0, 1), locale).not.toBe(note(1));
      expect(note(2, 1, 1), locale).not.toBe(note(2, 1));
    }
    const en = MANAGEMENT_REPORT_STRINGS.en.dataGapsNote;
    expect(en(1, 0, 1)).toMatch(
      /collect the data again and review the overlapping assignments/,
    );
    expect(en(2, 0, 1)).toMatch(
      /^2 safeguards could not be read, 1 of them also because/,
    );
    expect(MANAGEMENT_REPORT_STRINGS.de.dataGapsNote(1, 0, 1)).toMatch(
      /erneut zu erfassen und die sich überschneidenden Zuweisungen zu prüfen/,
    );
  });
});

import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import {
  isExportFrameworkId,
  PURVIEW_TEMPLATES,
  PURVIEW_TEMPLATE_SOURCE,
  purviewTemplateFor,
} from "../compliance/export";

describe("Purview template mapping", () => {
  it("covers every framework the engine assesses", () => {
    const ids = assessCompliance(CONTOSO_TENANT).frameworks.map(
      (framework) => framework.framework.id,
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(isExportFrameworkId(id), `${id} needs a Purview mapping`).toBe(
        true,
      );
      expect(purviewTemplateFor(id)).not.toBeUndefined();
    }
  });

  it("records the source and verification date", () => {
    expect(PURVIEW_TEMPLATE_SOURCE.url).toContain(
      "compliance-manager-regulations-list",
    );
    for (const entry of Object.values(PURVIEW_TEMPLATES))
      if (entry) expect(entry.verifiedAt).toBe("2026-10-18");
  });

  it("resolves names, notes and frameworks without a template", () => {
    expect(purviewTemplateFor("iso-27001-2022")?.displayName).toBe(
      "ISO/IEC 27001:2022",
    );
    expect(purviewTemplateFor("hipaa-security-rule")?.displayName).toBe(
      "HIPAA/HITECH",
    );
    expect(purviewTemplateFor("dora-2022-2554")?.displayName).toBe(
      "Digital Operational Resilience Act",
    );
    expect(purviewTemplateFor("nist-800-171-r3")?.note).toContain("revision");
    expect(purviewTemplateFor("unknown-framework")).toBeUndefined();
  });

  it("uses the Essential Eight template of the assessed maturity level", () => {
    expect(purviewTemplateFor("essential-eight")?.displayName).toBe(
      "Australia - ASD Essential 8",
    );
    const level2 = purviewTemplateFor("essential-eight", {
      essentialEightMaturityLevel: 2,
    });
    expect(level2?.displayName).toBe(
      "Australia - ASD Essential 8 Maturity Level 2",
    );
    expect(level2?.note).toContain("Australia - ASD Essential 8");
  });
});

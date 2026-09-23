import { describe, expect, it } from "vitest";
import { buildScopedExportData } from "../../../apps/desktop/src/main/export-scope";
import {
  exportFileName,
  MAX_SCOPE_ITEMS,
  parseExportScope,
} from "../../../apps/desktop/src/shared/export-scope";
import type { ConfigurationSectionData } from "../configuration-sections";

function section(
  key: string,
  items: Record<string, unknown>[],
  selectionPrefix = key,
): ConfigurationSectionData {
  return { key, familyKey: key, label: key, selectionPrefix, items };
}

function collection() {
  const ring1 = { id: "ring-1", displayName: "Ring 1" };
  const ring3 = { id: "ring-3", displayName: "Ring 3" };
  const catalog = { id: "cat-1", name: "Catalog policy" };
  const script = { id: "script-1", displayName: "Script" };
  const tenantSetting = { displayName: "Tenant setting" };
  return {
    sections: [
      section("settingsCatalog", [catalog], "catalog"),
      section("windowsUpdatePolicies", [ring1, ring3], "update"),
      section("windowsScripts", [script], "script-win"),
      section("macOSScripts", [], "script-mac"),
      section("additional-tenant", [tenantSetting], "additional-tenant"),
    ],
    settingsCatalog: [catalog],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    appProtectionPolicies: [],
    securityBaselines: [],
    scripts: { windows: [script], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [ring1, ring3],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
    fetchErrors: [
      { policyId: "ring-3", policyName: "Ring 3", policyType: "u", error: "x" },
      { policyId: "cat-1", policyName: "Catalog", policyType: "c", error: "y" },
      {
        policyId: "windowsUpdatePolicies",
        policyName: "Update rings",
        policyType: "u",
        error: "z",
      },
    ],
    collectedAt: "2026-09-23T10:00:00Z",
  };
}

describe("desktop export scope validation", () => {
  it("treats a missing scope as the whole tenant", () => {
    expect(parseExportScope(undefined)).toBeNull();
    expect(parseExportScope(null)).toBeNull();
  });

  it("rejects empty, malformed and oversized scopes", () => {
    expect(() => parseExportScope({ items: [] })).toThrow();
    expect(() => parseExportScope({ items: "all" })).toThrow();
    expect(() =>
      parseExportScope({ items: [{ sectionKey: "a", itemId: 1 }] }),
    ).toThrow();
    expect(() =>
      parseExportScope({
        items: [{ sectionKey: "a".repeat(201), itemId: "b" }],
      }),
    ).toThrow();
    const many = Array.from({ length: MAX_SCOPE_ITEMS + 1 }, (_, index) => ({
      sectionKey: "s",
      itemId: String(index),
    }));
    expect(() => parseExportScope({ items: many })).toThrow(/5,000/);
  });

  it("drops duplicate references", () => {
    const item = { sectionKey: "s", itemId: "1" };
    expect(parseExportScope({ items: [item, { ...item }] })).toEqual([item]);
  });
});

describe("desktop scoped export data", () => {
  it("keeps only the referenced items in sections and legacy arrays", () => {
    const scoped = buildScopedExportData(collection(), [
      { sectionKey: "windowsUpdatePolicies", itemId: "ring-3" },
      { sectionKey: "windowsScripts", itemId: "script-1" },
      {
        sectionKey: "additional-tenant",
        itemId: "singleton-additional-tenant-0",
      },
    ]);
    expect(scoped.sections.map((entry) => entry.key)).toEqual([
      "windowsUpdatePolicies",
      "windowsScripts",
      "additional-tenant",
    ]);
    expect(scoped.windowsUpdatePolicies).toEqual([
      { id: "ring-3", displayName: "Ring 3" },
    ]);
    expect(scoped.settingsCatalog).toEqual([]);
    expect(scoped.scripts).toEqual({
      windows: [{ id: "script-1", displayName: "Script" }],
      macOS: [],
    });
    expect(scoped.fetchErrors.map((error) => error.policyId)).toEqual([
      "ring-3",
      "windowsUpdatePolicies",
    ]);
    expect(scoped.collectedAt).toBe("2026-09-23T10:00:00Z");
  });

  it("does not change the collection", () => {
    const data = collection();
    buildScopedExportData(data, [
      { sectionKey: "settingsCatalog", itemId: "cat-1" },
    ]);
    expect(data.windowsUpdatePolicies).toHaveLength(2);
    expect(data.sections[1]?.items).toHaveLength(2);
  });

  it("rejects items that are not in the collection", () => {
    expect(() =>
      buildScopedExportData(collection(), [
        { sectionKey: "settingsCatalog", itemId: "ring-3" },
      ]),
    ).toThrow(/not in the last collection/);
  });
});

describe("desktop export file names", () => {
  const date = new Date(2026, 8, 23, 23, 30);

  it("appends the local date", () => {
    expect(exportFileName("Win - WUfB - Ring 3", "pdf", date)).toBe(
      "Win - WUfB - Ring 3 - 2026-09-23.pdf",
    );
  });

  it("removes characters Windows and macOS reject and trailing dots", () => {
    expect(exportFileName('a\\b/c:d*e?f"g<h>i|j...', "docx", date)).toBe(
      "a b c d e f g h i j - 2026-09-23.docx",
    );
    expect(exportFileName("...", "pdf", date)).toBe(
      "Intune configuration - 2026-09-23.pdf",
    );
  });

  it("keeps the name at 120 characters", () => {
    const name = exportFileName(`${"x".repeat(200)}`, "docx", date);
    expect(name).toHaveLength(120);
    expect(name.endsWith(" - 2026-09-23.docx")).toBe(true);
  });
});

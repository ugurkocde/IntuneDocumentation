import { expect, it } from "vitest";
import { countCompletedResources } from "../collection-progress";
import type { ConfigurationSectionData } from "../configuration-sections";
it("counts only successfully completed resources from sections received this run", () => {
  const section: ConfigurationSectionData = {
    key: "settingsCatalog",
    familyKey: "settingsCatalog",
    label: "Catalog",
    selectionPrefix: "catalog",
    items: [{ id: "one" }, { id: "failed", hasFetchError: true }],
  };
  expect(countCompletedResources([section], new Set())).toBe(0);
  expect(countCompletedResources([section], new Set([1]))).toBe(1);
  expect(
    countCompletedResources(
      [{ ...section, error: { message: "Partial response" } }],
      new Set([1]),
    ),
  ).toBe(0);
  expect(countCompletedResources([], new Set([1]))).toBe(0);
});

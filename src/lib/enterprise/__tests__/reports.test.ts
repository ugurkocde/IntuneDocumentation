import { describe, expect, it } from "vitest";
import { generateReport } from "../reports";
import type { Snapshot } from "../domain";
const snapshot: Snapshot = {
  version: 1,
  capturedAt: "2026-09-09T10:00:00Z",
  sections: {
    settingsCatalog: {
      status: "failed",
      data: [],
      error: "Read permission missing",
    },
  },
};
const summary = {
  findings: 1,
  changes: 2,
  reviews: 0,
  trend: ["2026-09-08: 0 changes"],
};
describe("historical report artifacts", () => {
  it("generates a PDF from captured evidence without Graph calls", async () => {
    const result = await generateReport(
      snapshot,
      "pdf",
      "executive",
      "Contoso",
      summary,
    );
    expect(Buffer.from(result.buffer).subarray(0, 4).toString()).toBe("%PDF");
    expect(Buffer.from(result.buffer).toString()).toContain(
      "Incomplete sections",
    );
  });
  it("generates an editable Word review pack", async () => {
    const result = await generateReport(
      snapshot,
      "docx",
      "qbr",
      "Contoso",
      summary,
    );
    expect(Buffer.from(result.buffer).subarray(0, 2).toString()).toBe("PK");
    expect(result.buffer.length).toBeGreaterThan(1000);
  });
});

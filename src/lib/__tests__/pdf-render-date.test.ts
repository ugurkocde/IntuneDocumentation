import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { readPdfPageTexts } from "./helpers/pdf-outline";

afterEach(() => {
  vi.useRealTimers();
});

async function renderAt(now: string, renderDate?: Date) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  const result = await generateDetailedPDF(CONTOSO_TENANT, {
    audience: "desktop",
    ...(renderDate ? { renderDate } : {}),
  });
  vi.useRealTimers();
  return result.buffer;
}

describe("documentation PDF render date", () => {
  it("renders the same bytes for a fixed render date at any time", async () => {
    const renderDate = new Date("2026-10-08T23:30:00Z");
    const first = await renderAt("2026-01-01T08:00:00Z", renderDate);
    const second = await renderAt("2026-12-31T20:15:00Z", renderDate);
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
    const source = Buffer.from(first).toString("latin1");
    expect(source).toContain("/CreationDate (D:20261008233000+00'00')");
    // Calendar fields come from UTC, so the late evening stays on the 8th.
    const [cover] = readPdfPageTexts(first);
    expect(cover).toContain("8 Oct 2026");
    expect(cover).toContain("(v2026.10.08) Tj");
  });

  it("keeps the current time without a render date", async () => {
    const pdf = await renderAt("2026-03-04T05:06:00");
    const [cover] = readPdfPageTexts(pdf);
    expect(cover).toContain("4 Mar 2026");
    expect(cover).toContain("(v2026.03.04) Tj");
  });
});

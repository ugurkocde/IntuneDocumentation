import { describe, expect, it } from "vitest";
import type { Client } from "@microsoft/microsoft-graph-client";
import {
  collectAllPages,
  collectAllPagesWithStatus,
  GraphPaginationError,
} from "../graph-paging";

const failingClient = {
  api: () => ({
    get: () => Promise.reject(new Error("next page unavailable")),
  }),
} as unknown as Client;

describe("Graph paging", () => {
  const firstPage = {
    value: [{ id: "first" }],
    "@odata.nextLink": "https://graph.microsoft.com/beta/example?page=2",
  };

  it("returns an explicit partial result when a later page fails", async () => {
    await expect(
      collectAllPagesWithStatus(failingClient, firstPage, { maxRetries: 1 }),
    ).resolves.toMatchObject({
      items: [{ id: "first" }],
      complete: false,
      error: expect.any(Error),
    });
  });

  it("never lets legacy callers mistake a partial page set for completion", async () => {
    await expect(
      collectAllPages(failingClient, firstPage, { maxRetries: 1 }),
    ).rejects.toBeInstanceOf(GraphPaginationError);
  });
});

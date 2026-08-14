import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHANGELOG_API_URL,
  fetchLatestChangelog,
  formatChangelogDate,
  resetChangelogCacheForTests,
} from "../changelog";

const feedResponse = {
  product: {
    id: "intunedocumentation",
    name: "Intune Documentation",
    websiteUrl: "https://www.intunedocumentation.com/",
  },
  entries: [
    {
      id: "entry-1",
      title: "A clearer update panel",
      summary: "Recent improvements are now easier to follow.",
      type: "improved",
      publishedOn: "2026-08-14",
      sourceUrl: "https://www.intunedocumentation.com/",
    },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("changelog client", () => {
  beforeEach(() => resetChangelogCacheForTests());

  it("requests only the latest 20 product entries and caches successful responses", async () => {
    const fetcher = vi.fn(async () => jsonResponse(feedResponse));

    const first = await fetchLatestChangelog(fetcher as typeof fetch);
    const second = await fetchLatestChangelog(fetcher as typeof fetch);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(CHANGELOG_API_URL, {
      headers: { Accept: "application/json" },
    });
    expect(first).toEqual(second);
    expect(first.entries[0]?.title).toBe("A clearer update panel");
  });

  it("deduplicates concurrent requests", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const responsePromise = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const fetcher = vi.fn(() => responsePromise);

    const first = fetchLatestChangelog(fetcher as typeof fetch);
    const second = fetchLatestChangelog(fetcher as typeof fetch);
    resolveResponse?.(jsonResponse(feedResponse));

    expect(first).toBe(second);
    await expect(first).resolves.toMatchObject({
      product: { id: "intunedocumentation" },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not cache failures and allows a later retry", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse(feedResponse));

    await expect(fetchLatestChangelog(fetcher as typeof fetch)).rejects.toThrow(
      "status 503",
    );
    await expect(
      fetchLatestChangelog(fetcher as typeof fetch),
    ).resolves.toMatchObject({ entries: [{ id: "entry-1" }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps change type as metadata and discards unsafe source links", async () => {
    const unsafeFeed = structuredClone(feedResponse);
    unsafeFeed.entries[0]!.sourceUrl = "javascript:alert(1)";
    const fetcher = vi.fn(async () => jsonResponse(unsafeFeed));

    const feed = await fetchLatestChangelog(fetcher as typeof fetch);

    expect(feed.entries[0]).toMatchObject({ type: "improved" });
    expect(feed.entries[0]?.sourceUrl).toBeUndefined();
  });

  it("formats publication dates without timezone drift", () => {
    expect(formatChangelogDate("2026-08-14")).toBe("Aug 14, 2026");
  });
});

import type { Client } from "@microsoft/microsoft-graph-client";

import { retryGraphRequest } from "./graph-request";

// Collects all pages given a first Graph response with potential @odata.nextLink
export class GraphPaginationError<T = unknown> extends Error {
  readonly items: T[];
  readonly cause: unknown;

  constructor(items: T[], cause: unknown) {
    super(
      `Microsoft Graph paging stopped after ${items.length} items: ${
        cause instanceof Error ? cause.message : "unknown paging error"
      }`,
    );
    this.name = "GraphPaginationError";
    this.items = items;
    this.cause = cause;
  }
}

export interface GraphPagingOptions {
  maxRetries?: number;
  initialDelay?: number;
  signal?: AbortSignal;
}

// Only public-cloud Graph is supported; the client uses the SDK default host.
const GRAPH_HOST = "graph.microsoft.com";

// The SDK sends the bearer token to whatever absolute URL it is given, so a
// continuation link must point at Graph itself before it is followed.
export function assertGraphNextLink(link: string): void {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("Graph returned a continuation link that is not a URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hostname !== GRAPH_HOST ||
    url.port
  ) {
    throw new Error("Graph returned a continuation link to another host");
  }
}

export async function collectAllPages<T = any>(
  client: Client,
  firstResponse: any,
  options: GraphPagingOptions = {},
): Promise<T[]> {
  const result = await collectAllPagesWithStatus<T>(
    client,
    firstResponse,
    options,
  );
  if (!result.complete) {
    throw new GraphPaginationError(result.items, result.error);
  }
  return result.items;
}

export interface GraphPagingResult<T> {
  items: T[];
  complete: boolean;
  error?: any;
}

export async function collectAllPagesWithStatus<T = any>(
  client: Client,
  firstResponse: any,
  options: GraphPagingOptions = {},
): Promise<GraphPagingResult<T>> {
  if (!Array.isArray(firstResponse?.value)) {
    return {
      items: [],
      complete: false,
      error: new Error("Graph omitted the collection value array"),
    };
  }
  const items: T[] = [...firstResponse.value];
  const visited = new Set<string>();
  let nextLink: string | undefined = firstResponse?.["@odata.nextLink"];
  let pageNumber = 2;

  while (nextLink !== undefined && nextLink !== null) {
    try {
      if (typeof nextLink !== "string" || !nextLink || visited.has(nextLink)) {
        throw new Error(
          "Graph returned an invalid or repeated continuation link",
        );
      }
      visited.add(nextLink);
      assertGraphNextLink(nextLink);
      // The Graph SDK supports passing the absolute nextLink URL
      // Avoid adding .version() or other modifiers when following nextLink
      const page: any = await retryGraphRequest(
        () => (client as any).api(nextLink).get(),
        {
          maxAttempts: options.maxRetries ?? 5,
          initialDelay: options.initialDelay ?? 1000,
          signal: options.signal,
        },
      );

      if (!Array.isArray(page?.value))
        throw new Error("Graph omitted the collection value array");
      items.push(...page.value);
      pageNumber++;

      nextLink = page?.["@odata.nextLink"];
    } catch (error: any) {
      console.error(
        `Failed to fetch page ${pageNumber} after retries. ` +
          `Error: ${error?.message || "Unknown error"}. ` +
          `Collected ${items.length} items so far.`,
      );
      return { items, complete: false, error };
    }
  }

  return { items, complete: true };
}

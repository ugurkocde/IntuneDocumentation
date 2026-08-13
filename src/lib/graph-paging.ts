import type { Client } from "@microsoft/microsoft-graph-client";

// Helper function for retrying with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelay: number = 1000,
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const statusCode = error?.statusCode || error?.response?.status;
      const errorMessage = error?.message || "";

      // Don't retry on permanent failures
      // 404 or 403 - resource doesn't exist or forbidden
      // "No OData route exists" - API endpoint not supported for this resource
      if (
        statusCode === 404 ||
        statusCode === 403 ||
        errorMessage.includes("No OData route exists")
      ) {
        throw error;
      }

      // Check if it's a rate limit error (429)
      if (error?.statusCode === 429 || error?.code === "TooManyRequests") {
        // Try to get Retry-After header
        const retryAfter = error?.headers?.["retry-after"] || error?.retryAfter;
        const retryDelay = retryAfter ? parseInt(retryAfter) * 1000 : 30000; // Default to 30s
        console.log(
          `Rate limited. Waiting ${retryDelay}ms before retry ${attempt + 1}/${maxRetries}`,
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }

      // For other errors, use exponential backoff with jitter
      if (attempt < maxRetries - 1) {
        const exponentialDelay = initialDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 500;
        const delayMs = exponentialDelay + jitter;

        console.log(
          `Retry ${attempt + 1}/${maxRetries} after ${delayMs.toFixed(0)}ms. Error: ${error?.message || "Unknown error"}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

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
  const items: T[] = Array.isArray(firstResponse?.value)
    ? [...firstResponse.value]
    : [];
  let nextLink: string | undefined = firstResponse?.["@odata.nextLink"];
  let pageNumber = 2;

  while (nextLink) {
    try {
      // The Graph SDK supports passing the absolute nextLink URL
      // Avoid adding .version() or other modifiers when following nextLink
      const page: any = await retryWithBackoff(
        () => (client as any).api(nextLink).get(),
        options.maxRetries ?? 5,
        options.initialDelay ?? 1000,
      );

      if (Array.isArray(page?.value)) {
        items.push(...page.value);
        pageNumber++;
      }

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

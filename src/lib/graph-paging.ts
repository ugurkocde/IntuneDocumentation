import type { Client } from "@microsoft/microsoft-graph-client";

// Helper function for retrying with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const statusCode = error?.statusCode || error?.response?.status;
      const errorMessage = error?.message || '';

      // Don't retry on permanent failures
      // 404 or 403 - resource doesn't exist or forbidden
      // "No OData route exists" - API endpoint not supported for this resource
      if (
        statusCode === 404 ||
        statusCode === 403 ||
        errorMessage.includes('No OData route exists')
      ) {
        throw error;
      }

      // Check if it's a rate limit error (429)
      if (error?.statusCode === 429 || error?.code === 'TooManyRequests') {
        // Try to get Retry-After header
        const retryAfter = error?.headers?.['retry-after'] || error?.retryAfter;
        const retryDelay = retryAfter ? parseInt(retryAfter) * 1000 : 30000; // Default to 30s
        console.log(`Rate limited. Waiting ${retryDelay}ms before retry ${attempt + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }

      // For other errors, use exponential backoff with jitter
      if (attempt < maxRetries - 1) {
        const exponentialDelay = initialDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 500;
        const delayMs = exponentialDelay + jitter;

        console.log(`Retry ${attempt + 1}/${maxRetries} after ${delayMs.toFixed(0)}ms. Error: ${error?.message || 'Unknown error'}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

// Collects all pages given a first Graph response with potential @odata.nextLink
export async function collectAllPages<T = any>(client: Client, firstResponse: any): Promise<T[]> {
  const items: T[] = Array.isArray(firstResponse?.value) ? [...firstResponse.value] : [];
  let nextLink: string | undefined = firstResponse?.['@odata.nextLink'];
  let pageNumber = 1;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 3;

  while (nextLink) {
    try {
      // The Graph SDK supports passing the absolute nextLink URL
      // Avoid adding .version() or other modifiers when following nextLink
      const page: any = await retryWithBackoff(
        () => (client as any).api(nextLink).get(),
        5,
        1000
      );

      if (Array.isArray(page?.value)) {
        items.push(...page.value);
        pageNumber++;
        consecutiveFailures = 0; // Reset failure counter on success
      }

      nextLink = page?.['@odata.nextLink'];
    } catch (error: any) {
      consecutiveFailures++;
      console.error(
        `Failed to fetch page ${pageNumber} after retries. ` +
        `Error: ${error?.message || 'Unknown error'}. ` +
        `Collected ${items.length} items so far. ` +
        `Consecutive failures: ${consecutiveFailures}/${maxConsecutiveFailures}`
      );

      // If we've had too many consecutive failures, stop pagination
      // Return what we have rather than losing everything
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.error(
          `Stopping pagination after ${maxConsecutiveFailures} consecutive failures. ` +
          `Returning ${items.length} items collected so far.`
        );
        break;
      }

      // Otherwise, try to continue with the next page (skip the failed page)
      // This helps if there's a transient issue with a specific page
      try {
        // Wait a bit before trying the next page
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch {
        // If even the delay fails, just break
        break;
      }

      // Try to continue (the nextLink should still be set from before the error)
      // If this fails again, we'll break on the next iteration
    }
  }

  return items;
}


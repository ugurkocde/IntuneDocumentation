import type { Client } from "@microsoft/microsoft-graph-client";

// Collects all pages given a first Graph response with potential @odata.nextLink
export async function collectAllPages<T = any>(client: Client, firstResponse: any): Promise<T[]> {
  const items: T[] = Array.isArray(firstResponse?.value) ? [...firstResponse.value] : [];
  let nextLink: string | undefined = firstResponse?.['@odata.nextLink'];

  while (nextLink) {
    // The Graph SDK supports passing the absolute nextLink URL
    // Avoid adding .version() or other modifiers when following nextLink
    // eslint-disable-next-line no-await-in-loop
    const page = await (client as any).api(nextLink).get();
    if (Array.isArray(page?.value)) {
      items.push(...page.value);
    }
    nextLink = page?.['@odata.nextLink'];
  }

  return items;
}


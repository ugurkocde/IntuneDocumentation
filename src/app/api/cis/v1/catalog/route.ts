import { cisCatalogResponse, defaultCisDeps } from "~/lib/cis-content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return cisCatalogResponse(request, await defaultCisDeps());
}

import { cisListResponse, defaultCisDeps } from "~/lib/cis-content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ benchmark: string; version: string }> },
) {
  return cisListResponse(request, await context.params, await defaultCisDeps());
}

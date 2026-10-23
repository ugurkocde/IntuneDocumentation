import { cisPackResponse, defaultCisDeps } from "~/lib/cis-content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ benchmark: string; version: string; level: string }>;
  },
) {
  return cisPackResponse(request, await context.params, await defaultCisDeps());
}

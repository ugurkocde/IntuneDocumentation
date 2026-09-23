import { missingConfiguration } from "~/lib/desktop-license/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const missing = missingConfiguration();
  return Response.json(
    { ok: missing.length === 0, missing },
    {
      status: missing.length === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

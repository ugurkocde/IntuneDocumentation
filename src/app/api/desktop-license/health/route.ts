import {
  missingConfiguration,
  missingTenantConfiguration,
} from "~/lib/desktop-license/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ok covers key licenses. Organization licenses additionally need storage;
// without it only the tenant route answers 503.
export function GET() {
  const missing = missingConfiguration();
  const storageMissing = missingTenantConfiguration();
  return Response.json(
    {
      ok: missing.length === 0,
      missing,
      organizationLicenses: {
        ok: missing.length === 0 && storageMissing.length === 0,
        missing: storageMissing,
      },
    },
    {
      status: missing.length === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

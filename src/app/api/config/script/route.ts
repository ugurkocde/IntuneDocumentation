export const dynamic = "force-dynamic";

export function GET() {
  const clientId =
    process.env.AZURE_AD_CLIENT_ID ??
    process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID;
  const tenantId =
    process.env.AZURE_AD_TENANT_ID ??
    process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ??
    "common";

  const body = clientId
    ? `window.__ENTRA_CONFIG__=${JSON.stringify({ clientId, tenantId })}`
    : "";

  return new Response(body, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export const dynamic = "force-dynamic";

export function GET() {
  // Runtime-only values intentionally bypass the T3 schema so Docker images can build with SKIP_ENV_VALIDATION.
  const clientId =
    process.env.AZURE_AD_CLIENT_ID ??
    process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID;
  const tenantId =
    process.env.AZURE_AD_TENANT_ID ??
    process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID ??
    "common";

  if (!clientId) {
    return Response.json(
      {
        error:
          "Microsoft Entra configuration is missing. Set AZURE_AD_CLIENT_ID before starting the application.",
      },
      { status: 500 },
    );
  }

  return Response.json({ clientId, tenantId });
}

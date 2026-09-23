import { z } from "zod";
import { fields, licenseHandler } from "~/lib/desktop-license/http";
import { tenantLicense } from "~/lib/desktop-license/tenant";

export const runtime = "nodejs";
// A JWKS fetch, a storage read and up to five sequential Polar calls.
export const maxDuration = 60;

export const POST = licenseHandler(
  z.object({
    idToken: fields.idToken,
    installId: fields.installId,
    os: fields.os,
    appVersion: fields.appVersion,
    action: z.enum(["activate", "refresh", "deactivate"]),
    activationId: fields.activationId.optional(),
  }),
  tenantLicense,
  { maxBytes: 16384 },
);

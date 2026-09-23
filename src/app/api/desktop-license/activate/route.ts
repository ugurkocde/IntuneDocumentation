import { z } from "zod";
import { fields, licenseHandler } from "~/lib/desktop-license/http";
import { activateAndShare } from "~/lib/desktop-license/service";

export const runtime = "nodejs";
// Up to four sequential Polar calls, each with a 10 second timeout.
export const maxDuration = 60;

export const POST = licenseHandler(
  z.object({
    key: fields.key,
    installId: fields.installId,
    tenantId: fields.tenantId,
    os: fields.os,
    appVersion: fields.appVersion,
    // The key holder's app registration and a fresh sign-in to it, the
    // proof of the tenant needed to share the license with it.
    clientId: fields.clientId.optional(),
    idToken: fields.idToken.optional(),
    shareWithTenant: z.boolean().optional(),
  }),
  activateAndShare,
  { maxBytes: 16384 },
);

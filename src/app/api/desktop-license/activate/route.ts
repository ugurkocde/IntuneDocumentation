import { z } from "zod";
import { fields, licenseHandler } from "~/lib/desktop-license/http";
import { activateLicense } from "~/lib/desktop-license/service";

export const runtime = "nodejs";

export const POST = licenseHandler(
  z.object({
    key: fields.key,
    installId: fields.installId,
    tenantId: fields.tenantId,
    os: fields.os,
    appVersion: fields.appVersion,
  }),
  activateLicense,
);

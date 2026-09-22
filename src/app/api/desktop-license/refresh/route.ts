import { z } from "zod";
import { fields, licenseHandler } from "~/lib/desktop-license/http";
import { refreshLicense } from "~/lib/desktop-license/service";

export const runtime = "nodejs";

export const POST = licenseHandler(
  z.object({
    key: fields.key,
    activationId: fields.activationId,
    installId: fields.installId,
    tenantId: fields.tenantId,
  }),
  refreshLicense,
);

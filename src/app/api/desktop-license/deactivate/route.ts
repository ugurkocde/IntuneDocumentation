import { z } from "zod";
import { fields, licenseHandler } from "~/lib/desktop-license/http";
import { deactivateLicense } from "~/lib/desktop-license/service";

export const runtime = "nodejs";

export const POST = licenseHandler(
  z.object({ key: fields.key, activationId: fields.activationId }),
  async (ctx, input) => {
    await deactivateLicense(ctx, input);
    return { success: true };
  },
);

import { z } from "zod";
import { fields, licenseHandler } from "~/lib/desktop-license/http";
import { deactivateLicense } from "~/lib/desktop-license/service";

export const runtime = "nodejs";
// Up to four sequential Polar calls, each with a 10 second timeout.
export const maxDuration = 60;

export const POST = licenseHandler(
  z.object({ key: fields.key, activationId: fields.activationId }),
  async (ctx, input) => {
    await deactivateLicense(ctx, input);
    return { success: true };
  },
);

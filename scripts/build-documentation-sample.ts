// Renders IntuneDocumentation-Sample.pdf, the public sample of the
// documentation export (served by src/app/api/pdf/sample/route.ts), from the
// fictional Contoso demo tenant. The render date is fixed, so the same code
// and fixture always write the same bytes.
//
// Run: npm run build:documentation-sample
// Smoke test elsewhere: SAMPLE_PDF_OUT=/tmp/sample.pdf npm run build:documentation-sample
//
// The docs screenshots are pages 1 (cover) and 3 (Executive Summary) of the
// file, at their existing 707 x 1000 pixels:
//   pdftoppm -png -singlefile -f 1 -l 1 -scale-to-x 707 -scale-to-y 1000 IntuneDocumentation-Sample.pdf apps/docs/public/images/web/report-cover
//   pdftoppm -png -singlefile -f 3 -l 3 -scale-to-x 707 -scale-to-y 1000 IntuneDocumentation-Sample.pdf apps/docs/public/images/web/report-summary
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CONTOSO_TENANT,
  CONTOSO_TENANT_LABEL,
} from "~/lib/compliance/demo/contoso-tenant";
import { SAMPLE_RENDER_DATE } from "~/lib/compliance/demo/sample-plan";
import { generateDetailedPDF } from "~/lib/pdf-generator-detailed";

process.env.TZ = "UTC";

const outFile = path.resolve(
  process.env.SAMPLE_PDF_OUT ??
    path.join(process.cwd(), "IntuneDocumentation-Sample.pdf"),
);

async function main() {
  // The web export, as a visitor of the website would download it.
  const { buffer, errors } = await generateDetailedPDF(
    { ...CONTOSO_TENANT, tenantLabel: CONTOSO_TENANT_LABEL },
    { audience: "web", renderDate: new Date(SAMPLE_RENDER_DATE) },
  );
  if (errors.length)
    throw new Error(`Sample export reported errors: ${JSON.stringify(errors)}`);
  await writeFile(outFile, buffer);
  console.log(`${path.basename(outFile)}: ${buffer.byteLength} bytes`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

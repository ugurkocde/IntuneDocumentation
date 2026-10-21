// Renders the documentation export of the fictional Contoso demo tenant
// for local checks of the design. The render date is fixed, so the same
// code and fixture always write the same bytes.
//
// The published IntuneDocumentation-Sample.pdf (served by
// src/app/api/pdf/sample/route.ts) is not this file: it is a ten page
// excerpt of a lab tenant export (cover, Tenant Overview and Settings
// Catalog pages), with every page that holds personal data, the full tenant
// id or third party benchmark names left out. The landing and docs images
// are pages 1, 2 and 5 of it at 707 x 1000 pixels, for example:
//   pdftoppm -png -singlefile -f 1 -l 1 -scale-to-x 707 -scale-to-y 1000 IntuneDocumentation-Sample.pdf public/landing/report-cover
//
// Run: npm run build:documentation-sample (writes /tmp/documentation-sample.pdf)
// Other path: SAMPLE_PDF_OUT=/path/sample.pdf npm run build:documentation-sample
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
    "/tmp/documentation-sample.pdf",
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

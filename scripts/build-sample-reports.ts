// Renders the public sample evidence reports from the fictional Contoso demo
// tenant into public/samples, plus a deterministic manifest.json that the
// staleness test (src/lib/__tests__/sample-reports.test.ts) compares against.
//
// Run: npm run build:samples
// Smoke test elsewhere: SAMPLES_OUT_DIR=/tmp/samples npm run build:samples
//
// Runs through vite-node (installed with vitest) so the ~ alias, extensionless
// imports and JSON imports resolve exactly as they do in the test suite.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderSampleReport } from "~/lib/compliance/demo/render-sample";
import { expectedSampleManifest } from "~/lib/compliance/demo/sample-plan";
import { SAMPLE_REPORTS } from "~/lib/compliance/samples";

// Sample dates render in UTC already; pin the zone as well so nothing in the
// run can pick up the machine's local offset.
process.env.TZ = "UTC";

const outDir = path.resolve(
  process.env.SAMPLES_OUT_DIR ?? path.join(process.cwd(), "public", "samples"),
);

async function main() {
  await mkdir(outDir, { recursive: true });
  for (const sample of SAMPLE_REPORTS) {
    const pdf = await renderSampleReport(sample);
    await writeFile(path.join(outDir, sample.file), pdf);
    console.log(`${sample.file}: ${pdf.byteLength} bytes`);
  }
  const manifest = await expectedSampleManifest();
  await writeFile(
    path.join(outDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`manifest.json written to ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

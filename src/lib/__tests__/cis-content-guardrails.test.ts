import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

// CIS Benchmark content is delivered at runtime from the gated content service
// and never ships with the product. This test scans everything that ships or
// is published for benchmark text, Build Kit names and packs. Synthetic test
// data uses the invented benchmark id "synthetic-bench" and labels its titles
// with the word "Synthetic".

const ROOT = process.cwd();
const THIS_FILE = "src/lib/__tests__/cis-content-guardrails.test.ts";

// Directories and files that ship in a bundle or are published. The built
// desktop bundle is scanned when a local build exists.
const SCAN_ROOTS = [
  "src",
  "apps/desktop/src",
  "apps/desktop/build",
  "apps/desktop/release-notes",
  "apps/desktop/dist",
  "apps/docs/app",
  "apps/docs/components",
  "apps/docs/content",
  "apps/docs/lib",
  "apps/docs/public",
  "public",
  "README.md",
  "IntuneDocumentation-Sample.pdf",
  "docs",
  "scripts",
];
const OPTIONAL_ROOTS = new Set(["apps/desktop/dist"]);
const SKIPPED_DIRS = new Set(["node_modules", ".next", ".source", "out"]);

// Customer facing copy: any mention of CIS Benchmarks must say coming soon and
// name no benchmark beyond "CIS Benchmarks".
const COPY_ROOTS = [
  "README.md",
  "apps/desktop/release-notes",
  "apps/docs/content",
  "docs/releases",
  "docs/sales",
  "public",
  "src/app",
  "src/components",
];
const NOT_COPY = ["src/app/api"];

// The complete allowlist. Everything else is scanned without exemption,
// including the CIS Controls crosswalk (src/lib/compliance/management) and
// the CIS manual notice and URL constants (src/lib/benchmarks/manual.ts):
// their strings name CIS Controls or CIS Benchmarks generically and match no
// rule below.
const ALLOWLIST: ReadonlyArray<{ file: string; reason: string }> = [
  { file: THIS_FILE, reason: "holds the rule patterns and their probes" },
];

// PDFs whose text is drawn with embedded Type 3 fonts, so no literal text can
// be read without a font decoder. Each entry was checked by hand with
// pdftotext; any new PDF must be readable or be checked and listed here.
const OPAQUE_PDFS: ReadonlyArray<{ file: string; reason: string }> = [
  {
    file: "public/desktop/intune-documentation-desktop-security-overview.pdf",
    reason: "printed from a browser with embedded fonts",
  },
];

// Binary formats that cannot hold scannable text. Any other binary file, such
// as an archive or a spreadsheet, fails the scan until it is reviewed.
const IMAGE_OR_FONT = /\.(?:png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf)$/i;

type Rule = { id: string; pattern: RegExp };

// "CIS" as a whole word, also inside snake_case and kebab-case names.
const CIS = "(?<![A-Za-z0-9])CIS(?![A-Za-z0-9])";
const cisRule = (id: string, body: string, flags = "g"): Rule => ({
  id,
  pattern: new RegExp(CIS + body, flags),
});

// Benchmark recommendation text, benchmark document names and Build Kit
// policy or file names.
const TEXT_RULES: Rule[] = [
  {
    id: "ensure-title",
    pattern:
      /\bEnsure\s+['"\u2018\u201c][^'"\u2019\u201d\n]{1,200}['"\u2019\u201d]\s+(?:is|are|be)\b/gi,
  },
  {
    // Unquoted titles at the start of a string, line or list item.
    id: "ensure-statement",
    pattern:
      /(?:["'`]|^[ \t]*(?:[-*#>|][ \t]*)*)Ensure[ \t]+(?:that[ \t]+)?[A-Za-z'][^\n"'`]{0,160}?\b(?:is|are)[ \t]+(?:set|configured|enabled|disabled|not|required|blocked|restricted|allowed|prohibited|limited|turned|reviewed|present|used)\b/gm,
  },
  {
    id: "level-tagged-title",
    pattern: /\((?:L[12]|BL|NG)\)\s*Ensure\b/g,
  },
  {
    id: "recommendation-id-title",
    pattern:
      /(?<![\w.])\d{1,3}(?:\.\d{1,3}){1,6}\.?:?\s+(?:\((?:L[12]|BL|NG)\)\s+)?Ensure\b/g,
  },
  cisRule(
    "benchmark-product-name",
    "[ _-]+(?:Microsoft|Apple|Google|Mozilla|Amazon|AWS|Azure|Oracle|Cisco|Samsung|Ubuntu|Linux|Docker|Zoom|Intune|Entra|Defender|Exchange|SharePoint|Teams|M365|Windows|macOS|iOS|iPadOS|Android|Office|Edge|Chrome|Firefox)(?![A-Za-z])",
    "gi",
  ),
  cisRule(
    "benchmark-document-name",
    "(?:[ _-]+[\\w.()+]+){1,10}?[ _-]+Benchmark(?![A-Za-z])",
  ),
  cisRule(
    "build-kit-level-version",
    "[^\\n\"'`]{0,100}?(?<![A-Za-z0-9])(?:L[12]|Level[ _-]?[12])(?![A-Za-z0-9])[^\\n\"'`]{0,60}?(?<![A-Za-z0-9])v?\\d+\\.\\d+\\.\\d+",
    "gi",
  ),
  cisRule(
    "build-kit-version",
    "[^\\n\"'`]{0,100}?(?<![A-Za-z0-9])v\\d+\\.\\d+\\.\\d+",
    "gi",
  ),
  cisRule(
    "build-kit-level-tag",
    "[^\\n\"'`]{0,60}?\\((?:L[12]|BL|NG)\\)",
    "gi",
  ),
  {
    id: "build-kit-file-name",
    pattern: /(?:\bL1\+L2\b|\(BL\))[^\n"'`]{0,80}?\.json\b/g,
  },
];

// Certification, compliance or conformity claims about CIS, in English and
// German.
const CLAIM_WORD =
  "(?:certified|certification|compliant|compliance|conformant|aligned|konform|zertifiziert|Zertifizierung)";
const CLAIM_RULE: Rule = {
  id: "cis-claim",
  pattern: new RegExp(
    [
      `${CIS}(?:[ -]+(?!not\\b)[A-Za-z]+){0,2}?[ -]+${CLAIM_WORD}\\b`,
      `\\b(?:${CLAIM_WORD}|meets|entspricht)\\s+(?:(?:by|with|against|to|for|nach|mit)\\s+)?(?:the\\s+|den\\s+|dem\\s+)?${CIS}`,
    ].join("|"),
    "gi",
  ),
};

const SYNTHETIC_MARK = /synthetic/i;
const BENCHMARK_MENTION =
  /\b(?:CIS|Center\s+for\s+Internet\s+Security)[\s-]+(?:\(CIS\)\s*)?Benchmarks?\b/gi;
// Words that would name a specific benchmark next to a mention in copy.
const NAMED_BENCHMARK =
  /\b(?:Windows|macOS|iOS|iPadOS|Android|Intune|Entra|Microsoft\s+365|M365|Office|Edge|Chrome|Defender|Level\s*[12]|L[12])\b|\bv?\d+\.\d+(?:\.\d+)?\b/i;
const COMING_SOON = /coming soon/i;

type Finding = { file: string; rule: string; text: string };

function listFiles(entry: string): string[] {
  const absolute = path.join(ROOT, entry);
  if (!existsSync(absolute)) return [];
  if (statSync(absolute).isFile()) return [entry];
  const files: string[] = [];
  for (const name of readdirSync(absolute)) {
    if (SKIPPED_DIRS.has(name)) continue;
    files.push(...listFiles(path.join(entry, name).split(path.sep).join("/")));
  }
  return files;
}

function unescapePdfString(raw: string) {
  return raw.replace(/\\(\d{1,3}|[\s\S])/g, (_, escaped: string) => {
    if (/^\d+$/.test(escaped)) return String.fromCharCode(parseInt(escaped, 8));
    const map: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "\n": "",
      "\r": "",
    };
    return map[escaped] ?? escaped;
  });
}

// Text of every literal string in the file, with Flate streams inflated.
// Wrapped lines are joined with spaces so a title split across lines matches.
function pdfLiteralText(bytes: Buffer) {
  const raw = bytes.toString("latin1");
  const parts: string[] = [];
  const marker = /stream\r?\n/g;
  let cursor = 0;
  for (let match = marker.exec(raw); match; match = marker.exec(raw)) {
    const head = raw.slice(cursor, match.index);
    parts.push(head);
    const dataStart = match.index + match[0].length;
    const dataEnd = raw.indexOf("endstream", dataStart);
    if (dataEnd < 0) break;
    const data = bytes.subarray(dataStart, dataEnd);
    // Inflate every stream; streams that are not Flate encoded stay raw.
    try {
      parts.push(inflateSync(data).toString("latin1"));
    } catch {
      parts.push(data.toString("latin1"));
    }
    cursor = dataEnd + "endstream".length;
    marker.lastIndex = cursor;
  }
  parts.push(raw.slice(cursor));
  const literals =
    parts.join("\n").match(/\((?:[^()\\]|\\[\s\S])*\)/g) ?? ([] as string[]);
  return literals
    .map((literal) => unescapePdfString(literal.slice(1, -1)))
    .join(" ");
}

function isSyntheticBenchmarkId(id: string) {
  return id === "synthetic-bench" || id.startsWith("synthetic-bench-");
}

// Objects shaped like a pack, a catalog or a recommendation list.
function packShapes(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) packShapes(item, found);
    return found;
  }
  if (typeof value !== "object" || value === null) return found;
  const record = value as Record<string, unknown>;
  const benchmark = record.benchmark;
  if (
    typeof benchmark === "string" &&
    !isSyntheticBenchmarkId(benchmark) &&
    ["policies", "items", "recommendations"].some((key) =>
      Array.isArray(record[key]),
    )
  )
    found.push(`benchmark ${benchmark}`);
  if (Array.isArray(record.benchmarks)) {
    for (const entry of record.benchmarks) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;
      if (
        typeof item.id === "string" &&
        ("version" in item || "levels" in item) &&
        !isSyntheticBenchmarkId(item.id)
      )
        found.push(`catalog entry ${item.id}`);
    }
  }
  for (const child of Object.values(record)) packShapes(child, found);
  return found;
}

// Pack, catalog or list literals in source files: a benchmark id that names a
// real product, next to a Level and policies or recommendation items. Tests of
// id handling may use other invented ids such as "other-bench".
const PRODUCT_ID =
  /(?:^|-)(?:cis|microsoft|apple|google|samsung|ubuntu|linux|windows|win|w\d+|macos|ios|ipados|android|office|m365|exchange|sharepoint|teams|entra|edge|chrome|firefox|safari|defender|intune|azure|aws)(?=-|\d|$)/;
const BENCHMARK_LITERAL =
  /["']?\bbenchmark["']?\s*:\s*["'`]([a-z0-9]+(?:-[a-z0-9]+)*)["'`]/g;
const PACK_KEYS = /["']?\b(?:policies|items|recommendations)["']?\s*:/;
const LEVEL_KEY = /["']?\blevels?["']?\s*:/;

function packLiterals(text: string) {
  if (!PACK_KEYS.test(text) || !LEVEL_KEY.test(text)) return [];
  return [...text.matchAll(BENCHMARK_LITERAL)]
    .map((match) => match[1]!)
    .filter((id) => PRODUCT_ID.test(id))
    .map((id) => `benchmark ${id}`);
}

function textMatches(rule: Rule, text: string) {
  return [...text.matchAll(rule.pattern)]
    .map((match) => match[0])
    .filter((match) => !SYNTHETIC_MARK.test(match));
}

function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  for (const rule of [...TEXT_RULES, CLAIM_RULE])
    for (const match of textMatches(rule, text))
      findings.push({ file, rule: rule.id, text: match.slice(0, 160) });
  return findings;
}

function decodeText(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return Buffer.from(bytes.subarray(2)).swap16().toString("utf16le");
  if (bytes.subarray(0, 8192).includes(0)) return null;
  return bytes.toString("utf8").replace(/^\uFEFF/, "");
}

type Content =
  | { kind: "text" | "json" | "pdf"; text: string }
  | "image"
  | "binary";

function readContent(file: string, bytes: Buffer): Content {
  if (IMAGE_OR_FONT.test(file)) return "image";
  if (file.toLowerCase().endsWith(".pdf"))
    return { kind: "pdf", text: pdfLiteralText(bytes) };
  const text = decodeText(bytes);
  if (text === null) return "binary";
  return { kind: file.toLowerCase().endsWith(".json") ? "json" : "text", text };
}

// Copy units: paragraphs, list items, headings and table rows.
function copyUnits(text: string) {
  return text.split(/\n\s*\n|\n(?=[ \t]*(?:[-*+|#]|\d+\.)\s)/);
}

function copyFindings(file: string, text: string): Finding[] {
  const findings: Finding[] = [];
  for (const unit of copyUnits(text)) {
    if (!unit.match(BENCHMARK_MENTION)) continue;
    const rest = unit.replace(BENCHMARK_MENTION, " ");
    const problem = !COMING_SOON.test(unit)
      ? "copy-not-coming-soon"
      : NAMED_BENCHMARK.test(rest)
        ? "copy-names-a-benchmark"
        : null;
    if (problem)
      findings.push({ file, rule: problem, text: unit.trim().slice(0, 160) });
  }
  return findings;
}

function isAllowlisted(file: string) {
  return ALLOWLIST.some((entry) => entry.file === file);
}

function scannedFiles() {
  return [...new Set(SCAN_ROOTS.flatMap(listFiles))]
    .filter((file) => !isAllowlisted(file))
    .sort();
}

function isCopy(file: string) {
  const inside = (root: string) => file === root || file.startsWith(`${root}/`);
  return COPY_ROOTS.some(inside) && !NOT_COPY.some(inside);
}

// Every rule for one file: its path, its text, pack shapes and copy wording.
function scanFile(file: string, bytes: Buffer, copy: boolean): Finding[] {
  const findings = scanText(file, file);
  const content = readContent(file, bytes);
  if (content === "image") return findings;
  if (content === "binary")
    return [...findings, { file, rule: "unscanned-binary", text: file }];
  findings.push(...scanText(file, content.text));
  let value: unknown;
  if (content.kind === "json")
    try {
      value = JSON.parse(content.text);
    } catch {
      value = undefined;
    }
  const shapes =
    value === undefined
      ? packLiterals(content.text).map((text) => ["pack-literal", text])
      : packShapes(value).map((text) => ["pack-file", text]);
  for (const [rule, text] of shapes)
    findings.push({ file, rule: rule!, text: text! });
  if (copy) findings.push(...copyFindings(file, content.text));
  return findings;
}

function scanRepository(): Finding[] {
  return scannedFiles().flatMap((file) =>
    scanFile(file, readFileSync(path.join(ROOT, file)), isCopy(file)),
  );
}

describe("CIS content guardrails", () => {
  it("finds no CIS Benchmark text, Build Kit names, packs or claims in shipped or published files", () => {
    expect(scanRepository()).toEqual([]);
  });

  it("scans the source, assets, samples and copy that ship or are published", () => {
    for (const root of SCAN_ROOTS)
      if (!OPTIONAL_ROOTS.has(root))
        expect(existsSync(path.join(ROOT, root)), root).toBe(true);
    const files = scannedFiles();
    expect(files).toContain("src/lib/compliance/management/crosswalk.ts");
    expect(files).toContain(
      "src/lib/compliance/management/management-report-strings.ts",
    );
    expect(files).toContain("IntuneDocumentation-Sample.pdf");
    expect(files.some((file) => file.startsWith("public/samples/"))).toBe(true);
    expect(files).not.toContain(THIS_FILE);
  });

  it("reads the text of every published PDF or lists it as checked by hand", () => {
    const pdfs = scannedFiles().filter((file) => file.endsWith(".pdf"));
    expect(pdfs.length).toBeGreaterThan(0);
    for (const file of pdfs) {
      const opaque = OPAQUE_PDFS.some((entry) => entry.file === file);
      const text = pdfLiteralText(readFileSync(path.join(ROOT, file)));
      const words = text.match(/[A-Za-z]{4,}/g)?.length ?? 0;
      expect(words > 200, `${file} readable`).toBe(!opaque);
    }
    expect(
      pdfLiteralText(
        readFileSync(path.join(ROOT, "IntuneDocumentation-Sample.pdf")),
      ),
    ).toContain("Intune");
  });

  it("keeps the allowlist to the guardrail itself", () => {
    expect(ALLOWLIST.map((entry) => entry.file)).toEqual([THIS_FILE]);
    for (const entry of OPAQUE_PDFS)
      expect(existsSync(path.join(ROOT, entry.file)), entry.file).toBe(true);
  });
});

describe("CIS content guardrail rules", () => {
  // Probes use the invented product "Fakebook"; they are assembled at runtime.
  const quote = "'";
  const title = (setting: string) =>
    [
      "Ensure",
      `${quote}${setting}${quote}`,
      "is set to",
      `${quote}Enabled${quote}`,
    ].join(" ");
  const cis = "CIS";

  it.each([
    ["ensure-title", title("Fakebook widget")],
    ["level-tagged-title", `(L1) ${title("Fakebook widget")}`],
    ["recommendation-id-title", `18.10.4 ${title("Fakebook widget")}`],
    ["ensure-statement", `"Ensure Fakebook sharing is disabled for all users"`],
    ["ensure-statement", "- Ensure that Fakebook is not configured"],
    ["recommendation-id-title", `1.1.1. ${title("Fakebook widget")}`],
    ["benchmark-product-name", `${cis} Microsoft Fakebook 9 Enterprise`],
    ["benchmark-product-name", "cis_windows_99_fakebook_v9.json"],
    ["benchmark-product-name", "Fakebook_CIS_Samsung_Fakebook"],
    ["benchmark-document-name", `${cis} Fakebook 9.9 Enterprise Benchmark`],
    ["build-kit-level-version", `${cis} Fakebook L1 v9.9.9`],
    ["build-kit-version", `${cis} Fakebook 99 v9.9.9`],
    ["build-kit-level-tag", `${cis} Fakebook (L2) Section 9`],
    ["build-kit-file-name", "Fakebook Benchmark L1+L2 v9.9.9.json"],
    ["cis-claim", `${cis} certified`],
    ["cis-claim", `compliant with ${cis}`],
    ["cis-claim", `${cis} Benchmark certified`],
    ["cis-claim", `compliance with ${cis} Benchmarks`],
    ["cis-claim", `meets ${cis} Level 1`],
    ["cis-claim", `${cis}-konform`],
    ["cis-claim", `zertifiziert nach ${cis}`],
  ])("%s detects %s", (rule, text) => {
    expect(scanText("probe", text).map((finding) => finding.rule)).toContain(
      rule,
    );
  });

  it("lets synthetic titles, generic mentions and the CIS Controls crosswalk pass", () => {
    for (const text of [
      title("Synthetic widget"),
      `${cis} Benchmarks: comparisons against ${cis} Benchmarks are coming soon.`,
      `${cis} Controls safeguard ids from your licensed copy`,
      `${cis} (your crosswalk)`,
      `Not all recommendations from the ${cis} Benchmarks are included in this tool.`,
      "Readiness comparison, not a certification",
      `${cis} Benchmarks readiness, not a certification`,
      "// Ensure the token is set before the request.",
      "/api/cis/v1/packs/other-bench/1.0.0/1",
    ])
      expect(scanText("probe", text), text).toEqual([]);
  });

  it("detects pack, catalog and list shapes unless the benchmark is synthetic", () => {
    const pack = {
      benchmark: "fakebook-9",
      version: "9.9.9",
      level: 1,
      policies: [],
    };
    const list = { benchmark: "fakebook-9", version: "9.9.9", items: [] };
    const catalog = {
      benchmarks: [
        { id: "fakebook-9", name: "x", version: "9.9.9", levels: [1] },
      ],
    };
    expect(packShapes(pack)).toEqual(["benchmark fakebook-9"]);
    expect(packShapes(list)).toEqual(["benchmark fakebook-9"]);
    expect(packShapes(catalog)).toEqual(["catalog entry fakebook-9"]);
    expect(packShapes({ ...pack, benchmark: "synthetic-bench" })).toEqual([]);
    expect(
      packShapes({ benchmark: "fakebook-9", levels: [1], recommendations: [] }),
    ).toEqual(["benchmark fakebook-9"]);
    const literal = (id: string) =>
      `{ benchmark: "${id}", level: 1, policies: [] }`;
    expect(packLiterals(literal("microsoft-fakebook-9"))).toEqual([
      "benchmark microsoft-fakebook-9",
    ]);
    expect(packLiterals(literal("fakebook-win11"))).toEqual([
      "benchmark fakebook-win11",
    ]);
    expect(packLiterals(literal("synthetic-bench"))).toEqual([]);
    expect(packLiterals(literal("other-bench"))).toEqual([]);
  });

  it("reads JSON with a byte order mark, UTF-16 text and flags other binaries", () => {
    const pack = JSON.stringify({ benchmark: "fakebook-9", policies: [] });
    const rules = (file: string, bytes: Buffer) =>
      scanFile(file, bytes, false).map((finding) => finding.rule);
    expect(rules("p.json", Buffer.from(`\uFEFF${pack}`))).toEqual([
      "pack-file",
    ]);
    expect(
      rules(
        "p.txt",
        Buffer.from(`\uFEFF${title("Fakebook widget")}`, "utf16le"),
      ),
    ).toContain("ensure-title");
    expect(rules("kit.zip", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]))).toEqual([
      "unscanned-binary",
    ]);
    expect(rules("logo.png", Buffer.from([0x89, 0x50, 0]))).toEqual([]);
  });

  it("requires coming soon and no benchmark names in customer copy", () => {
    const copy = (text: string) =>
      scanFile("page.mdx", Buffer.from(text), true).map((f) => f.rule);
    expect(copy(`${cis} Benchmarks are supported.`)).toEqual([
      "copy-not-coming-soon",
    ]);
    expect(copy(`Center for Internet Security benchmarks are here.`)).toEqual([
      "copy-not-coming-soon",
    ]);
    expect(copy(`${cis} Benchmarks for Windows 99 are coming soon.`)).toEqual([
      "copy-names-a-benchmark",
    ]);
    expect(
      copy(`- Windows 99 support\n- ${cis} Benchmarks: coming soon.`),
    ).toEqual([]);
  });

  it("reads literal text from a PDF content stream", () => {
    const stream = Buffer.from("BT (Fakebook \\(wrapped\\)) Tj (line) Tj ET");
    const pdf = Buffer.concat([
      Buffer.from(
        "%PDF-1.3\r\n1 0 obj\r\n<</Length 1 /Filter /FlateDecode>> stream\r\n",
      ),
      deflateSync(stream),
      Buffer.from("\r\nendstream\r\nendobj\r\n"),
    ]);
    expect(pdfLiteralText(pdf)).toContain("Fakebook (wrapped) line");
  });
});

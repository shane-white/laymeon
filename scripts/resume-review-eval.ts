/**
 * Runs the resume review's code checks (src/lib/resume-review) on real resume
 * files, to see how the labels hold up outside the generated test fixtures.
 *
 * Put PDF or .docx resumes in scripts/resumes/ (ignored by git: they're
 * personal data). For each file this prints every check that isn't Good, and
 * writes the full results to scripts/resumes/results/<file>.md.
 *
 * The Claude steps (parsing to markdown, and the Career Story extraction with
 * --with-story) are cached in scripts/resumes/.cache/ by the file's content,
 * so running again after changing a check costs nothing. Use --fresh to redo them.
 *
 * Usage: npm run eval:resume-review [-- --with-story] [-- --fresh] [-- file ...]
 * Needs ANTHROPIC_API_KEY in .env.local.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { parseDocument } from "@/lib/ai/parse-document";
import { extractDocument } from "@/lib/profile/extract";
import { EXTRACTION_VERSION, type Extraction } from "@/lib/profile/schema";
import { runCodeChecks } from "@/lib/resume-review/run-checks";
import { readAsSoftware } from "@/lib/resume-review/software-view";
import type { CheckResult } from "@/lib/resume-review/types";

const RESUMES_DIR = join(__dirname, "resumes");
const RESULTS_DIR = join(RESUMES_DIR, "results");
const CACHE_DIR = join(RESUMES_DIR, ".cache");

const MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
};

const LABELS: Record<CheckResult["label"], string> = {
  good: "Good",
  could_improve: "Could improve",
  fix: "Fix this",
  info: "Information",
};

/** Runs `compute` once per key, keeping the result in the cache folder. */
async function cached<T>(key: string, fresh: boolean, compute: () => Promise<T>): Promise<T> {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!fresh && existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  const value = await compute();
  writeFileSync(path, JSON.stringify(value, null, 2));
  return value;
}

function formatResults(file: string, results: CheckResult[], markdown: string): string {
  const lines = [`# ${file}`, ""];
  for (const r of results) {
    lines.push(`## ${LABELS[r.label]}: ${r.id}`, "", r.summary, "");
    for (const e of r.evidence) lines.push(`> ${e.replace(/\n/g, " ")}`, "");
    if (r.data) lines.push(`\`${JSON.stringify(r.data)}\``, "");
  }
  lines.push("---", "", "## What Claude read (parsed markdown)", "", markdown);
  return lines.join("\n");
}

async function reviewFile(path: string, withStory: boolean, fresh: boolean): Promise<void> {
  const file = basename(path);
  const mimeType = MIME_TYPES[extname(path).toLowerCase()];
  if (!mimeType) {
    console.log(`\n${file}: skipped (not a PDF, .docx or .doc)`);
    return;
  }

  const buffer = readFileSync(path);
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const asOf = new Date().toISOString();

  const { markdown } = await cached(`${hash}-markdown`, fresh, () => parseDocument(buffer, mimeType, file));
  const extraction = withStory
    ? await cached<Extraction>(`${hash}-extraction-v${EXTRACTION_VERSION}`, fresh, () =>
        extractDocument(markdown, file, "resume", asOf),
      )
    : null;
  const software = await readAsSoftware(buffer, mimeType);

  const results = runCodeChecks({ markdown, filename: file, mimeType, software, extraction, asOf });
  writeFileSync(join(RESULTS_DIR, `${file}.md`), formatResults(file, results, markdown));

  const counts = Object.fromEntries(
    (Object.keys(LABELS) as CheckResult["label"][]).map((l) => [l, results.filter((r) => r.label === l).length]),
  );
  console.log(
    `\n${file}: ${counts.fix} Fix this, ${counts.could_improve} Could improve, ${counts.info} Information, ${counts.good} Good`,
  );
  for (const r of results.filter((r) => r.label !== "good")) {
    console.log(`  [${LABELS[r.label]}] ${r.id}: ${r.summary}`);
    for (const e of r.evidence.slice(0, 3)) console.log(`      > ${e.replace(/\n/g, " ").slice(0, 140)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const withStory = args.includes("--with-story");
  const fresh = args.includes("--fresh");
  const named = args.filter((a) => !a.startsWith("--"));

  mkdirSync(RESULTS_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  const files = named.length
    ? named.map((f) => resolve(f))
    : readdirSync(RESUMES_DIR)
        .filter((f) => MIME_TYPES[extname(f).toLowerCase()])
        .map((f) => join(RESUMES_DIR, f));

  if (files.length === 0) {
    console.log(`No resumes found. Put PDF or .docx files in ${RESUMES_DIR}, or pass file paths.`);
    return;
  }
  if (!withStory) {
    console.log("Without --with-story, the gap, short-job and bullets-per-job checks are skipped.");
  }

  for (const path of files) {
    try {
      await reviewFile(path, withStory, fresh);
    } catch (err) {
      console.log(`\n${basename(path)}: failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`\nFull results: ${RESULTS_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

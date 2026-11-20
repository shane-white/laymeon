/**
 * Runs the resume review on real resume files, to see how the labels hold up
 * outside the generated test fixtures.
 *
 * Put PDF, Word, RTF or ODT resumes in scripts/resumes/ (ignored by git: they're
 * personal data). For each file this prints every check that isn't Good, and
 * writes the full results to scripts/resumes/results/<file>.md.
 *
 * By default only the code checks (LAY-67) run. With --full, Claude's review
 * (LAY-68) runs too, and the results include the overall label, the fixes in
 * order and the suggested rewrites.
 *
 * The Claude steps (parsing to markdown, the Career Story extraction with
 * --with-story, and Claude's review with --full) are cached in
 * scripts/resumes/.cache/, so running again after changing a check costs
 * nothing. Use --fresh to redo them.
 *
 * Usage: npm run eval:resume-review -- [--with-story] [--full] [--fresh]
 *          [--target-role "Product Manager"] [--as-of 2022-06-01] [file ...]
 * --as-of: the date "Present" means, for old resumes. Defaults to today.
 * Needs ANTHROPIC_API_KEY in .env.local.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseDocument } from "@/lib/ai/parse-document";
import { resolveType } from "@/lib/documents/file-format";
import { extractDocument } from "@/lib/profile/extract";
import { EXTRACTION_VERSION, type Extraction } from "@/lib/profile/schema";
import { buildResumeReview } from "@/lib/resume-review/build-report";
import { generateModelReview, MODEL_REVIEW_VERSION, type ModelReview } from "@/lib/resume-review/model-review";
import type { ResumeReview, ReviewCheck } from "@/lib/resume-review/report-schema";
import { runCodeChecks } from "@/lib/resume-review/run-checks";
import { readAsSoftware } from "@/lib/resume-review/software-view";
import type { CheckResult } from "@/lib/resume-review/types";

const RESUMES_DIR = join(__dirname, "resumes");
const RESULTS_DIR = join(RESUMES_DIR, "results");
const CACHE_DIR = join(RESUMES_DIR, ".cache");

const LABELS: Record<CheckResult["label"], string> = {
  good: "Good",
  could_improve: "Could improve",
  fix: "Fix this",
  info: "Information",
};

const OVERALL_LABELS: Record<ResumeReview["overall"]["label"], string> = {
  ready: "Ready to send",
  few_fixes: "A few fixes",
  needs_work: "Needs work",
};

interface Options {
  withStory: boolean;
  full: boolean;
  fresh: boolean;
  targetRole: string | null;
  asOf: string;
}

type AnyCheck = CheckResult | ReviewCheck;

function hashOf(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);
}

/** Runs `compute` once per key, keeping the result in the cache folder. */
async function cached<T>(key: string, fresh: boolean, compute: () => Promise<T>): Promise<T> {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!fresh && existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
  const value = await compute();
  writeFileSync(path, JSON.stringify(value, null, 2));
  return value;
}

function formatResults(file: string, checks: AnyCheck[], markdown: string, review: ResumeReview | null): string {
  const lines = [`# ${file}`, ""];
  if (review) {
    lines.push(`**Overall: ${OVERALL_LABELS[review.overall.label]}.** ${review.overall.reason}`, "");
    lines.push("## What to do next", "");
    review.nextSteps.forEach((f, i) => lines.push(`${i + 1}. [${LABELS[f.label]}] ${f.text} (${f.checkId})`));
    lines.push("", "## Suggested rewrites", "");
    for (const r of review.rewrites) {
      lines.push(`- **Now:** ${r.current}`, `  **If true, try:** ${r.suggested}`, `  *${r.why}* (${r.checkId})`, "");
    }
    lines.push("# All checks", "");
  }
  for (const c of checks) {
    const source = "source" in c ? ` (${c.source})` : "";
    lines.push(`## ${LABELS[c.label]}: ${c.id}${source}`, "", c.summary, "");
    for (const e of c.evidence) lines.push(`> ${e.replace(/\n/g, " ")}`, "");
    if (c.data) lines.push(`\`${JSON.stringify(c.data)}\``, "");
  }
  lines.push("---", "", "## What Claude read (parsed markdown)", "", markdown);
  return lines.join("\n");
}

async function reviewFile(path: string, options: Options): Promise<void> {
  const { withStory, full, fresh, targetRole, asOf } = options;
  const file = basename(path);
  // From the extension; null if LayMeOn doesn't accept the file.
  const mimeType = resolveType({ type: "", name: path });
  if (!mimeType) {
    console.log(`\n${file}: skipped (not a PDF, Word, RTF or ODT file)`);
    return;
  }

  const buffer = readFileSync(path);
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);

  const { markdown } = await cached(`${hash}-markdown`, fresh, () => parseDocument(buffer, mimeType, file));
  const extraction = withStory
    ? await cached<Extraction>(`${hash}-extraction-v${EXTRACTION_VERSION}`, fresh, () =>
        extractDocument(markdown, file, "resume", asOf),
      )
    : null;
  const software = await readAsSoftware(buffer, mimeType);
  const codeChecks = runCodeChecks({ markdown, filename: file, mimeType, software, extraction, asOf });

  let review: ResumeReview | null = null;
  if (full) {
    // Redone when the prompt, the target role or the code checks' results change.
    const key = hashOf(String(MODEL_REVIEW_VERSION), targetRole ?? "", JSON.stringify(codeChecks));
    const model = await cached<ModelReview>(`${hash}-review-${key}`, fresh, () =>
      generateModelReview(markdown, targetRole, codeChecks),
    );
    review = buildResumeReview(codeChecks, model, markdown);
  }

  const checks: AnyCheck[] = review ? review.checks : codeChecks;
  writeFileSync(join(RESULTS_DIR, `${file}.md`), formatResults(file, checks, markdown, review));

  const count = (label: CheckResult["label"]) => checks.filter((c) => c.label === label).length;
  const overall = review ? ` → ${OVERALL_LABELS[review.overall.label]}` : "";
  console.log(
    `\n${file}${overall}: ${count("fix")} Fix this, ${count("could_improve")} Could improve, ${count("info")} Information, ${count("good")} Good`,
  );
  if (review) console.log(`  ${review.overall.reason}`);
  for (const c of checks.filter((c) => c.label !== "good")) {
    const source = "source" in c && c.source === "model" ? " (Claude)" : "";
    console.log(`  [${LABELS[c.label]}] ${c.id}${source}: ${c.summary}`);
    for (const e of c.evidence.slice(0, 3)) console.log(`      > ${e.replace(/\n/g, " ").slice(0, 140)}`);
  }
  if (review) console.log(`  ${review.rewrites.length} suggested rewrites (in the results file)`);
}

async function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const targetRole = valueOf("--target-role") ?? null;
  const asOfArg = valueOf("--as-of");
  const options: Options = {
    withStory: args.includes("--with-story"),
    full: args.includes("--full"),
    fresh: args.includes("--fresh"),
    targetRole,
    asOf: asOfArg ? new Date(asOfArg).toISOString() : new Date().toISOString(),
  };
  const flagValues = new Set([targetRole, asOfArg].filter((v): v is string => Boolean(v)));
  const named = args.filter((a) => !a.startsWith("--") && !flagValues.has(a));

  mkdirSync(RESULTS_DIR, { recursive: true });
  mkdirSync(CACHE_DIR, { recursive: true });

  const files = named.length
    ? named.map((f) => resolve(f))
    : readdirSync(RESUMES_DIR)
        .filter((f) => resolveType({ type: "", name: f }))
        .map((f) => join(RESUMES_DIR, f));

  if (files.length === 0) {
    console.log(`No resumes found. Put PDF, Word, RTF or ODT files in ${RESUMES_DIR}, or pass file paths.`);
    return;
  }
  if (!options.withStory) {
    console.log("Without --with-story, the gap, short-job and bullets-per-job checks are skipped.");
  }

  for (const path of files) {
    try {
      await reviewFile(path, options);
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

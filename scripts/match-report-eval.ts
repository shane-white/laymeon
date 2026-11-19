/**
 * Runs sample resume/job pairs against the real models several times, and
 * checks that each pair always gets the same overall label, matching
 * expected.json.
 *
 * expected.json can also give `ratings`: phrases mapped to the rating every
 * Requirement whose text contains the phrase should get (strong, partial or
 * missing).
 *
 * A fixture can also give a Career Story: other documents that are extracted
 * (once) into a profile together with the resume. The check is then that each
 * phrase in `careerStory.covers` names a requirement or screener the resume
 * doesn't show and the Career Story does, and that the label is unchanged.
 *
 * Pairs come from scripts/fixtures/match-report. With --private, real pairs
 * in scripts/resumes/match-report/<pair>/ (ignored by git) run too: resume.pdf,
 * resume.docx or resume.md, plus job.md and expected.json. Only use --private
 * when the resumes' owners are fine with the text going to the model APIs.
 *
 * Usage: npm run eval:match-report -- [--runs 3] [--private] [pair-name ...]
 * Needs ANTHROPIC_API_KEY in .env.local.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "@/lib/ai/parse-document";
import { generateMatchReport, type MatchReportStep } from "@/lib/match-report/generate";
import type { MatchReport, Requirement } from "@/lib/match-report/schema";
import { buildProfile } from "@/lib/profile/build";
import { extractDocument, type SourceDocumentType } from "@/lib/profile/extract";
import type { CareerProfile } from "@/lib/profile/schema";

type Rating = Requirement["match"];

interface Expected {
  label: MatchReport["overall"]["label"];
  /** Phrase → the rating every Requirement containing it should get. */
  ratings?: Record<string, Rating>;
  careerStory?: {
    documents: { file: string; type: SourceDocumentType; asOf: string }[];
    /** Phrases naming requirements or screeners the Career Story should cover. */
    covers: string[];
  };
}

interface Pair {
  name: string;
  dir: string;
  resume: string;
  job: string;
  expected: Expected;
}

const FIXTURES_DIR = join(__dirname, "fixtures", "match-report");
const PRIVATE_DIR = join(__dirname, "resumes", "match-report");
// Shared with resume-review-eval, so a resume parsed there isn't parsed again.
const CACHE_DIR = join(__dirname, "resumes", ".cache");

const RESUME_FILES: [file: string, mimeType: string][] = [
  ["resume.pdf", "application/pdf"],
  ["resume.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
];

/** Reads resume.md, or parses resume.pdf or resume.docx once and caches the markdown. */
async function readResume(dir: string): Promise<string> {
  const md = join(dir, "resume.md");
  if (existsSync(md)) return readFileSync(md, "utf8");
  for (const [file, mimeType] of RESUME_FILES) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    const buffer = readFileSync(path);
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    const cachePath = join(CACHE_DIR, `${hash}-markdown.json`);
    if (existsSync(cachePath)) return (JSON.parse(readFileSync(cachePath, "utf8")) as { markdown: string }).markdown;
    const parsed = await parseDocument(buffer, mimeType, file);
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cachePath, JSON.stringify(parsed, null, 2));
    return parsed.markdown;
  }
  throw new Error(`No resume.md, resume.pdf or resume.docx in ${dir}`);
}

async function loadPair(name: string, dir: string): Promise<Pair> {
  return {
    name,
    dir,
    resume: await readResume(dir),
    job: readFileSync(join(dir, "job.md"), "utf8"),
    expected: JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")) as Expected,
  };
}

async function loadPairs(names: string[], includePrivate: boolean): Promise<Pair[]> {
  const roots = [FIXTURES_DIR];
  if (includePrivate) {
    if (existsSync(PRIVATE_DIR)) roots.push(PRIVATE_DIR);
    else console.log(`No private pairs: ${PRIVATE_DIR} doesn't exist.`);
  }
  const found = roots.flatMap((root) =>
    readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: root === PRIVATE_DIR ? `private/${d.name}` : d.name, dir: join(root, d.name) })),
  );
  const chosen = names.length ? found.filter((p) => names.some((n) => p.name === n || p.name === `private/${n}`)) : found;
  return Promise.all(chosen.map((p) => loadPair(p.name, p.dir)));
}

/** Builds the Career Story from the resume and the fixture's other documents. */
async function buildCareerStory(pair: Pair): Promise<CareerProfile> {
  const docs = [
    { file: "resume.md", type: "resume" as const, asOf: "2026-09-01T00:00:00Z", markdown: pair.resume },
    ...pair.expected.careerStory!.documents.map((d) => ({
      ...d,
      markdown: readFileSync(join(pair.dir, d.file), "utf8"),
    })),
  ];
  const extracted = await Promise.all(
    docs.map(async (d) => ({
      document: { id: d.file, name: d.file, type: d.type, markdown: d.markdown, asOf: d.asOf, targetRole: null },
      extraction: await extractDocument(d.markdown, d.file, d.type, d.asOf),
    })),
  );
  return buildProfile(extracted, new Date().toISOString());
}

/** Phrases in `covers` that no shortfall in the report ties to the Career Story. */
function uncovered(report: MatchReport, covers: string[]): string[] {
  const covered = [
    ...report.requirements.filter((r) => r.careerStory.length).map((r) => r.text),
    ...report.screeners.filter((s) => s.careerStory.length).map((s) => s.item),
  ].map((t) => t.toLowerCase());
  return covers.filter((phrase) => !covered.some((t) => t.includes(phrase.toLowerCase())));
}

/** Expected ratings the report doesn't match, one line each. */
function ratingMismatches(report: MatchReport, ratings: Record<string, Rating>): string[] {
  return Object.entries(ratings).flatMap(([phrase, rating]) => {
    const matching = report.requirements.filter((r) => r.text.toLowerCase().includes(phrase.toLowerCase()));
    if (matching.length === 0) return [`"${phrase}": no Requirement mentions it`];
    return matching
      .filter((r) => r.match !== rating)
      .map((r) => `"${phrase}": expected ${rating}, got ${r.match} for "${r.text}"`);
  });
}

// Eligibility questions applicants answer themselves; the report shouldn't list them.
const ELIGIBILITY_PATTERN =
  /authori[sz]|sponsor|citizen|visa\b|criminal|background check|drug (test|screen)/i;

function parseArgs(argv: string[]) {
  let runs = 3;
  let includePrivate = false;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs") runs = Number(argv[++i]);
    else if (argv[i] === "--private") includePrivate = true;
    else names.push(argv[i]);
  }
  return { runs, includePrivate, names };
}

/** Token totals per model across the whole run. */
const usage = new Map<string, { calls: number; input: number; cacheRead: number; cacheWrite: number; output: number }>();

function recordStep(step: MatchReportStep) {
  const total = usage.get(step.model) ?? { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  total.calls += 1;
  total.input += step.usage.input_tokens;
  total.cacheRead += step.usage.cache_read_input_tokens ?? 0;
  total.cacheWrite += step.usage.cache_creation_input_tokens ?? 0;
  total.output += step.usage.output_tokens;
  usage.set(step.model, total);
}

function printUsage() {
  console.log("\nToken usage (Match Report calls only; Career Story extraction and resume parsing not counted):");
  for (const [model, t] of usage) {
    console.log(
      `  ${model}: ${t.calls} calls, ${t.input} input, ${t.cacheRead} cache read, ${t.cacheWrite} cache write, ${t.output} output`,
    );
  }
}

function summarize(report: MatchReport): string {
  const reqs = report.requirements
    .map(
      (r) =>
        `    ${r.importance === "must_have" ? "MUST" : "nice"} ${r.match.padEnd(7)} ${r.text}` +
        (r.careerStory.length ? `  ← Career Story: ${r.careerStory.map((c) => c.label).join("; ")}` : ""),
    )
    .join("\n");
  const words = report.searchWords
    .map((w) => `${w.term}=${w.status}${w.resumeWording ? `(${w.resumeWording})` : ""}`)
    .join(", ");
  const screeners = report.screeners
    .map(
      (s) =>
        `${s.item}=${s.shown ? "shown" : "not shown"}` +
        (s.careerStory.length ? ` (Career Story: ${s.careerStory.map((c) => c.label).join("; ")})` : ""),
    )
    .join(", ");
  return `${reqs}\n    screeners: ${screeners || "none"}\n    search words: ${words}`;
}

async function evalPair(pair: Pair, runs: number): Promise<boolean> {
  const { name, resume, job, expected } = pair;
  // Built once, so the runs differ only in the report.
  const profile = expected.careerStory ? await buildCareerStory(pair) : null;

  const reports = await Promise.all(
    Array.from({ length: runs }, () => generateMatchReport(resume, job, profile, { onStep: recordStep })),
  );
  const missingCoverage = expected.careerStory
    ? reports.map((r) => uncovered(r, expected.careerStory!.covers))
    : [];
  const wrongRatings = expected.ratings ? reports.map((r) => ratingMismatches(r, expected.ratings!)) : [];
  const labels = reports.map((r) => r.overall.label);
  const eligibilityLeaks = reports.flatMap((r) =>
    [...r.screeners.map((s) => s.item), ...r.requirements.map((q) => q.text)].filter((text) =>
      ELIGIBILITY_PATTERN.test(text),
    ),
  );
  const consistent = labels.every((l) => l === labels[0]);
  const correct = labels.every((l) => l === expected.label);
  const coverageOk = missingCoverage.every((m) => m.length === 0);
  const ratingsOk = wrongRatings.every((m) => m.length === 0);
  const ok = consistent && correct && eligibilityLeaks.length === 0 && coverageOk && ratingsOk;

  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: expected ${expected.label}, got [${labels.join(", ")}]`,
  );
  wrongRatings.forEach((wrong, i) => {
    if (wrong.length) console.log(`  run ${i + 1}: ratings:\n${wrong.map((w) => `    ${w}`).join("\n")}`);
  });
  missingCoverage.forEach((missing, i) => {
    if (missing.length) console.log(`  run ${i + 1}: Career Story should cover: ${missing.join(", ")}`);
  });
  if (eligibilityLeaks.length) {
    console.log(`  eligibility questions that should be left out: ${eligibilityLeaks.join("; ")}`);
  }
  if (!ok) {
    reports.forEach((r, i) => console.log(`  run ${i + 1}:\n${summarize(r)}`));
  } else {
    console.log(summarize(reports[0]));
  }
  return ok;
}

async function main() {
  const { runs, includePrivate, names } = parseArgs(process.argv.slice(2));
  const pairs = await loadPairs(names, includePrivate);

  const results = await Promise.all(pairs.map((pair) => evalPair(pair, runs)));
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} pairs passed (${runs} runs each)`);
  printUsage();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  printUsage();
  process.exit(1);
});

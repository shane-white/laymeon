/**
 * Runs the sample resume/job pairs in scripts/fixtures/match-report against
 * the real model several times, and checks that each pair always gets the
 * same overall label, matching expected.json.
 *
 * A fixture can also give a Career Story: other documents that are extracted
 * (once) into a profile together with the resume. The check is then that each
 * phrase in `careerStory.covers` names a requirement or screener the resume
 * doesn't show and the Career Story does, and that the label is unchanged.
 *
 * Usage: npm run eval:match-report [-- --runs 3] [-- fixture-name ...]
 * Needs ANTHROPIC_API_KEY in .env.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateMatchReport } from "@/lib/match-report/generate";
import type { MatchReport } from "@/lib/match-report/schema";
import { buildProfile } from "@/lib/profile/build";
import { extractDocument, type SourceDocumentType } from "@/lib/profile/extract";
import type { CareerProfile } from "@/lib/profile/schema";

interface Expected {
  label: MatchReport["overall"]["label"];
  careerStory?: {
    documents: { file: string; type: SourceDocumentType; asOf: string }[];
    /** Phrases naming requirements or screeners the Career Story should cover. */
    covers: string[];
  };
}

/** Builds the Career Story from the resume and the fixture's other documents. */
async function buildCareerStory(dir: string, resume: string, expected: Expected): Promise<CareerProfile> {
  const docs = [
    { file: "resume.md", type: "resume" as const, asOf: "2026-09-01T00:00:00Z", markdown: resume },
    ...expected.careerStory!.documents.map((d) => ({ ...d, markdown: readFileSync(join(dir, d.file), "utf8") })),
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

// Eligibility questions applicants answer themselves; the report shouldn't list them.
const ELIGIBILITY_PATTERN =
  /authori[sz]|sponsor|citizen|visa\b|criminal|background check|drug (test|screen)/i;

const FIXTURES_DIR = join(__dirname, "fixtures", "match-report");

function parseArgs(argv: string[]) {
  let runs = 3;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs") runs = Number(argv[++i]);
    else names.push(argv[i]);
  }
  return { runs, names };
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

async function evalFixture(name: string, runs: number): Promise<boolean> {
  const dir = join(FIXTURES_DIR, name);
  const resume = readFileSync(join(dir, "resume.md"), "utf8");
  const job = readFileSync(join(dir, "job.md"), "utf8");
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")) as Expected;
  // Built once, so the runs differ only in the report.
  const profile = expected.careerStory ? await buildCareerStory(dir, resume, expected) : null;

  const reports = await Promise.all(
    Array.from({ length: runs }, () => generateMatchReport(resume, job, profile)),
  );
  const missingCoverage = expected.careerStory
    ? reports.map((r) => uncovered(r, expected.careerStory!.covers))
    : [];
  const labels = reports.map((r) => r.overall.label);
  const eligibilityLeaks = reports.flatMap((r) =>
    [...r.screeners.map((s) => s.item), ...r.requirements.map((q) => q.text)].filter((text) =>
      ELIGIBILITY_PATTERN.test(text),
    ),
  );
  const consistent = labels.every((l) => l === labels[0]);
  const correct = labels.every((l) => l === expected.label);
  const coverageOk = missingCoverage.every((m) => m.length === 0);
  const ok = consistent && correct && eligibilityLeaks.length === 0 && coverageOk;

  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: expected ${expected.label}, got [${labels.join(", ")}]`,
  );
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
  const { runs, names } = parseArgs(process.argv.slice(2));
  const fixtures = names.length ? names : readdirSync(FIXTURES_DIR);

  const results = await Promise.all(fixtures.map((name) => evalFixture(name, runs)));
  const failed = results.filter((ok) => !ok).length;
  console.log(`\n${results.length - failed}/${results.length} fixtures passed (${runs} runs each)`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

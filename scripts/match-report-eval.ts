/**
 * Runs the sample resume/job pairs in scripts/fixtures/match-report against
 * the real model several times, and checks that each pair always gets the
 * same overall label, matching expected.json.
 *
 * Usage: npm run eval:match-report [-- --runs 3] [-- fixture-name ...]
 * Needs ANTHROPIC_API_KEY in .env.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { generateMatchReport } from "@/lib/match-report/generate";
import type { MatchReport } from "@/lib/match-report/schema";

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
    .map((r) => `    ${r.importance === "must_have" ? "MUST" : "nice"} ${r.match.padEnd(7)} ${r.text}`)
    .join("\n");
  const words = report.searchWords
    .map((w) => `${w.term}=${w.status}${w.resumeWording ? `(${w.resumeWording})` : ""}`)
    .join(", ");
  const screeners = report.screeners
    .map((s) => `${s.item}=${s.shown ? "shown" : "not shown"}`)
    .join(", ");
  return `${reqs}\n    screeners: ${screeners || "none"}\n    search words: ${words}`;
}

async function evalFixture(name: string, runs: number): Promise<boolean> {
  const dir = join(FIXTURES_DIR, name);
  const resume = readFileSync(join(dir, "resume.md"), "utf8");
  const job = readFileSync(join(dir, "job.md"), "utf8");
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")) as {
    label: MatchReport["overall"]["label"];
  };

  const reports = await Promise.all(
    Array.from({ length: runs }, () => generateMatchReport(resume, job)),
  );
  const labels = reports.map((r) => r.overall.label);
  const eligibilityLeaks = reports.flatMap((r) =>
    [...r.screeners.map((s) => s.item), ...r.requirements.map((q) => q.text)].filter((text) =>
      ELIGIBILITY_PATTERN.test(text),
    ),
  );
  const consistent = labels.every((l) => l === labels[0]);
  const correct = labels.every((l) => l === expected.label);
  const ok = consistent && correct && eligibilityLeaks.length === 0;

  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}: expected ${expected.label}, got [${labels.join(", ")}]`,
  );
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

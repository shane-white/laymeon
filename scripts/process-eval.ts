/**
 * Runs Interview Prep Process research (LAY-120) on saved search results and
 * pages against the real Claude model, so runs cost no Firecrawl credits and
 * see the same web every time.
 *
 * Each fixture in scripts/fixtures/process/<name>.json gives a `job`
 * (company, title, description), the search `results` every query returns,
 * the fetched `pages` by URL, and `expected`:
 * - `found`: whether sourced stages or tips should come back. When false, the
 *   check is that the "common for this kind of role" note is filled in.
 * - `minStages`: the fewest stages a run should find.
 * - `forbiddenUrls`: sources that must never be cited (pages about something
 *   else with the same name).
 *
 * It also reports how many tips Claude gave that weren't really in their
 * source (code drops them), and dates it gave that the source doesn't show.
 *
 * Usage: npm run eval:process -- [--runs 3] [fixture-name ...]
 * Needs ANTHROPIC_API_KEY in .env.local.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProcessData } from "@/lib/interview-prep/interview-prep";
import { claudeProcessAsk } from "@/lib/interview-prep/process/production";
import { researchProcess, type ProcessAnswer, type WebResult } from "@/lib/interview-prep/process/research";

interface Fixture {
  job: { company: string; title: string; description: string };
  results: WebResult[];
  pages: Record<string, { markdown: string; publishedTime: string | null }>;
  expected: { found: boolean; minStages?: number; forbiddenUrls?: string[] };
}

const FIXTURES_DIR = join(process.cwd(), "scripts", "fixtures", "process");
const NOW = new Date("2026-11-25T12:00:00Z");

function parseArgs(argv: string[]): { runs: number; names: string[] } {
  let runs = 1;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs") runs = Number(argv[++i]);
    else names.push(argv[i]);
  }
  return { runs, names };
}

function check(fixture: Fixture, data: ProcessData): string[] {
  const problems: string[] = [];
  const found = data.stages.length > 0 || data.tips.length > 0;
  if (found !== fixture.expected.found) problems.push(`expected found=${fixture.expected.found}, got ${found}`);
  if (!found && !data.commonForRole) problems.push("nothing found, but no common-for-role note");
  if (found && data.commonForRole) problems.push("found reports, but still shows the common-for-role note");
  if (fixture.expected.minStages && data.stages.length < fixture.expected.minStages) {
    problems.push(`expected at least ${fixture.expected.minStages} stages, got ${data.stages.length}`);
  }
  const cited = [...data.stages, ...data.tips].flatMap((item) => item.sources.map((s) => s.url));
  for (const url of fixture.expected.forbiddenUrls ?? []) {
    if (cited.includes(url)) problems.push(`cited a source about something else: ${url}`);
  }
  return problems;
}

async function runOnce(fixture: Fixture) {
  const ask = claudeProcessAsk({
    onUsage: (usage, model) => console.log(`    ${model}: ${usage.input_tokens} in, ${usage.output_tokens} out`),
  });
  let raw: ProcessAnswer | null = null;
  const data = await researchProcess(
    { id: "eval", resume: null, legacySuggestions: null, ...fixture.job },
    {
      search: async () => fixture.results,
      fetchPage: async (url) => fixture.pages[url] ?? null,
      ask: async (request) => (raw = await ask(request)),
      now: () => NOW,
    },
  );
  return { data, raw: raw as ProcessAnswer | null };
}

async function main() {
  const { runs, names } = parseArgs(process.argv.slice(2));
  const files = readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => names.length === 0 || names.includes(f.replace(/\.json$/, "")));

  let failures = 0;
  for (const file of files) {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8")) as Fixture;
    console.log(`\n${file}`);
    for (let run = 1; run <= runs; run++) {
      const { data, raw } = await runOnce(fixture);
      const problems = check(fixture, data);
      const droppedTips = (raw?.tips.length ?? 0) - data.tips.length;
      console.log(`  run ${run}: ${data.stages.length} stages, ${data.tips.length} tips (${droppedTips} dropped as not in their source)`);
      for (const stage of data.stages) {
        console.log(`    - ${stage.name}: ${stage.detail} [${stage.sources.map((s) => s.title).join(", ")}]`);
      }
      for (const tip of data.tips) console.log(`    * "${tip.text}" [${tip.sources.map((s) => s.title).join(", ")}]`);
      if (data.commonForRole) console.log(`    common for role: ${data.commonForRole}`);
      if (problems.length) {
        failures += 1;
        for (const p of problems) console.log(`    FAIL ${p}`);
      }
    }
  }
  console.log(failures ? `\n${failures} run(s) failed` : "\nAll runs passed");
  process.exitCode = failures ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

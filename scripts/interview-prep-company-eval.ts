/**
 * Runs the Interview Prep Company research against the real Claude model with
 * fixed web results, so runs cost no Firecrawl credits and are repeatable.
 *
 * Each fixture in scripts/fixtures/interview-prep-company/<name>/fixture.json
 * gives the Job, the results for the name search, the news search and the
 * company-site search, the pages to fetch (null for one that can't be
 * fetched), and what to expect:
 * - `newsUrls`: the news items that should appear (news from another company
 *   with the same name, or older than 6 months, must not).
 * - `minValues`: at least this many values quoted from the company's site.
 * - `whatTheyDoMentions`: words What they do should contain.
 *
 * Code already drops unsourced items, so the checks are on what Claude picks.
 *
 * Usage: npm run eval:interview-prep-company -- [--runs 3] [fixture-name ...]
 * Needs ANTHROPIC_API_KEY in .env.local.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCompanyModel, type CompanyStep } from "@/lib/interview-prep/company/claude";
import { researchCompany } from "@/lib/interview-prep/company/research";
import type { CompanyWeb, SearchHit } from "@/lib/interview-prep/company/web";
import type { CompanyData } from "@/lib/interview-prep/interview-prep";
import { interviewPrepJob } from "@/lib/interview-prep/testing";

interface Fixture {
  now: string;
  job: { title: string; company: string; description: string };
  nameResults: SearchHit[];
  newsResults: SearchHit[];
  siteResults: SearchHit[];
  pages: Record<string, string | null>;
  expected: { newsUrls: string[]; minValues: number; whatTheyDoMentions: string[] };
}

const FIXTURES = join(__dirname, "fixtures", "interview-prep-company");

function fixtureWeb(fixture: Fixture): CompanyWeb {
  return {
    async search(query, { news }) {
      if (news) return fixture.newsResults;
      if (query.startsWith("site:")) return fixture.siteResults;
      return fixture.nameResults;
    },
    async fetchPage(url) {
      return fixture.pages[url] ?? null;
    },
  };
}

function problems(data: CompanyData, expected: Fixture["expected"]): string[] {
  const found: string[] = [];
  const newsUrls = data.news.map((n) => n.sources[0]?.url).sort();
  const want = [...expected.newsUrls].sort();
  if (JSON.stringify(newsUrls) !== JSON.stringify(want)) {
    found.push(`news: got ${JSON.stringify(newsUrls)}, expected ${JSON.stringify(want)}`);
  }
  if (data.values.length < expected.minValues) found.push(`values: got ${data.values.length}, expected at least ${expected.minValues}`);
  const what = data.whatTheyDo?.text.toLowerCase() ?? "";
  for (const word of expected.whatTheyDoMentions) {
    if (!what.includes(word.toLowerCase())) found.push(`what they do doesn't mention "${word}"`);
  }
  return found;
}

async function main() {
  const args = process.argv.slice(2);
  const runsAt = args.indexOf("--runs");
  const runs = runsAt === -1 ? 1 : Number(args[runsAt + 1]);
  const names = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--runs");
  const fixtures = (names.length ? names : readdirSync(FIXTURES)).map((name) => ({
    name,
    fixture: JSON.parse(readFileSync(join(FIXTURES, name, "fixture.json"), "utf8")) as Fixture,
  }));

  let failures = 0;
  for (const { name, fixture } of fixtures) {
    for (let run = 1; run <= runs; run++) {
      const steps: CompanyStep[] = [];
      const data = await researchCompany(interviewPrepJob({ ...fixture.job }), {
        web: fixtureWeb(fixture),
        model: claudeCompanyModel((step) => steps.push(step)),
        now: () => new Date(fixture.now),
      });
      const found = problems(data, fixture.expected);
      if (found.length) failures++;
      const tokens = steps.map((s) => `${s.step} ${s.usage.input_tokens}in/${s.usage.output_tokens}out`).join(", ");
      console.log(`\n${found.length ? "FAIL" : "PASS"} ${name} run ${run} (${tokens})`);
      for (const p of found) console.log(`  - ${p}`);
      console.log(JSON.stringify(data, null, 2));
    }
  }
  console.log(`\n${failures} failing run(s)`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

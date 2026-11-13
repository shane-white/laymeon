/**
 * Runs the sample résumés in scripts/fixtures/profile through the real model
 * several times, builds a Career Story from each run, and checks that:
 * - every run gives the same position keys (rebuilds are stable),
 * - the same job on two résumés becomes one position,
 * - months of experience land in the expected ranges,
 * - expected skills are found,
 * - no personal details leak into the profile.
 *
 * Usage: npm run eval:profile [-- --runs 3] [-- fixture-name ...]
 * Needs ANTHROPIC_API_KEY in .env.local.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProfile, type ExtractedDocument } from "@/lib/profile/build";
import { extractDocument } from "@/lib/profile/extract";
import type { CareerProfile } from "@/lib/profile/schema";

const FIXTURES_DIR = join(__dirname, "fixtures", "profile");

type Range = [number, number];

interface Expected {
  documents: { file: string; asOf: string }[];
  positions: number;
  totalMonths: Range;
  roles: Record<string, Range>;
  skills: Record<string, Range>;
  requiredSkills: string[];
  certifications: number;
  languages: number;
  forbidden: string[];
}

function parseArgs(argv: string[]) {
  let runs = 3;
  const names: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--runs") runs = Number(argv[++i]);
    else names.push(argv[i]);
  }
  return { runs, names };
}

function inRange(value: number | null | undefined, [min, max]: Range): boolean {
  return value != null && value >= min && value <= max;
}

function check(profile: CareerProfile, expected: Expected): string[] {
  const problems: string[] = [];
  if (profile.positions.length !== expected.positions) {
    problems.push(`expected ${expected.positions} positions, got ${profile.positions.length}`);
  }
  if (!inRange(profile.summary.totalMonths, expected.totalMonths)) {
    problems.push(`total months ${profile.summary.totalMonths}, expected ${expected.totalMonths.join("–")}`);
  }
  for (const [key, range] of Object.entries(expected.roles)) {
    const months = profile.roles.find((r) => r.key === key)?.months;
    if (!inRange(months, range)) problems.push(`role ${key}: ${months ?? "missing"}, expected ${range.join("–")}`);
  }
  for (const [key, range] of Object.entries(expected.skills)) {
    const months = profile.skills.find((s) => s.key === key)?.months;
    if (!inRange(months, range)) problems.push(`skill ${key}: ${months ?? "missing"}, expected ${range.join("–")}`);
  }
  const skillKeys = new Set(profile.skills.map((s) => s.key));
  const missing = expected.requiredSkills.filter((k) => !skillKeys.has(k));
  if (missing.length) problems.push(`missing skills: ${missing.join(", ")}`);
  if (profile.certifications.length !== expected.certifications) {
    problems.push(`expected ${expected.certifications} certifications, got ${profile.certifications.length}`);
  }
  if (profile.languages.length !== expected.languages) {
    problems.push(`expected ${expected.languages} languages, got ${profile.languages.length}`);
  }
  const json = JSON.stringify(profile);
  const leaked = expected.forbidden.filter((text) => json.includes(text));
  if (leaked.length) problems.push(`personal details in the profile: ${leaked.join(", ")}`);
  return problems;
}

function summarize(profile: CareerProfile): string {
  const positions = profile.positions
    .map((p) => `    ${p.key}  ${p.start ?? "?"} → ${p.end ?? "?"}  ${p.months ?? "?"} mo`)
    .join("\n");
  const roles = profile.roles.map((r) => `${r.titleFamily} ${r.months ?? "?"} mo`).join(", ");
  const skills = profile.skills
    .map((s) => `${s.name}${s.months != null ? ` ${s.months}` : ""}`)
    .join(", ");
  return `${positions}\n    total: ${profile.summary.totalMonths} mo · ${profile.summary.seniority}\n    roles: ${roles}\n    skills: ${skills}`;
}

async function runOnce(dir: string, expected: Expected): Promise<CareerProfile> {
  const docs: ExtractedDocument[] = await Promise.all(
    expected.documents.map(async ({ file, asOf }) => {
      const markdown = readFileSync(join(dir, file), "utf8");
      return {
        document: { id: file, name: file, type: "resume" as const, markdown, asOf, targetRole: null },
        extraction: await extractDocument(markdown, file, asOf),
      };
    }),
  );
  return buildProfile(docs, new Date().toISOString());
}

async function evalFixture(name: string, runs: number): Promise<boolean> {
  const dir = join(FIXTURES_DIR, name);
  const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")) as Expected;

  const profiles = await Promise.all(Array.from({ length: runs }, () => runOnce(dir, expected)));
  const problems = profiles.map((p) => check(p, expected));
  const keySets = profiles.map((p) => p.positions.map((pos) => pos.key).join(","));
  const stable = keySets.every((k) => k === keySets[0]);
  const ok = stable && problems.every((p) => p.length === 0);

  console.log(`${ok ? "PASS" : "FAIL"} ${name}${stable ? "" : " (position keys differ between runs)"}`);
  profiles.forEach((profile, i) => {
    if (ok && i > 0) return;
    console.log(`  run ${i + 1}:\n${summarize(profile)}`);
    problems[i].forEach((p) => console.log(`    ✗ ${p}`));
  });
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

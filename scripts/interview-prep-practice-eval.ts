/**
 * Writes the starting Practice Decks (LAY-122) against the real Claude model
 * for a fixed Job, Career Story and research, and checks what code can check:
 *
 * - each Deck starts at its size (6 / 6 / 5 / 5), with no question repeated;
 * - every card has a hint, and behavioral and role cards mostly have
 *   experiences from the Career Story;
 * - an experience from the older job (Brightside), which the Resume leaves
 *   out, is flagged "not on your resume", and one from the job on the Resume
 *   (Acme) isn't;
 * - the process has a portfolio review, so a role card prepares for it;
 * - About this company draws on the news (the self-serve plan).
 * - More like this on the behavioral Deck adds 5 cards, none repeating it.
 *
 * Usage: npm run eval:interview-prep-practice -- [--runs 3]
 * Needs ANTHROPIC_API_KEY in .env.local.
 */
import { buildProfile } from "@/lib/profile/build";
import type { PracticeCard, PracticeData, Research } from "@/lib/interview-prep/interview-prep";
import { sameQuestion } from "@/lib/interview-prep/practice/cards";
import { claudePracticeModel } from "@/lib/interview-prep/practice/claude";
import { DECK_START_SIZE, practiceGenerator, practiceWriter } from "@/lib/interview-prep/practice/writer";
import { interviewPrepJob } from "@/lib/interview-prep/testing";

const RESUME = `# Sam Rivera — Product Designer

**Senior Product Designer** — Acme Payments (2021-03 – present)
- Redesigned checkout; ran a usability test before launch that cut drop-off by 12%
- Led the onboarding flow redesign: activation up 18%
- Built the design system used by 4 product teams

Skills: Figma, usability testing, design systems, prototyping`;

const OLD_RESUME = `# Sam Rivera

**Product Designer** — Brightside Health (2018-01 – 2021-02)
- Designed the patient intake app used by 30 clinics
- Settled a pricing page disagreement with marketing using an A/B test

Skills: Figma, user research`;

const doc = (id: string, name: string, markdown: string, asOf: string) => ({ id, name, type: "resume" as const, markdown, asOf, targetRole: null });

const profile = buildProfile(
  [
    {
      document: doc("resume", "Design Resume", RESUME, "2026-10-01T00:00:00Z"),
      extraction: {
        headline: "Product designer for payments",
        seniority: "senior",
        positions: [
          {
            employer: "Acme Payments",
            title: "Senior Product Designer",
            titleFamily: "Product Designer",
            location: "",
            employmentType: "full_time",
            start: "2021-03",
            end: "present",
            peopleManaged: 0,
            achievements: [
              { text: "Redesigned checkout; ran a usability test before launch that cut drop-off by 12%", metric: "12%", evidence: "Redesigned checkout; ran a usability test before launch that cut drop-off by 12%" },
              { text: "Led the onboarding flow redesign: activation up 18%", metric: "18%", evidence: "Led the onboarding flow redesign: activation up 18%" },
              { text: "Built the design system used by 4 product teams", metric: "4 teams", evidence: "Built the design system used by 4 product teams" },
            ],
            skills: ["Figma", "Usability testing", "Design systems"],
            evidence: "Senior Product Designer** — Acme Payments",
          },
        ],
        skills: [
          { name: "Figma", canonicalName: "Figma", category: "tool", evidence: "Figma" },
          { name: "Usability testing", canonicalName: "Usability testing", category: "hard_skill", evidence: "usability testing" },
          { name: "Design systems", canonicalName: "Design systems", category: "hard_skill", evidence: "design systems" },
        ],
        education: [],
        certifications: [],
        languages: [],
      },
    },
    {
      document: doc("old", "Old Resume", OLD_RESUME, "2021-02-01T00:00:00Z"),
      extraction: {
        headline: "",
        seniority: "experienced",
        positions: [
          {
            employer: "Brightside Health",
            title: "Product Designer",
            titleFamily: "Product Designer",
            location: "",
            employmentType: "full_time",
            start: "2018-01",
            end: "2021-02",
            peopleManaged: 0,
            achievements: [
              { text: "Designed the patient intake app used by 30 clinics", metric: "30 clinics", evidence: "Designed the patient intake app used by 30 clinics" },
              { text: "Settled a pricing page disagreement with marketing using an A/B test", metric: "", evidence: "Settled a pricing page disagreement with marketing using an A/B test" },
            ],
            skills: ["Figma", "User research"],
            evidence: "Product Designer** — Brightside Health",
          },
        ],
        skills: [{ name: "User research", canonicalName: "User research", category: "hard_skill", evidence: "user research" }],
        education: [],
        certifications: [],
        languages: [],
      },
    },
  ],
  "2026-11-01T00:00:00Z",
);

const job = interviewPrepJob({
  title: "Senior Product Designer",
  company: "Ledgerly",
  description:
    "Ledgerly makes invoicing and payments software for small businesses. We're hiring a Senior Product Designer to own the self-serve signup and onboarding experience. You'll run research, prototype in Figma, work closely with engineers and present your work to leadership. 5+ years of product design, a strong portfolio, and experience with design systems.",
  resume: { name: "Design Resume", text: RESUME },
});

const research: Research = {
  process: {
    stages: [
      { name: "Recruiter call", detail: "30 minutes on your background and why Ledgerly.", sources: [] },
      { name: "Portfolio review", detail: "Present two projects to the design team for 45 minutes, then questions.", sources: [] },
      { name: "Design exercise", detail: "A live whiteboard exercise on an onboarding problem.", sources: [] },
    ],
    tips: [{ text: "They care a lot about how you measured the impact of your work.", sources: [] }],
    commonForRole: null,
  },
  company: {
    whatTheyDo: { text: "Invoicing and payments software for small businesses. Series B, about 200 people.", sources: [] },
    news: [
      { date: "2026-10-02", headline: "Ledgerly launched a self-serve plan for freelancers.", howItMightComeUp: "Expect questions on self-serve onboarding.", sources: [] },
      { date: "2026-08-15", headline: "Ledgerly raised a $40M Series B.", howItMightComeUp: "Expect questions on scaling the team.", sources: [] },
    ],
    values: [{ text: "We sweat the small stuff for small businesses.", sources: [] }],
  },
};

function check(data: PracticeData, more: PracticeCard[]): string[] {
  const problems: string[] = [];
  for (const [deck, size] of Object.entries(DECK_START_SIZE)) {
    const n = data.cards.filter((c) => c.deck === deck).length;
    if (n !== size) problems.push(`${deck}: ${n} cards, expected ${size}`);
  }
  const all = [...data.cards, ...more];
  all.forEach((a, i) => {
    if (all.some((b, j) => j < i && a.deck === b.deck && sameQuestion(a.question, b.question))) problems.push(`repeated: "${a.question}"`);
    if (!a.hint) problems.push(`no hint: "${a.question}"`);
  });
  const story = data.cards.filter((c) => c.deck === "behavioral" || c.deck === "role");
  const withExperience = story.filter((c) => (c.hint?.experiences.length ?? 0) > 0).length;
  if (withExperience < story.length - 2) problems.push(`only ${withExperience} of ${story.length} behavioral and role cards have experiences`);

  const experiences = all.flatMap((c) => c.hint?.experiences ?? []);
  const fromOnly = (employer: string) =>
    experiences.filter((e) => e.backedBy.every((s) => s.evidence.some((q) => q.documentName === employer)));
  const brightside = fromOnly("Old Resume");
  if (brightside.length === 0) problems.push("no experience from the older job (Brightside)");
  if (brightside.some((e) => e.onResume !== false)) problems.push("an experience only on the old resume isn't flagged");
  if (fromOnly("Design Resume").some((e) => e.onResume !== true)) problems.push("an experience on the resume is flagged");

  const role = data.cards.filter((c) => c.deck === "role").map((c) => c.question.toLowerCase());
  if (!role.some((q) => q.includes("portfolio") || q.includes("walk us through") || q.includes("walk me through"))) {
    problems.push("no role card prepares for the portfolio review");
  }
  const company = data.cards.filter((c) => c.deck !== "behavioral").map((c) => `${c.question} ${c.hint?.probing}`.toLowerCase());
  if (!company.some((t) => t.includes("self-serve") || t.includes("freelancer"))) problems.push("no card draws on the self-serve launch");
  if (more.length !== 5) problems.push(`More like this added ${more.length} cards, expected 5`);
  return problems;
}

async function main() {
  const at = process.argv.indexOf("--runs");
  const runs = at === -1 ? 1 : Number(process.argv[at + 1]);
  let failures = 0;
  for (let run = 1; run <= runs; run++) {
    const usage: string[] = [];
    const model = claudePracticeModel({ onUsage: (u) => usage.push(`${u.input_tokens}in/${u.output_tokens}out`) });
    const writer = practiceWriter({ model, newId: () => crypto.randomUUID() });
    const started = Date.now();
    const data = await practiceGenerator(writer)({ job, careerStory: profile, previous: null, research: async () => research });
    const seconds = Math.round((Date.now() - started) / 1000);
    const avoid = data.cards.filter((c) => c.deck === "behavioral").map((c) => c.question);
    const more = await writer.write({ job, careerStory: profile, research }, { deck: "behavioral", count: 5, avoid });
    const problems = check(data, more);
    if (problems.length) failures++;
    console.log(`\n${problems.length ? "FAIL" : "PASS"} run ${run} (Decks in ${seconds}s; ${usage.join(", ")})`);
    for (const p of problems) console.log(`  - ${p}`);
    for (const card of [...data.cards, ...more]) {
      console.log(`\n[${card.deck}] ${card.question}\n  listening for: ${card.hint?.probing}\n  shape: ${card.hint?.outline.join(" / ")}`);
      for (const e of card.hint?.experiences ?? []) console.log(`  - ${e.text}${e.onResume === false ? " (not on your resume)" : ""}`);
    }
  }
  console.log(`\n${failures} failing run(s)`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

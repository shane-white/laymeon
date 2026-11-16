/** Whether listed skills are backed up by the experience, and whether any are overused. */
import { skillMatchKey } from "@/lib/profile/keys";
import { check, percent, share, type CheckContext } from "../context";
import { bulletsIn, countTerm, paragraphsIn, sectionsOfKind, stripMarkdown, wordCount } from "../text";
import type { CheckResult } from "../types";

// Share of listed skills that should show up in the experience.
const SHOWN_GOOD = 0.6;
const SHOWN_FIX_BELOW = 0.3;
// The claude-resume-kit threshold: more than this many uses looks like stuffing.
const MAX_USES = 8;
const MAX_SKILL_WORDS = 5;

export function skillChecks(ctx: CheckContext): CheckResult[] {
  const skills = listedSkills(ctx);
  if (skills.length === 0) return [];
  return [shownInContext(ctx, skills), repetition(ctx, skills)];
}

/**
 * The skills in the Skills sections. Handles comma, pipe and bullet lists,
 * and "Languages: Python, SQL" style lines.
 */
export function listedSkills(ctx: CheckContext): string[] {
  const lines = sectionsOfKind(ctx.resume, "skills").flatMap((s) => [...bulletsIn(s.lines), ...paragraphsIn(s.lines)]);
  const skills = lines
    .map(stripMarkdown)
    .map((line) => (line.includes(":") ? line.slice(line.indexOf(":") + 1) : line))
    .flatMap((line) => line.split(/[,;|•·]|\s+-\s+/))
    .map((s) => s.replace(/\(.*?\)/g, "").replace(/^and\s+/i, "").replace(/[.\s]+$/, "").trim())
    // One-letter skills are real ("R", "C"), but only as capitals.
    .filter((s) => (s.length > 1 || /^[A-Z]$/.test(s)) && wordCount(s) <= MAX_SKILL_WORDS);
  const seen = new Set<string>();
  return skills.filter((s) => {
    const key = skillMatchKey(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The resume without its Skills sections. */
function experienceText(ctx: CheckContext): string {
  return ctx.resume.sections
    .filter((s) => s.kind !== "skills")
    .flatMap((s) => s.lines)
    .map(stripMarkdown)
    .join("\n");
}

/**
 * Skills the Career Story says were used in a job, by match key. The
 * extraction knows "Postgres" in a bullet is the listed "PostgreSQL".
 */
function skillsUsedInJobs(ctx: CheckContext): Set<string> {
  const extraction = ctx.input.extraction;
  if (!extraction) return new Set();
  const used = new Set(extraction.positions.flatMap((p) => p.skills.map(skillMatchKey)));
  const keys = new Set<string>();
  for (const s of extraction.skills) {
    if (used.has(skillMatchKey(s.canonicalName))) {
      keys.add(skillMatchKey(s.name));
      keys.add(skillMatchKey(s.canonicalName));
    }
  }
  return keys;
}

function shownInContext(ctx: CheckContext, skills: string[]): CheckResult {
  const text = experienceText(ctx);
  const usedInJobs = skillsUsedInJobs(ctx);
  const notShown = skills.filter((s) => countTerm(text, s) === 0 && !usedInJobs.has(skillMatchKey(s)));
  const shown = share(skills.length - notShown.length, skills.length);
  const data = { listed: skills.length, notShown: notShown.length, share: Number(shown.toFixed(2)) };
  const summary = `${percent(shown)} of the skills you list also appear in your experience.`;

  if (shown >= SHOWN_GOOD) {
    return check("skills.shown_in_context", "good", summary, notShown, data);
  }
  return check(
    "skills.shown_in_context",
    shown < SHOWN_FIX_BELOW ? "fix" : "could_improve",
    `${summary} Screening software and recruiters trust a skill more when a bullet shows you using it. Mention your key skills where you used them.`,
    notShown,
    data,
  );
}

function repetition(ctx: CheckContext, skills: string[]): CheckResult {
  const overused = skills
    .map((s) => ({ skill: s, uses: countTerm(ctx.body, s) }))
    .filter((s) => s.uses > MAX_USES)
    .sort((a, b) => b.uses - a.uses);
  if (overused.length) {
    return check(
      "skills.repetition",
      "could_improve",
      `Some words are used more than ${MAX_USES} times. Repeating keywords doesn't help with modern screening software, and recruiters notice it. Say each one where it matters.`,
      overused.map((s) => `${s.skill}: ${s.uses} times`),
      { overused: overused.length },
    );
  }
  return check("skills.repetition", "good", "No keyword is overused.");
}

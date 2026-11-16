/** Whether listed skills are backed up by the experience, and whether any are overused. */
import { skillMatchKey } from "@/lib/profile/keys";
import { check, percent, share, type CheckContext } from "../context";
import { countTerm, sectionsOfKind, stripMarkdown, tokens, wordCount } from "../text";
import type { CheckResult } from "../types";

// Share of listed skills that should show up in the experience. A list of
// tools usually has more than the bullets mention, so this is never Fix this.
const SHOWN_GOOD = 0.6;
// The claude-resume-kit threshold: more than this many uses looks like stuffing.
const MAX_USES = 8;
const MAX_SKILL_WORDS = 5;
// A descriptive skill ("Asynchronous learning design") counts as shown when this share of its words is.
const PHRASE_SHOWN = 0.6;
// Words compared by their start, so "architecture" matches "architected".
const STEM_LENGTH = 6;

// Common words that show up often on any resume. Using them a lot isn't keyword stuffing.
const GENERIC_WORDS = new Set([
  "development", "design", "production", "management", "leadership", "communication", "data", "analytics",
  "analysis", "research", "strategy", "marketing", "sales", "operations", "engineering", "testing", "writing",
  "product", "project", "programming", "training", "planning", "reporting", "support", "content",
]);

export function skillChecks(ctx: CheckContext): CheckResult[] {
  const skills = listedSkills(ctx);
  if (skills.length === 0) return [];
  return [shownInContext(ctx, skills), repetition(ctx, skills)];
}

const HEADING = /^\s*#{1,6}\s/;
// A line that is only bold or italic text, like "**Development**" or "*Tools:*": a subheading.
const EMPHASIS_ONLY = /^\s*(\*\*|__|\*|_)[^*_]+\1\s*:?\s*$/;
const BULLET = /^\s*(?:[-*+•▪◦‣]|\d+[.)])\s+/;
const LEVEL_IN_PARENS =
  /\(\s*(?:advanced|intermediate|basic|beginner|expert|proficient|fluent|native|working knowledge|familiar|\d+\+?\s*(?:years?|yrs?))\s*\)/gi;

/**
 * A line of prose rather than a list: "Stakeholder coordination across
 * creative, production, and engineering teams". Its first item is a phrase,
 * and there's no "Label:" in front.
 */
function isProse(line: string): boolean {
  if (line.includes(":")) return false;
  const pieces = line.replace(/\(.*?\)/g, "").split(/[,;|•·]/);
  return pieces.length >= 2 && wordCount(pieces[0]) >= 3;
}

/**
 * The skills in the Skills sections. Handles comma, pipe and bullet lists,
 * "Languages: Python, SQL" lines, and "Video editing (Premiere Pro, Camtasia)".
 */
export function listedSkills(ctx: CheckContext): string[] {
  const lines = sectionsOfKind(ctx.resume, "skills")
    .flatMap((s) => s.lines)
    .filter((line) => line.trim() && !HEADING.test(line) && !EMPHASIS_ONLY.test(line))
    .map((line) => stripMarkdown(line.replace(BULLET, "")))
    .filter((line) => !isProse(line));

  const skills = lines
    .map((line) => (line.includes(":") ? line.slice(line.indexOf(":") + 1) : line))
    // "Excel (advanced)" is a level, not a skill; "Video (Premiere Pro, Camtasia)" lists tools.
    .map((line) => line.replace(LEVEL_IN_PARENS, ""))
    .flatMap((line) => line.replace(/[()]/g, ",").split(/[,;|•·]|\s+-\s+/))
    .map((s) => s.replace(/^and\s+/i, "").replace(/[.\s]+$/, "").trim())
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

const stem = (word: string) => word.slice(0, STEM_LENGTH);

/** Whether the experience shows a skill: by name, by one of its "A/B" parts, by its words, or by the Career Story. */
function isShown(skill: string, text: string, textStems: Set<string>, usedInJobs: Set<string>): boolean {
  if (usedInJobs.has(skillMatchKey(skill))) return true;
  const names = [skill, ...(skill.includes("/") ? skill.split("/").map((s) => s.trim()) : [])];
  if (names.some((name) => name.length > 1 && countTerm(text, name) > 0)) return true;
  // A descriptive skill is shown when most of its words are used.
  const words = tokens(skill).filter((w) => w !== "and");
  return words.length >= 2 && share(words.filter((w) => textStems.has(stem(w))).length, words.length) >= PHRASE_SHOWN;
}

function shownInContext(ctx: CheckContext, skills: string[]): CheckResult {
  const text = experienceText(ctx);
  const textStems = new Set(tokens(text).map(stem));
  const usedInJobs = skillsUsedInJobs(ctx);
  const notShown = skills.filter((s) => !isShown(s, text, textStems, usedInJobs));
  const shown = share(skills.length - notShown.length, skills.length);
  const data = { listed: skills.length, notShown: notShown.length, share: Number(shown.toFixed(2)) };
  const summary = `${percent(shown)} of the skills you list also appear in your experience.`;

  if (shown >= SHOWN_GOOD) {
    return check("skills.shown_in_context", "good", summary, notShown, data);
  }
  return check(
    "skills.shown_in_context",
    "could_improve",
    `${summary} Screening software and recruiters trust a skill more when a bullet shows you using it. Mention your most important skills where you used them.`,
    notShown,
    data,
  );
}

function repetition(ctx: CheckContext, skills: string[]): CheckResult {
  const overused = skills
    .filter((s) => !GENERIC_WORDS.has(s.toLowerCase()))
    .map((s) => ({ skill: s, uses: countTerm(ctx.body, s) }))
    .filter((s) => s.uses > MAX_USES)
    .sort((a, b) => b.uses - a.uses);
  if (overused.length) {
    return check(
      "skills.repetition",
      "could_improve",
      `Some keywords are used more than ${MAX_USES} times. Repeating keywords doesn't help with modern screening software, and recruiters notice it. Say each one where it matters.`,
      overused.map((s) => `${s.skill}: ${s.uses} times`),
      { overused: overused.length },
    );
  }
  return check("skills.repetition", "good", "No keyword is overused.");
}

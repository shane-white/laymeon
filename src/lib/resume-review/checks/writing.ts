/** Writing style: pronouns, clichés, signs of AI writing, and consistency. */
import { check, plural, share, type CheckContext } from "../context";
import { bulletsIn, countTerm, paragraphsIn, sectionsOfKind, truncate } from "../text";
import type { CheckResult } from "../types";
import { AI_WORDS, CLICHES, ING_EXCEPTIONS, TACKED_ON_RESULTS } from "../word-lists";

const AI_WORDS_IMPROVE = 3;
const AI_WORDS_FIX = 8;
const MAX_EM_DASHES = 2;
const ING_MIN = 3;
const ING_SHARE = 0.2;
const SAME_OPENER_MIN = 4;
const SAME_OPENER_SHARE = 0.25;
const TACKED_ON_MIN = 3;
// Consistency: a style used by more than this share, but not by everyone, is a mix.
const MIX_MIN_SHARE = 0.15;

export function writingChecks(ctx: CheckContext): CheckResult[] {
  const prose = proseLines(ctx);
  return [
    pronouns(prose),
    cliches(prose),
    aiWords(prose),
    emDashes(ctx),
    ingEndings(ctx),
    repetitiveStructure(ctx),
    consistency(ctx),
  ];
}

/** Sentences the person wrote: bullets and paragraphs, not headings, contact details or skills lists. */
function proseLines(ctx: CheckContext): string[] {
  return ctx.resume.sections
    .filter((s) => !["skills", "education", "certifications", "references"].includes(s.kind))
    .flatMap((s) => [...bulletsIn(s.lines), ...paragraphsIn(s.lines)]);
}

/** Matches of any listed phrase, with how often each appears. */
function findPhrases(lines: string[], phrases: string[]) {
  const text = lines.join("\n");
  return phrases
    .map((phrase) => ({ phrase, count: countTerm(text, phrase) }))
    .filter((p) => p.count > 0);
}

function linesWith(lines: string[], phrases: string[]): string[] {
  return lines.filter((l) => phrases.some((p) => countTerm(l, p) > 0)).map((l) => truncate(l));
}

// "I" as a pronoun. Not "Engineer I" or "Level I", which are job levels.
const FIRST_PERSON =
  /(?<!\b(?:Engineer|Analyst|Developer|Manager|Specialist|Associate|Level|Tier|Grade|Scientist|Designer|Consultant|Technician|Representative|Administrator|Officer|Coordinator|Accountant|Nurse|Teacher|Phase|Part|Type|World War) )\bI\b|\b([Mm]e|[Mm]y|[Mm]ine|[Mm]yself)\b/;

function pronouns(prose: string[]): CheckResult {
  const lines = prose.filter((l) => FIRST_PERSON.test(l));
  if (lines.length === 0) return check("writing.pronouns", "good", 'You don\'t use "I" or "my".');
  return check(
    "writing.pronouns",
    "could_improve",
    `${plural(lines.length, "line uses", "lines use")} "I", "me" or "my". Resumes leave these out: "Led a team of 5", not "I led a team of 5".`,
    lines.map((l) => truncate(l)),
    { lines: lines.length },
  );
}

function cliches(prose: string[]): CheckResult {
  const found = findPhrases(prose, CLICHES);
  if (found.length === 0) return check("writing.cliches", "good", "No clichés.");
  return check(
    "writing.cliches",
    "could_improve",
    'Phrases like "team player" and "results-driven" are on so many resumes that recruiters skip them. Show the quality with something you did instead.',
    found.map((f) => f.phrase),
    { found: found.length },
  );
}

function aiWords(prose: string[]): CheckResult {
  const found = findPhrases(prose, AI_WORDS);
  const total = found.reduce((sum, f) => sum + f.count, 0);
  const data = { total, distinct: found.length };
  if (total < AI_WORDS_IMPROVE) {
    return check("writing.ai_words", "good", "Your wording doesn't read as AI-written.", found.map((f) => f.phrase), data);
  }
  return check(
    "writing.ai_words",
    total >= AI_WORDS_FIX ? "fix" : "could_improve",
    `Words like ${found
      .slice(0, 3)
      .map((f) => `"${f.phrase}"`)
      .join(", ")} are common in AI-written text, and many hiring managers now see that as a red flag. Use plain verbs that say what you did.`,
    linesWith(prose, found.map((f) => f.phrase)),
    data,
  );
}

function emDashes(ctx: CheckContext): CheckResult {
  // Count in the file's own text when there is one: Claude adds dashes of its
  // own when it lays out a .docx as markdown ("Oak | Portland — Technical Lead").
  const text = ctx.input.software?.text ?? ctx.body;
  const count = text.match(/—/g)?.length ?? 0;
  if (count <= MAX_EM_DASHES) return check("writing.em_dashes", "good", "Dashes are used sparingly.", [], { count });
  const lines = text.split("\n").filter((l) => l.includes("—"));
  return check(
    "writing.em_dashes",
    "could_improve",
    `This resume uses ${count} long dashes (—). Lots of them is a common sign of AI-written text. Use commas, or split the sentence.`,
    lines.map((l) => truncate(l)),
    { count },
  );
}

/**
 * Bullets ending in a vague "-ing" phrase: "…, improving team efficiency."
 * One with a number (", saving $120K a year") states a real result, so it doesn't count.
 */
const ING_ENDING = /,\s+(\p{L}+ing)\b[^,;]*$/u;

function ingEndings(ctx: CheckContext): CheckResult {
  const endings = ctx.bullets.filter((b) => {
    const match = ING_ENDING.exec(b.replace(/[.!]+$/, ""));
    return match !== null && !ING_EXCEPTIONS.has(match[1].toLowerCase()) && !/\d/.test(match[0]);
  });
  const data = { count: endings.length, bullets: ctx.bullets.length };
  if (endings.length >= ING_MIN && share(endings.length, ctx.bullets.length) >= ING_SHARE) {
    return check(
      "writing.ing_endings",
      "could_improve",
      `${plural(endings.length, "bullet ends", "bullets end")} with an "-ing" phrase like ", improving efficiency". It's a common AI pattern, and it hides the result. State the result directly, with a number if you can.`,
      endings.map((b) => truncate(b)),
      data,
    );
  }
  return check("writing.ing_endings", "good", 'Your bullets don\'t lean on "-ing" endings.', [], data);
}

function firstWord(bullet: string): string {
  return bullet.split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}-]/gu, "") ?? "";
}

function repetitiveStructure(ctx: CheckContext): CheckResult {
  const counts = new Map<string, number>();
  for (const b of ctx.bullets) {
    const word = firstWord(b);
    if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  const [topWord, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const sameOpener = topCount >= SAME_OPENER_MIN && share(topCount, ctx.bullets.length) >= SAME_OPENER_SHARE;

  const tackedOn = ctx.bullets.filter((b) => TACKED_ON_RESULTS.some((p) => countTerm(b, p) > 0));
  const formulaic = tackedOn.length >= TACKED_ON_MIN;
  const data = { topOpener: topWord, topOpenerCount: topCount, tackedOn: tackedOn.length };

  if (sameOpener || formulaic) {
    const problems = [
      sameOpener && `${topCount} bullets start with "${topWord[0].toUpperCase()}${topWord.slice(1)}"`,
      formulaic && `${tackedOn.length} use "resulting in" or "leading to"`,
    ].filter(Boolean);
    return check(
      "writing.repetitive_structure",
      "could_improve",
      `Many bullets are built the same way (${problems.join("; ")}). It reads as a template. Vary the verbs and how you describe results.`,
      [
        ...ctx.bullets.filter((b) => sameOpener && firstWord(b) === topWord).slice(0, 3),
        ...tackedOn.slice(0, 2),
      ].map((b) => truncate(b)),
      data,
    );
  }
  return check("writing.repetitive_structure", "good", "Your bullets vary in how they're written.", [], data);
}

/** The less common of two styles, if it's common enough to look like a mix. */
function minority<T>(items: T[], test: (item: T) => boolean): T[] | null {
  const yes = items.filter(test);
  const no = items.filter((i) => !test(i));
  const smaller = yes.length <= no.length ? yes : no;
  return smaller.length >= 2 && share(smaller.length, items.length) >= MIX_MIN_SHARE ? smaller : null;
}

function consistency(ctx: CheckContext): CheckResult {
  const bullets = sectionsOfKind(ctx.resume, "experience", "projects").flatMap((s) => bulletsIn(s.lines));
  const periods = minority(bullets, (b) => /[.!]$/.test(b));
  const lowercase = bullets.filter((b) => /^\p{Ll}/u.test(b));

  const problems = [
    periods && "some bullets end with a period and others don't",
    lowercase.length >= 2 && `${lowercase.length} bullets start with a lowercase letter`,
  ].filter((p): p is string => Boolean(p));

  if (problems.length) {
    return check(
      "writing.consistency",
      "could_improve",
      `Small inconsistencies: ${problems.join(", and ")}. Recruiters read them as a lack of care. Pick one style and use it everywhere.`,
      [...(periods ?? []).slice(0, 3), ...lowercase.slice(0, 2)].map((b) => truncate(b)),
      { mixedPeriods: periods !== null, lowercase: lowercase.length },
    );
  }
  return check("writing.consistency", "good", "Punctuation and capitalization are consistent.");
}

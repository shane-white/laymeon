/** Experience bullets: how they start, numbers, length, and how detail is spread across jobs. */
import { check, percent, plural, share, type CheckContext } from "../context";
import { escapeRegExp, paragraphsIn, sectionsOfKind, truncate, wordCount } from "../text";
import type { CheckResult } from "../types";
import { WEAK_OPENERS } from "../word-lists";

const WEAK_OPENER = new RegExp(`^(?:${WEAK_OPENERS.map(escapeRegExp).join("|")})\\b`, "i");

// Share of bullets with a number.
const NUMBERS_GOOD = 0.4;
const NUMBERS_FIX_BELOW = 0.15;

// About two lines on a page at a normal font size.
const LONG_BULLET_WORDS = 30;
const LONG_SHARE_IMPROVE = 0.2;

const MAX_BULLETS_PER_ROLE = 8;
const OLD_ROLE_YEARS = 15;
const OLD_ROLE_MAX_BULLETS = 3;

export function bulletChecks(ctx: CheckContext): CheckResult[] {
  const present = bulletsPresent(ctx);
  const results = [present];
  if (ctx.bullets.length) results.push(weakOpeners(ctx), numbers(ctx), length(ctx));
  if (ctx.positions.length) results.push(perRole(ctx), detailByRecency(ctx));
  return results;
}

function bulletsPresent(ctx: CheckContext): CheckResult {
  if (ctx.bullets.length) {
    return check("bullets.present", "good", `Your experience is written as ${plural(ctx.bullets.length, "bullet point")}.`, [], {
      bullets: ctx.bullets.length,
    });
  }
  const paragraphs = sectionsOfKind(ctx.resume, "experience").flatMap((s) => paragraphsIn(s.lines));
  return check(
    "bullets.present",
    "could_improve",
    "Your experience is written in paragraphs. Recruiters skim, so split each job into 3–6 bullet points, one achievement each.",
    paragraphs.filter((p) => wordCount(p) > 15).map((p) => truncate(p)),
  );
}

function weakOpeners(ctx: CheckContext): CheckResult {
  const weak = ctx.bullets.filter((b) => WEAK_OPENER.test(b));
  const weakShare = share(weak.length, ctx.bullets.length);
  const data = { weak: weak.length, bullets: ctx.bullets.length };
  if (weak.length === 0) {
    return check("bullets.weak_openers", "good", "Your bullets start with what you did.", [], data);
  }
  return check(
    "bullets.weak_openers",
    weakShare >= 0.3 && weak.length >= 2 ? "fix" : "could_improve",
    `${plural(weak.length, "bullet")} ${weak.length === 1 ? "starts" : "start"} with a duty ("Responsible for", "Helped with") instead of an action. Start with a strong verb that says what you did, like "Built", "Cut" or "Led".`,
    weak.map((b) => truncate(b)),
    data,
  );
}

// Digits, money, percentages, and words that are numbers in disguise. Not
// "one" to "ten": "one of the" and "two teams" rarely measure a result.
const HAS_NUMBER = /\d|%|[$£€¥]|\b(doubled|tripled|quadrupled|halved|tenfold|dozens|hundreds|thousands|millions?|billions?)\b/i;

function numbers(ctx: CheckContext): CheckResult {
  const withNumbers = ctx.bullets.filter((b) => HAS_NUMBER.test(b));
  const numberShare = share(withNumbers.length, ctx.bullets.length);
  const without = ctx.bullets.filter((b) => !HAS_NUMBER.test(b));
  const data = { withNumbers: withNumbers.length, bullets: ctx.bullets.length, share: Number(numberShare.toFixed(2)) };
  const summary = `${percent(numberShare)} of your bullets include a number.`;

  if (numberShare >= NUMBERS_GOOD) return check("bullets.numbers", "good", `${summary} That's a good amount.`, [], data);
  return check(
    "bullets.numbers",
    numberShare < NUMBERS_FIX_BELOW ? "fix" : "could_improve",
    `${summary} Numbers (money, time saved, people, growth) make results concrete. Aim for at least 2 in 5.`,
    without.map((b) => truncate(b)),
    data,
  );
}

function length(ctx: CheckContext): CheckResult {
  const long = ctx.bullets.filter((b) => wordCount(b) > LONG_BULLET_WORDS);
  const data = { long: long.length, bullets: ctx.bullets.length };
  if (share(long.length, ctx.bullets.length) > LONG_SHARE_IMPROVE) {
    return check(
      "bullets.length",
      "could_improve",
      `${plural(long.length, "bullet")} ${long.length === 1 ? "runs" : "run"} past two lines. Keep each bullet to one or two lines: the action, then the result.`,
      long.map((b) => truncate(b)),
      data,
    );
  }
  return check("bullets.length", "good", "Your bullets are a good length.", [], data);
}

function describe(p: { title: string; employer: string }): string {
  return [p.title, p.employer].filter(Boolean).join(", ");
}

function perRole(ctx: CheckContext): CheckResult {
  const tooMany = ctx.positions.filter((p) => p.achievements > MAX_BULLETS_PER_ROLE);
  const latest = ctx.positions[0];
  const latestEmpty = ctx.positions.length > 1 && latest.achievements === 0;
  const data = { tooMany: tooMany.length, latestEmpty };

  if (latestEmpty) {
    return check(
      "bullets.per_role",
      "could_improve",
      "Your most recent job has no bullet points. It's the first job recruiters read, so give it 3–6 bullets.",
      [describe(latest)],
      data,
    );
  }
  if (tooMany.length) {
    return check(
      "bullets.per_role",
      "could_improve",
      `${plural(tooMany.length, "job has", "jobs have")} more than ${MAX_BULLETS_PER_ROLE} bullets. Keep the 3–6 strongest, so the best ones stand out.`,
      tooMany.map((p) => `${describe(p)}: ${p.achievements} bullets`),
      data,
    );
  }
  return check("bullets.per_role", "good", "Each job has a sensible number of bullets.", [], data);
}

function detailByRecency(ctx: CheckContext): CheckResult {
  const cutoff = ctx.asOf - OLD_ROLE_YEARS * 12;
  const old = ctx.positions.filter((p) => p.interval && !p.current && p.interval.end < cutoff);
  const oldDetailed = old.filter((p) => p.achievements > OLD_ROLE_MAX_BULLETS);

  const [latest, ...earlier] = ctx.positions;
  const mostEarlier = Math.max(0, ...earlier.map((p) => p.achievements));
  const latestThin = earlier.length > 0 && mostEarlier >= 4 && latest.achievements < mostEarlier / 2;
  const data = { oldDetailed: oldDetailed.length, latestThin };

  if (oldDetailed.length) {
    return check(
      "bullets.detail_by_recency",
      "could_improve",
      `Jobs from more than ${OLD_ROLE_YEARS} years ago get as much space as recent ones. Cut them to a line or two, so recent work gets the attention.`,
      oldDetailed.map((p) => `${describe(p)}: ${p.achievements} bullets`),
      data,
    );
  }
  if (latestThin) {
    return check(
      "bullets.detail_by_recency",
      "could_improve",
      "Your most recent job has much less detail than an earlier one. Recruiters care most about your recent work, so give it the most space.",
      [`${describe(latest)}: ${latest.achievements} bullets`],
      data,
    );
  }
  return check("bullets.detail_by_recency", "good", "Your recent jobs get the most detail.", [], data);
}

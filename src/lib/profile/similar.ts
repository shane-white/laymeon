/**
 * Loose matching for things two documents describe in different words: the
 * same accomplishment reworded between résumé versions, or the same employer
 * written in full on one résumé and shortened on another.
 */
import { normalizeText } from "@/lib/match-report/evidence";

const STOPWORDS = new Set(
  "a an and the of to for in on at by with from into over across our my we i as is was were be been that this their its it via through using while".split(
    " ",
  ),
);

/** Strips common English endings so "clustering", "clustered" and "clusters" match. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .replace(/(\d),(\d)/g, "$1$2") // 1,200 → 1200
      .split(/[^a-z0-9%.]+/)
      .map((w) => w.replace(/^\.+|\.+$/g, ""))
      .filter((w) => w && !STOPWORDS.has(w))
      .map(stem),
  );
}

const NUMBER = /^\d+(\.\d+)?%?$/;

function numbers(words: Set<string>): Set<string> {
  return new Set([...words].filter((w) => NUMBER.test(w)).map((w) => w.replace(/%$/, "")));
}

// Most of the shorter one's words appear in the longer one, and the two share
// at least half their words overall.
const MIN_CONTAINMENT = 0.7;
const MIN_JACCARD = 0.5;
// Too few words to judge: only identical text counts.
const MIN_WORDS = 3;

/**
 * True when two accomplishments are the same one in different words, e.g.
 * "Cut warehouse costs 30% by clustering Snowflake tables" and "Reduced
 * Snowflake warehouse costs by 30% through clustering". Different numbers
 * mean different results, so they never match.
 */
export function sameAccomplishment(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  const shorter = Math.min(ta.size, tb.size);
  if (shorter < MIN_WORDS) return normalizeText(a) === normalizeText(b);

  const na = numbers(ta);
  const nb = numbers(tb);
  if (na.size && nb.size && ![...na].some((n) => nb.has(n))) return false;

  const shared = [...ta].filter((w) => tb.has(w)).length;
  const union = ta.size + tb.size - shared;
  return shared / shorter >= MIN_CONTAINMENT && shared / union >= MIN_JACCARD;
}

/**
 * True when two normalized employer keys (see normalizeEmployer) name the same
 * employer: equal, or one is the other with words added at the end
 * ("lumen" and "lumen-analytics"). Callers must also check the role and
 * dates, since a short name can be the start of a different company's.
 */
export function sameEmployer(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // A one- or two-letter name ("ge", "hp") is too short to match on.
  return short.length >= 3 && long.startsWith(`${short}-`);
}

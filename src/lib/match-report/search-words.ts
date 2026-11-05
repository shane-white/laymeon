import type { SearchWord } from "./schema";

/**
 * Splits text into normalized word tokens for search word matching.
 *
 * - Case-insensitive; markdown escapes and formatting are ignored.
 * - Punctuation separates words, so "CI/CD", "CI-CD" and "CI CD" all give
 *   ["ci", "cd"]. Trailing "+" and "#" stay part of the word ("c++", "c#").
 * - Simple plurals are stripped ("pipelines" → "pipeline", "libraries" → "library").
 */
export function tokenize(text: string): string[] {
  const normalized = text.normalize("NFKC").replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1");
  return (normalized.match(/[\p{L}\p{N}]+[+#]*/gu) ?? []).map(singularize);
}

function singularize(original: string): string {
  // Acronym plurals: APIs → api, KPIs → kpi.
  if (/^[\p{Lu}\p{N}]{2,}s$/u.test(original)) return original.slice(0, -1).toLowerCase();

  const word = original.toLowerCase();
  if (word.length <= 3 || /[+#]$/.test(word)) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

const MAX_JOINED_TOKENS = 3;

/**
 * Builds a matcher over the resume. `contains(phrase)` is true when the
 * phrase's words appear consecutively in the resume, on whole-word
 * boundaries (so "Java" doesn't match "JavaScript"). A phrase also matches
 * when it's written as one word on one side and split on the other
 * ("CI/CD" and "CICD").
 */
export function createResumeMatcher(resume: string) {
  const tokens = tokenize(resume);

  // Every run of 1–3 consecutive resume tokens, joined without separators.
  const joined = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    let run = "";
    for (let k = 0; k < MAX_JOINED_TOKENS && i + k < tokens.length; k++) {
      run += tokens[i + k];
      joined.add(run);
    }
  }

  function containsSequence(phrase: string[]): boolean {
    outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
      for (let j = 0; j < phrase.length; j++) {
        if (tokens[i + j] !== phrase[j]) continue outer;
      }
      return true;
    }
    return false;
  }

  return {
    contains(phrase: string): boolean {
      const words = tokenize(phrase);
      if (words.length === 0) return false;
      if (containsSequence(words)) return true;
      return words.length <= MAX_JOINED_TOKENS && joined.has(words.join(""));
    },
  };
}

export type SearchWordCandidate = {
  wording: string;
  similarity: "same_meaning" | "related";
};

/**
 * Classifies one search word against the resume:
 * - found: the posting's term is in the resume.
 * - similar: the term isn't, but one of the model's proposed wordings is
 *   (the first one present wins).
 * - not_found: neither is. A proposed wording that isn't really in the
 *   resume is never reported.
 */
export function classifySearchWord(
  term: string,
  candidates: SearchWordCandidate[],
  resume: ReturnType<typeof createResumeMatcher>,
): SearchWord {
  if (resume.contains(term)) {
    return { term, status: "found", resumeWording: null, similarity: null };
  }

  const match = candidates.find((c) => resume.contains(c.wording));
  if (match) {
    return {
      term,
      status: "similar",
      resumeWording: match.wording,
      similarity: match.similarity,
    };
  }

  return { term, status: "not_found", resumeWording: null, similarity: null };
}

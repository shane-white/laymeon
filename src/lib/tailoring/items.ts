/**
 * Making a Tailoring's items from its Match Report: picking and ordering
 * them, sorting them by coverage, and checking the Suggestions Claude writes
 * for them against the structured Markdown.
 */
import { normalizeText } from "@/lib/match-report/evidence";
import type { CareerStoryRef, MatchReport } from "@/lib/match-report/schema";
import { findItem, type ListSection } from "@/lib/profile/changes";
import type { CareerProfile, Evidence } from "@/lib/profile/schema";
import { findQuote, findSection, type QuoteSpan } from "./quotes";
import type {
  AddAnchor,
  EvidenceQuote,
  Suggestion,
  SuggestionEvidence,
  SuggestionRequest,
  TailoringItem,
  TailoringTarget,
  WrittenSuggestion,
} from "./tailoring";

interface Picked {
  target: TailoringTarget;
  careerStory: CareerStoryRef[];
}

/**
 * The items a Tailoring covers: missing and partial Requirements, and
 * Screeners not shown, except location Screeners: changing the Resume can't
 * meet them. Older Match Reports' Screeners have no kind and are kept. Must-have before nice-to-have; within each, missing
 * before partial. A Screener counts as must-have and missing, and comes before
 * the Requirements of its rank.
 */
function pickItems(report: MatchReport): Picked[] {
  const screeners: Picked[] = report.screeners
    .filter((s) => !s.shown && s.kind !== "location")
    .map((s) => ({ target: { kind: "screener", text: s.item }, careerStory: s.careerStory }));
  const requirements: Picked[] = report.requirements.flatMap((r) =>
    r.match === "strong"
      ? []
      : [
          {
            target: { kind: "requirement", text: r.text, importance: r.importance, category: r.category, match: r.match },
            careerStory: r.careerStory,
          },
        ],
  );
  const rank = ({ target }: Picked) =>
    target.kind === "screener"
      ? 0
      : (target.importance === "must_have" ? 0 : 2) + (target.match === "missing" ? 0 : 1);
  // Array.prototype.sort is stable, so the Match Report's order is kept within a rank.
  return [...screeners, ...requirements].sort((a, b) => rank(a) - rank(b));
}

/** The Tailoring's items for a Match Report, with new IDs, each undecided and with no Suggestion yet. */
export function newItems(report: MatchReport, newId: () => string): TailoringItem[] {
  return pickItems(report).map(({ target, careerStory }) => ({
    id: newId(),
    target,
    careerStory,
    suggestion: null,
    gap: true,
    decision: { status: "undecided" },
  }));
}

const LIST_SECTIONS: readonly string[] = ["position", "skill", "accomplishment", "education", "certification", "language"];

/** The Evidence quotes of the Career Story item a Match Report link points at. */
function quotesOf(ref: CareerStoryRef, profile: CareerProfile | null): EvidenceQuote[] {
  if (!profile || !LIST_SECTIONS.includes(ref.section)) return [];
  const found = findItem(profile, ref.section as ListSection, ref.key);
  const evidence = (found?.evidence ?? []) as Evidence[];
  return evidence.map((e) => ({
    documentId: e.documentId,
    documentName: profile.sources.find((s) => s.documentId === e.documentId)?.documentName ?? null,
    quote: e.quote,
  }));
}

/**
 * What to ask Claude for: a Suggestion for each item the Career Story covers,
 * and a rewording Suggestion for each partial Requirement it doesn't. Missing
 * items and Screeners it doesn't cover are gaps, with nothing to ask for.
 */
export function suggestionRequests(items: TailoringItem[], profile: CareerProfile | null): SuggestionRequest[] {
  return items.flatMap((item): SuggestionRequest[] => {
    if (item.careerStory.length > 0) {
      const sources = item.careerStory.map((ref) => ({ label: ref.label, quotes: quotesOf(ref, profile).map((q) => q.quote) }));
      return [{ itemId: item.id, target: item.target, basis: "career_story", sources }];
    }
    if (item.target.kind === "requirement" && item.target.match === "partial") {
      return [{ itemId: item.id, target: item.target, basis: "resume", sources: [] }];
    }
    return [];
  });
}

/** Where in the Markdown the text each of the items' Rewrites replaces is. */
function rewriteSpans(items: TailoringItem[], markdown: string): QuoteSpan[] {
  return items.flatMap((item) => {
    const span = item.suggestion?.kind === "rewrite" ? findQuote(markdown, item.suggestion.quote) : null;
    return span ? [span] : [];
  });
}

/**
 * The Suggestion Claude wrote, with its quotes and heading exactly as they are
 * in the Markdown, or null if any of them isn't there (or is there more than
 * once), it's a Rewrite whose text overlaps one of `taken` (other items'
 * Rewrites), or it's otherwise unusable. `evidence` gives its Evidence, given
 * a Rewrite's quote.
 */
function checked(
  written: WrittenSuggestion,
  basis: SuggestionRequest["basis"],
  markdown: string,
  taken: QuoteSpan[],
  evidence: (rewriteQuote: string | null) => SuggestionEvidence[],
): Suggestion | null {
  const text = written.text.trim();
  const why = written.why.trim();
  if (!text || !why) return null;
  const quoted = (quote: string) => {
    const span = findQuote(markdown, quote);
    return span && markdown.slice(span.start, span.end);
  };

  if (written.kind === "rewrite") {
    const span = findQuote(markdown, written.quote);
    if (!span || taken.some((other) => span.start < other.end && other.start < span.end)) return null;
    const quote = markdown.slice(span.start, span.end);
    if (normalizeText(quote) === normalizeText(text)) return null;
    return { kind: "rewrite", quote, text, why, evidence: evidence(quote) };
  }

  // A rewording Suggestion can only reword what's there.
  if (basis === "resume") return null;
  let anchor: AddAnchor | null = null;
  if (written.quote.trim()) {
    const quote = quoted(written.quote);
    anchor = quote ? { type: "after", quote } : null;
  } else {
    const heading = findSection(markdown, written.section);
    anchor = heading ? { type: "section", heading } : null;
  }
  if (!anchor) return null;
  return { kind: "add", anchor, text, why, evidence: evidence(null) };
}

/** The first of the written Suggestions for the item that's usable, or null. */
function firstUsable(
  item: TailoringItem,
  written: WrittenSuggestion[],
  basis: SuggestionRequest["basis"],
  markdown: string,
  taken: QuoteSpan[],
  evidence: (rewriteQuote: string | null) => SuggestionEvidence[],
): Suggestion | null {
  for (const w of written.filter((w) => w.itemId === item.id)) {
    const suggestion = checked(w, basis, markdown, taken, evidence);
    if (suggestion) return suggestion;
  }
  return null;
}

/**
 * The items with the Suggestions Claude wrote for them: at most one each, the
 * first usable one. Suggestions for items that weren't asked for, ones whose
 * quote or section isn't in the Markdown (or whose quote is in it more than
 * once), and Rewrites whose text overlaps an earlier item's Rewrite, are
 * dropped, so every Rewrite has text of its own to replace. An item left
 * without a Suggestion is a gap; so is a partial Requirement the Career Story
 * doesn't cover, even with its rewording Suggestion.
 */
export function withSuggestions(
  items: TailoringItem[],
  requests: SuggestionRequest[],
  written: WrittenSuggestion[],
  markdown: string,
  profile: CareerProfile | null,
): TailoringItem[] {
  const taken: QuoteSpan[] = [];
  return items.map((item) => {
    const request = requests.find((r) => r.itemId === item.id);
    const evidence = (rewriteQuote: string | null): SuggestionEvidence[] =>
      request?.basis === "resume" && rewriteQuote
        ? [{ source: "resume", quote: rewriteQuote }]
        : item.careerStory.map((ref) => ({ source: "career_story", ...ref, quotes: quotesOf(ref, profile) }));
    const suggestion = request ? firstUsable(item, written, request.basis, markdown, taken, evidence) : null;
    taken.push(...rewriteSpans([{ ...item, suggestion }], markdown));
    return { ...item, suggestion, gap: request?.basis !== "career_story" || suggestion === null };
  });
}

/** What to ask Claude for to fill a gap: a Suggestion based only on the Example Work the user wrote for it. */
export function exampleWorkRequest(item: TailoringItem, exampleWork: { title: string; description: string }): SuggestionRequest {
  return {
    itemId: item.id,
    target: item.target,
    basis: "example_work",
    sources: [{ label: exampleWork.title, quotes: [exampleWork.description] }],
  };
}

/**
 * The gap's Suggestion from the ones Claude wrote for its Example Work, with
 * the Example Work as its Evidence, or null if none is usable. A Rewrite whose
 * text overlaps one of the Tailoring's other `items`' Rewrites isn't usable.
 */
export function exampleWorkSuggestion(
  item: TailoringItem,
  items: TailoringItem[],
  written: WrittenSuggestion[],
  markdown: string,
  exampleWork: { documentId: string; title: string },
): Suggestion | null {
  const taken = rewriteSpans(items.filter((other) => other.id !== item.id), markdown);
  return firstUsable(item, written, "example_work", markdown, taken, () => [{ source: "example_work", ...exampleWork }]);
}

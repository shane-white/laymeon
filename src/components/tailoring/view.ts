/**
 * The Tailoring view's model: the Tailoring's structured Markdown as plain
 * Resume blocks, with each item's Suggestion or gap marked where it applies.
 * Pure, so the view only renders what this returns.
 */
import { findQuote } from "@/lib/tailoring/quotes";
import {
  acceptedText,
  addLineIndex,
  LIST_MARK,
  markdownLines,
  plainText,
  type LineKind,
  type MarkdownLine,
} from "@/lib/tailoring/resume-markdown";
import type { Decision, Tailoring, TailoringItem } from "@/lib/tailoring/tailoring";

export { acceptedText, plainText };

/**
 * A run of text inside a block:
 * - `text`: the Resume's own text.
 * - `rewrite`: the text a Rewrite would change, or the text that replaced it
 *   once it's accepted.
 * `number` is the item's place in the Tailoring's order, from 1.
 */
export type ViewInline =
  | { kind: "text"; text: string }
  | { kind: "rewrite"; itemId: string; number: number; text: string; status: Decision["status"] };

/** One line of the Resume's own text. */
export type TextBlock = LineKind & { inlines: ViewInline[] };

/**
 * Where an Add's new text goes: its accepted text, or null for a placeholder.
 * `bullet` when it goes in a list.
 */
export interface AddBlock {
  kind: "add";
  itemId: string;
  number: number;
  text: string | null;
  status: Decision["status"];
  bullet: boolean;
}

/** One block of the Resume as shown. */
export type ViewBlock = TextBlock | AddBlock;

/** An item with no place in the Resume: a gap, or a Suggestion whose quote or anchor isn't found. */
export interface ViewMarker {
  itemId: string;
  number: number;
  /** The Requirement or Screener it's aimed at. */
  label: string;
  status: Decision["status"];
}

export interface ResumeView {
  blocks: ViewBlock[];
  /** Shown apart from the Resume, in the items' order. */
  markers: ViewMarker[];
}

interface RewriteSpan {
  start: number;
  end: number;
  itemId: string;
  number: number;
  status: Decision["status"];
  /** The accepted text that replaces the quote, or null while it isn't accepted. */
  replacement: string | null;
}

/**
 * Where each Rewrite's quote is in the Markdown, in Markdown order. Rewrites
 * never overlap (one that overlaps an earlier item's is dropped when it's
 * written); should one, it's left out here as it is from the download.
 */
function rewriteSpans(tailoring: Tailoring): RewriteSpan[] {
  const spans: RewriteSpan[] = [];
  tailoring.items.forEach((item, index) => {
    if (item.suggestion?.kind !== "rewrite") return;
    const span = findQuote(tailoring.markdown, item.suggestion.quote);
    if (!span || spans.some((other) => span.start < other.end && other.start < span.end)) return;
    spans.push({ ...span, itemId: item.id, number: index + 1, status: item.decision.status, replacement: acceptedText(item) });
  });
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * A line's text, split where Rewrites start and end. An accepted Rewrite's
 * text is shown once, on the line its quote starts on.
 */
function lineInlines(markdown: string, line: MarkdownLine, spans: RewriteSpan[]): ViewInline[] {
  const inlines: ViewInline[] = [];
  const pushText = (from: number, to: number) => {
    const text = plainText(markdown.slice(from, to));
    if (text) inlines.push({ kind: "text", text });
  };
  let at = line.start;
  for (const span of spans) {
    if (span.end <= line.start || span.start >= line.end) continue;
    const start = Math.max(span.start, line.start);
    const end = Math.min(span.end, line.end);
    pushText(at, start);
    at = end;
    const { itemId, number, status, replacement } = span;
    if (replacement !== null && span.start < line.start) continue;
    const text = replacement ?? plainText(markdown.slice(start, end));
    inlines.push({ kind: "rewrite", itemId, number, text, status });
  }
  pushText(at, line.end);
  return inlines;
}

/** An Add's text as shown: plain, without a leading list mark. */
function addText(text: string): string {
  return plainText(text.trim().replace(LIST_MARK, ""));
}

/** The Tailoring's Resume as blocks of plain text, with its items marked. */
export function resumeView(tailoring: Tailoring): ResumeView {
  const { markdown } = tailoring;
  const all = markdownLines(markdown);
  const spans = rewriteSpans(tailoring);

  const addsAfter = new Map<number, AddBlock[]>();
  tailoring.items.forEach((item, index) => {
    if (item.suggestion?.kind !== "add") return;
    const at = addLineIndex(markdown, all, item.suggestion.anchor);
    if (at === null) return;
    const text = acceptedText(item);
    addsAfter.set(at, [
      ...(addsAfter.get(at) ?? []),
      {
        kind: "add",
        itemId: item.id,
        number: index + 1,
        text: text === null ? null : addText(text),
        status: item.decision.status,
        bullet: all[at]?.block.kind === "bullet",
      },
    ]);
  });

  const blocks: ViewBlock[] = [...(addsAfter.get(-1) ?? [])];
  all.forEach((line, i) => {
    const inlines = lineInlines(markdown, line, spans);
    // Leave out a line all of whose text an accepted Rewrite on an earlier line replaced.
    if (inlines.length > 0) blocks.push({ ...line.block, inlines } as TextBlock);
    blocks.push(...(addsAfter.get(i) ?? []));
  });

  const placed = new Set([
    ...spans.map((span) => span.itemId),
    ...[...addsAfter.values()].flat().map((add) => add.itemId),
  ]);
  const markers = tailoring.items.flatMap((item, index) =>
    placed.has(item.id)
      ? []
      : [{ itemId: item.id, number: index + 1, label: item.target.text, status: item.decision.status }],
  );
  return { blocks, markers };
}

/**
 * The item after (or before) the selected one in the Tailoring's order, or
 * null past either end. With none selected, the first item.
 */
export function stepItem(items: TailoringItem[], selectedId: string | null, direction: "next" | "previous"): string | null {
  const index = items.findIndex((item) => item.id === selectedId);
  if (index === -1) return items[0]?.id ?? null;
  return items[direction === "next" ? index + 1 : index - 1]?.id ?? null;
}

/**
 * How many Suggestions put text on the Resume (accepted, edited or own text),
 * out of the items that have one. Gaps without a Suggestion don't count.
 */
export function acceptedCount(items: TailoringItem[]): { accepted: number; total: number } {
  return {
    accepted: items.filter((item) => acceptedText(item) !== null).length,
    total: items.filter((item) => item.suggestion !== null).length,
  };
}

/** The Tailoring with the decision recorded on one item, as the server will save it. */
export function withDecision(tailoring: Tailoring, itemId: string, decision: Decision): Tailoring {
  return { ...tailoring, items: tailoring.items.map((item) => (item.id === itemId ? { ...item, decision } : item)) };
}

/**
 * The decisions the user can make on an item, besides undoing one: an item
 * with a Suggestion can be accepted, edited, given own text or rejected; a gap
 * can be skipped. The server allows the same.
 */
export function allowedDecisions(item: TailoringItem): Exclude<Decision["status"], "undecided">[] {
  return [...(item.suggestion ? (["accepted", "edited", "own_text", "rejected"] as const) : []), ...(item.gap ? (["skipped"] as const) : [])];
}

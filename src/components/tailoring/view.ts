/**
 * The Tailoring view's model: the Tailoring's structured Markdown as plain
 * Resume blocks, with each item's Suggestion or gap marked where it applies.
 * Pure, so the view only renders what this returns.
 */
import { normalizeText } from "@/lib/match-report/evidence";
import { findQuote } from "@/lib/tailoring/quotes";
import type { AddAnchor, Decision, Tailoring, TailoringItem } from "@/lib/tailoring/tailoring";

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

type LineKind = { kind: "heading"; level: number } | { kind: "bullet" } | { kind: "paragraph" };

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

/** An item with no place in the Resume: a gap, or a Suggestion whose text another one already highlights. */
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

interface Line {
  /** Where the line starts in the Markdown. */
  lineStart: number;
  /** Where the line's text starts in the Markdown, after any heading or bullet mark. */
  start: number;
  end: number;
  block: LineKind;
}

/** The Markdown's non-blank lines, with what kind of block each is. */
function lines(markdown: string): Line[] {
  const result: Line[] = [];
  let offset = 0;
  for (const raw of markdown.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + raw.length;
    offset = lineEnd + 1;
    if (!raw.trim()) continue;
    const heading = raw.match(/^(#{1,6})\s+/);
    const bullet = raw.match(/^\s*(?:[-*+•]|\d+[.)])\s+/);
    if (heading) {
      result.push({ lineStart, start: lineStart + heading[0].length, end: lineEnd, block: { kind: "heading", level: heading[1].length } });
    } else if (bullet) {
      result.push({ lineStart, start: lineStart + bullet[0].length, end: lineEnd, block: { kind: "bullet" } });
    } else {
      result.push({ lineStart, start: lineStart + (raw.length - raw.trimStart().length), end: lineEnd, block: { kind: "paragraph" } });
    }
  }
  return result;
}

/** Markdown text as it's read: without emphasis and code marks, escapes or a heading's closing `#`s. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+#+\s*$/, "");
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
 * The text an item puts on the Resume: its Suggestion's text when accepted,
 * the user's text when edited or their own, otherwise null.
 */
export function acceptedText(item: TailoringItem): string | null {
  if (!item.suggestion) return null;
  const { decision } = item;
  if (decision.status === "accepted") return item.suggestion.text;
  if (decision.status === "edited" || decision.status === "own_text") return decision.text;
  return null;
}

/**
 * Where each Rewrite's quote is in the Markdown, in Markdown order. A Rewrite
 * whose text overlaps an earlier item's is left out.
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
function lineInlines(markdown: string, line: Line, spans: RewriteSpan[]): ViewInline[] {
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

/**
 * The index of the line an Add goes after: the line holding the end of its
 * quote, or the last line of its section. Null if it isn't found.
 */
function addLine(markdown: string, all: Line[], anchor: AddAnchor): number | null {
  if (anchor.type === "after") {
    const span = findQuote(markdown, anchor.quote);
    if (!span) return null;
    return all.findLastIndex((line) => line.lineStart < span.end);
  }
  const wanted = normalizeText(anchor.heading);
  const heading = all.findIndex(
    (line) => line.block.kind === "heading" && normalizeText(plainText(markdown.slice(line.start, line.end))) === wanted,
  );
  if (heading === -1) return null;
  const { block } = all[heading];
  const level = block.kind === "heading" ? block.level : 0;
  const next = all.findIndex((line, i) => i > heading && line.block.kind === "heading" && line.block.level <= level);
  return (next === -1 ? all.length : next) - 1;
}

/** An Add's text as shown: plain, without a leading list mark. */
function addText(text: string): string {
  return plainText(text.trim().replace(/^(?:[-*+•]|\d+[.)])\s+/, ""));
}

/** The Tailoring's Resume as blocks of plain text, with its items marked. */
export function resumeView(tailoring: Tailoring): ResumeView {
  const { markdown } = tailoring;
  const all = lines(markdown);
  const spans = rewriteSpans(tailoring);

  const addsAfter = new Map<number, AddBlock[]>();
  tailoring.items.forEach((item, index) => {
    if (item.suggestion?.kind !== "add") return;
    const at = addLine(markdown, all, item.suggestion.anchor);
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

/** How many items put text on the Resume (accepted, edited or own text), out of all of them. */
export function acceptedCount(items: TailoringItem[]): { accepted: number; total: number } {
  return { accepted: items.filter((item) => acceptedText(item) !== null).length, total: items.length };
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

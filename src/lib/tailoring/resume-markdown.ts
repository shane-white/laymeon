/**
 * Reading a Tailoring's structured Markdown line by line, and where its
 * items' text goes. Shared by the Tailoring view and the outputs, so the
 * Resume with the accepted Suggestions that the user downloads matches the
 * one they see.
 */
import { normalizeText } from "@/lib/match-report/evidence";
import { findQuote } from "./quotes";
import type { AddAnchor, TailoringItem } from "./tailoring";

export type LineKind = { kind: "heading"; level: number } | { kind: "bullet" } | { kind: "paragraph" };

/** One non-blank line of the Markdown. */
export interface MarkdownLine {
  /** Where the line starts in the Markdown. */
  lineStart: number;
  /** Where the line's text starts in the Markdown, after any heading or bullet mark. */
  start: number;
  /** Where the line ends, before its newline. */
  end: number;
  block: LineKind;
}

/** A list mark at the start of a line, with the space after it. */
export const LIST_MARK = /^\s*(?:[-*+•]|\d+[.)])\s+/;

/** The Markdown's non-blank lines, with what kind of block each is. */
export function markdownLines(markdown: string): MarkdownLine[] {
  const result: MarkdownLine[] = [];
  let offset = 0;
  for (const raw of markdown.split("\n")) {
    const lineStart = offset;
    const lineEnd = offset + raw.length;
    offset = lineEnd + 1;
    if (!raw.trim()) continue;
    const heading = raw.match(/^(#{1,6})\s+/);
    const bullet = raw.match(LIST_MARK);
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
 * The index (in `lines`) of the line an Add goes after: the line holding the
 * end of its quote, or the last line of its section (before the next heading
 * of the same or a higher level). -1 for before the first line; null if the
 * anchor isn't found.
 */
export function addLineIndex(markdown: string, lines: MarkdownLine[], anchor: AddAnchor): number | null {
  if (anchor.type === "after") {
    const span = findQuote(markdown, anchor.quote);
    if (!span) return null;
    return lines.findLastIndex((line) => line.lineStart < span.end);
  }
  const wanted = normalizeText(anchor.heading);
  const heading = lines.findIndex(
    (line) => line.block.kind === "heading" && normalizeText(plainText(markdown.slice(line.start, line.end))) === wanted,
  );
  if (heading === -1) return null;
  const { block } = lines[heading];
  const level = block.kind === "heading" ? block.level : 0;
  const next = lines.findIndex((line, i) => i > heading && line.block.kind === "heading" && line.block.level <= level);
  return (next === -1 ? lines.length : next) - 1;
}

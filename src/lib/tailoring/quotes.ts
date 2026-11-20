/**
 * Finding a Suggestion's quotes and sections in a Tailoring's structured
 * Markdown. Matching is the same as for Match Report Evidence
 * (`normalizeText`), but these give back where in the Markdown the quote is,
 * so it can be highlighted and replaced.
 */
import { normalizeText } from "@/lib/match-report/evidence";

/** Where a quote is in the Markdown: `markdown.slice(start, end)`. */
export interface QuoteSpan {
  start: number;
  end: number;
}

const MARKDOWN_ESCAPABLE = "\\`*_{}[]()#+-.!|>";

/**
 * The Markdown folded the way `normalizeText` folds it, with the Markdown
 * position each folded character came from (`from`) and the position just
 * after it (`to`).
 */
function fold(markdown: string): { folded: string; from: number[]; to: number[] } {
  let folded = "";
  const from: number[] = [];
  const to: number[] = [];
  let lineStart = true;

  const emit = (text: string, start: number, end: number) => {
    for (const ch of text) {
      const space = /\s/.test(ch);
      // Collapse whitespace; drop it at the start.
      if (space && (folded === "" || folded.endsWith(" "))) continue;
      folded += space ? " " : ch;
      from.push(start);
      to.push(end);
    }
  };

  for (let i = 0; i < markdown.length; ) {
    const codePoint = markdown.codePointAt(i)!;
    const raw = String.fromCodePoint(codePoint);
    const end = i + raw.length;
    if (raw === "\n") {
      lineStart = true;
      emit(" ", i, end);
      i = end;
      continue;
    }
    // A Markdown escape: keep the escaped character, drop the backslash.
    if (raw === "\\" && i + 1 < markdown.length && MARKDOWN_ESCAPABLE.includes(markdown[i + 1])) {
      lineStart = false;
      emit(markdown[i + 1], i, i + 2);
      i += 2;
      continue;
    }
    let ch = raw.normalize("NFKC").toLowerCase();
    // A list bullet at the start of a line counts as a space.
    if (lineStart && /^[-+•]$/.test(ch) && /\s/.test(markdown[end] ?? "")) ch = " ";
    else if (!/^\s+$/.test(ch)) lineStart = false;
    ch = ch
      .replace(/[‘’‚‛′]/g, "'")
      .replace(/[“”„‟″]/g, '"')
      .replace(/[‐‑‒–—―−]/g, "-")
      .replace(/…/g, "...")
      .replace(/[*_`#>|]/g, " ");
    emit(ch, i, end);
    i = end;
  }
  return { folded, from, to };
}

/** The quote as it's searched for: normalised, without surrounding quote marks or punctuation. */
function searchText(quote: string): string {
  return normalizeText(quote).replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, "");
}

/**
 * Where the quote first appears in the Markdown, or null if it doesn't. A
 * quote with an ellipsis is never found: a Suggestion must quote the whole
 * text it changes or follows.
 */
export function findQuote(markdown: string, quote: string): QuoteSpan | null {
  const text = searchText(quote);
  if (!text || text.includes("...")) return null;
  const { folded, from, to } = fold(markdown);
  const index = folded.indexOf(text);
  if (index === -1) return null;
  return { start: from[index], end: to[index + text.length - 1] };
}

/**
 * The heading of the Markdown's section with the given title, as written in
 * the Markdown (without its `#`s), or null if there's none. Any heading level
 * counts.
 */
export function findSection(markdown: string, title: string): string | null {
  const wanted = normalizeText(title);
  if (!wanted) return null;
  for (const line of markdown.split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading && normalizeText(heading[1]) === wanted) return heading[1];
  }
  return null;
}

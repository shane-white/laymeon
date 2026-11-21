/**
 * What the user takes away from a Tailoring: its Resume with the accepted
 * Suggestions, as Markdown, and a prompt telling another AI to make the same
 * edits to their original file. Both use only the items the user accepted (as
 * they are, edited, or in their own words).
 */
import { findQuote } from "./quotes";
import { acceptedText, addLineIndex, LIST_MARK, markdownLines, plainText, type MarkdownLine } from "./resume-markdown";
import type { Tailoring, TailoringItem } from "./tailoring";

/** One change to the Markdown: `markdown.slice(start, end)` becomes `text`. */
interface Splice {
  start: number;
  end: number;
  text: string;
}

/**
 * The list mark for the `count`th item added after a list line: the same
 * bullet, or the next number in a numbered list.
 */
function nextListMark(prefix: string, count: number): string {
  const numbered = prefix.match(/^(\s*)(\d+)([.)])\s+$/);
  if (!numbered) return prefix;
  return `${numbered[1]}${Number(numbered[2]) + count}${numbered[3]} `;
}

/**
 * The text that goes after a line for the Adds placed there, in order. After
 * a list line each one is another list item; after anything else, a paragraph
 * of its own. `following` is the Markdown after the insertion point, so the
 * Adds don't run into the text below them.
 */
function addsAfter(markdown: string, line: MarkdownLine | undefined, texts: string[], following: string): string {
  const prefix = line ? markdown.slice(line.lineStart, line.start) : "";
  const inList = line?.block.kind === "bullet";
  const nextLine = following.startsWith("\n") ? following.slice(1).split("\n")[0] : "";
  if (inList) {
    const items = texts.map((text, i) => (LIST_MARK.test(text) ? text : nextListMark(prefix, i + 1) + text));
    const breakAfter = nextLine.trim() !== "" && !LIST_MARK.test(nextLine) ? "\n" : "";
    return `\n${items.join("\n")}${breakAfter}`;
  }
  const breakAfter = nextLine.trim() !== "" ? "\n" : "";
  if (!line) return `${texts.join("\n\n")}\n\n`;
  return `\n\n${texts.join("\n\n")}${breakAfter}`;
}

/** The Tailoring's structured Markdown with its accepted edits made. */
export function tailoredMarkdown(tailoring: Tailoring): string {
  const { markdown } = tailoring;
  const lines = markdownLines(markdown);
  const rewrites: Splice[] = [];
  /** Each accepted Add's text, by the index of the line it goes after. */
  const adds = new Map<number, string[]>();
  for (const item of tailoring.items) {
    const text = acceptedText(item)?.trim();
    if (!text || !item.suggestion) continue;
    if (item.suggestion.kind === "rewrite") {
      const span = findQuote(markdown, item.suggestion.quote);
      // Rewrites are written so they never overlap; should two, the first is kept, as in the view.
      if (span && !rewrites.some((other) => span.start < other.end && other.start < span.end)) rewrites.push({ ...span, text });
    } else {
      const at = addLineIndex(markdown, lines, item.suggestion.anchor);
      if (at !== null) adds.set(at, [...(adds.get(at) ?? []), text]);
    }
  }

  const splices = [...rewrites];
  for (const [at, texts] of adds) {
    const line = lines[at];
    let position = line ? line.end : 0;
    // A Rewrite that runs past the end of the line: add after its text instead.
    const across = rewrites.find((r) => r.start < position && position < r.end);
    if (across) position = across.end;
    splices.push({ start: position, end: position, text: addsAfter(markdown, line, texts, markdown.slice(position)) });
  }

  return splices
    .sort((a, b) => b.start - a.start)
    .reduce((result, s) => result.slice(0, s.start) + s.text + result.slice(s.end), markdown);
}

/** Text from the Markdown as the user's original file has it: plain, without a list mark. */
function asWritten(text: string): string {
  return plainText(text.trim().replace(LIST_MARK, ""));
}

/** One accepted item as an instruction, or null if it puts nothing on the Resume. */
function editInstruction(item: TailoringItem): string | null {
  const text = acceptedText(item)?.trim();
  if (!text || !item.suggestion) return null;
  const { suggestion } = item;
  if (suggestion.kind === "rewrite") return `Replace "${asWritten(suggestion.quote)}" with "${asWritten(text)}".`;
  if (suggestion.anchor.type === "after") return `Add "${asWritten(text)}" after "${asWritten(suggestion.anchor.quote)}".`;
  return `Add "${asWritten(text)}" in the "${asWritten(suggestion.anchor.heading)}" section.`;
}

/**
 * A prompt for another AI, pasted alongside the user's original Resume file:
 * make only the accepted edits, in the Tailoring's order, and change nothing
 * else. It leaves out each Suggestion's reasons, its Evidence and the Job, so
 * the other AI has nothing to make changes of its own from.
 */
export function copyPrompt(tailoring: Tailoring): string {
  const edits = tailoring.items.map(editInstruction).filter((edit) => edit !== null);
  const lines = [
    "I've attached my resume. Please make only the edits listed below to it.",
    "",
    "Rules:",
    "- Make each edit exactly as written. Don't reword, add or remove anything else.",
    "- Keep the layout, fonts, spacing, formatting and everything else unchanged.",
    "- Give me back the whole document in the same format as the file I attached.",
    "- If you can't find the text an edit refers to, make no change for it and tell me which edit it was.",
    "",
    "## Edits",
    "",
    ...(edits.length ? edits.map((edit, i) => `${i + 1}. ${edit}`) : ["There are no edits yet."]),
  ];
  return lines.join("\n") + "\n";
}

/** Characters that file names can't have on common systems. */
const NOT_IN_FILE_NAMES = /[/\\:*?"<>|]/g;

function fileNamePart(text: string | null): string {
  return (text ?? "").replace(NOT_IN_FILE_NAMES, " ").replace(/\s+/g, " ").trim();
}

/** The download name of the Resume with the accepted Suggestions: `<Resume name> – <Company>.md`. */
export function downloadName(resumeName: string | null, company: string | null): string {
  const resume = fileNamePart(resumeName?.replace(/\.(pdf|docx?|odt|rtf|txt|md)$/i, "") ?? null) || "Resume";
  const companyPart = fileNamePart(company);
  return `${companyPart ? `${resume} – ${companyPart}` : resume}.md`;
}

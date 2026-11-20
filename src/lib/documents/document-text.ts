/**
 * How the text readers (.docx, .odt, .rtf) put a document's parts together.
 * Editors keep separate headers and footers for the first page and left and
 * right pages, which often repeat the same text.
 */

/** The texts that aren't blank, each kept once, in order. */
export function distinctTexts(texts: string[]): string[] {
  return [...new Set(texts.filter((t) => t.trim()))];
}

/**
 * All the text of a document: headers, then the body, then footers, with a
 * blank line between parts. Headers and footers often hold contact details;
 * repeated ones are kept once.
 */
export function joinDocumentText(parts: { headers: string[]; body: string; footers: string[] }): string {
  return [...distinctTexts(parts.headers), parts.body, ...distinctTexts(parts.footers)].filter(Boolean).join("\n\n");
}

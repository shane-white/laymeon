/**
 * Reads the text of an OpenDocument text file (.odt, a file whose `kindOf` is
 * "odt") straight from its XML, keeping line breaks, tabs, repeated spaces,
 * headers and footers, like the .docx reader in `word-xml.ts`.
 */
import JSZip from "jszip";
import { decodeXml } from "./word-xml";

// A tag or a run of text. Comments, processing instructions and CDATA don't
// appear in the parts LibreOffice and Google Docs write.
const TOKEN = /<(\/?)([\w:.-]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|[^<]+/g;

// Elements whose content isn't the document's visible text: deleted text kept
// for tracked changes, comments, and a footnote's number in the body.
const SKIPPED = new Set(["text:tracked-changes", "office:annotation", "text:note-citation"]);

/**
 * The text in a piece of ODF XML, one line per paragraph or heading, with
 * `text:line-break` as a new line, `text:tab` as a tab and `text:s` as spaces.
 * Other whitespace in the XML collapses to one space, as ODF readers show it.
 */
export function textOfOdtXml(xml: string): string {
  const lines: string[] = [];
  // One buffer per open paragraph: text boxes and footnotes nest paragraphs.
  const open: { text: string; spaced: boolean }[] = [];
  let skipping = 0;

  for (const [token, closing, name, attributes, selfClosing] of xml.matchAll(TOKEN)) {
    const para = open.at(-1);
    if (name === undefined) {
      if (skipping || !para) continue;
      let text = decodeXml(token).replace(/[ \t\r\n]+/g, " ");
      // Collapsed whitespace at the start of a paragraph, or after a space, is dropped.
      if (text.startsWith(" ") && (para.spaced || !para.text)) text = text.slice(1);
      if (!text) continue;
      para.text += text;
      para.spaced = text.endsWith(" ");
      continue;
    }
    if (SKIPPED.has(name)) {
      if (!selfClosing) skipping += closing ? -1 : 1;
      continue;
    }
    if (skipping) continue;
    if (name === "text:p" || name === "text:h") {
      if (closing) {
        const done = open.pop();
        if (done?.text.trim()) lines.push(done.text);
      } else if (!selfClosing) {
        open.push({ text: "", spaced: false });
      }
      continue;
    }
    if (!para || closing) continue;
    if (name === "text:line-break") para.text += "\n";
    else if (name === "text:tab") para.text += "\t";
    else if (name === "text:s") para.text += " ".repeat(Number(/text:c="(\d+)"/.exec(attributes)?.[1] ?? 1));
    else continue;
    para.spaced = false;
  }
  return lines.join("\n");
}

export interface OdtParts {
  /** content.xml, which holds the body. */
  contentXml: string;
  /** The XML of each page style's headers and footers, from styles.xml. */
  headers: string[];
  footers: string[];
  /** meta.xml, where the page count is recorded. Empty if missing. */
  metaXml: string;
}

// A page style's header or footer, including the ones for left and first pages.
const HEADER_FOOTER = /<style:(header|footer)(-left|-first)?(?=[\s>/])[^>]*?(?<!\/)>([\s\S]*?)<\/style:\1\2?>/g;

/**
 * The parts of an .odt file that hold text. Throws if it isn't an .odt (zip)
 * file, or if it's password-protected.
 */
export async function readOdtParts(buffer: Buffer): Promise<OdtParts> {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  const [manifest, contentXml, stylesXml, metaXml] = await Promise.all(
    ["META-INF/manifest.xml", "content.xml", "styles.xml", "meta.xml"].map(read),
  );
  if (manifest.includes("encryption-data")) throw new Error("The ODT file is password-protected");
  const headers: string[] = [];
  const footers: string[] = [];
  for (const [, which, , xml] of stylesXml.matchAll(HEADER_FOOTER)) {
    (which === "header" ? headers : footers).push(xml);
  }
  return { contentXml, headers, footers, metaXml };
}

/**
 * All the text of an .odt: headers, then the body, then footers. Headers and
 * footers often hold contact details; repeated ones are kept once.
 */
export async function readOdtText(buffer: Buffer): Promise<string> {
  const { contentXml, headers, footers } = await readOdtParts(buffer);
  const unique = (parts: string[]) => [...new Set(parts.map(textOfOdtXml).filter((t) => t.trim()))];
  return [...unique(headers), textOfOdtXml(contentXml), ...unique(footers)].filter(Boolean).join("\n\n");
}

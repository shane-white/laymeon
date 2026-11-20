/**
 * Reads the text of a .docx straight from its XML. mammoth's raw text drops
 * soft line breaks (Shift+Enter) and tabs, which runs words from separate
 * lines together ("4 Newton StPortland, ME"); this keeps them.
 */
import JSZip from "jszip";

// Text, line breaks and tabs, in document order. A bare <w:tab/> is a tab in
// the text; <w:tab w:pos=…/> inside <w:tabs> is a tab stop setting.
const WORD_TEXT = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:br|cr)\b[^>]*\/>|<w:tab\/>/g;

/** Decodes the entities in XML text. */
export function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** The text in a piece of WordprocessingML, one line per paragraph or line break. */
export function textOfWordXml(xml: string): string {
  return xml
    .split(/<\/w:p>/)
    .map((para) =>
      [...para.matchAll(WORD_TEXT)]
        .map((m) => (m[1] !== undefined ? decodeXml(m[1]) : m[0].startsWith("<w:tab") ? "\t" : "\n"))
        .join(""),
    )
    .filter((line) => line.trim())
    .join("\n");
}

export interface WordParts {
  /** The main document, with Word's fallback copies of text boxes and drawings removed so nothing is read twice. */
  documentXml: string;
  headers: string[];
  footers: string[];
  /** docProps/app.xml, where Word records the page count. Empty if missing. */
  appXml: string;
}

/** The parts of a .docx file that hold text. Throws if it isn't a .docx (zip) file. */
export async function readWordParts(buffer: Buffer): Promise<WordParts> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = ((await zip.file("word/document.xml")?.async("string")) ?? "").replace(
    /<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g,
    "",
  );
  const read = (pattern: RegExp) =>
    Promise.all(
      zip
        .file(pattern)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map((f) => f.async("string")),
    );
  const [headers, footers] = await Promise.all([read(/^word\/header\d*\.xml$/), read(/^word\/footer\d*\.xml$/)]);
  const appXml = (await zip.file("docProps/app.xml")?.async("string")) ?? "";
  return { documentXml, headers, footers, appXml };
}

/**
 * All the text of a .docx: headers, then the body, then footers. Headers
 * and footers often hold contact details. Word keeps separate copies for the
 * first page and even pages, so repeated ones are kept once.
 */
export async function readWordXmlText(buffer: Buffer): Promise<string> {
  const { documentXml, headers, footers } = await readWordParts(buffer);
  const unique = (parts: string[]) => [...new Set(parts.map(textOfWordXml).filter((t) => t.trim()))];
  return [...unique(headers), textOfWordXml(documentXml), ...unique(footers)].filter(Boolean).join("\n\n");
}

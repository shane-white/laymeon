/**
 * Reads the text of a Word file (a file whose `kindOf` is "word").
 * Server-side only: it uses mammoth. Dialogs import `file-format.ts` instead.
 */
import mammoth from "mammoth";
import { readWordXmlText } from "./word-xml";

/**
 * Reads the XML directly, keeping line breaks, tabs, headers and footers that
 * mammoth's raw text drops. Falls back to mammoth if that fails (for example
 * an old .doc file that isn't really a .docx).
 */
export async function readWordText(buffer: Buffer): Promise<string> {
  try {
    const text = await readWordXmlText(buffer);
    if (text.trim()) return text;
  } catch {
    // Not a .docx zip; let mammoth try.
  }
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

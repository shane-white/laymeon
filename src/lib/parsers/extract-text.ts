import mammoth from "mammoth";
import { extractWordText } from "./word-xml";

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  switch (mimeType) {
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/msword":
      return extractDocxText(buffer);
    case "application/rtf":
    case "application/vnd.oasis.opendocument.text":
      throw new Error(
        "RTF and ODT formats are not yet supported. Please upload a PDF or DOCX file.",
      );
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

/**
 * Reads the XML directly, keeping line breaks, tabs, headers and footers that
 * mammoth's raw text drops. Falls back to mammoth if that fails (for example
 * an old .doc file that isn't really a .docx).
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const text = await extractWordText(buffer);
    if (text.trim()) return text;
  } catch {
    // Not a .docx zip; let mammoth try.
  }
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

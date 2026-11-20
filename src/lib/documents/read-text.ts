/**
 * Reads the text of an uploaded editor file (Word, RTF or ODT) for Claude to
 * work from. PDFs go to Claude as they are. Server-side only: the Word reader
 * uses mammoth.
 */
import { UnreadableFileError } from "./document";
import type { FileKind } from "./file-format";
import { readOdtText } from "./odt-text";
import { readRtfText } from "./rtf-text";
import { readWordText } from "./word-text";

/** The kinds of file whose text is read here rather than by Claude. */
export type TextFileKind = Extract<FileKind, "word" | "rtf" | "odt">;

/** The file's text. Throws `UnreadableFileError` if it has none. */
export async function readText(buffer: Buffer, kind: TextFileKind): Promise<string> {
  const text = kind === "rtf" ? readRtfText(buffer) : kind === "odt" ? await readOdtText(buffer) : await readWordText(buffer);
  if (!text?.trim()) throw new UnreadableFileError("Could not extract any text from the document");
  return text;
}

/**
 * Which files LayMeOn accepts as Documents, and how big they can be. Every
 * upload route, upload dialog and reader of an uploaded file uses these rules.
 *
 * No server-only imports: the upload dialogs use this too. Reading a Word
 * file's text lives in `word-text.ts`, which is server-side only.
 */

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** The old Word format. Accepted and read by the Word reader. */
export const DOC_MIME = "application/msword";

/** RTF, saved by TextEdit, WordPad and Word. */
export const RTF_MIME = "application/rtf";
/** OpenDocument text, saved by LibreOffice and Google Docs. */
export const ODT_MIME = "application/vnd.oasis.opendocument.text";

export type FileKind = "pdf" | "word" | "rtf" | "odt" | "unsupported";

/**
 * The accepted types: each with its kind, the MIME types browsers give it
 * (the first is the one stored) and its file extensions.
 */
const ACCEPTED: { mimes: string[]; kind: Exclude<FileKind, "unsupported">; extensions: string[] }[] = [
  { mimes: [PDF_MIME], kind: "pdf", extensions: [".pdf"] },
  { mimes: [DOCX_MIME], kind: "word", extensions: [".docx"] },
  { mimes: [DOC_MIME], kind: "word", extensions: [".doc"] },
  { mimes: [RTF_MIME, "text/rtf"], kind: "rtf", extensions: [".rtf"] },
  { mimes: [ODT_MIME], kind: "odt", extensions: [".odt"] },
];

/** The `accept` option for an upload dialog's dropzone: each type with its file extensions. */
export const DROPZONE_ACCEPT: Record<string, string[]> = Object.fromEntries(
  ACCEPTED.flatMap((t) => t.mimes.map((mime) => [mime, t.extensions])),
);

const MAX_UPLOAD_MB = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const UNSUPPORTED_FILE_MESSAGE = "Please upload a PDF, Word, RTF or ODT file";
export const FILE_TOO_LARGE_MESSAGE = `File is too large. Maximum size is ${MAX_UPLOAD_MB} MB.`;
/** What upload dialogs say they accept. */
export const ACCEPTED_FILES_HINT = `PDF, Word (.docx, .doc), RTF or ODT, up to ${MAX_UPLOAD_MB} MB.`;

/** The kind of file a stored MIME type is. */
export function kindOf(mimeType: string): FileKind {
  return ACCEPTED.find((t) => t.mimes.includes(mimeType))?.kind ?? "unsupported";
}

// Types browsers give a file they don't recognise.
const UNKNOWN_TYPES = new Set(["", "application/octet-stream"]);

/**
 * The standard MIME type to store for an uploaded file, or null if it isn't
 * accepted. When the browser gave no type, the file's extension decides. It
 * also decides for a .rtf file typed as Word: Windows browsers report RTF
 * files that way when Word is installed.
 */
export function resolveType(file: { type: string; name: string }): string | null {
  const extension = /\.[^.]+$/.exec(file.name)?.[0].toLowerCase();
  const byExtension = UNKNOWN_TYPES.has(file.type) || (file.type === DOC_MIME && extension === ".rtf");
  const accepted = byExtension
    ? ACCEPTED.find((t) => extension !== undefined && t.extensions.includes(extension))
    : ACCEPTED.find((t) => t.mimes.includes(file.type));
  return accepted?.mimes[0] ?? null;
}

/** Why a file can't be uploaded, or null if it can. */
export function uploadProblem(file: { type: string; name: string; size: number }): string | null {
  if (!resolveType(file)) return UNSUPPORTED_FILE_MESSAGE;
  if (file.size > MAX_UPLOAD_BYTES) return FILE_TOO_LARGE_MESSAGE;
  return null;
}

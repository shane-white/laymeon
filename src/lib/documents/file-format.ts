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

export type FileKind = "pdf" | "word" | "unsupported";

/** The accepted types: each with its kind and file extensions. */
const ACCEPTED: { mime: string; kind: Exclude<FileKind, "unsupported">; extensions: string[] }[] = [
  { mime: PDF_MIME, kind: "pdf", extensions: [".pdf"] },
  { mime: DOCX_MIME, kind: "word", extensions: [".docx"] },
  { mime: DOC_MIME, kind: "word", extensions: [".doc"] },
];

/** The `accept` option for an upload dialog's dropzone: each type with its file extensions. */
export const DROPZONE_ACCEPT: Record<string, string[]> = Object.fromEntries(
  ACCEPTED.map((t) => [t.mime, t.extensions]),
);

const MAX_UPLOAD_MB = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

export const UNSUPPORTED_FILE_MESSAGE = "Please upload a PDF or Word file";
export const FILE_TOO_LARGE_MESSAGE = `File is too large. Maximum size is ${MAX_UPLOAD_MB} MB.`;
/** What upload dialogs say they accept. */
export const ACCEPTED_FILES_HINT = `PDF or Word (.docx, .doc), up to ${MAX_UPLOAD_MB} MB.`;

export function kindOf(mimeType: string): FileKind {
  return ACCEPTED.find((t) => t.mime === mimeType)?.kind ?? "unsupported";
}

/** Why a file can't be uploaded, or null if it can. */
export function uploadProblem(file: { type: string; size: number }): string | null {
  if (kindOf(file.type) === "unsupported") return UNSUPPORTED_FILE_MESSAGE;
  if (file.size > MAX_UPLOAD_BYTES) return FILE_TOO_LARGE_MESSAGE;
  return null;
}

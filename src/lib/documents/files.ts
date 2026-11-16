/** Rules shared by uploading a document and replacing its file. */

export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
];

/** The same limit the upload dialog enforces. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const UPLOAD_BUCKET = "imported-documents";

/** Where an uploaded file is stored. The timestamp keeps a replaced file's path different from the old one. */
export function storagePathFor(documentType: "resume" | "cover_letter", userId: string, filename: string): string {
  const folder = documentType === "resume" ? "resumes" : "cover-letters";
  return `${folder}/${userId}/${Date.now()}-${filename}`;
}

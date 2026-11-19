/** Where uploaded files are stored. Which files are accepted is in `file-format.ts`. */

export const UPLOAD_BUCKET = "imported-documents";

/** Where an uploaded file is stored. The timestamp keeps a replaced file's path different from the old one. */
export function storagePathFor(documentType: "resume" | "cover_letter", userId: string, filename: string): string {
  const folder = documentType === "resume" ? "resumes" : "cover-letters";
  return `${folder}/${userId}/${Date.now()}-${filename}`;
}

/** Where uploaded files are stored. Which files are accepted is in `file-format.ts`. */

import type { DocumentType } from "./document";

export const UPLOAD_BUCKET = "imported-documents";

const FOLDERS: Record<DocumentType, string> = { resume: "resumes", cover_letter: "cover-letters", project: "projects" };

/** Where an uploaded file is stored. The timestamp keeps a replaced file's path different from the old one. */
export function storagePathFor(documentType: DocumentType, userId: string, filename: string): string {
  const folder = FOLDERS[documentType];
  return `${folder}/${userId}/${Date.now()}-${filename}`;
}

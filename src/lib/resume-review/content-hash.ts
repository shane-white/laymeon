import { createHash } from "node:crypto";

/**
 * Identifies the version of a resume a review was made from. Changes when the
 * file is replaced (new storage path) or its parsed text changes.
 *
 * Must match public.resume_content_hash() in the add_resume_reviews migration,
 * which the database uses to tell whether a review is out of date.
 */
export function resumeContentHash(storagePath: string | null, parsedMarkdown: string | null): string {
  return createHash("sha256")
    .update(`${storagePath ?? ""}\n${parsedMarkdown ?? ""}`, "utf8")
    .digest("hex");
}

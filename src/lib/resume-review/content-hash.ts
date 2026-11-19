import { createHash } from "node:crypto";

/**
 * Identifies the version of a resume a review was made from. Changes when the
 * file is replaced (new storage path), its Target role changes or its parsed
 * text changes. Its name and whether it's the Default document don't count.
 *
 * Must match public.resume_content_hash() in the database (LAY-86 migration),
 * which the database uses to tell whether a review is an Earlier version.
 */
export function resumeContentHash(
  storagePath: string | null,
  targetRole: string | null,
  parsedMarkdown: string | null,
): string {
  return createHash("sha256")
    .update(`${storagePath ?? ""}\n${targetRole ?? ""}\n${parsedMarkdown ?? ""}`, "utf8")
    .digest("hex");
}

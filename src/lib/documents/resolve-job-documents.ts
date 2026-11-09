import type { SupabaseClient } from "@supabase/supabase-js";

export type DocumentType = "resume" | "cover_letter";

export interface JobDocument {
  id: string;
  document_type: DocumentType;
  display_name: string;
  target_role: string | null;
  is_default: boolean;
  parsed_markdown: string | null;
}

export interface JobDocuments {
  resume: JobDocument | null;
  coverLetter: JobDocument | null;
}

export interface JobDocumentSelection {
  resume_document_id: string | null;
  cover_letter_document_id: string | null;
}

/**
 * Picks the selected document of `type` from the user's live uploaded
 * documents, falling back to the default when nothing is selected or the
 * selection is gone (deleted, or the wrong type).
 */
export function pickDocument(
  selectedId: string | null,
  docs: JobDocument[],
  type: DocumentType,
): JobDocument | null {
  const ofType = docs.filter((d) => d.document_type === type);
  if (selectedId) {
    const selected = ofType.find((d) => d.id === selectedId);
    if (selected) return selected;
  }
  return ofType.find((d) => d.is_default) ?? null;
}

/** Loads the resume and cover letter a job uses. */
export async function resolveJobDocuments(
  supabase: SupabaseClient,
  userId: string,
  job: JobDocumentSelection,
): Promise<JobDocuments> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, document_type, display_name, target_role, is_default, parsed_markdown")
    .eq("user_id", userId)
    .eq("source", "uploaded")
    .is("deleted_at", null);

  if (error) throw new Error(`Failed to load documents: ${error.message}`);

  const docs = (data ?? []) as JobDocument[];
  return {
    resume: pickDocument(job.resume_document_id, docs, "resume"),
    coverLetter: pickDocument(job.cover_letter_document_id, docs, "cover_letter"),
  };
}

/** "PM Resume (targeting Product Manager)" or just the name. */
export function describeDocument(doc: Pick<JobDocument, "display_name" | "target_role">): string {
  return doc.target_role
    ? `${doc.display_name} (targeting ${doc.target_role})`
    : doc.display_name;
}

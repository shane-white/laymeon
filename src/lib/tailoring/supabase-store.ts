/** The Tailoring store in production: the `tailorings` table. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Tailoring, TailoringItem, TailoringStore } from "./tailoring";

interface TailoringRow {
  id: string;
  user_job_id: string;
  resume_document_id: string;
  version: number;
  markdown: string;
  items: TailoringItem[];
  match_report_generated_at: string;
  resume_content_hash: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  "id, user_job_id, resume_document_id, version, markdown, items, match_report_generated_at, resume_content_hash, created_at, updated_at";

function fromRow(row: TailoringRow): Tailoring {
  return {
    id: row.id,
    jobId: row.user_job_id,
    resumeId: row.resume_document_id,
    version: row.version,
    markdown: row.markdown,
    items: row.items,
    matchReportGeneratedAt: row.match_report_generated_at,
    resumeContentHash: row.resume_content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Now, or just after `readAt` if that's not earlier, so a save always changes
 * `updated_at`, even two in the same millisecond.
 */
function laterThan(readAt: string): string {
  const read = Date.parse(readAt);
  return new Date(Number.isNaN(read) ? Date.now() : Math.max(Date.now(), read + 1)).toISOString();
}

export function supabaseTailoringStore(supabase: SupabaseClient, userId: string): TailoringStore {
  return {
    async find(jobId, resumeId) {
      const { data, error } = await supabase
        .from("tailorings")
        .select(COLUMNS)
        .eq("user_id", userId)
        .eq("user_job_id", jobId)
        .eq("resume_document_id", resumeId)
        .maybeSingle<TailoringRow>();
      if (error) throw new Error(`Couldn't load the Tailoring: ${error.message}`);
      return data ? fromRow(data) : null;
    },

    async save(tailoring) {
      const { data, error } = await supabase
        .from("tailorings")
        .upsert(
          {
            user_id: userId,
            user_job_id: tailoring.jobId,
            resume_document_id: tailoring.resumeId,
            version: tailoring.version,
            markdown: tailoring.markdown,
            items: tailoring.items,
            match_report_generated_at: tailoring.matchReportGeneratedAt,
            resume_content_hash: tailoring.resumeContentHash,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_job_id,resume_document_id" },
        )
        .select(COLUMNS)
        .single<TailoringRow>();
      if (error) throw new Error(`Couldn't save the Tailoring: ${error.message}`);
      return fromRow(data);
    },

    async saveItems(tailoringId, items, readAt) {
      // Only if no other save (or start over) has changed it since it was read.
      const { data, error } = await supabase
        .from("tailorings")
        .update({ items, updated_at: laterThan(readAt) })
        .eq("id", tailoringId)
        .eq("user_id", userId)
        .eq("updated_at", readAt)
        .select(COLUMNS)
        .maybeSingle<TailoringRow>();
      if (error) throw new Error(`Couldn't save the Tailoring's decisions: ${error.message}`);
      return data ? fromRow(data) : null;
    },
  };
}

/** The Interview Prep store in production: the `interview_preps` table. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptySection } from "./sections";
import type { InterviewPrep, InterviewPrepStore, Section } from "./interview-prep";

interface InterviewPrepRow {
  user_job_id: string;
  version: number;
  /** Null when the section was never researched. */
  process: Partial<Section<never>> | null;
  company: Partial<Section<never>> | null;
  practice: Partial<Section<never>> | null;
  updated_at: string;
}

const COLUMNS = "user_job_id, version, process, company, practice, updated_at";

/** A saved section, with any field missing from an older row filled in. */
function sectionOf<T>(saved: Partial<Section<T>> | null): Section<T> {
  return { ...emptySection<T>(), ...(saved ?? {}) };
}

function fromRow(row: InterviewPrepRow): InterviewPrep {
  return {
    jobId: row.user_job_id,
    version: row.version,
    sections: {
      process: sectionOf(row.process),
      company: sectionOf(row.company),
      practice: sectionOf(row.practice),
    },
    updatedAt: row.updated_at,
  };
}

export function supabaseInterviewPrepStore(supabase: SupabaseClient, userId: string): InterviewPrepStore {
  return {
    async find(jobId) {
      const { data, error } = await supabase
        .from("interview_preps")
        .select(COLUMNS)
        .eq("user_id", userId)
        .eq("user_job_id", jobId)
        .maybeSingle<InterviewPrepRow>();
      if (error) throw new Error(`Couldn't load the Interview Prep: ${error.message}`);
      return data ? fromRow(data) : null;
    },

    async saveSection(jobId, key, section) {
      // An upsert updates only the columns it sends, so the other sections stay as they are.
      const { data, error } = await supabase
        .from("interview_preps")
        .upsert(
          { user_id: userId, user_job_id: jobId, [key]: section, updated_at: new Date().toISOString() },
          { onConflict: "user_job_id" },
        )
        .select(COLUMNS)
        .single<InterviewPrepRow>();
      if (error) throw new Error(`Couldn't save the Interview Prep: ${error.message}`);
      return fromRow(data);
    },
  };
}

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

/** Saves are retried on a newer row this many times before giving up. */
const MAX_ATTEMPTS = 5;
const UNIQUE_VIOLATION = "23505";

/**
 * Now, or just after `readAt` if that's not earlier, so a save always changes
 * `updated_at`, even two in the same millisecond.
 */
function laterThan(readAt: string): string {
  const read = Date.parse(readAt);
  return new Date(Number.isNaN(read) ? Date.now() : Math.max(Date.now(), read + 1)).toISOString();
}

/**
 * Each save reads the row, applies the change to the section and writes it
 * back only if `updated_at` hasn't moved, trying again on the newer row if it
 * has. So a save never undoes one made at the same time by another request.
 */
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

    async updateSection(jobId, key, update) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const { data: row, error } = await supabase
          .from("interview_preps")
          .select(COLUMNS)
          .eq("user_id", userId)
          .eq("user_job_id", jobId)
          .maybeSingle<InterviewPrepRow>();
        if (error) throw new Error(`Couldn't load the Interview Prep: ${error.message}`);

        if (!row) {
          const section = update(emptySection());
          const { data, error: insertError } = await supabase
            .from("interview_preps")
            .insert({ user_id: userId, user_job_id: jobId, [key]: section })
            .select(COLUMNS)
            .single<InterviewPrepRow>();
          // Another request created it first: run the change on that one.
          if (insertError?.code === UNIQUE_VIOLATION) continue;
          if (insertError) throw new Error(`Couldn't save the Interview Prep: ${insertError.message}`);
          return fromRow(data);
        }

        const section = update(fromRow(row).sections[key]);
        // Only if no other save has changed the row since it was read.
        const { data, error: updateError } = await supabase
          .from("interview_preps")
          .update({ [key]: section, updated_at: laterThan(row.updated_at) })
          .eq("user_id", userId)
          .eq("user_job_id", jobId)
          .eq("updated_at", row.updated_at)
          .select(COLUMNS)
          .maybeSingle<InterviewPrepRow>();
        if (updateError) throw new Error(`Couldn't save the Interview Prep: ${updateError.message}`);
        if (data) return fromRow(data);
      }
      throw new Error("Couldn't save the Interview Prep: it kept changing while we saved. Try again.");
    },
  };
}

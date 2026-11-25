/** The signed-in user's Jobs in production, as an Interview Prep needs them. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveJobDocuments } from "@/lib/documents/resolve-job-documents";
import type { InterviewPrepJob, InterviewPrepJobs } from "./interview-prep";

interface JobRow {
  id: string;
  custom_job_title: string | null;
  custom_job_company: string | null;
  resume_document_id: string | null;
  cover_letter_document_id: string | null;
  interview_suggestions: string | null;
  job_listing: { extracted_job_title: string | null; extracted_company_name: string | null; description: string | null } | null;
}

export function supabaseInterviewPrepJobs(supabase: SupabaseClient, userId: string): InterviewPrepJobs {
  return {
    async find(jobId) {
      const { data: job, error } = await supabase
        .from("user_job_listings")
        .select(
          `id, custom_job_title, custom_job_company, resume_document_id, cover_letter_document_id, interview_suggestions,
          job_listing:job_listings ( extracted_job_title, extracted_company_name, description )`,
        )
        .eq("id", jobId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle<JobRow>();
      if (error) throw new Error(`Couldn't load the Job: ${error.message}`);
      if (!job) return null;

      const { resume } = await resolveJobDocuments(supabase, userId, job);
      return {
        id: job.id,
        title: job.custom_job_title || job.job_listing?.extracted_job_title || null,
        company: job.custom_job_company || job.job_listing?.extracted_company_name || null,
        description: job.job_listing?.description ?? null,
        resume: resume && { name: resume.display_name, text: resume.parsed_markdown },
        legacySuggestions: job.interview_suggestions?.trim() ? job.interview_suggestions : null,
      } satisfies InterviewPrepJob;
    },

    async clearLegacySuggestions(jobId) {
      const { error } = await supabase
        .from("user_job_listings")
        .update({ interview_suggestions: null })
        .eq("id", jobId)
        .eq("user_id", userId);
      if (error) throw new Error(`Couldn't clear the older Interview Suggestions: ${error.message}`);
    },
  };
}

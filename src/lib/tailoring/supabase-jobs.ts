/** The signed-in user's Jobs in production, as a Tailoring needs them. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickDocument, type JobDocument } from "@/lib/documents/resolve-job-documents";
import { matchReportSchema } from "@/lib/match-report/schema";
import { resumeContentHash } from "@/lib/resume-review/content-hash";
import type { JobMatchReport, TailoringJob, TailoringJobs } from "./tailoring";

interface JobRow {
  id: string;
  custom_job_title: string | null;
  custom_job_company: string | null;
  resume_document_id: string | null;
  match_report: unknown;
  analysis_documents: { match_analysis?: MatchAnalysisEntry } | null;
  job_listing: { extracted_job_title: string | null; extracted_company_name: string | null } | null;
}

/** What the analyze route records about the Resume a Match Report compared. */
interface MatchAnalysisEntry {
  resume_id?: string;
  generated_at?: string;
  resume_content_hash?: string;
}

type ResumeRow = JobDocument & { updated_at: string };

/**
 * The Job's Match Report, or null if it has none or it's in an older format.
 * A report without a record of its Resume can't be shown to be current, so
 * it's given an empty Resume ID, which makes it an Earlier version.
 */
function matchReportOf(row: JobRow): JobMatchReport | null {
  const parsed = matchReportSchema.safeParse(row.match_report);
  if (!parsed.success) return null;
  const entry = row.analysis_documents?.match_analysis;
  return {
    report: parsed.data,
    generatedAt: entry?.generated_at ?? "",
    resumeId: entry?.resume_id ?? "",
    resumeContentHash: entry?.resume_content_hash ?? null,
  };
}

export function supabaseTailoringJobs(supabase: SupabaseClient, userId: string): TailoringJobs {
  return {
    async find(jobId) {
      const { data: job, error } = await supabase
        .from("user_job_listings")
        .select(
          `id, custom_job_title, custom_job_company, resume_document_id, match_report, analysis_documents,
          job_listing:job_listings ( extracted_job_title, extracted_company_name )`,
        )
        .eq("id", jobId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle<JobRow>();
      if (error) throw new Error(`Couldn't load the Job: ${error.message}`);
      if (!job) return null;

      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("id, document_type, display_name, target_role, is_default, parsed_markdown, storage_path, updated_at")
        .eq("user_id", userId)
        .eq("source", "uploaded")
        .eq("document_type", "resume")
        .is("deleted_at", null);
      if (docsError) throw new Error(`Couldn't load the Job's Resume: ${docsError.message}`);
      const resume = pickDocument(job.resume_document_id, (docs ?? []) as ResumeRow[], "resume");

      return {
        id: job.id,
        title: job.custom_job_title || job.job_listing?.extracted_job_title || null,
        company: job.custom_job_company || job.job_listing?.extracted_company_name || null,
        resume: resume && {
          id: resume.id,
          name: resume.display_name,
          text: resume.parsed_markdown,
          contentHash: resumeContentHash(resume.storage_path, resume.target_role, resume.parsed_markdown),
          updatedAt: resume.updated_at,
        },
        matchReport: matchReportOf(job),
      } satisfies TailoringJob;
    },
  };
}

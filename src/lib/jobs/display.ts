import type { UserJob } from "@/hooks/use-jobs";

type DisplayFields = Pick<UserJob, "custom_job_title" | "custom_job_company"> & {
  job_listing: Pick<UserJob["job_listing"], "extracted_job_title" | "extracted_company_name">;
};

/** The title the jobs list shows: the user's custom title, or the extracted one. */
export function displayTitle(job: DisplayFields): string {
  return job.custom_job_title || job.job_listing.extracted_job_title;
}

/** The company the jobs list shows: the user's custom company, or the extracted one. */
export function displayCompany(job: DisplayFields): string | null {
  return job.custom_job_company || job.job_listing.extracted_company_name;
}

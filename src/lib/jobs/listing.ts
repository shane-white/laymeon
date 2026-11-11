import type { ExtractedJob } from "@/lib/ai/extract-job";

/** The job_listings row for a job extracted from a URL or pasted text. */
export function toJobListingRow(url: string | null, extracted: ExtractedJob) {
  return {
    url,
    extracted_job_title: extracted.title,
    extracted_company_name: extracted.company,
    location: extracted.location,
    work_arrangement: extracted.work_arrangement,
    salary: extracted.salary,
    seniority_level: extracted.seniority_level,
    description: extracted.description,
  };
}

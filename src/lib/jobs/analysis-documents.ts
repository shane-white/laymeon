/**
 * Which documents an analysis was generated with (names are snapshots), as
 * the analyze route records it in `user_job_listings.analysis_documents`, by
 * analysis type.
 */
export interface AnalysisDocumentsEntry {
  resume_id: string;
  resume_name: string;
  /** `resumeContentHash` of the Resume then. Missing on analyses saved before LAY-99. */
  resume_content_hash?: string;
  cover_letter_id: string | null;
  cover_letter_name: string | null;
  generated_at: string;
}

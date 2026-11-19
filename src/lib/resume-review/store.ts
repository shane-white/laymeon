/**
 * Runs, saves and reads resume reviews (LAY-70). Table: resume_reviews, one
 * row per resume. View: resume_review_summaries, for lists.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentHash } from "@/lib/profile/rebuild";
import { extractionSchema, type Extraction } from "@/lib/profile/schema";
import { resumeContentHash } from "./content-hash";
import { RESUME_REVIEW_VERSION, resumeReviewSchema, type OverallLabel, type ResumeReview } from "./report-schema";
import { reviewResume } from "./review";
import { readAsSoftware } from "./software-view";
import type { SoftwareView } from "./types";

/** A problem the user can do something about, with the HTTP status to answer with. */
export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface ResumeRow {
  id: string;
  document_type: string;
  display_name: string;
  original_filename: string;
  mime_type: string;
  storage_bucket: string;
  storage_path: string;
  parsed_markdown: string | null;
  target_role: string | null;
  created_at: string;
  deleted_at: string | null;
}

/** A saved review, for the report view. */
export interface StoredReview {
  /** Null when the saved report is from an older version that can't be shown; run the review again. */
  review: ResumeReview | null;
  resumeDocumentId: string;
  resumeName: string;
  createdAt: string;
  updatedAt: string;
  /** The resume changed since the review. */
  outOfDate: boolean;
  /** The resume was deleted. */
  resumeDeleted: boolean;
}

/** One review in a list, without the report. */
export interface ReviewSummary {
  id: string;
  resumeDocumentId: string;
  resumeName: string;
  overallLabel: OverallLabel | null;
  createdAt: string;
  updatedAt: string;
  outOfDate: boolean;
  resumeDeleted: boolean;
}

async function loadResume(supabase: SupabaseClient, userId: string, documentId: string): Promise<ResumeRow> {
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, document_type, display_name, original_filename, mime_type, storage_bucket, storage_path, parsed_markdown, target_role, created_at, deleted_at",
    )
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle<ResumeRow>();
  if (error) throw new Error(error.message);
  if (!data || data.deleted_at) throw new ReviewError("Resume not found", 404);
  if (data.document_type !== "resume") throw new ReviewError("Only resumes can be reviewed", 400);
  if (!data.parsed_markdown?.trim()) {
    throw new ReviewError("This resume has no readable text yet. Try uploading it again.", 400);
  }
  return data;
}

/** What resume-reading software gets from the stored file. Null if the file can't be read; those checks are skipped. */
async function loadSoftwareView(supabase: SupabaseClient, resume: ResumeRow): Promise<SoftwareView | null> {
  try {
    const { data, error } = await supabase.storage.from(resume.storage_bucket).download(resume.storage_path);
    if (error || !data) throw error ?? new Error("No file");
    return await readAsSoftware(Buffer.from(await data.arrayBuffer()), resume.mime_type);
  } catch (err) {
    console.error(`Couldn't read the file for resume ${resume.id}; skipping the file checks`, err);
    return null;
  }
}

/** The Career Story extraction of this resume, if it's cached and still matches the resume. */
async function loadExtraction(supabase: SupabaseClient, resume: ResumeRow): Promise<Extraction | null> {
  const { data } = await supabase
    .from("career_profile_extractions")
    .select("content_hash, extraction")
    .eq("document_id", resume.id)
    .maybeSingle<{ content_hash: string; extraction: unknown }>();
  if (!data || data.content_hash !== contentHash(resume.parsed_markdown!, resume.created_at)) return null;
  const parsed = extractionSchema.safeParse(data.extraction);
  return parsed.success ? parsed.data : null;
}

/** Reviews a resume and saves the result, replacing any earlier review. */
export async function runReview(supabase: SupabaseClient, userId: string, documentId: string): Promise<StoredReview> {
  const resume = await loadResume(supabase, userId, documentId);
  const [software, extraction] = await Promise.all([loadSoftwareView(supabase, resume), loadExtraction(supabase, resume)]);

  const review = await reviewResume({
    markdown: resume.parsed_markdown!,
    filename: resume.original_filename,
    mimeType: resume.mime_type,
    software,
    extraction,
    asOf: resume.created_at,
    targetRole: resume.target_role,
  });

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("resume_reviews")
    .upsert(
      {
        user_id: userId,
        resume_document_id: resume.id,
        report_version: RESUME_REVIEW_VERSION,
        report: review,
        resume_content_hash: resumeContentHash(resume.storage_path, resume.target_role, resume.parsed_markdown),
        updated_at: now,
      },
      { onConflict: "resume_document_id" },
    )
    .select("created_at, updated_at")
    .single<{ created_at: string; updated_at: string }>();
  if (error) throw new Error(error.message);

  return {
    review,
    resumeDocumentId: resume.id,
    resumeName: resume.display_name,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    outOfDate: false,
    resumeDeleted: false,
  };
}

interface SummaryRow {
  id: string;
  resume_document_id: string;
  report_version: number;
  overall_label: string | null;
  created_at: string;
  updated_at: string;
  resume_name: string | null;
  resume_deleted: boolean;
  out_of_date: boolean;
}

const SUMMARY_COLUMNS =
  "id, resume_document_id, report_version, overall_label, created_at, updated_at, resume_name, resume_deleted, out_of_date";

export function toSummary(row: SummaryRow): ReviewSummary {
  const label = row.report_version === RESUME_REVIEW_VERSION ? row.overall_label : null;
  return {
    id: row.id,
    resumeDocumentId: row.resume_document_id,
    resumeName: row.resume_name ?? "Deleted resume",
    overallLabel: label === "ready" || label === "few_fixes" || label === "needs_work" ? label : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // An older report can't be shown, so it needs running again either way.
    outOfDate: row.out_of_date || row.report_version !== RESUME_REVIEW_VERSION,
    resumeDeleted: row.resume_deleted,
  };
}

/** The saved review of a resume, or null if it hasn't been reviewed. */
export async function getReview(supabase: SupabaseClient, userId: string, documentId: string): Promise<StoredReview | null> {
  const [{ data: summary, error }, { data: row }] = await Promise.all([
    supabase
      .from("resume_review_summaries")
      .select(SUMMARY_COLUMNS)
      .eq("resume_document_id", documentId)
      .eq("user_id", userId)
      .maybeSingle<SummaryRow>(),
    supabase
      .from("resume_reviews")
      .select("report")
      .eq("resume_document_id", documentId)
      .eq("user_id", userId)
      .maybeSingle<{ report: unknown }>(),
  ]);
  if (error) throw new Error(error.message);
  if (!summary || !row) return null;

  const parsed = resumeReviewSchema.safeParse(row.report);
  const s = toSummary(summary);
  return {
    review: parsed.success ? parsed.data : null,
    resumeDocumentId: s.resumeDocumentId,
    resumeName: s.resumeName,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    outOfDate: s.outOfDate,
    resumeDeleted: s.resumeDeleted,
  };
}

/** The user's reviews, newest first, without their reports. */
export async function listReviews(supabase: SupabaseClient, userId: string): Promise<ReviewSummary[]> {
  const { data, error } = await supabase
    .from("resume_review_summaries")
    .select(SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .returns<SummaryRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSummary);
}

/** Deletes the review of a resume. Returns false if there wasn't one. */
export async function deleteReview(supabase: SupabaseClient, userId: string, documentId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("resume_reviews")
    .delete()
    .eq("resume_document_id", documentId)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

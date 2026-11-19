import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contentHash } from "@/lib/profile/rebuild";
import { resumeContentHash } from "./content-hash";
import { GOOD_EXTRACTION, GOOD_RESUME } from "./__fixtures__/resumes";
import { RESUME_REVIEW_VERSION, type ResumeReview } from "./report-schema";
import { reviewResume } from "./review";
import { ReviewError, runReview, toSummary } from "./store";

vi.mock("./review", () => ({ reviewResume: vi.fn() }));

const REPORT: ResumeReview = {
  version: RESUME_REVIEW_VERSION,
  overall: { label: "ready", reason: "Strong.", topFixes: [] },
  checks: [],
  rewrites: [],
  nextSteps: [],
};

const RESUME = {
  id: "doc-1",
  document_type: "resume",
  display_name: "Data Engineer",
  original_filename: "Jane-Doe-Resume.pdf",
  mime_type: "application/pdf",
  storage_bucket: "imported-documents",
  storage_path: "resumes/u/1-Jane.pdf",
  parsed_markdown: GOOD_RESUME,
  target_role: "Data Engineer",
  created_at: "2026-11-01T00:00:00Z",
  deleted_at: null as string | null,
};

/** Just enough of the Supabase client for runReview: chained filters that resolve to canned rows. */
function fakeSupabase(rows: { documents: unknown; extraction: unknown }) {
  const upserts: unknown[] = [];
  const query = (result: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order"]) chain[m] = () => chain;
    chain.maybeSingle = async () => ({ data: result, error: null });
    chain.upsert = (row: unknown) => {
      upserts.push(row);
      return chain;
    };
    chain.single = async () => ({ data: { created_at: "c", updated_at: "u" }, error: null });
    return chain;
  };
  const client = {
    from: (table: string) =>
      query(table === "documents" ? rows.documents : table === "career_profile_extractions" ? rows.extraction : null),
    // No file: the file checks are skipped, which runReview allows.
    storage: { from: () => ({ download: async () => ({ data: null, error: new Error("not in test") }) }) },
  };
  return { client: client as unknown as SupabaseClient, upserts };
}

describe("resumeContentHash", () => {
  it("is sha256 of the storage path, the Target role and the text, one per line, like the database function", () => {
    const expected = createHash("sha256").update("a/b.pdf\nProduct Designer\nHello — résumé", "utf8").digest("hex");
    expect(resumeContentHash("a/b.pdf", "Product Designer", "Hello — résumé")).toBe(expected);
  });

  it("changes when the file is replaced, even with the same text", () => {
    expect(resumeContentHash("a/1.pdf", null, "x")).not.toBe(resumeContentHash("a/2.pdf", null, "x"));
  });

  it("changes when the Target role changes", () => {
    expect(resumeContentHash("a/1.pdf", "Designer", "x")).not.toBe(resumeContentHash("a/1.pdf", "Researcher", "x"));
    expect(resumeContentHash("a/1.pdf", "Designer", "x")).not.toBe(resumeContentHash("a/1.pdf", null, "x"));
  });

  it("treats missing values as empty", () => {
    expect(resumeContentHash(null, null, null)).toBe(createHash("sha256").update("\n\n").digest("hex"));
  });
});

describe("toSummary", () => {
  const row = {
    id: "r1",
    resume_document_id: "doc-1",
    report_version: RESUME_REVIEW_VERSION,
    overall_label: "few_fixes",
    created_at: "c",
    updated_at: "u",
    resume_name: "Data Engineer",
    resume_deleted: false,
    out_of_date: false,
  };

  it("maps a current review", () => {
    expect(toSummary(row)).toMatchObject({ overallLabel: "few_fixes", outOfDate: false, resumeName: "Data Engineer" });
  });

  it("marks a review from an older report version as out of date, with no label", () => {
    expect(toSummary({ ...row, report_version: RESUME_REVIEW_VERSION - 1 })).toMatchObject({
      overallLabel: null,
      outOfDate: true,
    });
  });

  it("names a review whose resume is gone", () => {
    expect(toSummary({ ...row, resume_name: null, resume_deleted: true })).toMatchObject({
      resumeName: "Deleted resume",
      resumeDeleted: true,
    });
  });
});

describe("runReview", () => {
  beforeEach(() => {
    vi.mocked(reviewResume).mockReset().mockResolvedValue(REPORT);
  });

  it("reviews the resume and saves one row per resume with its content hash", async () => {
    const extraction = { content_hash: contentHash(GOOD_RESUME, RESUME.created_at), extraction: GOOD_EXTRACTION };
    const { client, upserts } = fakeSupabase({ documents: RESUME, extraction });

    const stored = await runReview(client, "user-1", "doc-1");

    expect(vi.mocked(reviewResume).mock.calls[0][0]).toMatchObject({
      markdown: GOOD_RESUME,
      filename: "Jane-Doe-Resume.pdf",
      targetRole: "Data Engineer",
      asOf: RESUME.created_at,
      software: null,
      extraction: GOOD_EXTRACTION,
    });
    expect(upserts).toEqual([
      {
        user_id: "user-1",
        resume_document_id: "doc-1",
        report_version: RESUME_REVIEW_VERSION,
        report: REPORT,
        resume_content_hash: resumeContentHash(RESUME.storage_path, "Data Engineer", GOOD_RESUME),
        updated_at: expect.any(String),
      },
    ]);
    expect(stored).toMatchObject({ review: REPORT, outOfDate: false, resumeDeleted: false, resumeName: "Data Engineer" });
  });

  it("ignores a Career Story extraction made from an older version of the resume", async () => {
    const { client } = fakeSupabase({ documents: RESUME, extraction: { content_hash: "old", extraction: GOOD_EXTRACTION } });
    await runReview(client, "user-1", "doc-1");
    expect(vi.mocked(reviewResume).mock.calls[0][0].extraction).toBeNull();
  });

  it.each([
    ["a missing resume", null, 404],
    ["a deleted resume", { ...RESUME, deleted_at: "2026-11-02" }, 404],
    ["a cover letter", { ...RESUME, document_type: "cover_letter" }, 400],
    ["a resume with no text", { ...RESUME, parsed_markdown: "  " }, 400],
  ])("refuses %s", async (_name, documents, status) => {
    const { client, upserts } = fakeSupabase({ documents, extraction: null });
    await expect(runReview(client, "user-1", "doc-1")).rejects.toMatchObject({ status });
    await expect(runReview(client, "user-1", "doc-1")).rejects.toBeInstanceOf(ReviewError);
    expect(reviewResume).not.toHaveBeenCalled();
    expect(upserts).toEqual([]);
  });
});

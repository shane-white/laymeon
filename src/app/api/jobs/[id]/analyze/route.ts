import { createClient } from "@/lib/supabase/server";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { generateMatchReport } from "@/lib/match-report/generate";
import { resolveJobDocuments } from "@/lib/documents/resolve-job-documents";
import type { AnalysisDocumentsEntry } from "@/lib/jobs/analysis-documents";
import { loadProfile } from "@/lib/profile/rebuild";
import { resumeContentHash } from "@/lib/resume-review/content-hash";
import { NextResponse, type NextRequest } from "next/server";

const VALID_TYPES = [
  "match_analysis",
  "cover_letter_suggestions",
  "interview_suggestions",
] as const;

type AnalysisType = (typeof VALID_TYPES)[number];

// The structured match report makes two Claude calls in a row (each can retry
// once) around a quick Jev request, so it can take several minutes.
export const maxDuration = 300;

// match_analysis returns a structured report instead (see generateMatchReport).
const PROMPTS: Record<Exclude<AnalysisType, "match_analysis">, string> = {
  cover_letter_suggestions: `Based on the resume and job description below, provide suggestions for writing a compelling cover letter for this role. Include:
- Key points to address
- How to frame relevant experience
- Company-specific talking points to include
- Opening and closing suggestions

Be specific and actionable. Format your response in markdown.`,

  interview_suggestions: `Based on the resume and job description below, help the candidate prepare for an interview. Include:
- Likely interview questions and how to answer them
- Key experiences to highlight from the resume
- Technical topics to review
- Questions the candidate should ask the interviewer
- Potential weaknesses to prepare for

Be specific and actionable. Format your response in markdown.`,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { type } = body as { type?: string };

  if (!type || !VALID_TYPES.includes(type as AnalysisType)) {
    return NextResponse.json({ error: "Invalid analysis type" }, { status: 400 });
  }

  const analysisType = type as AnalysisType;

  // Fetch job details
  const { data: userJob, error: jobError } = await supabase
    .from("user_job_listings")
    .select(`
      id,
      resume_document_id,
      cover_letter_document_id,
      analysis_documents,
      custom_job_title,
      job_listing:job_listings (
        description,
        extracted_job_title
      )
    `)
    .eq("id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single();

  if (jobError || !userJob) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // The job's selected resume and cover letter, or the defaults.
  let resume, coverLetter;
  try {
    ({ resume, coverLetter } = await resolveJobDocuments(supabase, user.id, userJob));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (!resume?.parsed_markdown) {
    return NextResponse.json(
      { error: "No resume found. Please upload a resume first." },
      { status: 400 },
    );
  }

  // Recorded so the UI can show which documents each analysis used.
  const analysisDocuments = {
    ...((userJob.analysis_documents as Record<string, unknown> | null) ?? {}),
    [analysisType]: {
      resume_id: resume.id,
      resume_name: resume.display_name,
      // The Resume's Source material, so a Tailoring can tell whether the
      // Match Report is an Earlier version.
      resume_content_hash: resumeContentHash(resume.storage_path, resume.target_role, resume.parsed_markdown),
      cover_letter_id: coverLetter?.id ?? null,
      cover_letter_name: coverLetter?.display_name ?? null,
      generated_at: new Date().toISOString(),
    } satisfies AnalysisDocumentsEntry,
  };

  const listing = userJob.job_listing as unknown as {
    description: string | null;
    extracted_job_title: string | null;
  } | null;
  const jobDescription = listing?.description;

  if (!jobDescription) {
    return NextResponse.json(
      { error: "Job has no description to analyze" },
      { status: 400 },
    );
  }

  if (analysisType === "match_analysis") {
    try {
      // The Career Story (with the user's removals left out) shows what this
      // resume could add. A problem loading it shouldn't stop the report.
      const profile = await loadProfile(supabase, user.id).catch((err) => {
        console.error("Couldn't load the Career Story for a match report", err);
        return null;
      });
      const report = await generateMatchReport(
        {
          resume: resume.parsed_markdown,
          jobDescription,
          jobTitle: userJob.custom_job_title || listing?.extracted_job_title || "",
          profile,
        },
        { onRating: (rating) => console.info(`Match report Requirements rated by ${rating.model}`) },
      );

      // Clearing the old markdown analysis makes the UI show the new report.
      const { error: updateError } = await supabase
        .from("user_job_listings")
        .update({
          match_report: report,
          match_analysis: null,
          analysis_documents: analysisDocuments,
        })
        .eq("id", id)
        .eq("user_id", user.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ report });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json(
        { error: `Analysis failed: ${message}` },
        { status: 500 },
      );
    }
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // Thinking counts toward max_tokens alongside the suggestions.
      max_tokens: 16000,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: `${PROMPTS[analysisType]}

---

## Resume

${resume.parsed_markdown}
${
  coverLetter?.parsed_markdown
    ? `
---

## Current Cover Letter

${coverLetter.parsed_markdown}
`
    : ""
}
---

## Job Description

${jobDescription}`,
        },
      ],
    });

    const analysisContent = getResponseText(response);

    // Save to database
    const { error: updateError } = await supabase
      .from("user_job_listings")
      .update({
        [analysisType]: analysisContent,
        analysis_documents: analysisDocuments,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ content: analysisContent });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Analysis failed: ${message}` },
      { status: 500 },
    );
  }
}

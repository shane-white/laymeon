import { createClient } from "@/lib/supabase/server";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { generateMatchReport } from "@/lib/match-report/generate";
import { resolveJobDocuments } from "@/lib/documents/resolve-job-documents";
import { loadProfile } from "@/lib/profile/rebuild";
import { NextResponse, type NextRequest } from "next/server";

const VALID_TYPES = [
  "match_analysis",
  "resume_suggestions",
  "cover_letter_suggestions",
  "interview_suggestions",
] as const;

type AnalysisType = (typeof VALID_TYPES)[number];

// The structured match report can take over a minute, plus one retry.
export const maxDuration = 180;

// match_analysis returns a structured report instead (see generateMatchReport).
const PROMPTS: Record<Exclude<AnalysisType, "match_analysis">, string> = {
  resume_suggestions: `Based on the job description below, suggest specific improvements to the candidate's resume to better match this role. Include:
- Keywords to add
- Experience to highlight or reframe
- Skills to emphasize
- Sections to add or reorganize

Be specific and actionable. Format your response in markdown.`,

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
      job_listing:job_listings (
        description
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
      cover_letter_id: coverLetter?.id ?? null,
      cover_letter_name: coverLetter?.display_name ?? null,
      generated_at: new Date().toISOString(),
    },
  };

  const jobDescription = (userJob.job_listing as unknown as { description: string | null })?.description;

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
      const report = await generateMatchReport(resume.parsed_markdown, jobDescription, profile);

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

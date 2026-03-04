import { createClient } from "@/lib/supabase/server";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { NextResponse, type NextRequest } from "next/server";

const VALID_TYPES = [
  "match_analysis",
  "resume_suggestions",
  "cover_letter_suggestions",
  "interview_suggestions",
] as const;

type AnalysisType = (typeof VALID_TYPES)[number];

const PROMPTS: Record<AnalysisType, string> = {
  match_analysis: `Analyze how well the candidate from this resume matches this job description. Evaluate:
- Skills alignment (what matches, what's missing)
- Experience relevance
- Education fit
- Overall match percentage estimate

Be specific and reference actual items from both the resume and job description. Format your response in markdown.`,

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

  // Fetch user's resume
  const { data: resume } = await supabase
    .from("documents")
    .select("parsed_markdown")
    .eq("user_id", user.id)
    .eq("document_type", "resume")
    .eq("source", "uploaded")
    .is("deleted_at", null)
    .single();

  if (!resume?.parsed_markdown) {
    return NextResponse.json(
      { error: "No resume found. Please upload a resume first." },
      { status: 400 },
    );
  }

  // Fetch job details
  const { data: userJob, error: jobError } = await supabase
    .from("user_job_listings")
    .select(`
      id,
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

  const jobDescription = (userJob.job_listing as unknown as { description: string | null })?.description;

  if (!jobDescription) {
    return NextResponse.json(
      { error: "Job has no description to analyze" },
      { status: 400 },
    );
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `${PROMPTS[analysisType]}

---

## Resume

${resume.parsed_markdown}

---

## Job Description

${jobDescription}`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response format from Claude");
    }

    const analysisContent = content.text;

    // Save to database
    const { error: updateError } = await supabase
      .from("user_job_listings")
      .update({ [analysisType]: analysisContent })
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

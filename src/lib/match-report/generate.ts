import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { formatCareerStoryForPrompt, type CareerStoryContext } from "@/lib/profile/for-prompt";
import type { CareerProfile } from "@/lib/profile/schema";
import { buildMatchReport } from "./build";
import { modelReportSchema, type MatchReport, type ModelReport } from "./schema";

const SYSTEM_PROMPT = `You compare a candidate's resume to a job posting the way applicant tracking systems (ATS) and recruiters do, and return the result as a structured match report.

The reader may never have thought about recruiting. Use plain, friendly language with no jargon.

Rules:
- Judge only what is written on the resume. "Missing" means missing from the resume, not that the candidate lacks the skill.
- Requirements: list every distinct requirement in the posting, one per entry. Mark must_have only when the posting says it is required (required, must, minimum, or listed under requirements/qualifications); preferred, bonus, plus, or nice-to-have items are nice_to_have.
- Evidence: copy a short quote from the resume exactly, character for character. Do not paraphrase, fix typos, or join separate lines. If there is no quote that supports the match, the match is not strong.
- Screeners: include only hard requirements the posting actually states that a resume is expected to show: minimum years of experience, degree, license or certification, security clearance, or a required location for an on-site or region-limited job. Leave the list empty if there are none.
- Never include eligibility questions applicants answer for themselves, which resumes don't usually cover: work authorization, visa sponsorship, citizenship or residency status, criminal history, background checks, drug tests, age, or willingness to travel, relocate or work certain shifts. Don't list them anywhere in the report: not as screeners, requirements, search words, fixes or next steps.
- Search words: pick the 8–12 terms a recruiter would most likely type into an ATS search for this job, using the posting's exact wording (skills, tools, job titles, certifications). For each term, if the resume doesn't use that exact wording, list the resume's own wordings for it, copied verbatim from the resume, and say whether each is the same thing in different words or related but not the same. Exact matches are checked in code, so don't guess whether a term is present.
- Actions and next steps: never suggest claiming skills or experience the candidate may not have. Phrase wording suggestions as "If true, add…".
- Be consistent: the same resume and posting should always produce the same assessment.
- Career Story: the candidate may also have a Career Story, built from their other documents and their own edits. It is not the resume. Never use it to decide a match, evidence, screener "shown", search words or the first impression: those are only about the resume. Use it only to fill careerStoryIds: for a requirement that isn't strong, or a screener that isn't shown, list the IDs of Career Story items that clearly show the candidate has it, most relevant first, or an empty list. For years-of-experience requirements and screeners, use the "Time in each role" items (R1, R2…) and the jobs' dates. Items marked "stated by the candidate" are the candidate's own statement and count the same. When an item shows a requirement, the action should suggest adding it to this resume, still phrased "If true, add…". Without a Career Story, leave every careerStoryIds empty.`;

function buildUserMessage(resume: string, jobDescription: string, careerStory?: CareerStoryContext): string {
  return `## Resume

${resume}

---

## Job posting

${jobDescription}

---

## Career Story (not the resume)

${careerStory?.text || "No Career Story."}`;
}

type ParsedReport = ReturnType<typeof modelReportSchema.safeParse>;

async function requestModelReport(
  messages: Anthropic.MessageParam[],
): Promise<{ response: Anthropic.Message; parsed: ParsedReport }> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // Thinking counts toward max_tokens alongside the report itself.
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(modelReportSchema),
    },
    messages,
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("The match report was too long to generate");
  }

  const text = getResponseText(response);
  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    output = undefined;
  }
  return { response, parsed: modelReportSchema.safeParse(output) };
}

/** Asks the model for a match report, retrying once if its output fails validation. */
export async function generateModelReport(
  resume: string,
  jobDescription: string,
  careerStory?: CareerStoryContext,
): Promise<ModelReport> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(resume, jobDescription, careerStory) },
  ];

  const first = await requestModelReport(messages);
  if (first.parsed.success) return first.parsed.data;

  // Send the whole first answer back unchanged (thinking blocks included), then the errors.
  const retry = await requestModelReport([
    ...messages,
    { role: "assistant", content: first.response.content },
    {
      role: "user",
      content: `The report didn't match the schema. Fix these problems and return the full report again:\n${z.prettifyError(first.parsed.error)}`,
    },
  ]);
  if (retry.parsed.success) return retry.parsed.data;

  throw new Error("Claude returned a match report that didn't match the expected format");
}

/**
 * Generates, verifies and labels a match report for a resume and job posting.
 * With the user's Career Story, the report also shows where it covers
 * requirements the resume doesn't.
 */
export async function generateMatchReport(
  resume: string,
  jobDescription: string,
  profile?: CareerProfile | null,
): Promise<MatchReport> {
  const careerStory = profile ? formatCareerStoryForPrompt(profile) : undefined;
  const model = await generateModelReport(resume, jobDescription, careerStory);
  return buildMatchReport(model, resume, careerStory);
}

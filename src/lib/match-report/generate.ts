import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { buildMatchReport } from "./build";
import { modelReportSchema, type MatchReport, type ModelReport } from "./schema";

const TOOL_NAME = "submit_match_report";

// The API expects a plain object schema, without the "$schema" dialect key.
const inputSchema: Record<string, unknown> = { ...z.toJSONSchema(modelReportSchema) };
delete inputSchema.$schema;

const MATCH_REPORT_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit the structured match report for this resume and job posting.",
  input_schema: inputSchema as Anthropic.Tool.InputSchema,
};

const SYSTEM_PROMPT = `You compare a candidate's resume to a job posting the way applicant tracking systems (ATS) and recruiters do, and report the result through the ${TOOL_NAME} tool.

The reader may never have thought about recruiting. Use plain, friendly language with no jargon.

Rules:
- Judge only what is written on the resume. "Missing" means missing from the resume, not that the candidate lacks the skill.
- Requirements: list every distinct requirement in the posting, one per entry. Mark must_have only when the posting says it is required (required, must, minimum, or listed under requirements/qualifications); preferred, bonus, plus, or nice-to-have items are nice_to_have.
- Evidence: copy a short quote from the resume exactly, character for character. Do not paraphrase, fix typos, or join separate lines. If there is no quote that supports the match, the match is not strong.
- Screeners: include only hard requirements the posting actually states (work authorization, location, license or certification, minimum years of experience, degree). Leave the list empty if there are none.
- Search words: pick the 8–12 terms a recruiter would most likely type into an ATS search for this job, using the posting's exact wording. When the resume doesn't use that exact term but uses other wording for it, give that wording copied verbatim from the resume.
- Actions and next steps: never suggest claiming skills or experience the candidate may not have. Phrase wording suggestions as "If true, add…".
- Be consistent: the same resume and posting should always produce the same assessment.`;

function buildUserMessage(resume: string, jobDescription: string): string {
  return `## Resume

${resume}

---

## Job posting

${jobDescription}`;
}

async function requestModelReport(
  messages: Anthropic.MessageParam[],
): Promise<{ toolUse: Anthropic.ToolUseBlock; parsed: ReturnType<typeof modelReportSchema.safeParse> }> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [MATCH_REPORT_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages,
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("The match report was too long to generate");
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === TOOL_NAME,
  );
  if (!toolUse) {
    throw new Error("Unexpected response format from Claude");
  }

  return { toolUse, parsed: modelReportSchema.safeParse(toolUse.input) };
}

/** Asks the model for a match report, retrying once if its output fails validation. */
export async function generateModelReport(
  resume: string,
  jobDescription: string,
): Promise<ModelReport> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(resume, jobDescription) },
  ];

  const first = await requestModelReport(messages);
  if (first.parsed.success) return first.parsed.data;

  const retry = await requestModelReport([
    ...messages,
    { role: "assistant", content: [first.toolUse] },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: first.toolUse.id,
          is_error: true,
          content: `The report didn't match the schema. Fix these problems and submit it again:\n${z.prettifyError(first.parsed.error)}`,
        },
      ],
    },
  ]);
  if (retry.parsed.success) return retry.parsed.data;

  throw new Error("Claude returned a match report that didn't match the expected format");
}

/** Generates, verifies and labels a match report for a resume and job posting. */
export async function generateMatchReport(
  resume: string,
  jobDescription: string,
): Promise<MatchReport> {
  const model = await generateModelReport(resume, jobDescription);
  return buildMatchReport(model, resume);
}

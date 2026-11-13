import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { extractionSchema, type Extraction } from "./schema";

export type SourceDocumentType = "resume" | "cover_letter" | "project";

const SYSTEM_PROMPT = `You read a document a person wrote about their work (a résumé, a cover letter, or a description of a project) and extract their work history, skills, accomplishments, education, certifications and languages the way applicant tracking systems (ATS) do, as structured data.

Rules:
- Use only what the document says about the person's own experience. Never guess or add anything.
- Evidence: copy a short quote from the document exactly, character for character. Don't paraphrase, fix typos, use ellipses or join separate lines.
- Dates: copy the document's dates as "YYYY-MM", or "YYYY" when it only gives the year. Use "present" for a current job. Don't compute durations.
- Skills: list every skill, tool, domain and method the document shows the person has, including ones only mentioned in passing. Give each one a standard canonicalName, and use exactly that canonicalName in each job's skills list.
- Never extract personal details that aren't about work: date of birth, age, gender, marital status, nationality, citizenship, visa or work authorization, religion, health, photos, or contact details.
- Be consistent: the same document should always produce the same result.

The user message says which kind of document it is. Follow the instructions for that kind.`;

const TYPE_INSTRUCTIONS: Record<SourceDocumentType, string> = {
  resume: `This is a résumé.
- positions: every job listed, with its achievements and the skills each job's text shows.
- Fill in every other section the résumé covers.`,

  cover_letter: `This is a cover letter the person wrote when applying for a job.
- The job and company being applied to are NOT the person's experience. Never list them as a position, and never list the posting's requirements as skills unless the letter shows the person has them ("I've used Python for five years").
- positions: only jobs the person says they've held, with the employer named ("At Lumen Analytics, I…"). Leave start and end empty unless the letter gives that job's dates. Put the accomplishments the letter describes for that job in its achievements, and the skills they show in its skills.
- If the letter describes an accomplishment without naming where it happened, list it under a position with an empty employer and title.
- skills: what the letter shows the person can do, not what they say they want to do.
- headline: empty. seniority: unknown.
- education, certifications, languages: only if the letter states them.`,

  project: `This is a description of a project the person worked on.
- positions: if the project says where it happened, one position with that employer and the person's title (empty if not stated). If it doesn't say where it happened, use one position with an empty employer and title.
- start and end: the dates of the project itself, if the document gives them ("present" if it's ongoing). Never the dates of the job it happened in. Empty if the project's dates aren't given.
- achievements: the project's outcomes and what the person did, especially measurable results. Put the metric in metric.
- skills: every skill, tool and method the project shows, also listed in that position's skills.
- headline: empty. seniority: unknown.
- education, certifications, languages: only if the document states them.`,
};

const TYPE_LABELS: Record<SourceDocumentType, string> = {
  resume: "Résumé",
  cover_letter: "Cover letter",
  project: "Project description",
};

function buildUserMessage(
  markdown: string,
  documentName: string,
  documentType: SourceDocumentType,
  asOf: string,
): string {
  return `Kind of document: ${TYPE_LABELS[documentType]}
Name: ${documentName}
Added on: ${asOf.slice(0, 10)}. "Present" in it means as of this date.

${TYPE_INSTRUCTIONS[documentType]}

---

${markdown}`;
}

type ParsedExtraction = ReturnType<typeof extractionSchema.safeParse>;

async function requestExtraction(
  messages: Anthropic.MessageParam[],
): Promise<{ response: Anthropic.Message; parsed: ParsedExtraction }> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // Thinking counts toward max_tokens alongside the extraction.
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "medium",
      format: zodOutputFormat(extractionSchema),
    },
    messages,
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("The document was too long to process");
  }

  let output: unknown;
  try {
    output = JSON.parse(getResponseText(response));
  } catch {
    output = undefined;
  }
  return { response, parsed: extractionSchema.safeParse(output) };
}

/**
 * Extracts structured profile data from one document's markdown, retrying
 * once if the output fails validation.
 */
export async function extractDocument(
  markdown: string,
  documentName: string,
  documentType: SourceDocumentType,
  asOf: string,
): Promise<Extraction> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(markdown, documentName, documentType, asOf) },
  ];

  const first = await requestExtraction(messages);
  if (first.parsed.success) return first.parsed.data;

  // Send the whole first answer back unchanged (thinking blocks included), then the errors.
  const retry = await requestExtraction([
    ...messages,
    { role: "assistant", content: first.response.content },
    {
      role: "user",
      content: `The result didn't match the schema. Fix these problems and return the full result again:\n${z.prettifyError(first.parsed.error)}`,
    },
  ]);
  if (retry.parsed.success) return retry.parsed.data;

  throw new Error("Claude returned profile data that didn't match the expected format");
}

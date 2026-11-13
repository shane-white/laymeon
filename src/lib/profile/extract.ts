import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { extractionSchema, type Extraction } from "./schema";

const SYSTEM_PROMPT = `You read a person's résumé and extract their work history, skills, education, certifications and languages the way applicant tracking systems (ATS) do, as structured data.

Rules:
- Use only what the document says. Never guess or add anything.
- Evidence: copy a short quote from the document exactly, character for character. Don't paraphrase, fix typos, use ellipses or join separate lines.
- Dates: copy the document's dates as "YYYY-MM", or "YYYY" when it only gives the year. Use "present" for a current job. Don't compute durations.
- Skills: list every skill, tool, domain and method the document shows, including ones only mentioned in job descriptions. Give each one a standard canonicalName, and use exactly that canonicalName in each job's skills list.
- Never extract personal details that aren't about work: date of birth, age, gender, marital status, nationality, citizenship, visa or work authorization, religion, health, photos, or contact details.
- Be consistent: the same document should always produce the same result.`;

function buildUserMessage(markdown: string, documentName: string, asOf: string): string {
  return `Document: ${documentName}
Added on: ${asOf.slice(0, 10)}. "Present" in it means as of this date.

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
 * Extracts the structured profile data from one résumé's markdown, retrying
 * once if the output fails validation.
 */
export async function extractDocument(
  markdown: string,
  documentName: string,
  asOf: string,
): Promise<Extraction> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildUserMessage(markdown, documentName, asOf) },
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

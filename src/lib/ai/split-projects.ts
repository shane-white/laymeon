import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { extractTextFromFile } from "@/lib/parsers/extract-text";
import { MAX_PROJECT_DESCRIPTION_LENGTH, MAX_PROJECT_TITLE_LENGTH } from "@/lib/projects";

const splitProjectsSchema = z.object({
  projects: z
    .array(
      z.object({
        title: z
          .string()
          .describe(
            'A short name for the project, e.g. "Checkout redesign at Acme" or "Data warehouse migration". Use the document\'s own heading for it if it has one.',
          ),
        description: z
          .string()
          .describe(
            "Everything the document says about this project, cleaned up and formatted as markdown. Keep every detail: the context, the problem, the author's role and actions, obstacles, results and numbers, skills and tools, dates, links. Don't summarize, reword or add anything.",
          ),
      }),
    )
    .describe("One entry per distinct project, in the order they appear. Empty if the document describes no projects."),
});

export type SplitProject = z.infer<typeof splitProjectsSchema>["projects"][number];

const SYSTEM_PROMPT = `You split documents into the projects they describe. The user uploads a document such as a portfolio, case studies, a list of projects or a brag document, and you return each project it describes as a separate entry.

A project is one distinct piece of work: a product, feature, initiative, engagement, case study or similar. Text that belongs to a project, such as its results or tools, stays with that project. Leave out text that isn't about a specific project, such as a cover page, table of contents, contact details or a general introduction. Remove page numbers, headers, footers and formatting artifacts.

Use only what the document says.`;

/** Splits an uploaded PDF or Word document into the projects it describes. */
export async function splitProjects(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<SplitProject[]> {
  let content: Anthropic.ContentBlockParam[];
  if (mimeType === "application/pdf") {
    content = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buffer.toString("base64"),
        },
      },
      { type: "text", text: `Filename: ${filename}` },
    ];
  } else {
    const text = await extractTextFromFile(buffer, mimeType);
    if (!text.trim()) {
      throw new Error("Could not extract any text from the document");
    }
    content = [{ type: "text", text: `Filename: ${filename}\n\n${text}` }];
  }

  // Streamed because the SDK refuses non-streaming calls with this many
  // max_tokens; only the final message is used.
  const response = await anthropic.messages
    .stream({
      model: CLAUDE_MODEL,
      // Thinking counts toward max_tokens, and every project is returned in full.
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: zodOutputFormat(splitProjectsSchema),
      },
      messages: [{ role: "user", content }],
    })
    .finalMessage();

  if (response.stop_reason === "max_tokens") {
    throw new Error("The document was too long to process");
  }

  let output: unknown;
  try {
    output = JSON.parse(getResponseText(response));
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("Could not read the projects in the document");
    }
    throw err;
  }

  const parsed = splitProjectsSchema.safeParse(output);
  if (!parsed.success) {
    throw new Error("Could not read the projects in the document");
  }

  return parsed.data.projects
    .map((p) => ({
      title: p.title.trim().slice(0, MAX_PROJECT_TITLE_LENGTH),
      description: p.description.trim().slice(0, MAX_PROJECT_DESCRIPTION_LENGTH),
    }))
    .filter((p) => p.title && p.description);
}

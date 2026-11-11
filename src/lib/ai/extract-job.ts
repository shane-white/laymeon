import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { firecrawl } from "@/lib/firecrawl/client";
import { seniorityLevelSchema, workArrangementSchema } from "@/lib/jobs/details";

const TOOL_NAME = "submit_job_listing";

const extractedJobSchema = z.object({
  title: z.string().describe('The job title, e.g. "Senior Software Engineer" or "Product Manager".'),
  company: z.string().nullable().describe("The company name, or null if the listing doesn't say."),
  location: z
    .string()
    .nullable()
    .describe(
      'Where the job is based, as short as possible, e.g. "Austin, TX", "London, UK" or "United States" for a remote job limited to a country. If there are several, join them with " / "; if more than three, give the first three and "+N more". Null if the listing doesn\'t say.',
    ),
  work_arrangement: workArrangementSchema
    .nullable()
    .describe(
      "on_site if the job is fully in the office, hybrid if it mixes office and remote days, remote if it is fully remote. Null if the listing doesn't say.",
    ),
  salary: z
    .string()
    .nullable()
    .describe(
      'The pay the listing states, formatted for display, keeping its currency and period, e.g. "$150,000–$180,000 a year", "£45k a year" or "$60–$75 an hour". Include equity or bonus only if stated, briefly (e.g. "+ equity"). Null if no pay is stated. Never estimate.',
    ),
  seniority_level: seniorityLevelSchema
    .nullable()
    .describe(
      "The level of the role. Use the title first (e.g. Senior → senior, Staff → staff, Head of / Director → director, VP → vp, C-level or President → executive, Team Lead / Tech Lead → lead, Engineering Manager → manager). If the title has no level, judge from the required years of experience and scope (about 0–2 years → junior, 3–5 → mid, 5+ → senior). Null only if there is nothing to go on.",
    ),
  description: z
    .string()
    .describe(
      "The full job description, cleaned up and formatted as markdown. Keep every detail about responsibilities, requirements, benefits, pay, location, etc. Remove navigation, ads and other page content that isn't part of the listing.",
    ),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

// Parses the tool input. A missing or invalid optional field becomes null
// instead of failing the whole extraction.
const lenientJobSchema = extractedJobSchema.extend({
  company: z.string().nullable().catch(null),
  location: z.string().nullable().catch(null),
  work_arrangement: workArrangementSchema.nullable().catch(null),
  salary: z.string().nullable().catch(null),
  seniority_level: seniorityLevelSchema.nullable().catch(null),
  description: z.string().catch(""),
});

// The API expects a plain object schema, without the "$schema" dialect key.
const inputSchema: Record<string, unknown> = { ...z.toJSONSchema(extractedJobSchema) };
delete inputSchema.$schema;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Submit the fields extracted from this job listing.",
  input_schema: inputSchema as Anthropic.Tool.InputSchema,
};

const SYSTEM_PROMPT = `You parse job listings. Read the listing the user gives you and report its fields through the ${TOOL_NAME} tool. Use only what the listing says; return null for any optional field it doesn't cover.`;

export async function extractJobFromUrl(url: string): Promise<ExtractedJob> {
  const scrapeResult = await firecrawl.scrape(url, {
    formats: ["markdown"],
  });

  if (!("markdown" in scrapeResult) || !scrapeResult.markdown) {
    const errorMsg =
      "error" in scrapeResult ? scrapeResult.error : "Unknown scrape error";
    throw new Error(`Failed to scrape URL: ${errorMsg}`);
  }

  return extractJobFromText(scrapeResult.markdown);
}

export async function extractJobFromText(text: string): Promise<ExtractedJob> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: text }],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("The job listing was too long to process");
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === TOOL_NAME,
  );
  if (!toolUse) {
    throw new Error("Unexpected response format from Claude");
  }

  const parsed = lenientJobSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new Error("Could not read the job listing details");
  }

  const job = parsed.data;
  if (!job.title.trim()) {
    throw new Error("Could not extract job title");
  }

  return {
    ...job,
    company: job.company || null,
    location: job.location || null,
    salary: job.salary || null,
    description: job.description || text,
  };
}

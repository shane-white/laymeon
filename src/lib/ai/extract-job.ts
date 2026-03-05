import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
import { firecrawl } from "@/lib/firecrawl/client";

interface ExtractedJob {
  title: string;
  company: string | null;
  description: string;
}

const EXTRACTION_PROMPT = `You are a job listing parser. Extract the following fields from the provided job listing text:

1. **title**: The job title (e.g. "Senior Software Engineer", "Product Manager")
2. **company**: The company name. If not found, return null.
3. **description**: The full job description text, cleaned up and formatted. Preserve all details about responsibilities, requirements, benefits, etc. Remove navigation elements, ads, and other irrelevant page content.

Respond with ONLY valid JSON in this exact format:
{"title": "...", "company": "...", "description": "..."}

Do not wrap in markdown code blocks. Do not include any other text.`;

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
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${EXTRACTION_PROMPT}\n\n---\n\n${text}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }

  const raw = content.text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(raw) as ExtractedJob;

  if (!parsed.title) {
    throw new Error("Could not extract job title");
  }

  return {
    title: parsed.title,
    company: parsed.company || null,
    description: parsed.description || text,
  };
}

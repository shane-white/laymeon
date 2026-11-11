import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { extractTextFromFile } from "@/lib/parsers/extract-text";

const MARKDOWN_PROMPT = `You are a document parser. Convert the following document into clean, simplified markdown.

Rules:
- Preserve all meaningful content (contact info, experience, education, skills, etc.)
- Use proper markdown headings (##, ###) for sections
- Use bullet points for lists
- Use **bold** for names, titles, and section headers
- Remove any garbled text, page numbers, headers/footers, or formatting artifacts
- Keep it concise but complete
- Do NOT add any content that isn't in the original
- Output ONLY the markdown, no preamble or explanation`;

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<{ markdown: string }> {
  if (mimeType === "application/pdf") {
    return parsePdfWithClaude(buffer, filename);
  }

  const rawText = await extractTextFromFile(buffer, mimeType);

  if (!rawText || rawText.trim().length === 0) {
    throw new Error("Could not extract any text from the document");
  }

  return parseTextWithClaude(rawText, filename);
}

async function parsePdfWithClaude(
  buffer: Buffer,
  filename: string,
): Promise<{ markdown: string }> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // Thinking counts toward max_tokens alongside the markdown.
    max_tokens: 16000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: buffer.toString("base64"),
            },
          },
          {
            type: "text",
            text: `${MARKDOWN_PROMPT}\n\nFilename: ${filename}`,
          },
        ],
      },
    ],
  });

  return { markdown: getResponseText(response) };
}

async function parseTextWithClaude(
  text: string,
  filename: string,
): Promise<{ markdown: string }> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // Thinking counts toward max_tokens alongside the markdown.
    max_tokens: 16000,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: `${MARKDOWN_PROMPT}\n\n---\n\nFilename: ${filename}\n\n${text}`,
      },
    ],
  });

  return { markdown: getResponseText(response) };
}

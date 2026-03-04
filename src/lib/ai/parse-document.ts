import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic/client";
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
    max_tokens: 4096,
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

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }

  return { markdown: content.text };
}

async function parseTextWithClaude(
  text: string,
  filename: string,
): Promise<{ markdown: string }> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `${MARKDOWN_PROMPT}\n\n---\n\nFilename: ${filename}\n\n${text}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response format from Claude");
  }

  return { markdown: content.text };
}

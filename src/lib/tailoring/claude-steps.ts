/** The Tailoring's Claude steps in production. */
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import type { TailoringSteps } from "./tailoring";

// Suggestions quote this Markdown word for word, and the copy prompt quotes
// it back against the user's original file, so the wording must not change.
const STRUCTURE_PROMPT = `You restructure a resume's text into clean, consistent Markdown. The text was read from the user's file and may have lost its layout.

Rules:
- Keep every word exactly as written: same wording, spelling, numbers and punctuation. Never reword, shorten, correct, merge or add anything.
- Keep the content in its original order.
- Put the name and contact details first, as plain lines under a "# " heading with the name.
- Make each section a "## " heading using the resume's own section title (for example "## Experience").
- Make each role a "### " heading with its title and employer as written, then its dates and location on the next line, then its bullets.
- Make every bullet or list item a "- " line, without its original bullet character.
- Remove only layout leftovers: page numbers, repeated headers and footers, stray symbols.
- Output only the Markdown, with no preamble, explanation or code fence.`;

/** Drops a code fence around the whole answer, which the prompt asks Claude not to add. */
function unfence(text: string): string {
  const match = text.trim().match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  return (match ? match[1] : text).trim();
}

export const claudeSteps: TailoringSteps = {
  async structureResume(resumeText) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      // Thinking counts toward max_tokens alongside the Markdown.
      max_tokens: 16000,
      output_config: { effort: "low" },
      system: STRUCTURE_PROMPT,
      messages: [{ role: "user", content: `<resume>\n${resumeText}\n</resume>` }],
    });
    return unfence(getResponseText(response));
  },
};

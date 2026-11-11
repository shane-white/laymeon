import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export const CLAUDE_MODEL = "claude-sonnet-5-5" as const;

/**
 * Returns the response's text, or throws if Claude declined the request or ran
 * out of output tokens. Thinking is always on for this model, so a response can
 * start with `thinking` blocks: read blocks by type, never by position.
 */
export function getResponseText(response: Anthropic.Message): string {
  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to process this request");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Claude's response was cut off because it was too long");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (!text) {
    throw new Error("Unexpected response format from Claude");
  }
  return text;
}

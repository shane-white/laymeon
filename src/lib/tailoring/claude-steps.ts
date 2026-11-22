/** The Tailoring's Claude steps in production. */
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL, getResponseText } from "@/lib/anthropic/client";
import { findSection, quoteMatches } from "./quotes";
import type { SuggestionRequest, TailoringSteps, WrittenSuggestion } from "./tailoring";

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

async function structureResume(resumeText: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // Thinking counts toward max_tokens alongside the Markdown.
    max_tokens: 16000,
    output_config: { effort: "low" },
    system: STRUCTURE_PROMPT,
    messages: [{ role: "user", content: `<resume>\n${resumeText}\n</resume>` }],
  });
  return unfence(getResponseText(response));
}

const SUGGESTIONS_PROMPT = `You help a job seeker tailor their resume to one job. For each numbered item (a requirement or screener from the job that the resume misses or only partly shows), write at most one Suggestion: a single edit to the resume that shows the item.

A Suggestion is one of:
- "rewrite": replace text already on the resume. "quote" is the text to replace, copied from the resume exactly, character for character: one bullet, line or sentence, never joined across lines and never shortened with "...". "text" is the replacement. "section" is empty.
- "add": add new text. Either put it after a line ("quote" is that line, copied exactly, and "section" is empty), or at the end of a section ("section" is the section's heading as written, and "quote" is empty). "text" is the new text, in the resume's own Markdown style (for example a "- " bullet).

Rules:
- Base each Suggestion only on the item's sources. For an item marked "Only reword", only reword what the resume already says, as a rewrite: never add a claim the resume doesn't make.
- For an item whose source is an Example Work, use only what the Example Work says, kept short enough to sit on the resume: either rewrite the line it best extends, or add it where it belongs (for example as a bullet under the role it happened in). When the Example Work shows something related rather than the item itself, describe only what the candidate actually did. Don't claim they did the item exactly.
- Never invent experience, numbers, employers, dates or tools. Keep the candidate's voice and the resume's tense and style.
- Prefer rewriting the most relevant existing line over adding one. Keep each change small.
- "why" says in one sentence how the edit helps with the item. The reader may never have thought about recruiting: use plain, friendly language with no jargon.
- Leave an item out when no honest edit would help.
- Put the item's number in "item". Give each item at most one Suggestion.`;

const suggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      item: z.number().int().describe("The item's number"),
      kind: z.enum(["rewrite", "add"]),
      quote: z
        .string()
        .describe(
          "Rewrite: the exact resume text to replace. Add: the exact line it goes after, or empty to add at the end of a section.",
        ),
      section: z.string().describe("Add at the end of a section: the section's heading as written. Otherwise empty."),
      text: z.string().describe("The new text"),
      why: z.string().describe("One plain sentence on how this helps with the item"),
    }),
  ),
});

type SuggestionsAnswer = z.infer<typeof suggestionsSchema>;

function itemsForPrompt(requests: SuggestionRequest[]): string {
  return requests
    .map((r, i) => {
      const what =
        r.target.kind === "screener"
          ? `Screener: ${r.target.text}`
          : `${r.target.importance === "must_have" ? "Must-have" : "Nice-to-have"} requirement (${r.target.match}): ${r.target.text}`;
      const basis =
        r.basis === "resume"
          ? ["   Only reword what the resume already says about this."]
          : r.basis === "example_work"
            ? [
                "   Source: an Example Work the candidate just wrote about a project that shows this item or something related to it.",
                ...r.sources.flatMap((s) => [
                  `   Title: ${s.label}`,
                  ...s.quotes.map((q) => `   <example_work>\n${q}\n   </example_work>`),
                ]),
              ]
            : ["   Sources:", ...r.sources.flatMap((s) => [`   - ${s.label}`, ...s.quotes.map((q) => `     "${q}"`)])];
      return [`${i + 1}. ${what}`, ...basis].join("\n");
    })
    .join("\n\n");
}

/**
 * Problems the schema can't catch: unknown or repeated items, quotes that
 * aren't in the Markdown or are in it more than once, and sections it lacks.
 */
function suggestionProblems(answer: SuggestionsAnswer, markdown: string, count: number): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const s of answer.suggestions) {
    if (s.item < 1 || s.item > count) problems.push(`There is no item ${s.item}.`);
    else if (seen.has(s.item)) problems.push(`Item ${s.item} has more than one Suggestion. Give it at most one.`);
    seen.add(s.item);
    if (s.kind === "rewrite" || s.quote.trim()) {
      const found = quoteMatches(markdown, s.quote).length;
      if (found === 0) problems.push(`Item ${s.item}: "${s.quote}" isn't in the resume word for word.`);
      else if (found > 1) {
        problems.push(`Item ${s.item}: "${s.quote}" is in the resume more than once. Quote enough to pick out one place.`);
      }
    } else if (!findSection(markdown, s.section)) {
      problems.push(`Item ${s.item}: the resume has no section headed "${s.section}".`);
    }
  }
  return problems;
}

type Answer = { response: Anthropic.Message; answer: SuggestionsAnswer | null; problems: string };

async function askForSuggestions(messages: Anthropic.MessageParam[]): Promise<Answer> {
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // Thinking counts toward max_tokens alongside the answer itself.
    max_tokens: 16000,
    system: SUGGESTIONS_PROMPT,
    output_config: { effort: "medium", format: zodOutputFormat(suggestionsSchema) },
    messages,
  });
  let output: unknown;
  try {
    output = JSON.parse(getResponseText(response));
  } catch {
    output = undefined;
  }
  const parsed = suggestionsSchema.safeParse(output);
  if (!parsed.success) return { response, answer: null, problems: z.prettifyError(parsed.error) };
  return { response, answer: parsed.data, problems: "" };
}

/**
 * Writes Suggestions, asking once more if the answer is malformed or has
 * problems. A second answer that still has quote problems is kept: the
 * Tailoring drops each Suggestion whose quote isn't in the Markdown.
 */
async function writeSuggestions(markdown: string, requests: SuggestionRequest[]): Promise<WrittenSuggestion[]> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `<resume>\n${markdown}\n</resume>\n\n<items>\n${itemsForPrompt(requests)}\n</items>` },
  ];
  const first = await askForSuggestions(messages);
  let { answer } = first;
  const problems = answer
    ? suggestionProblems(answer, markdown, requests.length)
        .map((p) => `- ${p}`)
        .join("\n")
    : first.problems;
  if (problems) {
    // Send the whole first answer back unchanged (thinking blocks included), then the problems.
    const retry = await askForSuggestions([
      ...messages,
      { role: "assistant", content: first.response.content },
      { role: "user", content: `Your answer has these problems. Fix them and return the full answer again:\n${problems}` },
    ]);
    answer = retry.answer;
  }
  if (!answer) throw new Error("Claude returned Suggestions that didn't match the expected format");

  const seen = new Set<number>();
  return answer.suggestions.flatMap((s) => {
    const request = requests[s.item - 1];
    if (!request || seen.has(s.item)) return [];
    seen.add(s.item);
    return [{ itemId: request.itemId, kind: s.kind, quote: s.quote, section: s.section, text: s.text, why: s.why }];
  });
}

export const claudeSteps: TailoringSteps = { structureResume, writeSuggestions };

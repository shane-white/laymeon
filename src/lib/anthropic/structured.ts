/**
 * One Claude call for structured output: the answer is checked against a Zod
 * schema, and Claude is asked once more when it doesn't fit (or has problems).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { anthropic, CLAUDE_MODEL, getResponseText } from "./client";

export interface StructuredRequest<T> {
  system: string;
  schema: z.ZodType<T>;
  effort: "low" | "medium";
  /** The user message. */
  content: string;
  /** Defaults to `CLAUDE_MODEL`. */
  model?: string;
  /** Problems with a well-formed answer, for Claude to fix on its second try. */
  check?: (data: T) => string[];
  /** Called after each Claude call, for evals and logs. */
  onUsage?: (usage: Anthropic.Usage, model: string) => void;
  /** Messages fit to show the user: when the call itself fails, and when no answer fits the schema. */
  errors: { callFailed: string; badAnswer: string };
  /** Names the call in the logs. */
  label: string;
}

type Attempt<T> = { response: Anthropic.Message; data: T | null; problems: string[] };

async function attempt<T>(request: StructuredRequest<T>, messages: Anthropic.MessageParam[]): Promise<Attempt<T>> {
  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: request.model ?? CLAUDE_MODEL,
      // Thinking counts toward max_tokens alongside the answer itself.
      max_tokens: 16000,
      system: request.system,
      output_config: { effort: request.effort, format: zodOutputFormat(request.schema) },
      messages,
    });
  } catch (error) {
    console.error(`${request.label}: Claude call failed`, error);
    throw new Error(request.errors.callFailed);
  }
  request.onUsage?.(response.usage, response.model);

  let output: unknown;
  try {
    output = JSON.parse(getResponseText(response));
  } catch {
    output = undefined;
  }
  const parsed = request.schema.safeParse(output);
  if (!parsed.success) return { response, data: null, problems: [z.prettifyError(parsed.error)] };
  return { response, data: parsed.data, problems: request.check?.(parsed.data) ?? [] };
}

/**
 * Asks Claude for an answer that fits `schema`, asking once more if it's
 * malformed or `check` finds problems. A first answer that's well formed is
 * kept when the second isn't, even with its problems.
 */
export async function askStructured<T>(request: StructuredRequest<T>): Promise<T> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: request.content }];
  const first = await attempt(request, messages);
  if (first.data && first.problems.length === 0) return first.data;

  const retry = await attempt(request, [
    ...messages,
    // The whole first answer, thinking blocks included, then the problems.
    { role: "assistant", content: first.response.content },
    {
      role: "user",
      content: `Your answer has these problems. Fix them and return the full answer again:\n${first.problems.map((p) => `- ${p}`).join("\n")}`,
    },
  ]);
  if (retry.data) return retry.data;
  if (first.data) return first.data;
  throw new Error(request.errors.badAnswer);
}

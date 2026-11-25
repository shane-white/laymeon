/** Process research's production adapters: Firecrawl for the web, Claude to read it. */
import type Anthropic from "@anthropic-ai/sdk";
import { askStructured } from "@/lib/anthropic/structured";
import { fetchWebPage, searchWeb } from "@/lib/firecrawl/web";
import { PROCESS_SYSTEM_PROMPT, processAnswerSchema, processUserMessage } from "./prompt";
import type { ProcessAnswer, ProcessRequest, ProcessResearchDeps } from "./research";

const CLAUDE_FAILED_MESSAGE = "We couldn't read what we found just now. Try again in a few minutes.";
const BAD_ANSWER_MESSAGE = "We couldn't make sense of what we found. Try again in a few minutes.";

const firecrawlSearch: ProcessResearchDeps["search"] = async (query, options) =>
  (await searchWeb(query, options)).map(({ url, title, snippet }) => ({ url, title, snippet }));

export interface ClaudeProcessOptions {
  model?: string;
  /** Called after each Claude call, for evals and logs. */
  onUsage?: (usage: Anthropic.Usage, model: string) => void;
}

/** Asks Claude to read the sources, retrying once if its answer doesn't fit the format. */
export function claudeProcessAsk(options: ClaudeProcessOptions = {}): ProcessResearchDeps["ask"] {
  return (request: ProcessRequest): Promise<ProcessAnswer> =>
    askStructured({
      label: "Process research",
      system: PROCESS_SYSTEM_PROMPT,
      schema: processAnswerSchema,
      effort: "medium",
      content: processUserMessage(request),
      model: options.model,
      onUsage: options.onUsage,
      errors: { callFailed: CLAUDE_FAILED_MESSAGE, badAnswer: BAD_ANSWER_MESSAGE },
    });
}

export function processResearchDeps(options: ClaudeProcessOptions = {}): ProcessResearchDeps {
  return {
    search: firecrawlSearch,
    fetchPage: fetchWebPage,
    ask: claudeProcessAsk(options),
    now: () => new Date(),
  };
}

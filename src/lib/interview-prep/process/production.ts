/** Process research's production adapters: Firecrawl for the web, Claude to read it. */
import type Anthropic from "@anthropic-ai/sdk";
import { askStructured } from "@/lib/anthropic/structured";
import { PROCESS_SYSTEM_PROMPT, processAnswerSchema, processUserMessage } from "./prompt";
import type { ProcessAnswer, ProcessRequest, ProcessResearchDeps, WebResult } from "./research";

const SEARCH_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 30_000;
/** Interview reports don't change often, so a page fetched in the last week is fine. */
const PAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const CLAUDE_FAILED_MESSAGE = "We couldn't read what we found just now. Try again in a few minutes.";
const BAD_ANSWER_MESSAGE = "We couldn't make sense of what we found. Try again in a few minutes.";

async function firecrawlClient() {
  // Imported when used, so loading this module doesn't need the API key.
  const { firecrawl } = await import("@/lib/firecrawl/client");
  return firecrawl;
}

export const firecrawlSearch: ProcessResearchDeps["search"] = async (query, options) => {
  const firecrawl = await firecrawlClient();
  const data = await firecrawl.search(query, {
    sources: ["web"],
    limit: options.limit,
    tbs: options.tbs,
    timeout: SEARCH_TIMEOUT_MS,
  });
  const results: WebResult[] = [];
  for (const item of data.web ?? []) {
    // Items are search results, or whole pages when scrape options are set (they aren't here).
    if ("url" in item && typeof item.url === "string") {
      results.push({ url: item.url, title: item.title ?? "", snippet: item.description ?? "" });
    }
  }
  return results;
};

export const firecrawlFetchPage: ProcessResearchDeps["fetchPage"] = async (url) => {
  const firecrawl = await firecrawlClient();
  try {
    const page = await firecrawl.scrape(url, {
      formats: ["markdown"],
      onlyMainContent: true,
      parsers: [],
      maxAge: PAGE_MAX_AGE_MS,
      timeout: PAGE_TIMEOUT_MS,
    });
    if (!page.markdown || page.metadata?.error) return null;
    return { markdown: page.markdown, publishedTime: page.metadata?.publishedTime ?? null };
  } catch {
    return null;
  }
};

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
    fetchPage: firecrawlFetchPage,
    ask: claudeProcessAsk(options),
    now: () => new Date(),
  };
}

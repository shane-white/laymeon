/**
 * The web through Firecrawl: a search and a page fetch, with timeouts and
 * Firecrawl's results normalized. Interview Prep's Process and Company
 * research each inject the web through their own seam; these are the
 * production adapters behind both.
 */

/** A search result. `dateText` is a news result's date as the search gave it, often relative ("3 months ago"). */
export interface WebHit {
  url: string;
  title: string;
  snippet: string;
  dateText: string | null;
}

export interface WebSearchOptions {
  limit: number;
  /** News results instead of web results. */
  news?: boolean;
  /** Firecrawl's time filter, e.g. `cdr:1,cd_min:11/25/2024,cd_max:11/25/2026`. */
  tbs?: string;
}

/** A fetched page. */
export interface WebPage {
  markdown: string;
  /** When the page says it was published, if it does. */
  publishedTime: string | null;
}

const SEARCH_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 30_000;
/** Interview reports and a company's about and values pages don't change often, so a page fetched in the last week is fine. */
const PAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function firecrawlClient() {
  // Imported when used, so loading this module doesn't need the API key.
  const { firecrawl } = await import("./client");
  return firecrawl;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Web results, or news results with `news`: [] when there are none. Throws, with a message fit to show the user, when the search fails. */
export async function searchWeb(query: string, { limit, news, tbs }: WebSearchOptions): Promise<WebHit[]> {
  const firecrawl = await firecrawlClient();
  let results: Awaited<ReturnType<typeof firecrawl.search>>;
  try {
    results = await firecrawl.search(query, { sources: [news ? "news" : "web"], limit, tbs, timeout: SEARCH_TIMEOUT_MS });
  } catch (err) {
    console.error("Web search failed", err);
    throw new Error("We couldn't search the web just now. Try refreshing in a minute.");
  }
  const items: unknown[] = (news ? results.news : results.web) ?? [];
  return items.flatMap((item) => {
    // Items are search results, or whole pages when scrape options are set (they aren't here).
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    const url = text(r.url);
    if (!url) return [];
    return [{ url, title: text(r.title), snippet: text(r.snippet) || text(r.description), dateText: text(r.date) || null }];
  });
}

/** The page's main content as Markdown, or null when it can't be fetched. */
export async function fetchWebPage(url: string): Promise<WebPage | null> {
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
}

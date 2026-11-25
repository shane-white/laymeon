/**
 * The web as the Company section sees it: a search and a page fetch.
 * Injected, so tests use fixtures and spend no credits; production uses
 * `@/lib/firecrawl/web`.
 */
import { fetchWebPage, searchWeb, type WebHit } from "@/lib/firecrawl/web";

/** A search result. `dateText` is the news date as the search gave it, often relative ("3 months ago"). */
export type SearchHit = WebHit;

export interface CompanyWeb {
  /** Web results, or news results when `news` is set: [] when there are none. Throws, with a message fit to show the user, when the search fails. */
  search(query: string, options: { news?: boolean; limit: number }): Promise<SearchHit[]>;
  /** The page as Markdown, or null when it can't be fetched. */
  fetchPage(url: string): Promise<string | null>;
}

/** The Company section's web in production, through Firecrawl. */
export function firecrawlCompanyWeb(): CompanyWeb {
  return {
    search: (query, options) => searchWeb(query, options),
    fetchPage: async (url) => (await fetchWebPage(url))?.markdown ?? null,
  };
}

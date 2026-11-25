/**
 * The web as the Company section sees it: a search and a page fetch, with
 * Firecrawl's results normalized. Injected, so tests use fixtures and spend no
 * credits.
 */

/** A search result. `dateText` is the news date as the search gave it, often relative ("3 months ago"). */
export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  dateText: string | null;
}

export interface CompanyWeb {
  /** Web results, or news results when `news` is set: [] when there are none. Throws, with a message fit to show the user, when the search fails. */
  search(query: string, options: { news?: boolean; limit: number }): Promise<SearchHit[]>;
  /** The page as Markdown, or null when it can't be fetched. */
  fetchPage(url: string): Promise<string | null>;
}

/** Cached pages up to a week old are fine for a company's about and values pages. */
const PAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SEARCH_TIMEOUT_MS = 30_000;
const PAGE_TIMEOUT_MS = 30_000;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The Company section's web in production, through Firecrawl. */
export function firecrawlCompanyWeb(): CompanyWeb {
  return {
    async search(query, { news, limit }) {
      const { firecrawl } = await import("@/lib/firecrawl/client");
      let results: Awaited<ReturnType<typeof firecrawl.search>>;
      try {
        results = await firecrawl.search(query, { sources: [news ? "news" : "web"], limit, timeout: SEARCH_TIMEOUT_MS });
      } catch (err) {
        console.error("Company search failed", err);
        throw new Error("We couldn't search the web just now. Try refreshing in a minute.");
      }
      const items: unknown[] = (news ? results.news : results.web) ?? [];
      return items.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const r = item as Record<string, unknown>;
        const url = text(r.url);
        if (!url) return [];
        return [
          {
            url,
            title: text(r.title),
            snippet: text(r.snippet) || text(r.description),
            dateText: text(r.date) || null,
          },
        ];
      });
    },
    async fetchPage(url) {
      const { firecrawl } = await import("@/lib/firecrawl/client");
      try {
        const page = await firecrawl.scrape(url, {
          formats: ["markdown"],
          onlyMainContent: true,
          parsers: [],
          maxAge: PAGE_MAX_AGE_MS,
          timeout: PAGE_TIMEOUT_MS,
        });
        return page.markdown || null;
      } catch {
        return null;
      }
    },
  };
}

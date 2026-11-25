/**
 * Process research (LAY-120): how a company interviews for a kind of role,
 * found by searching the web. Sourced or nothing: a stage or tip is kept only
 * when a source we actually fetched backs it.
 *
 * The web and Claude are injected (`ProcessResearchDeps`), so tests use
 * fixtures; the production adapters are in `production.ts`.
 */
import { normalizeText, quoteInResume } from "@/lib/match-report/evidence";
import type { InterviewPrepJob, ProcessData, Source } from "../interview-prep";

/** One web search result. */
export interface WebResult {
  url: string;
  title: string;
  snippet: string;
}

export interface SearchOptions {
  limit: number;
  /** Firecrawl's time filter, e.g. `cdr:1,cd_min:11/25/2024,cd_max:11/25/2026`. */
  tbs?: string;
}

/** A source as Claude sees it. Its `id` is how answers point back at it. */
export interface ProcessSource {
  id: string;
  url: string;
  /** The site's name, e.g. "reddit.com". */
  site: string;
  title: string;
  snippet: string;
  /** The page's text, trimmed, when it could be fetched. */
  content: string | null;
  /** When the page says it was published, if it does. */
  published: string | null;
}

/** What Claude is asked to read. */
export interface ProcessRequest {
  company: string;
  title: string;
  jobDescription: string | null;
  /** Today, as YYYY-MM-DD, so Claude can tell how old a report is. */
  today: string;
  sources: ProcessSource[];
}

/** What Claude answers. Every claim points at source IDs; code checks them. */
export interface ProcessAnswer {
  stages: { name: string; detail: string; sourceIds: string[] }[];
  /** A tip, quoted word for word from its source. */
  tips: { quote: string; sourceId: string }[];
  /** The year each cited source was written, when the source shows it. */
  sourceYears: { sourceId: string; year: number | null }[];
  /** What's common for this kind of role. Shown only when nothing sourced was found. */
  commonForRole: string;
}

export interface ProcessResearchDeps {
  search(query: string, options: SearchOptions): Promise<WebResult[]>;
  /** The page as Markdown, or null when it can't be fetched. */
  fetchPage(url: string): Promise<{ markdown: string; publishedTime: string | null } | null>;
  ask(request: ProcessRequest): Promise<ProcessAnswer>;
  now(): Date;
}

/** Search results are capped so the prompt stays small. */
const MAX_SOURCES = 15;
/** Pages read in full; the rest are seen by their search snippet only. */
const MAX_PAGES = 4;
/** Characters kept from each page. */
const MAX_PAGE_CHARS = 8000;

/** Sites Firecrawl can't fetch (Reddit) or that need a login: their snippet is all we get. */
const UNFETCHABLE_SITES = [
  "reddit.com",
  "linkedin.com",
  "facebook.com",
  "x.com",
  "twitter.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
];

const SITE_LABELS: Record<string, string> = {
  "reddit.com": "Reddit post",
  "teamblind.com": "Blind thread",
  "glassdoor.com": "Glassdoor review",
  "leetcode.com": "LeetCode post",
  "levels.fyi": "levels.fyi",
};

/** Words that end a company's legal name. Searches leave them out, to match the name people use. */
const LEGAL_SUFFIX = /[\s,]+(inc\.?|incorporated|corp\.?|corporation|llc|l\.l\.c\.|ltd\.?|limited|co\.?|gmbh|plc|s\.a\.|ag)$/i;

const NO_COMPANY_MESSAGE = "Add the company's name to this job to look up how it interviews.";
const SEARCH_FAILED_MESSAGE = "We couldn't search the web just now. Try again in a few minutes.";

function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

/** True when the site is `root` or one of its subdomains (old.reddit.com). */
function onSite(site: string, root: string): boolean {
  return site === root || site.endsWith(`.${root}`);
}

function siteLabel(site: string): string {
  const root = Object.keys(SITE_LABELS).find((r) => onSite(site, r));
  return root ? SITE_LABELS[root] : site;
}

/** The URL without its query, fragment or trailing slash, to spot the same page twice. */
function pageKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** The name people search for: "Acme Corp." → "Acme". */
function searchName(company: string): string {
  return company.replace(LEGAL_SUFFIX, "").trim() || company;
}

/** Drops results about something else with the same name, when they don't name the company at all. */
function mentionsCompany(result: WebResult, name: string): boolean {
  const normalized = normalizeText(name);
  if (normalizeText(`${result.title} ${result.snippet}`).includes(normalized)) return true;
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return compact.length > 0 && result.url.toLowerCase().replace(/[^a-z0-9]/g, "").includes(compact);
}

/** Markdown without images, link targets or runs of blank space, which only cost tokens. */
function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Firecrawl's `cdr` dates are MM/DD/YYYY. */
function usDate(date: Date): string {
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${mm}/${dd}/${date.getUTCFullYear()}`;
}

/** The role's process, first-hand reports from the last two years, and the company's own hiring pages. */
function processQueries(name: string, title: string, now: Date): { query: string; options: SearchOptions }[] {
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setUTCFullYear(now.getUTCFullYear() - 2);
  const quoted = `"${name}"`;
  return [
    { query: `${quoted} ${title} interview process`.replace(/\s+/g, " "), options: { limit: 10 } },
    {
      query: `${quoted} interview experience (site:reddit.com OR site:teamblind.com OR site:glassdoor.com OR site:leetcode.com)`,
      options: { limit: 10, tbs: `cdr:1,cd_min:${usDate(twoYearsAgo)},cd_max:${usDate(now)}` },
    },
    { query: `${quoted} how we hire interview`, options: { limit: 5 } },
  ];
}

async function gatherSources(name: string, title: string, deps: ProcessResearchDeps): Promise<ProcessSource[]> {
  const searches = await Promise.allSettled(
    processQueries(name, title, deps.now()).map(({ query, options }) => deps.search(query, options)),
  );
  if (searches.every((s) => s.status === "rejected")) throw new Error(SEARCH_FAILED_MESSAGE);

  const seen = new Set<string>();
  const results: WebResult[] = [];
  for (const search of searches) {
    if (search.status !== "fulfilled") continue;
    for (const result of search.value) {
      const key = pageKey(result.url);
      if (seen.has(key) || !mentionsCompany(result, name)) continue;
      seen.add(key);
      results.push(result);
    }
  }

  const sources: ProcessSource[] = results.slice(0, MAX_SOURCES).map((r, i) => ({
    id: `S${i + 1}`,
    url: r.url,
    site: siteOf(r.url),
    title: r.title,
    snippet: cleanMarkdown(r.snippet),
    content: null,
    published: null,
  }));

  const toFetch = sources.filter((s) => !UNFETCHABLE_SITES.some((root) => onSite(s.site, root))).slice(0, MAX_PAGES);
  await Promise.all(
    toFetch.map(async (source) => {
      const page = await deps.fetchPage(source.url).catch(() => null);
      if (!page) return;
      source.content = cleanMarkdown(page.markdown).slice(0, MAX_PAGE_CHARS) || null;
      source.published = page.publishedTime;
    }),
  );
  return sources;
}

/** Everything Claude saw from a source, which quotes and years are checked against. */
function sourceText(source: ProcessSource): string {
  return [source.title, source.snippet, source.content ?? "", source.published ?? ""].join("\n");
}

function uniqueSources(sources: (Source | null)[]): Source[] {
  const seen = new Set<string>();
  return sources.filter((s): s is Source => {
    if (!s || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

/** Researches how the Job's company interviews. Throws with a message fit to show the user. */
export async function researchProcess(job: InterviewPrepJob, deps: ProcessResearchDeps): Promise<ProcessData> {
  const company = job.company?.trim();
  if (!company) throw new Error(NO_COMPANY_MESSAGE);
  const title = job.title?.trim() ?? "";
  const now = deps.now();

  const sources = await gatherSources(searchName(company), title, deps);
  const answer = await deps.ask({
    company,
    title,
    jobDescription: job.description,
    today: now.toISOString().slice(0, 10),
    sources,
  });

  const byId = new Map(sources.map((s) => [s.id, s]));
  // A year is kept only when the source shows it, so a guessed date never reaches the user.
  const years = new Map<string, number>();
  for (const { sourceId, year } of answer.sourceYears) {
    const source = byId.get(sourceId);
    if (!source || !year || year < 2000 || year > now.getUTCFullYear()) continue;
    if (sourceText(source).includes(String(year))) years.set(sourceId, year);
  }
  const toSource = (id: string): Source | null => {
    const source = byId.get(id);
    if (!source) return null;
    const year = years.get(id);
    const label = siteLabel(source.site);
    return { title: year ? `${label}, ${year}` : label, url: source.url };
  };

  const stages = answer.stages
    .map((s) => ({ name: s.name.trim(), detail: s.detail.trim(), sources: uniqueSources(s.sourceIds.map(toSource)) }))
    .filter((s) => s.name && s.sources.length > 0);

  // Tips are quoted word for word, so one that isn't in its source was invented.
  const tips: ProcessData["tips"] = [];
  const seenQuotes = new Set<string>();
  for (const tip of answer.tips) {
    const source = byId.get(tip.sourceId);
    const quote = tip.quote.trim();
    if (!source || !quote || !quoteInResume(quote, sourceText(source))) continue;
    const key = normalizeText(quote);
    if (seenQuotes.has(key)) continue;
    seenQuotes.add(key);
    tips.push({ text: quote, sources: uniqueSources([toSource(tip.sourceId)]) });
  }

  const nothingFound = stages.length === 0 && tips.length === 0;
  return { stages, tips, commonForRole: nothingFound ? answer.commonForRole.trim() || null : null };
}


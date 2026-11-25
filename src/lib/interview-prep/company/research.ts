/**
 * Researches the Company section: what the company does, its news from the
 * last 6 months and what it says it values. About the company only, so it
 * doesn't read the Resume.
 *
 * 1. Search the company's name, and have Claude pick out its own website, the
 *    results about it (not another company with the same name) and a few
 *    words on what it does.
 * 2. Search news for the name plus those words, keeping the last 6 months, and
 *    fetch a few pages from the company's own site (about, mission, values).
 * 3. Have Claude write the briefing from those numbered sources, then keep
 *    only what's sourced (`assembleCompany`).
 */
import type { CompanyData, InterviewPrepJob } from "../interview-prep";
import { assembleCompany } from "./assemble";
import type { BriefSource, CompanyIdentity, CompanyModel } from "./company";
import { newsDate, withinMonths } from "./news-date";
import type { CompanyWeb, SearchHit } from "./web";

export interface CompanyResearchDeps {
  web: CompanyWeb;
  model: CompanyModel;
  now: () => Date;
}

const NEWS_MONTHS = 6;
const NAME_RESULTS = 10;
const NEWS_RESULTS = 10;
const SITE_RESULTS = 5;
/** Pages fetched from the company's own site. Each costs a Firecrawl credit. */
const SITE_PAGES = 3;
/** Enough of a page for its about or values text, without spending tokens on the rest. */
const PAGE_CHARS = 8000;

/**
 * Sites that are never a company's own, even when Claude picks one: job
 * boards, applicant tracking systems, social networks and company databases.
 */
const NOT_COMPANY_SITES = [
  "linkedin.com",
  "glassdoor.com",
  "indeed.com",
  "wikipedia.org",
  "crunchbase.com",
  "bloomberg.com",
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "myworkdayjobs.com",
  "workable.com",
  "smartrecruiters.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "reddit.com",
  "github.com",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function onSite(host: string, site: string): boolean {
  return host === site || host.endsWith(`.${site}`);
}

/** The company's own domain, from the hit Claude picked, unless it's a site that never is. */
function officialDomain(hits: SearchHit[], identity: CompanyIdentity): string | null {
  const official = identity.officialSite === null ? undefined : hits[identity.officialSite];
  const host = official && hostOf(official.url);
  if (!host || NOT_COMPANY_SITES.some((site) => onSite(host, site))) return null;
  return host;
}

/** Drops images and keeps link text without the URL, then caps the length. */
function pageText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .slice(0, PAGE_CHARS);
}

function uniqueByUrl(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((h) => !seen.has(h.url) && seen.add(h.url));
}

async function sitePages(web: CompanyWeb, domain: string, official: SearchHit): Promise<{ hit: SearchHit; text: string }[]> {
  const siteHits = await web.search(`site:${domain} about OR mission OR values OR culture`, { limit: SITE_RESULTS });
  const candidates = uniqueByUrl([official, ...siteHits.filter((h) => onSite(hostOf(h.url) ?? "", domain))]).slice(0, SITE_PAGES);
  const pages = await Promise.all(
    candidates.map(async (hit) => {
      const markdown = await web.fetchPage(hit.url);
      const text = markdown && pageText(markdown);
      return text ? { hit, text } : null;
    }),
  );
  return pages.filter((p) => p !== null);
}

async function recentNews(web: CompanyWeb, query: string, now: Date): Promise<{ hit: SearchHit; date: string }[]> {
  const hits = uniqueByUrl(await web.search(query, { news: true, limit: NEWS_RESULTS }));
  return hits.flatMap((hit) => {
    const date = newsDate(hit.dateText, now);
    return date && withinMonths(date, NEWS_MONTHS, now) ? [{ hit, date }] : [];
  });
}

export async function researchCompany(job: InterviewPrepJob, { web, model, now }: CompanyResearchDeps): Promise<CompanyData> {
  const company = job.company?.trim();
  if (!company) throw new Error("This Job has no company name to look up. Add one, then try again.");
  const today = now();
  const quoted = `"${company.replace(/"/g, "")}"`;

  const hits = uniqueByUrl(await web.search(quoted, { limit: NAME_RESULTS }));
  const identity: CompanyIdentity = hits.length
    ? await model.identify({ company, jobTitle: job.title, description: job.description, hits })
    : { officialSite: null, sameCompany: [], industry: "" };
  const industry = identity.industry.replace(/"/g, "").trim();
  const domain = officialDomain(hits, identity);
  const official = domain && identity.officialSite !== null ? hits[identity.officialSite] : null;

  const [news, pages] = await Promise.all([
    recentNews(web, `${quoted} ${industry}`.trim(), today),
    domain && official ? sitePages(web, domain, official) : Promise.resolve([]),
  ]);

  const others = [...new Set(identity.sameCompany)]
    .map((i) => hits[i])
    .filter((h): h is SearchHit => h !== undefined && h !== official);

  const unnumbered: Omit<BriefSource, "id">[] = [
    ...pages.map(({ hit, text }) => ({ kind: "site" as const, url: hit.url, title: hit.title, text, date: null })),
    ...others.map((h) => ({ kind: "web" as const, url: h.url, title: h.title, text: h.snippet, date: null })),
    ...news.map(({ hit, date }) => ({ kind: "news" as const, url: hit.url, title: hit.title, text: hit.snippet, date })),
  ];
  if (unnumbered.length === 0) return { whatTheyDo: null, news: [], values: [] };
  const sources: BriefSource[] = unnumbered.map((s, i) => ({ id: `S${i + 1}`, ...s }));

  const answer = await model.brief({ company, industry, sources }, (a) => assembleCompany(sources, a).problems);
  return assembleCompany(sources, answer).data;
}

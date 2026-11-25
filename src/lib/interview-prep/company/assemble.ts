/**
 * Turns Claude's briefing into `CompanyData`, enforcing "sourced or nothing":
 * every item must cite a source of the right kind, news takes its date from
 * its source, and a value must be quoted word for word from the company's own
 * site. What fails is dropped and listed as a problem, so Claude can be asked
 * once more.
 */
import { quoteInResume } from "@/lib/match-report/evidence";
import type { CompanyData, Source } from "../interview-prep";
import type { BriefAnswer, BriefSource } from "./company";

/** The site's name for a link: its host without "www.". */
export function siteName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function link(source: BriefSource): Source {
  return { title: siteName(source.url), url: source.url };
}

export function assembleCompany(sources: BriefSource[], answer: BriefAnswer): { data: CompanyData; problems: string[] } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const problems: string[] = [];

  let whatTheyDo: CompanyData["whatTheyDo"] = null;
  const text = answer.whatTheyDo.text.trim();
  if (text) {
    const cited: BriefSource[] = [];
    for (const id of new Set(answer.whatTheyDo.sourceIds)) {
      const source = byId.get(id);
      if (source) cited.push(source);
      else problems.push(`What they do cites ${id}, which isn't a source.`);
    }
    // One link per site: two pages of the same site read as a repeat.
    const sites = new Set<string>();
    const links = cited.filter((s) => !sites.has(siteName(s.url)) && sites.add(siteName(s.url))).map(link);
    if (links.length) whatTheyDo = { text, sources: links };
    else problems.push("What they do cites no source.");
  }

  const news: CompanyData["news"] = [];
  const newsSeen = new Set<string>();
  answer.news.forEach((item, i) => {
    const source = byId.get(item.sourceId);
    if (!source || source.kind !== "news" || !source.date) {
      problems.push(`News item ${i + 1} cites ${item.sourceId}, which isn't a news source.`);
    } else if (newsSeen.has(source.id)) {
      problems.push(`News item ${i + 1} repeats ${source.id}. Give each news source at most one item.`);
    } else {
      newsSeen.add(source.id);
      news.push({
        date: source.date,
        headline: item.headline.trim(),
        howItMightComeUp: item.howItMightComeUp.trim(),
        sources: [link(source)],
      });
    }
  });
  news.sort((a, b) => b.date.localeCompare(a.date));

  const values: CompanyData["values"] = [];
  answer.values.forEach((value, i) => {
    const source = byId.get(value.sourceId);
    const quote = value.quote.trim();
    if (!source || source.kind !== "site") {
      problems.push(`Value ${i + 1} cites ${value.sourceId}, which isn't a page on the company's own site.`);
    } else if (!quoteInResume(quote, source.text)) {
      problems.push(`Value ${i + 1}: "${quote}" isn't in ${source.id} word for word.`);
    } else {
      values.push({ text: quote, sources: [link(source)] });
    }
  });

  return { data: { whatTheyDo, news, values }, problems };
}

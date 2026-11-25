/**
 * The Company section's types and the seams its research works through: the
 * web (`web.ts`) and Claude (`claude.ts`). The research itself is in
 * `research.ts`, and the checks on Claude's answer in `assemble.ts`.
 */
import type { SearchHit } from "./web";

/** Which company a Job is at, as Claude read it from the posting and a web search. */
export interface CompanyIdentity {
  /** The index in the search hits of the company's own website, or null if none is. */
  officialSite: number | null;
  /** The indexes of the search hits about this company (not a different one with the same name). */
  sameCompany: number[];
  /** A few words on what the company does (e.g. "payments software"), to tell it apart in news searches. */
  industry: string;
}

export interface IdentifyInput {
  company: string;
  jobTitle: string | null;
  description: string | null;
  hits: SearchHit[];
}

/**
 * - `site`: a page on the company's own website, with its text.
 * - `news`: a news article from the last 6 months, with its date.
 * - `web`: another search result about the company, with its snippet.
 */
export type SourceKind = "site" | "news" | "web";

/** A numbered source Claude writes the briefing from. Claude cites it by `id`; code maps that back to the URL. */
export interface BriefSource {
  id: string;
  kind: SourceKind;
  url: string;
  title: string;
  text: string;
  /** The news date as an ISO date (YYYY-MM-DD), for news; null otherwise. */
  date: string | null;
}

/** Claude's briefing, citing sources by ID. Checked and turned into `CompanyData` by `assembleCompany`. */
export interface BriefAnswer {
  /** Empty `text` when the sources don't say what the company does. */
  whatTheyDo: { text: string; sourceIds: string[] };
  news: { sourceId: string; headline: string; howItMightComeUp: string }[];
  values: { quote: string; sourceId: string }[];
}

export interface BriefInput {
  company: string;
  industry: string;
  sources: BriefSource[];
}

export interface CompanyModel {
  identify(input: IdentifyInput): Promise<CompanyIdentity>;
  /**
   * Writes the briefing. `check` lists problems in an answer; when there are
   * any, Claude is asked once more. The answer is returned either way:
   * `assembleCompany` drops what still fails.
   */
  brief(input: BriefInput, check: (answer: BriefAnswer) => string[]): Promise<BriefAnswer>;
}

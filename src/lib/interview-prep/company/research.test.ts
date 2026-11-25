import { describe, expect, it } from "vitest";
import { interviewPrepJob } from "../testing";
import type { BriefAnswer, BriefInput, CompanyIdentity, CompanyModel, IdentifyInput } from "./company";
import { researchCompany } from "./research";
import type { CompanyWeb, SearchHit } from "./web";

const NOW = new Date("2026-11-25T12:00:00.000Z");

function hit(url: string, title = url, snippet = "", dateText: string | null = null): SearchHit {
  return { url, title, snippet, dateText };
}

const NAME_HITS = [
  hit("https://www.acme.com/", "Acme | Anvils for everyone", "Acme makes anvils."),
  hit("https://www.linkedin.com/company/acme", "Acme | LinkedIn", "Acme has 400 employees."),
  hit("https://acme-band.example/", "Acme the band", "A punk band."),
];
const NEWS_HITS = [
  hit("https://techcrunch.com/acme-self-serve", "Acme launches self-serve", "A self-serve plan.", "3 weeks ago"),
  hit("https://old.example.com/acme-2024", "Acme opens office", "Old news.", "2 years ago"),
  hit("https://undated.example.com/acme", "Acme something", "No date.", null),
];
const SITE_HITS = [hit("https://www.acme.com/values", "Our values"), hit("https://jobs.example.com/acme", "Acme jobs")];

/** A web that answers each query from `searches` (news searches by "news:" + query) and fetches `pages`. */
function fakeWeb(searches: Record<string, SearchHit[]>, pages: Record<string, string | null> = {}) {
  const queries: string[] = [];
  const fetched: string[] = [];
  const web: CompanyWeb = {
    async search(query, { news }) {
      const key = news ? `news:${query}` : query;
      queries.push(key);
      return searches[key] ?? [];
    },
    async fetchPage(url) {
      fetched.push(url);
      return pages[url] ?? null;
    },
  };
  return { web, queries, fetched };
}

const ACME_IDENTITY: CompanyIdentity = { officialSite: 0, sameCompany: [0, 1], industry: "anvil maker" };

const ANSWER: BriefAnswer = {
  whatTheyDo: { text: "Acme makes anvils.", sourceIds: ["S1"] },
  news: [{ sourceId: "S4", headline: "Launched a self-serve plan.", howItMightComeUp: "Expect questions on onboarding." }],
  values: [{ quote: "Default to clarity.", sourceId: "S2" }],
};

function fakeModel(identity: CompanyIdentity = ACME_IDENTITY, answer: BriefAnswer = ANSWER) {
  const identified: IdentifyInput[] = [];
  const briefed: BriefInput[] = [];
  const checked: string[][] = [];
  const model: CompanyModel = {
    async identify(input) {
      identified.push(input);
      return identity;
    },
    async brief(input, check) {
      briefed.push(input);
      checked.push(check(answer));
      return answer;
    },
  };
  return { model, identified, briefed, checked };
}

const ACME_SEARCHES = {
  '"Acme"': NAME_HITS,
  'news:"Acme" anvil maker': NEWS_HITS,
  "site:acme.com about OR mission OR values OR culture": SITE_HITS,
};
const ACME_PAGES = {
  "https://www.acme.com/": "# Acme\n\nAnvils for everyone.",
  "https://www.acme.com/values": "## Our values\n\n- Default to clarity.",
};

describe("researchCompany", () => {
  it("briefs from the company's own site, news from the last 6 months and results about the same company", async () => {
    const { web, queries, fetched } = fakeWeb(ACME_SEARCHES, ACME_PAGES);
    const { model, identified, briefed, checked } = fakeModel();

    const data = await researchCompany(interviewPrepJob(), { web, model, now: () => NOW });

    expect(identified[0]).toMatchObject({ company: "Acme", jobTitle: "Product Manager", hits: NAME_HITS });
    expect(queries).toEqual(['"Acme"', 'news:"Acme" anvil maker', "site:acme.com about OR mission OR values OR culture"]);
    expect(fetched).toEqual(["https://www.acme.com/", "https://www.acme.com/values"]);
    expect(briefed[0]).toEqual({
      company: "Acme",
      industry: "anvil maker",
      sources: [
        { id: "S1", kind: "site", url: "https://www.acme.com/", title: "Acme | Anvils for everyone", text: "# Acme\n\nAnvils for everyone.", date: null },
        { id: "S2", kind: "site", url: "https://www.acme.com/values", title: "Our values", text: "## Our values\n\n- Default to clarity.", date: null },
        { id: "S3", kind: "web", url: "https://www.linkedin.com/company/acme", title: "Acme | LinkedIn", text: "Acme has 400 employees.", date: null },
        { id: "S4", kind: "news", url: "https://techcrunch.com/acme-self-serve", title: "Acme launches self-serve", text: "A self-serve plan.", date: "2026-11-04" },
      ],
    });
    expect(checked[0]).toEqual([]);
    expect(data).toEqual({
      whatTheyDo: { text: "Acme makes anvils.", sources: [{ title: "acme.com", url: "https://www.acme.com/" }] },
      news: [
        {
          date: "2026-11-04",
          headline: "Launched a self-serve plan.",
          howItMightComeUp: "Expect questions on onboarding.",
          sources: [{ title: "techcrunch.com", url: "https://techcrunch.com/acme-self-serve" }],
        },
      ],
      values: [{ text: "Default to clarity.", sources: [{ title: "acme.com", url: "https://www.acme.com/values" }] }],
    });
  });

  it("doesn't treat a job board or social profile as the company's site", async () => {
    const { web, queries, fetched } = fakeWeb(ACME_SEARCHES, ACME_PAGES);
    const { model, briefed } = fakeModel({ ...ACME_IDENTITY, officialSite: 1 });

    await researchCompany(interviewPrepJob(), { web, model, now: () => NOW });

    expect(queries).toEqual(['"Acme"', 'news:"Acme" anvil maker']);
    expect(fetched).toEqual([]);
    expect(briefed[0].sources.map((s) => [s.kind, s.url])).toEqual([
      ["web", "https://www.acme.com/"],
      ["web", "https://www.linkedin.com/company/acme"],
      ["news", "https://techcrunch.com/acme-self-serve"],
    ]);
  });

  it("skips pages that can't be fetched", async () => {
    const { web } = fakeWeb(ACME_SEARCHES, { "https://www.acme.com/values": "## Our values\n\n- Default to clarity." });
    const { model, briefed } = fakeModel();

    await researchCompany(interviewPrepJob(), { web, model, now: () => NOW });

    expect(briefed[0].sources.filter((s) => s.kind === "site").map((s) => s.url)).toEqual(["https://www.acme.com/values"]);
  });

  it("asks Claude to fix items that aren't sourced", async () => {
    const { web } = fakeWeb(ACME_SEARCHES, ACME_PAGES);
    const { model, checked } = fakeModel(ACME_IDENTITY, { ...ANSWER, values: [{ quote: "We love anvils.", sourceId: "S2" }] });

    const data = await researchCompany(interviewPrepJob(), { web, model, now: () => NOW });

    expect(checked[0]).toEqual(['Value 1: "We love anvils." isn\'t in S2 word for word.']);
    expect(data.values).toEqual([]);
  });

  it("says nothing was found, without asking Claude for a briefing, when the searches find nothing", async () => {
    const { web } = fakeWeb({});
    const { model, briefed } = fakeModel({ officialSite: null, sameCompany: [], industry: "" });

    const data = await researchCompany(interviewPrepJob(), { web, model, now: () => NOW });

    expect(data).toEqual({ whatTheyDo: null, news: [], values: [] });
    expect(briefed).toEqual([]);
  });

  it("fails with a message when the Job has no company name", async () => {
    const { web } = fakeWeb({});
    const { model } = fakeModel();
    await expect(researchCompany(interviewPrepJob({ company: null }), { web, model, now: () => NOW })).rejects.toThrow(
      "This Job has no company name to look up. Add one, then try again.",
    );
  });
});

import { describe, expect, it } from "vitest";
import { assembleCompany } from "./assemble";
import type { BriefAnswer, BriefSource } from "./company";

const sources: BriefSource[] = [
  {
    id: "S1",
    kind: "site",
    url: "https://www.acme.com/about",
    title: "About Acme",
    text: "Acme makes anvils for cartoon coyotes.\n\n## Our values\n\n- **Default to clarity.**\n- Small teams, big ownership.",
    date: null,
  },
  { id: "S2", kind: "news", url: "https://news.example.com/acme-funding", title: "Acme raises $50M", text: "Acme raised a Series C.", date: "2026-09-02" },
  { id: "S3", kind: "news", url: "https://techcrunch.com/acme-launch", title: "Acme launches self-serve", text: "A self-serve plan.", date: "2026-11-01" },
  { id: "S4", kind: "web", url: "https://en.wikipedia.org/wiki/Acme", title: "Acme - Wikipedia", text: "Acme has about 400 staff.", date: null },
];

function answer(overrides: Partial<BriefAnswer> = {}): BriefAnswer {
  return {
    whatTheyDo: { text: "Anvils for coyotes. Series C, about 400 people.", sourceIds: ["S1", "S4"] },
    news: [
      { sourceId: "S2", headline: "Raised a $50M Series C.", howItMightComeUp: "Expect questions on scaling." },
      { sourceId: "S3", headline: "Launched a self-serve plan.", howItMightComeUp: "Expect questions on onboarding." },
    ],
    values: [
      { quote: "Default to clarity.", sourceId: "S1" },
      { quote: "Small teams, big ownership.", sourceId: "S1" },
    ],
    ...overrides,
  };
}

describe("assembleCompany", () => {
  it("links each item to its sources, dates the news from its source, newest first", () => {
    const { data, problems } = assembleCompany(sources, answer());
    expect(problems).toEqual([]);
    expect(data).toEqual({
      whatTheyDo: {
        text: "Anvils for coyotes. Series C, about 400 people.",
        sources: [
          { title: "acme.com", url: "https://www.acme.com/about" },
          { title: "en.wikipedia.org", url: "https://en.wikipedia.org/wiki/Acme" },
        ],
      },
      news: [
        {
          date: "2026-11-01",
          headline: "Launched a self-serve plan.",
          howItMightComeUp: "Expect questions on onboarding.",
          sources: [{ title: "techcrunch.com", url: "https://techcrunch.com/acme-launch" }],
        },
        {
          date: "2026-09-02",
          headline: "Raised a $50M Series C.",
          howItMightComeUp: "Expect questions on scaling.",
          sources: [{ title: "news.example.com", url: "https://news.example.com/acme-funding" }],
        },
      ],
      values: [
        { text: "Default to clarity.", sources: [{ title: "acme.com", url: "https://www.acme.com/about" }] },
        { text: "Small teams, big ownership.", sources: [{ title: "acme.com", url: "https://www.acme.com/about" }] },
      ],
    });
  });

  it("links What they do to each site once", () => {
    const twoPages: BriefSource[] = [...sources, { ...sources[0], id: "S5", url: "https://www.acme.com/" }];
    const { data } = assembleCompany(twoPages, answer({ whatTheyDo: { text: "Anvils.", sourceIds: ["S1", "S5", "S4"] } }));
    expect(data.whatTheyDo?.sources).toEqual([
      { title: "acme.com", url: "https://www.acme.com/about" },
      { title: "en.wikipedia.org", url: "https://en.wikipedia.org/wiki/Acme" },
    ]);
  });

  it("has no What they do when Claude found nothing, or cited no known source", () => {
    expect(assembleCompany(sources, answer({ whatTheyDo: { text: "", sourceIds: [] } })).data.whatTheyDo).toBeNull();
    const unsourced = assembleCompany(sources, answer({ whatTheyDo: { text: "Anvils.", sourceIds: ["S9"] } }));
    expect(unsourced.data.whatTheyDo).toBeNull();
    expect(unsourced.problems).toEqual(['What they do cites S9, which isn\'t a source.', "What they do cites no source."]);
  });

  it("drops news that isn't from a news source, or repeats one", () => {
    const { data, problems } = assembleCompany(
      sources,
      answer({
        news: [
          { sourceId: "S2", headline: "Raised.", howItMightComeUp: "Expect A." },
          { sourceId: "S2", headline: "Raised again.", howItMightComeUp: "Expect B." },
          { sourceId: "S1", headline: "Makes anvils.", howItMightComeUp: "Expect C." },
          { sourceId: "S7", headline: "Made up.", howItMightComeUp: "Expect D." },
        ],
      }),
    );
    expect(data.news.map((n) => n.headline)).toEqual(["Raised."]);
    expect(problems).toEqual([
      "News item 2 repeats S2. Give each news source at most one item.",
      "News item 3 cites S1, which isn't a news source.",
      "News item 4 cites S7, which isn't a news source.",
    ]);
  });

  it("keeps only values quoted word for word from the company's own site", () => {
    const { data, problems } = assembleCompany(
      sources,
      answer({
        values: [
          { quote: "Default to clarity", sourceId: "S1" },
          { quote: "We love customers.", sourceId: "S1" },
          { quote: "Acme has about 400 staff.", sourceId: "S4" },
        ],
      }),
    );
    expect(data.values.map((v) => v.text)).toEqual(["Default to clarity"]);
    expect(problems).toEqual([
      'Value 2: "We love customers." isn\'t in S1 word for word.',
      "Value 3 cites S4, which isn't a page on the company's own site.",
    ]);
  });
});

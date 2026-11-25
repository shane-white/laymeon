import { describe, expect, it } from "vitest";
import { interviewPrepJob } from "../testing";
import { researchProcess, type ProcessAnswer, type ProcessRequest, type ProcessResearchDeps, type WebResult } from "./research";

const REDDIT: WebResult = {
  url: "https://www.reddit.com/r/ProductManagement/comments/abc/acme_pm_interview/",
  title: "Acme PM interview experience",
  snippet: "Posted 2025. Acme PM loop: recruiter call, then a product sense round. Bring metrics for everything.",
};

const BLIND: WebResult = {
  url: "https://www.teamblind.com/post/Acme-PM-onsite-xyz",
  title: "Acme PM onsite",
  snippet: "Acme onsite was 4 rounds.",
};

function answer(overrides: Partial<ProcessAnswer> = {}): ProcessAnswer {
  return { stages: [], tips: [], sourceYears: [], commonForRole: "Most PM loops have a recruiter call and a panel.", ...overrides };
}

/** Search returns `results` for every query; pages come from `pages`; the model answers `reply`. */
function fakeDeps(
  options: {
    results?: WebResult[];
    pages?: Record<string, { markdown: string; publishedTime?: string | null }>;
    reply?: ProcessAnswer | ((request: ProcessRequest) => ProcessAnswer);
    search?: ProcessResearchDeps["search"];
  } = {},
) {
  const queries: string[] = [];
  const fetched: string[] = [];
  const requests: ProcessRequest[] = [];
  const deps: ProcessResearchDeps = {
    search:
      options.search ??
      (async (query) => {
        queries.push(query);
        return options.results ?? [];
      }),
    fetchPage: async (url) => {
      fetched.push(url);
      const page = options.pages?.[url];
      return page ? { markdown: page.markdown, publishedTime: page.publishedTime ?? null } : null;
    },
    ask: async (request) => {
      requests.push(request);
      const reply = options.reply ?? answer();
      return typeof reply === "function" ? reply(request) : reply;
    },
    now: () => new Date("2026-11-25T12:00:00Z"),
  };
  return { deps, queries, fetched, requests };
}

const job = interviewPrepJob({ company: "Acme", title: "Product Manager" });

describe("researchProcess", () => {
  it("keeps a stage backed by a source, linked and labeled with the site and year", async () => {
    const { deps } = fakeDeps({
      results: [REDDIT],
      reply: (request) =>
        answer({
          stages: [{ name: "Recruiter call", detail: "A short call about your background.", sourceIds: [request.sources[0].id] }],
          sourceYears: [{ sourceId: request.sources[0].id, year: 2025 }],
        }),
    });

    const data = await researchProcess(job, deps);

    expect(data.stages).toEqual([
      { name: "Recruiter call", detail: "A short call about your background.", sources: [{ title: "Reddit post, 2025", url: REDDIT.url }] },
    ]);
  });

  it("drops source IDs it never gave Claude, and stages left with no source", async () => {
    const { deps } = fakeDeps({
      results: [REDDIT],
      reply: answer({
        stages: [
          { name: "Recruiter call", detail: "Short.", sourceIds: ["S1", "S9"] },
          { name: "Made-up panel", detail: "Invented.", sourceIds: ["S9"] },
          { name: "Unsourced", detail: "No sources.", sourceIds: [] },
        ],
      }),
    });

    const data = await researchProcess(job, deps);

    expect(data.stages).toEqual([{ name: "Recruiter call", detail: "Short.", sources: [{ title: "Reddit post", url: REDDIT.url }] }]);
  });

  it("keeps a tip only when its quote is really in its source, and quotes it word for word", async () => {
    const { deps } = fakeDeps({
      results: [REDDIT],
      reply: answer({
        tips: [
          { quote: "Bring metrics for everything", sourceId: "S1" },
          { quote: "Always wear a suit", sourceId: "S1" },
          { quote: "Bring metrics for everything", sourceId: "S7" },
        ],
      }),
    });

    const data = await researchProcess(job, deps);

    expect(data.tips).toEqual([{ text: "Bring metrics for everything", sources: [{ title: "Reddit post", url: REDDIT.url }] }]);
  });

  it("dates a source only with a year the source itself shows, and never a future one", async () => {
    const { deps } = fakeDeps({
      results: [REDDIT, BLIND, { url: "https://acme.com/careers/how-we-hire", title: "How Acme hires", snippet: "Acme hiring in 2027." }],
      pages: { [BLIND.url]: { markdown: "Acme onsite was 4 rounds.", publishedTime: "2024-07-27T00:00:00Z" } },
      reply: answer({
        stages: [{ name: "Onsite", detail: "Four rounds.", sourceIds: ["S1", "S2", "S3"] }],
        sourceYears: [
          { sourceId: "S1", year: 2019 },
          { sourceId: "S2", year: 2024 },
          { sourceId: "S3", year: 2027 },
        ],
      }),
    });

    const data = await researchProcess(job, deps);

    expect(data.stages[0].sources.map((s) => s.title)).toEqual(["Reddit post", "Blind thread, 2024", "acme.com"]);
  });

  it("searches for the company by its exact name, for this role, in recent first-hand reports", async () => {
    const { deps, queries } = fakeDeps({ results: [REDDIT] });

    await researchProcess(interviewPrepJob({ company: "Acme Robotics", title: "Senior Product Manager" }), deps);

    expect(queries.length).toBeGreaterThanOrEqual(2);
    expect(queries.every((q) => q.includes('"Acme Robotics"'))).toBe(true);
    expect(queries.some((q) => q.includes("Senior Product Manager"))).toBe(true);
    expect(queries.some((q) => q.includes("site:reddit.com") && q.includes("site:teamblind.com"))).toBe(true);
  });

  it("gives Claude each page once, leaving out pages that don't mention the company", async () => {
    const other: WebResult = { url: "https://example.com/gremlins", title: "Gremlins review", snippet: "A film about a creature." };
    const { deps, requests } = fakeDeps({ results: [REDDIT, other, { ...REDDIT, url: `${REDDIT.url}?utm=x` }] });

    await researchProcess(job, deps);

    expect(requests[0].sources.map((s) => s.url)).toEqual([REDDIT.url]);
  });

  it("reads the full page where it can, but not Reddit, which can't be fetched", async () => {
    const { deps, fetched, requests } = fakeDeps({
      results: [REDDIT, BLIND],
      pages: { [BLIND.url]: { markdown: "![logo](https://x/y.png)\n[Community](https://www.teamblind.com/) Acme onsite was 4 rounds." } },
    });

    await researchProcess(job, deps);

    expect(fetched).toEqual([BLIND.url]);
    const [reddit, blind] = requests[0].sources;
    expect(reddit.content).toBeNull();
    expect(blind.content).toBe("Community Acme onsite was 4 rounds.");
  });

  it("still researches when some searches or pages fail", async () => {
    let calls = 0;
    const { deps, requests } = fakeDeps({
      search: async () => {
        calls += 1;
        if (calls === 1) throw new Error("timeout");
        return [REDDIT];
      },
    });

    await researchProcess(job, deps);

    expect(requests[0].sources.map((s) => s.url)).toEqual([REDDIT.url]);
  });

  it("fails with a message to show when every search fails", async () => {
    const { deps } = fakeDeps({
      search: async () => {
        throw new Error("503");
      },
    });

    await expect(researchProcess(job, deps)).rejects.toThrow("We couldn't search the web just now. Try again in a few minutes.");
  });

  it("needs the company's name", async () => {
    const { deps, queries } = fakeDeps();

    await expect(researchProcess(interviewPrepJob({ company: "  " }), deps)).rejects.toThrow(
      "Add the company's name to this job to look up how it interviews.",
    );
    expect(queries).toEqual([]);
  });

  it("shows what's common for the role only when nothing sourced was found", async () => {
    const empty = fakeDeps({ results: [REDDIT], reply: answer({ commonForRole: "Usually a recruiter call, then a panel." }) });
    expect(await researchProcess(job, empty.deps)).toEqual({
      stages: [],
      tips: [],
      commonForRole: "Usually a recruiter call, then a panel.",
    });

    const found = fakeDeps({
      results: [REDDIT],
      reply: answer({ stages: [{ name: "Recruiter call", detail: "Short.", sourceIds: ["S1"] }] }),
    });
    expect((await researchProcess(job, found.deps)).commonForRole).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildProfile } from "@/lib/profile/build";
import { careerStoryHash } from "@/lib/profile/career-story-hash";
import { applyUserChanges } from "@/lib/profile/changes";
import type { PracticeContext, SectionInput } from "../interview-prep";
import { interviewPrepJob, practiceCard, sampleData, scriptedPracticeWriter } from "../testing";
import { DECK_START_SIZE, practiceGenerator, practiceWriter, type CardAnswer, type CardsRequest } from "./writer";

const MARKDOWN = `**Product Manager** — Ledgerly (2021-01 – present)
- Built ACH payouts for invoice payments
Skills: SQL, Payments`;

const base = buildProfile(
  [
    {
      document: { id: "d", name: "Résumé", type: "resume", markdown: MARKDOWN, asOf: "2026-11-01T00:00:00Z", targetRole: null },
      extraction: {
        headline: "",
        seniority: "experienced",
        positions: [
          {
            employer: "Ledgerly",
            title: "Product Manager",
            titleFamily: "Product Manager",
            location: "",
            employmentType: "unknown",
            start: "2021-01",
            end: "present",
            peopleManaged: 0,
            achievements: [{ text: "Built ACH payouts for invoice payments", metric: "", evidence: "Built ACH payouts for invoice payments" }],
            skills: ["Payments"],
            evidence: "Product Manager** — Ledgerly",
          },
        ],
        skills: [{ name: "SQL", canonicalName: "SQL", category: "hard_skill", evidence: "SQL" }],
        education: [],
        certifications: [],
        languages: [],
      },
    },
  ],
  "2026-11-13T00:00:00Z",
);

const profile = applyUserChanges(base, [
  { id: "c1", section: "certification", kind: "add", targetKey: null, fields: { name: "PCI Professional" }, baseSnapshot: null, mergedKeys: null },
]).profile;

// In the Career Story as Claude sees it: [P1] the job, [A1] the ACH payouts, [C1] the certification the user added.
const RESUME = "## Experience\nProduct Manager, Ledgerly. Built ACH payouts for invoice payments.";

function context(overrides: Partial<PracticeContext> = {}): PracticeContext {
  return {
    job: interviewPrepJob({ resume: { name: "PM Resume", text: RESUME } }),
    careerStory: profile,
    research: { process: null, company: null },
    ...overrides,
  };
}

function answer(overrides: Partial<CardAnswer> = {}): CardAnswer {
  return {
    question: "Tell me about a launch you led.",
    probing: "Ownership from start to finish.",
    outline: ["The goal", "What you did", "The result"],
    experiences: [{ text: "ACH payouts at Ledgerly", careerStoryIds: ["A1"] }],
    ...overrides,
  };
}

function fakeModel(answers: CardAnswer[] | ((request: CardsRequest) => CardAnswer[])) {
  const requests: CardsRequest[] = [];
  return {
    requests,
    model: {
      async cards(request: CardsRequest) {
        requests.push(request);
        return typeof answers === "function" ? answers(request) : answers;
      },
    },
  };
}

function numbered() {
  let n = 0;
  return () => `id-${++n}`;
}

describe("practiceWriter.write", () => {
  it("writes cards whose experiences are backed by the Career Story items Claude pointed at, with their Evidence", async () => {
    const { model } = fakeModel([answer()]);
    const [card] = await practiceWriter({ model, newId: numbered() }).write(context(), { deck: "behavioral", count: 6, avoid: [] });
    expect(card).toEqual({
      id: "id-1",
      deck: "behavioral",
      question: "Tell me about a launch you led.",
      own: false,
      mark: "not_tried",
      hint: {
        probing: "Ownership from start to finish.",
        outline: ["The goal", "What you did", "The result"],
        experiences: [
          {
            text: "ACH payouts at Ledgerly",
            onResume: true,
            backedBy: [
              {
                ref: { section: "accomplishment", key: expect.any(String), label: "Built ACH payouts for invoice payments", byUser: false },
                evidence: [{ documentName: "Résumé", quote: "Built ACH payouts for invoice payments" }],
              },
            ],
          },
        ],
      },
      hintStatus: "ready",
      hintRequestedAt: null,
      hintBasis: careerStoryHash(profile),
    });
  });

  it("flags an experience that isn't on this Job's Resume", async () => {
    const { model } = fakeModel([answer({ experiences: [{ text: "Your PCI certification", careerStoryIds: ["[C1]"] }] })]);
    const [card] = await practiceWriter({ model, newId: numbered() }).write(context(), { deck: "behavioral", count: 1, avoid: [] });
    expect(card.hint?.experiences).toMatchObject([
      { text: "Your PCI certification", onResume: false, backedBy: [{ ref: { section: "certification", byUser: true }, evidence: [] }] },
    ]);
  });

  it("flags nothing when the Job has no Resume", async () => {
    const { model } = fakeModel([answer()]);
    const ctx = context({ job: interviewPrepJob({ resume: null }) });
    const [card] = await practiceWriter({ model, newId: numbered() }).write(ctx, { deck: "behavioral", count: 1, avoid: [] });
    expect(card.hint?.experiences[0].onResume).toBeNull();
  });

  it("drops experiences that point at nothing in the Career Story", async () => {
    const { model } = fakeModel([answer({ experiences: [{ text: "Made up", careerStoryIds: ["A9", "R1"] }] })]);
    const [card] = await practiceWriter({ model, newId: numbered() }).write(context(), { deck: "behavioral", count: 1, avoid: [] });
    expect(card.hint?.experiences).toEqual([]);
  });

  it("gives questions to ask them no experiences", async () => {
    const { model } = fakeModel([answer({ question: "What does success look like in 90 days?" })]);
    const [card] = await practiceWriter({ model, newId: numbered() }).write(context(), { deck: "ask", count: 1, avoid: [] });
    expect(card.hint?.experiences).toEqual([]);
  });

  it("leaves out repeats of questions already in the Deck, and keeps to the count", async () => {
    const { model, requests } = fakeModel([
      answer({ question: "tell me about a mistake" }),
      answer({ question: "One?" }),
      answer({ question: "one" }),
      answer({ question: "Two?" }),
      answer({ question: "Three?" }),
    ]);
    const cards = await practiceWriter({ model, newId: numbered() }).write(context(), {
      deck: "behavioral",
      count: 2,
      avoid: ["Tell me about a mistake."],
    });
    expect(cards.map((c) => c.question)).toEqual(["One?", "Two?"]);
    expect(requests[0].want).toEqual({ kind: "new", count: 2, avoid: ["Tell me about a mistake."] });
  });

  it("gives Claude the Job, the Career Story and the research, not the Resume", async () => {
    const { model, requests } = fakeModel([answer()]);
    await practiceWriter({ model, newId: numbered() }).write(context({ research: { process: sampleData.process, company: null } }), {
      deck: "company",
      count: 1,
      avoid: [],
    });
    expect(requests[0]).toMatchObject({
      deck: "company",
      job: { title: "Product Manager", company: "Acme" },
      research: { process: sampleData.process, company: null },
    });
    expect(requests[0].careerStory).toContain("[A1] Built ACH payouts for invoice payments");
    expect(JSON.stringify(requests[0])).not.toContain("## Experience");
  });

  it("fails when Claude writes no usable cards", async () => {
    const { model } = fakeModel([answer({ question: "  " })]);
    await expect(practiceWriter({ model, newId: numbered() }).write(context(), { deck: "role", count: 1, avoid: [] })).rejects.toThrow();
  });
});

describe("practiceWriter.hint", () => {
  it("writes a hint for the user's question as asked", async () => {
    const { model, requests } = fakeModel([answer({ question: "Something else?" })]);
    const result = await practiceWriter({ model, newId: numbered() }).hint(context(), { deck: "behavioral", question: "Why did you leave?" });
    expect(requests[0].want).toEqual({ kind: "hint", question: "Why did you leave?" });
    expect(result).toMatchObject({ hint: { probing: "Ownership from start to finish." }, hintBasis: careerStoryHash(profile) });
  });
});

describe("practiceGenerator", () => {
  function input(overrides: Partial<SectionInput<"practice">> = {}): SectionInput<"practice"> {
    return {
      job: interviewPrepJob(),
      careerStory: profile,
      previous: null,
      research: async () => ({ process: sampleData.process, company: sampleData.company }),
      ...overrides,
    };
  }

  it("starts the Decks at 6 behavioral, 6 role, 5 about the company and 5 to ask them", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const data = await practiceGenerator(writer)(input());
    expect(DECK_START_SIZE).toEqual({ behavioral: 6, role: 6, company: 5, ask: 5 });
    expect(calls.write.map((c) => [c.deck, c.count])).toEqual(
      expect.arrayContaining([["behavioral", 6], ["role", 6], ["company", 5], ["ask", 5]]),
    );
    expect(data.cards).toHaveLength(22);
    expect(data.cards.map((c) => c.deck)).toEqual([...Array(6).fill("behavioral"), ...Array(6).fill("role"), ...Array(5).fill("company"), ...Array(5).fill("ask")]);
  });

  it("writes behavioral questions without the research, and the rest with it", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    await practiceGenerator(writer)(input());
    const research = Object.fromEntries(calls.write.map((c) => [c.deck, c.context.research]));
    expect(research.behavioral).toEqual({ process: null, company: null });
    expect(research.role).toEqual({ process: sampleData.process, company: sampleData.company });
    expect(research.ask).toEqual({ process: sampleData.process, company: sampleData.company });
  });

  it("on a refresh, writes a Deck that has no cards yet and keeps the cards there", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const previous = { cards: [practiceCard({ deck: "behavioral" }), practiceCard({ id: "r", deck: "role" }), practiceCard({ id: "c", deck: "company" })] };
    const data = await practiceGenerator(writer)(input({ previous }));
    expect(calls.write.map((c) => [c.deck, c.count])).toEqual([["ask", 5]]);
    expect(data.cards.slice(0, 3)).toEqual(previous.cards);
    expect(data.cards).toHaveLength(8);
  });

  it("on a refresh with every Deck there, adds a few About this company cards from the latest research", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const previous = { cards: (["behavioral", "role", "company", "ask"] as const).map((deck) => practiceCard({ id: deck, deck, question: `${deck}?` })) };
    await practiceGenerator(writer)(input({ previous }));
    expect(calls.write).toMatchObject([{ deck: "company", count: 3, avoid: ["company?"], context: { research: { company: sampleData.company } } }]);
  });

  it("counts only generated cards, so a Deck with just the user's own question is still written", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const previous = { cards: [practiceCard({ deck: "ask", own: true })] };
    await practiceGenerator(writer)(input({ previous }));
    expect(calls.write.find((c) => c.deck === "ask")).toMatchObject({ count: 5 });
  });

  it("keeps the Decks that were written when another fails", async () => {
    let n = 0;
    const { writer } = scriptedPracticeWriter();
    const flaky = { ...writer, write: async (...args: Parameters<typeof writer.write>) => (++n === 1 ? Promise.reject(new Error("busy")) : writer.write(...args)) };
    const data = await practiceGenerator(flaky)(input());
    expect(new Set(data.cards.map((c) => c.deck)).size).toBe(3);
  });

  it("fails when no Deck could be written", async () => {
    const { writer } = scriptedPracticeWriter({ failWrite: new Error("Claude is busy") });
    await expect(practiceGenerator(writer)(input())).rejects.toThrow("Claude is busy");
  });
});

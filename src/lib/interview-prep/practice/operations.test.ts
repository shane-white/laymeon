import { describe, expect, it } from "vitest";
import { getInterviewPrep, prepareSection } from "../lifecycle";
import { emptySection } from "../sections";
import type { InterviewPrepDeps, PracticeCard } from "../interview-prep";
import {
  interviewPrepJob,
  memoryCareerStory,
  NOW,
  practiceCard,
  sampleData,
  scriptedGenerators,
  scriptedPracticeWriter,
  setup,
} from "../testing";
import { addMoreCards, addOwnQuestion, markCard, writeHint } from "./operations";

type Store = ReturnType<typeof setup>["store"];

async function withCards(store: Store, cards: PracticeCard[]) {
  await store.saveSection("job-1", "practice", { ...emptySection(), status: "ready", researchedAt: NOW, data: { cards } });
}

async function cardsOf(deps: InterviewPrepDeps) {
  const result = await getInterviewPrep(deps, "job-1");
  if (!result.ok) throw new Error(result.message);
  return result.prep?.sections.practice.data?.cards ?? [];
}

describe("markCard", () => {
  it("saves a mark, and Not tried yet clears it", async () => {
    const { deps, store } = setup();
    await withCards(store, [practiceCard()]);
    expect(await markCard(deps, "job-1", "card-1", "practice_more")).toMatchObject({ ok: true });
    expect((await cardsOf(deps))[0].mark).toBe("practice_more");
    await markCard(deps, "job-1", "card-1", "not_tried");
    expect((await cardsOf(deps))[0].mark).toBe("not_tried");
  });

  it("fails for a card the Interview Prep doesn't have", async () => {
    const { deps, store } = setup();
    await withCards(store, [practiceCard()]);
    expect(await markCard(deps, "job-1", "card-2", "feels_good")).toMatchObject({ ok: false, kind: "not_found" });
  });
});

describe("addMoreCards", () => {
  it("adds 5 cards to the Deck, after the ones there, avoiding their questions", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps, store } = setup({ practice: writer });
    await withCards(store, [practiceCard(), practiceCard({ id: "card-2", deck: "role", question: "Walk me through a project." })]);
    await addMoreCards(deps, "job-1", "behavioral");
    expect(calls.write[0]).toMatchObject({ deck: "behavioral", count: 5, avoid: ["Tell me about a mistake."] });
    const cards = await cardsOf(deps);
    expect(cards.map((c) => c.id)).toEqual(["card-1", "card-2", "written-1", "written-2", "written-3", "written-4", "written-5"]);
  });

  it("keeps a mark saved while the new cards are being written", async () => {
    const late = {} as { deps: InterviewPrepDeps };
    const { writer } = scriptedPracticeWriter({ before: async () => void (await markCard(late.deps, "job-1", "card-1", "feels_good")) });
    const built = setup({ practice: writer });
    const deps = (late.deps = built.deps);
    await withCards(built.store, [practiceCard()]);
    await addMoreCards(deps, "job-1", "behavioral");
    const cards = await cardsOf(deps);
    expect(cards[0].mark).toBe("feels_good");
    expect(cards).toHaveLength(6);
  });

  it("gives the writer the Process and Company research", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps, store } = setup({ practice: writer });
    await store.saveSection("job-1", "company", { ...emptySection(), status: "ready", data: sampleData.company });
    await addMoreCards(deps, "job-1", "company");
    expect(calls.write[0].context.research).toEqual({ process: null, company: sampleData.company });
  });

  it("needs a Career Story", async () => {
    const { deps } = setup({ careerStory: memoryCareerStory(null) });
    expect(await addMoreCards(deps, "job-1", "behavioral")).toMatchObject({ ok: false, kind: "no_career_story" });
  });

  it("says when the cards couldn't be written, and saves nothing", async () => {
    const { writer } = scriptedPracticeWriter({ failWrite: new Error("Claude is busy") });
    const { deps, store } = setup({ practice: writer });
    await withCards(store, [practiceCard()]);
    expect(await addMoreCards(deps, "job-1", "behavioral")).toEqual({ ok: false, kind: "write_failed", message: "Claude is busy" });
    expect(await cardsOf(deps)).toHaveLength(1);
  });
});

describe("addOwnQuestion", () => {
  it("adds the user's question to the Deck with a hint written for it", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps, store } = setup({ practice: writer });
    await withCards(store, [practiceCard()]);
    await addOwnQuestion(deps, "job-1", "behavioral", "  Why did you leave after a year?  ");
    expect(calls.hint[0]).toMatchObject({ deck: "behavioral", question: "Why did you leave after a year?" });
    const own = (await cardsOf(deps))[1];
    expect(own).toMatchObject({
      deck: "behavioral",
      question: "Why did you leave after a year?",
      own: true,
      mark: "not_tried",
      hintStatus: "ready",
      hint: { probing: "Listening for: Why did you leave after a year?" },
      hintBasis: "basis-2",
      hintRequestedAt: null,
    });
  });

  it("saves the card as writing its hint before the hint is ready", async () => {
    const late = {} as { deps: InterviewPrepDeps };
    let seen: PracticeCard[] = [];
    const { writer } = scriptedPracticeWriter({ before: async () => void (seen = await cardsOf(late.deps)) });
    const deps = (late.deps = setup({ practice: writer }).deps);
    await addOwnQuestion(deps, "job-1", "ask", "What's the team like?");
    expect(seen).toMatchObject([{ question: "What's the team like?", own: true, hint: null, hintStatus: "writing", hintRequestedAt: NOW }]);
  });

  it("keeps the card when its hint fails, so the hint can be tried again", async () => {
    const { writer } = scriptedPracticeWriter({ failHint: new Error("Claude is busy") });
    const { deps } = setup({ practice: writer });
    expect(await addOwnQuestion(deps, "job-1", "ask", "What's the team like?")).toMatchObject({ ok: true });
    expect(await cardsOf(deps)).toMatchObject([{ own: true, hint: null, hintStatus: "failed", hintRequestedAt: null }]);
  });

  it("refuses an empty question", async () => {
    const { deps } = setup();
    expect(await addOwnQuestion(deps, "job-1", "ask", "   ")).toMatchObject({ ok: false, kind: "invalid" });
    expect(await cardsOf(deps)).toEqual([]);
  });
});

describe("writeHint", () => {
  it("rewrites a card's hint and keeps its question and mark", async () => {
    const { deps, store } = setup();
    await withCards(store, [practiceCard({ mark: "practice_more", hintStatus: "failed", hint: null })]);
    await writeHint(deps, "job-1", "card-1");
    expect((await cardsOf(deps))[0]).toMatchObject({
      question: "Tell me about a mistake.",
      mark: "practice_more",
      hintStatus: "ready",
      hint: { probing: "Listening for: Tell me about a mistake." },
      hintBasis: "basis-2",
    });
  });

  it("fails for a card the Interview Prep doesn't have", async () => {
    const { deps } = setup();
    expect(await writeHint(deps, "job-1", "card-9")).toMatchObject({ ok: false, kind: "not_found" });
  });
});

describe("prepareSection for Practice", () => {
  it("keeps a mark and an own question saved while the Decks are being written", async () => {
    const late = {} as { deps: InterviewPrepDeps };
    const { generators } = scriptedGenerators();
    const practice = async (input: Parameters<typeof generators.practice>[0]) => {
      await markCard(late.deps, "job-1", "card-1", "feels_good");
      await addOwnQuestion(late.deps, "job-1", "ask", "What's the team like?");
      return { cards: [...(input.previous?.cards ?? []), practiceCard({ id: "new-1", question: "A new one?" })] };
    };
    const built = setup({ generators: { ...generators, practice } });
    const deps = (late.deps = built.deps);
    await withCards(built.store, [practiceCard()]);
    expect(await prepareSection(deps, "job-1", "practice")).toMatchObject({ prep: { sections: { practice: { status: "ready" } } } });
    expect((await cardsOf(deps)).map((c) => [c.id === "card-1" ? c.mark : c.question])).toEqual([
      ["feels_good"],
      ["What's the team like?"],
      ["A new one?"],
    ]);
  });

  it("gives Practice the Process and Company research once it's done researching", async () => {
    let now = NOW;
    const { generators, calls } = scriptedGenerators();
    let researched: unknown;
    const practice = async (input: Parameters<typeof generators.practice>[0]) => {
      researched = await input.research();
      return generators.practice(input);
    };
    const built = setup({ generators: { ...generators, practice }, now: () => now });
    await built.store.saveSection("job-1", "process", { ...emptySection(), status: "researching", startedAt: NOW });
    let slept = 0;
    built.deps.sleep = async (ms) => {
      slept += ms;
      now = new Date(Date.parse(NOW) + slept).toISOString();
      await built.store.saveSection("job-1", "process", { ...emptySection(), status: "ready", data: sampleData.process });
    };
    await prepareSection(built.deps, "job-1", "practice");
    expect(slept).toBeGreaterThan(0);
    expect(researched).toEqual({ process: sampleData.process, company: null });
    expect(calls.practice).toHaveLength(1);
  });

  it("stops waiting for research after a while and uses what's there", async () => {
    let now = NOW;
    const { generators } = scriptedGenerators();
    let researched: unknown;
    const practice = async (input: Parameters<typeof generators.practice>[0]) => {
      researched = await input.research();
      return generators.practice(input);
    };
    const built = setup({ generators: { ...generators, practice }, now: () => now });
    await built.store.saveSection("job-1", "company", { ...emptySection(), status: "researching", startedAt: NOW });
    built.deps.sleep = async (ms) => void (now = new Date(Date.parse(now) + ms).toISOString());
    await prepareSection(built.deps, "job-1", "practice");
    expect(researched).toEqual({ process: null, company: null });
  });
});

describe("a job with no such card or Job", () => {
  it("fails when there's no such Job", async () => {
    const { deps } = setup({ job: interviewPrepJob({ id: "job-2" }) });
    expect(await markCard(deps, "job-1", "card-1", "feels_good")).toMatchObject({ ok: false, kind: "not_found" });
  });
});

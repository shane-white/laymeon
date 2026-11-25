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
import { careerStoryHash } from "@/lib/profile/career-story-hash";
import { buildProfile } from "@/lib/profile/build";
import { DECK_KEYS } from "../interview-prep";
import { practiceGenerator } from "./writer";
import { addMoreCards, addOwnQuestion, markCard, removeCard, updateHints, writeHint } from "./operations";

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

describe("removeCard", () => {
  it("removes the user's own card and keeps the rest", async () => {
    const { deps, store } = setup();
    await withCards(store, [practiceCard(), practiceCard({ id: "card-2", own: true, question: "Why us?" })]);
    expect(await removeCard(deps, "job-1", "card-2")).toMatchObject({ ok: true });
    expect((await cardsOf(deps)).map((c) => c.id)).toEqual(["card-1"]);
  });

  it("removes a marked card", async () => {
    const { deps, store } = setup();
    await withCards(store, [practiceCard({ mark: "feels_good" })]);
    await removeCard(deps, "job-1", "card-1");
    expect(await cardsOf(deps)).toEqual([]);
  });

  it("refuses a card the user didn't add and hasn't marked", async () => {
    const { deps, store } = setup();
    await withCards(store, [practiceCard()]);
    expect(await removeCard(deps, "job-1", "card-1")).toMatchObject({ ok: false, kind: "invalid" });
    expect(await cardsOf(deps)).toHaveLength(1);
  });

  it("fails for a card the Interview Prep doesn't have", async () => {
    const { deps, store } = setup();
    await withCards(store, [practiceCard()]);
    expect(await removeCard(deps, "job-1", "card-9")).toMatchObject({ ok: false, kind: "not_found" });
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

describe("updateHints", () => {
  const profile = buildProfile([], "2026-11-01T00:00:00.000Z");
  const now = careerStoryHash(profile);
  const careerStory = memoryCareerStory(profile);

  it("rewrites only the hints that are an Earlier version, keeping each card's question, mark and Deck", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps, store } = setup({ careerStory, practice: writer });
    await withCards(store, [
      practiceCard({ id: "old-1", mark: "practice_more", hintBasis: "before" }),
      practiceCard({ id: "own-1", deck: "ask", question: "What's the team like?", own: true, hintBasis: "before" }),
      practiceCard({ id: "current", question: "Why us?", hintBasis: now }),
    ]);
    expect(await updateHints(deps, "job-1")).toMatchObject({ ok: true, careerStoryHash: now });
    expect(calls.hint.map((c) => c.question).sort()).toEqual(["Tell me about a mistake.", "What's the team like?"]);
    expect(await cardsOf(deps)).toEqual([
      expect.objectContaining({ id: "old-1", question: "Tell me about a mistake.", mark: "practice_more", deck: "behavioral", hintStatus: "ready", hintBasis: "basis-2", hint: expect.objectContaining({ probing: "Listening for: Tell me about a mistake." }) }),
      expect.objectContaining({ id: "own-1", question: "What's the team like?", own: true, deck: "ask", hintBasis: "basis-2" }),
      practiceCard({ id: "current", question: "Why us?", hintBasis: now }),
    ]);
  });

  it("rewrites only one Deck's Earlier version hints when given a Deck", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps, store } = setup({ careerStory, practice: writer });
    const other = practiceCard({ id: "role-1", deck: "role", question: "How do you design an API?", hintBasis: "before" });
    await withCards(store, [practiceCard({ id: "old-1", hintBasis: "before" }), other]);
    expect(await updateHints(deps, "job-1", "behavioral")).toMatchObject({ ok: true });
    expect(calls.hint.map((c) => c.question)).toEqual(["Tell me about a mistake."]);
    expect(await cardsOf(deps)).toEqual([expect.objectContaining({ id: "old-1", hintBasis: "basis-2" }), other]);
  });

  it("refuses an unknown Deck", async () => {
    const { deps, store } = setup({ careerStory });
    await withCards(store, [practiceCard({ hintBasis: "before" })]);
    expect(await updateHints(deps, "job-1", "nope" as never)).toMatchObject({ ok: false, kind: "invalid" });
  });

  it("keeps marks and cards saved while the hints are being written", async () => {
    const late = {} as { deps: InterviewPrepDeps };
    let acted = false;
    const { writer } = scriptedPracticeWriter({
      before: async () => {
        if (acted) return;
        acted = true;
        await markCard(late.deps, "job-1", "old-1", "feels_good");
        await removeCard(late.deps, "job-1", "own-1");
        await addOwnQuestion(late.deps, "job-1", "ask", "How do you ship?", () => "own-2");
      },
    });
    const built = setup({ careerStory, practice: writer });
    late.deps = built.deps;
    await withCards(built.store, [
      practiceCard({ id: "old-1", hintBasis: "before" }),
      practiceCard({ id: "own-1", own: true, question: "Mine?", hintBasis: "before" }),
    ]);
    expect(await updateHints(built.deps, "job-1")).toMatchObject({ ok: true });
    expect((await cardsOf(built.deps)).map((c) => [c.id, c.mark, c.hintStatus])).toEqual([
      ["old-1", "feels_good", "ready"],
      ["own-2", "not_tried", "ready"],
    ]);
  });

  it("keeps a hint that couldn't be written again, still an Earlier version, and says so", async () => {
    const { writer } = scriptedPracticeWriter({ failHint: new Error("Claude is busy.") });
    const { deps, store } = setup({ careerStory, practice: writer });
    await withCards(store, [practiceCard({ hintBasis: "before" })]);
    expect(await updateHints(deps, "job-1")).toMatchObject({ ok: false, kind: "write_failed", message: "Claude is busy." });
    expect(await cardsOf(deps)).toEqual([practiceCard({ hintBasis: "before" })]);
  });

  it("does nothing when every hint is up to date", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps, store } = setup({ careerStory, practice: writer });
    await withCards(store, [practiceCard({ hintBasis: now })]);
    expect(await updateHints(deps, "job-1")).toMatchObject({ ok: true });
    expect(calls.hint).toHaveLength(0);
  });

  it("needs a Career Story", async () => {
    const { deps, store } = setup({ careerStory: memoryCareerStory(null) });
    await withCards(store, [practiceCard({ hintBasis: "before" })]);
    expect(await updateHints(deps, "job-1")).toMatchObject({ ok: false, kind: "no_career_story" });
  });
});

describe("refreshing never removes Practice cards", () => {
  const decks = () =>
    DECK_KEYS.map((deck, i) => practiceCard({ id: `${deck}-1`, deck, question: `${deck} first`, mark: i === 0 ? "feels_good" : "not_tried" }));

  it("leaves the Practice cards as they are when Process is refreshed", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps, store } = setup({ practice: writer });
    const cards = [...decks(), practiceCard({ id: "own-1", own: true, question: "Mine?" })];
    await withCards(store, cards);
    await prepareSection(deps, "job-1", "process");
    expect(await cardsOf(deps)).toEqual(cards);
    expect(calls.write).toHaveLength(0);
  });

  it("adds new About this company cards next to the ones there, and keeps every other card", async () => {
    const { writer } = scriptedPracticeWriter();
    const { generators } = scriptedGenerators();
    const { deps, store } = setup({ generators: { ...generators, practice: practiceGenerator(writer) } });
    const cards = [...decks(), practiceCard({ id: "own-1", deck: "company", own: true, question: "Mine?" })];
    await withCards(store, cards);
    await prepareSection(deps, "job-1", "practice");
    const after = await cardsOf(deps);
    expect(after.slice(0, cards.length)).toEqual(cards);
    expect(after.filter((c) => c.deck === "company").map((c) => c.question)).toEqual([
      "company first",
      "Mine?",
      "company question 1",
      "company question 2",
      "company question 3",
    ]);
  });

  it("keeps the cards there even when a refresh's generator leaves some out", async () => {
    const { generators } = scriptedGenerators({ practice: { cards: [practiceCard({ id: "new-1", deck: "company", question: "New?" })] } });
    const { deps, store } = setup({ generators });
    const cards = decks();
    await withCards(store, cards);
    await prepareSection(deps, "job-1", "practice");
    expect((await cardsOf(deps)).map((c) => c.id)).toEqual([...cards.map((c) => c.id), "new-1"]);
  });
});

describe("refreshing Company adds About this company cards", () => {
  const news = { date: "2026-11-01", headline: "Opened a Berlin office", howItMightComeUp: "Expansion.", sources: [] };
  const fresh = { whatTheyDo: { text: "Makes anvils.", sources: [] }, news: [news], values: [] };
  const existing = () => [
    practiceCard({ id: "b-1", question: "Tell me about a mistake.", mark: "feels_good" }),
    practiceCard({ id: "c-1", deck: "company", question: "Why Acme?" }),
    practiceCard({ id: "own-1", deck: "company", own: true, question: "Mine?" }),
  ];

  it("adds 3 new cards to About this company from the new research, avoiding the Deck's questions and keeping every card", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { generators } = scriptedGenerators({ company: fresh });
    const { deps, store } = setup({ generators, practice: writer });
    const cards = existing();
    await withCards(store, cards);

    expect(await prepareSection(deps, "job-1", "company")).toMatchObject({ ok: true, prep: { sections: { company: { status: "ready" } } } });

    expect(calls.write).toEqual([expect.objectContaining({ deck: "company", count: 3, avoid: ["Why Acme?", "Mine?"] })]);
    expect(calls.write[0].context.research.company).toEqual(fresh);
    const after = await cardsOf(deps);
    expect(after.slice(0, cards.length)).toEqual(cards);
    expect(after.slice(cards.length).map((c) => [c.deck, c.question])).toEqual([
      ["company", "company question 1"],
      ["company", "company question 2"],
      ["company", "company question 3"],
    ]);
  });

  it("keeps a mark saved while the new cards are being written", async () => {
    const late = {} as { deps: InterviewPrepDeps };
    const { writer } = scriptedPracticeWriter({ before: () => markCard(late.deps, "job-1", "c-1", "practice_more").then(() => {}) });
    const built = setup({ practice: writer });
    late.deps = built.deps;
    await withCards(built.store, existing());
    await prepareSection(built.deps, "job-1", "company");
    const after = await cardsOf(built.deps);
    expect(after.find((c) => c.id === "c-1")?.mark).toBe("practice_more");
    expect(after).toHaveLength(6);
  });

  it("adds nothing when there's no Practice yet, or the Company research failed", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps } = setup({ practice: writer });
    await prepareSection(deps, "job-1", "company");

    const failing = setup({ generators: scriptedGenerators({ company: new Error("Search failed") }).generators, practice: writer });
    await withCards(failing.store, existing());
    await prepareSection(failing.deps, "job-1", "company");

    expect(calls.write).toHaveLength(0);
    expect(await cardsOf(failing.deps)).toEqual(existing());
  });

  it("leaves it to a Practice refresh running at the same time", async () => {
    const { writer, calls } = scriptedPracticeWriter();
    const { deps, store } = setup({ practice: writer });
    await store.saveSection("job-1", "practice", { ...emptySection(), status: "researching", startedAt: NOW, data: { cards: existing() } });
    await prepareSection(deps, "job-1", "company");
    expect(calls.write).toHaveLength(0);
  });

  it("keeps the Company research when writing the cards fails", async () => {
    const { writer } = scriptedPracticeWriter({ failWrite: new Error("Claude is busy.") });
    const { deps, store } = setup({ practice: writer });
    await withCards(store, existing());
    expect(await prepareSection(deps, "job-1", "company")).toMatchObject({ ok: true, prep: { sections: { company: { status: "ready" } } } });
    expect(await cardsOf(deps)).toEqual(existing());
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

/**
 * Writes Practice cards (LAY-122): likely interview questions for a Deck, each
 * with a hint built from the user's Career Story.
 *
 * Claude (`PracticeModel`, production in `claude.ts`) writes the questions and
 * hints, and points at Career Story items by their short IDs (P1, A2…). Code
 * resolves the IDs, so an experience is only kept when it's backed by a real
 * Career Story item, and decides from that item's Evidence whether this Job's
 * Resume shows it ("not on your resume").
 */
import { careerStoryHash } from "@/lib/profile/career-story-hash";
import { findItem, type ListSection } from "@/lib/profile/changes";
import { formatCareerStoryForPrompt, type CareerStoryContext, type CareerStoryRef } from "@/lib/profile/for-prompt";
import type { CareerProfile, Evidence } from "@/lib/profile/schema";
import {
  DECK_KEYS,
  type DeckKey,
  type Hint,
  type HintExperience,
  type HintSource,
  type InterviewPrepJob,
  type PracticeCard,
  type PracticeCardWriter,
  type PracticeContext,
  type PracticeData,
  type Research,
  type SectionGenerator,
} from "../interview-prep";
import { resumeShows, resumeText, sameQuestion } from "./cards";

/** How many cards each Deck starts with. */
export const DECK_START_SIZE: Record<DeckKey, number> = { behavioral: 6, role: 6, company: 5, ask: 5 };

/** How many About this company cards a Practice refresh adds once every Deck has cards, and a Company refresh adds to a Practice with cards. */
export const REFRESH_COMPANY_COUNT = 3;

const MAX_OUTLINE_STEPS = 6;
const MAX_EXPERIENCES = 3;
const MAX_REFS_PER_EXPERIENCE = 3;

/** One card as Claude writes it. */
export interface CardAnswer {
  question: string;
  probing: string;
  outline: string[];
  /** Each experience points at the Career Story items it comes from, by short ID. */
  experiences: { text: string; careerStoryIds: string[] }[];
}

/** What Claude is asked for. The Resume isn't sent: hints come from the Career Story. */
export interface CardsRequest {
  deck: DeckKey;
  job: Pick<InterviewPrepJob, "title" | "company" | "description">;
  /** The Career Story as model context, with short IDs (`formatCareerStoryForPrompt`). */
  careerStory: string;
  research: Research;
  want: { kind: "new"; count: number; avoid: string[] } | { kind: "hint"; question: string };
}

export interface PracticeModel {
  /** Cards for the request: `count` new ones (a few more is fine), or one for the question asked. */
  cards(request: CardsRequest): Promise<CardAnswer[]>;
}

const LIST_SECTIONS: readonly string[] = ["position", "skill", "accomplishment", "education", "certification", "language"];

function evidenceOf(ref: CareerStoryRef, profile: CareerProfile): HintSource["evidence"] {
  if (!LIST_SECTIONS.includes(ref.section)) return [];
  const evidence = (findItem(profile, ref.section as ListSection, ref.key)?.evidence ?? []) as Evidence[];
  return evidence.map((e) => ({
    documentName: profile.sources.find((s) => s.documentId === e.documentId)?.documentName ?? null,
    quote: e.quote,
  }));
}

/** The Career Story items an experience points at. Unknown IDs and time-in-role (R) items, which have no Evidence, are dropped. */
function sourcesOf(ids: string[], story: CareerStoryContext, profile: CareerProfile): HintSource[] {
  const seen = new Set<string>();
  const sources: HintSource[] = [];
  for (const raw of ids) {
    const id = raw.replace(/[[\]\s]/g, "").toUpperCase();
    const ref = story.refs.get(id);
    if (!ref || ref.section === "role" || seen.has(id)) continue;
    seen.add(id);
    sources.push({ ref, evidence: evidenceOf(ref, profile) });
  }
  return sources.slice(0, MAX_REFS_PER_EXPERIENCE);
}

function hintOf(answer: CardAnswer, deck: DeckKey, story: CareerStoryContext, profile: CareerProfile, resume: string | null): Hint | null {
  const probing = answer.probing.trim();
  const outline = answer.outline.map((s) => s.trim()).filter(Boolean).slice(0, MAX_OUTLINE_STEPS);
  if (!probing || outline.length === 0) return null;
  const experiences: HintExperience[] =
    deck === "ask"
      ? []
      : answer.experiences.flatMap((e) => {
          const text = e.text.trim();
          const backedBy = sourcesOf(e.careerStoryIds, story, profile);
          return text && backedBy.length ? [{ text, onResume: resumeShows(backedBy, resume), backedBy }] : [];
        });
  return { probing, outline, experiences: experiences.slice(0, MAX_EXPERIENCES) };
}

export interface PracticeWriterDeps {
  model: PracticeModel;
  newId: () => string;
}

export function practiceWriter({ model, newId }: PracticeWriterDeps): PracticeCardWriter {
  function prepared(context: PracticeContext) {
    const story = formatCareerStoryForPrompt(context.careerStory);
    const { title, company, description } = context.job;
    const base = { job: { title, company, description }, careerStory: story.text, research: context.research };
    const resume = resumeText(context.job);
    const hint = (answer: CardAnswer, deck: DeckKey) => hintOf(answer, deck, story, context.careerStory, resume);
    return { base, hint, basis: careerStoryHash(context.careerStory) };
  }

  return {
    async write(context, { deck, count, avoid }) {
      const { base, hint, basis } = prepared(context);
      const answers = await model.cards({ ...base, deck, want: { kind: "new", count, avoid } });
      const cards: PracticeCard[] = [];
      for (const answer of answers) {
        const question = answer.question.trim();
        if (!question || cards.length >= count) continue;
        if ([...avoid, ...cards.map((c) => c.question)].some((q) => sameQuestion(q, question))) continue;
        const written = hint(answer, deck);
        if (!written) continue;
        cards.push({
          id: newId(),
          deck,
          question,
          own: false,
          mark: "not_tried",
          hint: written,
          hintStatus: "ready",
          hintRequestedAt: null,
          hintBasis: basis,
        });
      }
      if (cards.length === 0) throw new Error("We couldn't write questions for this deck just now. Try again in a few minutes.");
      return cards;
    },

    async hint(context, { deck, question }) {
      const { base, hint, basis } = prepared(context);
      const answers = await model.cards({ ...base, deck, want: { kind: "hint", question } });
      const written = answers.map((a) => hint(a, deck)).find((h) => h !== null);
      if (!written) throw new Error("We couldn't write a hint for this question just now. Try again in a few minutes.");
      return { hint: written, hintBasis: basis };
    },
  };
}

/** Decks that don't need the Process and Company research, so they're written without waiting for it. */
const NEEDS_RESEARCH: Record<DeckKey, boolean> = { behavioral: false, role: true, company: true, ask: true };

const NO_RESEARCH: Research = { process: null, company: null };

/**
 * What a Prepare or refresh writes: every Deck with no generated cards yet
 * starts at its size. Once every Deck has cards, a refresh adds a few About
 * this company cards from the latest research. Cards are only ever added.
 */
export function decksToWrite(previous: PracticeData | null): { deck: DeckKey; count: number }[] {
  const generated = (deck: DeckKey) => (previous?.cards ?? []).some((c) => c.deck === deck && !c.own);
  const empty = DECK_KEYS.filter((deck) => !generated(deck));
  if (empty.length) return empty.map((deck) => ({ deck, count: DECK_START_SIZE[deck] }));
  return [{ deck: "company", count: REFRESH_COMPANY_COUNT }];
}

/**
 * The Practice section's generator: writes the Decks `decksToWrite` asks for,
 * all at once. Behavioral questions start right away; the others wait for
 * the Process and Company research (`input.research()`), so a Prepare that
 * runs all three sections together still draws on them. A Deck that fails is
 * left out (a refresh writes it); if every Deck fails, it throws.
 */
export function practiceGenerator(writer: PracticeCardWriter): SectionGenerator<"practice"> {
  return async ({ job, careerStory, previous, research }) => {
    if (!careerStory) throw new Error("Practice builds its hints from your Career Story, so it needs one.");
    let researched: Promise<Research> | null = null;
    const researchOnce = () => (researched ??= research());

    const plan = decksToWrite(previous);
    const results = await Promise.allSettled(
      plan.map(async ({ deck, count }) => {
        const context = { job, careerStory, research: NEEDS_RESEARCH[deck] ? await researchOnce() : NO_RESEARCH };
        const avoid = (previous?.cards ?? []).filter((c) => c.deck === deck).map((c) => c.question);
        return writer.write(context, { deck, count, avoid });
      }),
    );

    const added = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const failure = results.find((r) => r.status === "rejected");
    if (added.length === 0 && failure) throw failure.reason;
    return { cards: [...(previous?.cards ?? []), ...added] };
  };
}

/**
 * The Practice operations behind the Practice list (LAY-123) and the chat
 * (LAY-126): mark a card, More like this, add your own question, and write a
 * card's hint again. Writing the first Decks is `prepareSection(…, "practice")`.
 *
 * Every save goes through `store.updateSection` with a change from `cards.ts`,
 * made to the cards as saved at that moment, so operations running at once
 * (a mark saved while More like this writes, or while Practice refreshes)
 * never undo each other.
 */
import { careerStoryHash } from "@/lib/profile/career-story-hash";
import type { CareerProfile } from "@/lib/profile/schema";
import {
  DECK_KEYS,
  type DeckKey,
  type FailureKind,
  type InterviewPrep,
  type InterviewPrepDeps,
  type InterviewPrepJob,
  type InterviewPrepResult,
  type Mark,
  type PracticeCard,
  type PracticeContext,
  type PracticeData,
} from "../interview-prep";
import { interviewPrepState } from "../lifecycle";
import { emptySection } from "../sections";
import {
  addCards,
  CardNotFoundError,
  CardNotRemovableError,
  failHint,
  finishHint,
  hasEarlierHint,
  questionsIn,
  removeCard as withoutCard,
  setMark,
  startHint,
} from "./cards";

/** How many cards More like this adds. */
export const MORE_LIKE_THIS_COUNT = 5;
/** The longest own question accepted. */
export const MAX_QUESTION_CHARS = 500;

type Failure = { ok: false; kind: FailureKind; message: string };

const fail = (kind: FailureKind, message: string): Failure => ({ ok: false, kind, message });

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

function isDeck(deck: string): deck is DeckKey {
  return (DECK_KEYS as readonly string[]).includes(deck);
}

async function loaded(deps: InterviewPrepDeps, jobId: string): Promise<{ job: InterviewPrepJob; prep: InterviewPrep | null } | Failure> {
  try {
    const job = await deps.jobs.find(jobId);
    if (!job) return fail("not_found", "Job not found");
    return { job, prep: await deps.store.find(jobId) };
  } catch (err) {
    return fail("load_failed", errorMessage(err));
  }
}

/** What writing cards needs, or why it can't run. */
async function context(deps: InterviewPrepDeps, job: InterviewPrepJob, prep: InterviewPrep | null): Promise<PracticeContext | Failure> {
  let careerStory: CareerProfile | null;
  try {
    careerStory = await deps.careerStory.load();
  } catch (err) {
    return fail("load_failed", errorMessage(err));
  }
  if (!careerStory) return fail("no_career_story", "Practice builds its hints from your Career Story, so it needs one.");
  const research = { process: prep?.sections.process.data ?? null, company: prep?.sections.company.data ?? null };
  return { job, careerStory, research };
}

/** Saves a change to the Practice cards as saved now, creating the section if there is none. */
async function savePractice(
  deps: InterviewPrepDeps,
  job: InterviewPrepJob,
  change: (data: PracticeData | null) => PracticeData,
  careerStory?: CareerProfile,
): Promise<InterviewPrepResult> {
  try {
    const prep = await deps.store.updateSection(job.id, "practice", (current) => {
      // A section never researched becomes ready with just these cards, so it shows.
      const base = current.status === "not_started" ? { ...emptySection<PracticeData>(), status: "ready" as const } : current;
      return { ...base, data: change(current.data) };
    });
    return await interviewPrepState(deps, job, prep, job.legacySuggestions, careerStory);
  } catch (err) {
    if (err instanceof CardNotFoundError) return fail("not_found", err.message);
    if (err instanceof CardNotRemovableError) return fail("invalid", err.message);
    return fail("save_failed", errorMessage(err));
  }
}

/**
 * Removes a card the user added or has marked. Cards Practice wrote that the
 * user hasn't marked stay: only the user removes their own or marked cards.
 * Checked against the card as saved now, so a mark cleared meanwhile counts.
 */
export async function removeCard(deps: InterviewPrepDeps, jobId: string, cardId: string): Promise<InterviewPrepResult> {
  const found = await loaded(deps, jobId);
  if ("ok" in found) return found;
  if (!found.prep?.sections.practice.data?.cards.some((c) => c.id === cardId)) return fail("not_found", new CardNotFoundError().message);
  return savePractice(deps, found.job, (data) => withoutCard(data, cardId));
}

/** Marks a card Feels good or Practice more; `not_tried` clears the mark. */
export async function markCard(deps: InterviewPrepDeps, jobId: string, cardId: string, mark: Mark): Promise<InterviewPrepResult> {
  const found = await loaded(deps, jobId);
  if ("ok" in found) return found;
  if (!found.prep?.sections.practice.data?.cards.some((c) => c.id === cardId)) return fail("not_found", new CardNotFoundError().message);
  return savePractice(deps, found.job, (data) => setMark(data, cardId, mark));
}

/** How many hints Update hints writes at once. */
export const UPDATE_HINTS_AT_ONCE = 4;

/** The change, or the cards as they are when the card was removed meanwhile. */
const ifStillThere =
  (cardId: string, change: (data: PracticeData | null) => PracticeData) =>
  (data: PracticeData | null): PracticeData =>
    data?.cards.some((c) => c.id === cardId) ? change(data) : { cards: data?.cards ?? [] };

/**
 * Update hints: writes again every hint that's an Earlier version (built from
 * a Career Story other than the one now), a few at a time. Only the hints
 * change: each card's question, mark and Deck stay, the user's own cards
 * included, and so do marks and cards saved meanwhile. A hint that can't be
 * written again keeps its Earlier version, so Update hints can be tried again;
 * when none could be, it fails with why.
 */
export async function updateHints(deps: InterviewPrepDeps, jobId: string): Promise<InterviewPrepResult> {
  const found = await loaded(deps, jobId);
  if ("ok" in found) return found;
  const loadedCtx = await context(deps, found.job, found.prep);
  if ("ok" in loadedCtx) return loadedCtx;
  const ctx: PracticeContext = loadedCtx;
  const { job } = found;

  const basis = careerStoryHash(ctx.careerStory);
  const earlier = (found.prep?.sections.practice.data?.cards ?? []).filter((c) => hasEarlierHint(c, basis));
  if (earlier.length === 0) return interviewPrepState(deps, found.job, found.prep, found.job.legacySuggestions, ctx.careerStory);

  const started = await savePractice(
    deps,
    found.job,
    (data) => earlier.reduce((cards, card) => ifStillThere(card.id, (d) => startHint(d, card.id, deps.now()))(cards), data ?? { cards: [] }),
    ctx.careerStory,
  );
  if (!started.ok) return started;

  let last: InterviewPrepResult = started;
  const errors: string[] = [];
  const queue = [...earlier];
  async function work() {
    for (let card = queue.shift(); card; card = queue.shift()) {
      const { id } = card;
      try {
        const { hint, hintBasis } = await deps.practice.hint(ctx, { deck: card.deck, question: card.question });
        last = await savePractice(deps, job, ifStillThere(id, (d) => finishHint(d, id, hint, hintBasis)), ctx.careerStory);
      } catch (err) {
        errors.push(errorMessage(err));
        last = await savePractice(deps, job, ifStillThere(id, (d) => failHint(d, id)), ctx.careerStory);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPDATE_HINTS_AT_ONCE, earlier.length) }, work));
  if (errors.length === earlier.length) return fail("write_failed", errors[0]);
  return last;
}

/** More like this: adds about 5 new cards to a Deck, repeating none of the questions in it. */
export async function addMoreCards(deps: InterviewPrepDeps, jobId: string, deck: DeckKey): Promise<InterviewPrepResult> {
  if (!isDeck(deck)) return fail("invalid", "Unknown Deck");
  const found = await loaded(deps, jobId);
  if ("ok" in found) return found;
  const ctx = await context(deps, found.job, found.prep);
  if ("ok" in ctx) return ctx;

  let cards: PracticeCard[];
  try {
    const avoid = questionsIn(found.prep?.sections.practice.data ?? null, deck);
    cards = await deps.practice.write(ctx, { deck, count: MORE_LIKE_THIS_COUNT, avoid });
  } catch (err) {
    return fail("write_failed", errorMessage(err));
  }
  return savePractice(deps, found.job, (data) => addCards(data, cards));
}

/** Writes a card's hint and saves it, or records that it failed. */
async function hintFor(
  deps: InterviewPrepDeps,
  ctx: PracticeContext,
  card: Pick<PracticeCard, "id" | "deck" | "question">,
): Promise<{ saved: InterviewPrepResult; error: string | null }> {
  try {
    const { hint, hintBasis } = await deps.practice.hint(ctx, { deck: card.deck, question: card.question });
    return { saved: await savePractice(deps, ctx.job, (data) => finishHint(data, card.id, hint, hintBasis), ctx.careerStory), error: null };
  } catch (err) {
    return { saved: await savePractice(deps, ctx.job, (data) => failHint(data, card.id), ctx.careerStory), error: errorMessage(err) };
  }
}

/**
 * Adds the user's own question to a Deck and writes its hint. The card is
 * saved first, writing its hint, so a reload shows "Writing a hint…"; then the
 * hint is saved, or the card is marked failed so the hint can be tried again
 * with `writeHint`. Either way the card stays.
 */
export async function addOwnQuestion(
  deps: InterviewPrepDeps,
  jobId: string,
  deck: DeckKey,
  question: string,
  newId: () => string = () => crypto.randomUUID(),
): Promise<InterviewPrepResult> {
  const text = question.trim();
  if (!text) return fail("invalid", "Write a question first.");
  if (text.length > MAX_QUESTION_CHARS) return fail("invalid", `Keep the question under ${MAX_QUESTION_CHARS} characters.`);
  if (!isDeck(deck)) return fail("invalid", "Unknown Deck");
  const found = await loaded(deps, jobId);
  if ("ok" in found) return found;
  const ctx = await context(deps, found.job, found.prep);
  if ("ok" in ctx) return ctx;

  const card: PracticeCard = {
    id: newId(),
    deck,
    question: text,
    own: true,
    mark: "not_tried",
    hint: null,
    hintStatus: "writing",
    hintRequestedAt: deps.now(),
    hintBasis: null,
  };
  // Own questions are always added, even one like a card already there.
  const added = await savePractice(deps, found.job, (data) => ({ cards: [...(data?.cards ?? []), card] }));
  if (!added.ok) return added;
  return (await hintFor(deps, ctx, card)).saved;
}

/**
 * Writes a card's hint again: one that failed or stopped, or (LAY-125) an
 * Earlier version. Its question, mark and Deck stay as they are, and a hint
 * it already has is kept if the new one fails.
 */
export async function writeHint(deps: InterviewPrepDeps, jobId: string, cardId: string): Promise<InterviewPrepResult> {
  const found = await loaded(deps, jobId);
  if ("ok" in found) return found;
  const card = found.prep?.sections.practice.data?.cards.find((c) => c.id === cardId);
  if (!card) return fail("not_found", new CardNotFoundError().message);
  const ctx = await context(deps, found.job, found.prep);
  if ("ok" in ctx) return ctx;

  const started = await savePractice(deps, found.job, (data) => startHint(data, cardId, deps.now()));
  if (!started.ok) return started;
  const { saved, error } = await hintFor(deps, ctx, card);
  return error && saved.ok ? fail("write_failed", error) : saved;
}

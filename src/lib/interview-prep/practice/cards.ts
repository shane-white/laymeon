/**
 * Pure changes to a Practice section's cards. Each takes the cards as saved
 * now and returns them changed, so they run inside `store.updateSection` and
 * never undo another request's change. Safe to import on the client.
 */
import { normalizeText } from "@/lib/match-report/evidence";
import { RESEARCH_TIME_LIMIT_MS } from "../sections";
import type { DeckKey, Hint, Mark, PracticeCard, PracticeData } from "../interview-prep";

/** Thrown when a change names a card the Practice section doesn't have. */
export class CardNotFoundError extends Error {
  constructor() {
    super("That Practice card isn't there anymore.");
    this.name = "CardNotFoundError";
  }
}

/** Thrown when removing a card the user may not remove (see `canRemove`). */
export class CardNotRemovableError extends Error {
  constructor() {
    super("Only your own questions and cards you've marked can be removed.");
    this.name = "CardNotRemovableError";
  }
}

/** Whether two questions are the same, ignoring case, punctuation spacing and markdown. */
export function sameQuestion(a: string, b: string): boolean {
  const norm = (q: string) => normalizeText(q).replace(/[?.!\s]+$/, "");
  return norm(a) === norm(b);
}

/** The questions in a Deck, in order. */
export function questionsIn(data: PracticeData | null, deck: DeckKey): string[] {
  return (data?.cards ?? []).filter((c) => c.deck === deck).map((c) => c.question);
}

/**
 * The cards with `added` after them. An added card is left out when the
 * section already has its ID, or its Deck already has its question.
 */
export function addCards(data: PracticeData | null, added: PracticeCard[]): PracticeData {
  const cards = [...(data?.cards ?? [])];
  for (const card of added) {
    const repeat = cards.some((c) => c.id === card.id || (c.deck === card.deck && sameQuestion(c.question, card.question)));
    if (!repeat) cards.push(card);
  }
  return { cards };
}

function changeCard(data: PracticeData | null, cardId: string, change: (card: PracticeCard) => PracticeCard): PracticeData {
  const cards = data?.cards ?? [];
  if (!cards.some((c) => c.id === cardId)) throw new CardNotFoundError();
  return { cards: cards.map((c) => (c.id === cardId ? change(c) : c)) };
}

/**
 * How many cards have each mark, such as "4 feel good · 2 to practice more ·
 * 1 not tried yet". Marks no card has are left out; no cards gives "".
 */
export function markCounts(cards: Pick<PracticeCard, "mark">[]): string {
  const count = (mark: Mark) => cards.filter((c) => c.mark === mark).length;
  const good = count("feels_good");
  const more = count("practice_more");
  const untried = count("not_tried");
  return [
    good > 0 && `${good} ${good === 1 ? "feels" : "feel"} good`,
    more > 0 && `${more} to practice more`,
    untried > 0 && `${untried} not tried yet`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Sets a card's mark. `not_tried` clears it. */
export function setMark(data: PracticeData | null, cardId: string, mark: Mark): PracticeData {
  return changeCard(data, cardId, (c) => ({ ...c, mark }));
}

/** Whether the user may remove a card: only their own cards, or cards they've marked. */
export function canRemove(card: Pick<PracticeCard, "own" | "mark">): boolean {
  return card.own || card.mark !== "not_tried";
}

/** The cards without `cardId`. Throws when there's no such card, or it can't be removed. */
export function removeCard(data: PracticeData | null, cardId: string): PracticeData {
  const cards = data?.cards ?? [];
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new CardNotFoundError();
  if (!canRemove(card)) throw new CardNotRemovableError();
  return { cards: cards.filter((c) => c.id !== cardId) };
}

/** Marks a card's hint as being written, keeping the hint it has until the new one is ready. */
export function startHint(data: PracticeData | null, cardId: string, now: string): PracticeData {
  return changeCard(data, cardId, (c) => ({ ...c, hintStatus: "writing", hintRequestedAt: now }));
}

/** Saves a card's new hint and its basis. Its question, mark and Deck stay as they are. */
export function finishHint(data: PracticeData | null, cardId: string, hint: Hint, hintBasis: string): PracticeData {
  return changeCard(data, cardId, (c) => ({ ...c, hint, hintBasis, hintStatus: "ready", hintRequestedAt: null }));
}

/** Records that writing a card's hint failed. Any earlier hint is kept. */
export function failHint(data: PracticeData | null, cardId: string): PracticeData {
  return changeCard(data, cardId, (c) => ({ ...c, hintStatus: c.hint ? "ready" : "failed", hintRequestedAt: null }));
}

/**
 * Whether a card's hint is still being written. One asked for longer ago than
 * the research time limit is taken to have stopped (the request timed out),
 * so it can be tried again.
 */
export function hintIsWriting(card: PracticeCard, now: string): boolean {
  if (card.hintStatus !== "writing") return false;
  const asked = Date.parse(card.hintRequestedAt ?? "");
  return !Number.isNaN(asked) && Date.parse(now) - asked <= RESEARCH_TIME_LIMIT_MS;
}

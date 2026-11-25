/**
 * Choosing the cards for a Practice session (LAY-124). Pure and safe to
 * import on the client; randomness is passed in so tests can repeat it.
 */
import { DECK_KEYS, type DeckKey, type Mark, type PracticeCard } from "../interview-prep";

/** Where a Practice session starts: a Quick mix of every Deck, or one Deck. */
export type SessionSource = DeckKey | "mix";

/** How many cards a Quick mix has. */
export const QUICK_MIX_SIZE = 5;

const RANK: Record<Mark, number> = { practice_more: 0, not_tried: 1, feels_good: 2 };

/** The cards ordered Practice more, then Not tried yet, then Feels good, keeping their order otherwise. */
function byMark(cards: PracticeCard[]): PracticeCard[] {
  return [...cards].sort((a, b) => RANK[a.mark] - RANK[b.mark]);
}

/** A shuffled copy (Fisher–Yates). */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Up to 5 cards from every Deck: each Deck's best card first (Practice more,
 * then Not tried yet, chosen at random within a mark), then the best of the
 * rest from any Deck, all shuffled.
 */
function quickMix(cards: PracticeCard[], random: () => number): PracticeCard[] {
  const ranked = byMark(shuffle(cards, random));
  const firsts = DECK_KEYS.map((deck) => ranked.find((c) => c.deck === deck)).filter((c) => c !== undefined);
  // With more Decks than room, the Decks with the best first cards get in.
  const picked = byMark(firsts).slice(0, QUICK_MIX_SIZE);
  const rest = ranked.filter((c) => !picked.includes(c));
  return shuffle([...picked, ...rest.slice(0, QUICK_MIX_SIZE - picked.length)], random);
}

/**
 * The IDs of the cards a Practice session goes through, in order. Only cards
 * with a hint are used, so the session never shows one still being written.
 *
 * - Quick mix (`"mix"`): 5 cards drawn from every Deck, favoring Practice
 *   more, then Not tried yet, shuffled.
 * - Practice this deck: every card in the Deck, Practice more first, leaving
 *   out cards that feel good unless the Deck has nothing else.
 */
export function pickSession(cards: PracticeCard[], source: SessionSource, random: () => number = Math.random): string[] {
  const ready = cards.filter((c) => c.hint !== null);
  if (source === "mix") return quickMix(ready, random).map((c) => c.id);
  const deck = ready.filter((c) => c.deck === source);
  const notGood = deck.filter((c) => c.mark !== "feels_good");
  return byMark(notGood.length > 0 ? notGood : deck).map((c) => c.id);
}

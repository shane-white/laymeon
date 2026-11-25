import { describe, expect, it } from "vitest";
import { practiceCard } from "../testing";
import { pickSession } from "./session";

describe("pickSession: Practice this deck", () => {
  it("takes the Deck's cards, Practice more first, leaving out ones that feel good and other Decks", () => {
    const cards = [
      practiceCard({ id: "a" }),
      practiceCard({ id: "b", mark: "feels_good" }),
      practiceCard({ id: "c", mark: "practice_more" }),
      practiceCard({ id: "other", deck: "role" }),
      practiceCard({ id: "d" }),
    ];
    expect(pickSession(cards, "behavioral")).toEqual(["c", "a", "d"]);
  });

  it("takes every card when they all feel good", () => {
    const cards = [practiceCard({ id: "a", mark: "feels_good" }), practiceCard({ id: "b", mark: "feels_good" })];
    expect(pickSession(cards, "behavioral")).toEqual(["a", "b"]);
  });

  it("leaves out cards that have no hint yet", () => {
    const cards = [
      practiceCard({ id: "a" }),
      practiceCard({ id: "writing", hint: null, hintStatus: "writing" }),
      practiceCard({ id: "failed", hint: null, hintStatus: "failed" }),
    ];
    expect(pickSession(cards, "behavioral")).toEqual(["a"]);
    expect(pickSession([cards[1]], "behavioral")).toEqual([]);
  });
});

/** A repeatable stand-in for Math.random. */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const deckOf = (cards: ReturnType<typeof practiceCard>[], ids: string[]) =>
  ids.map((id) => cards.find((c) => c.id === id)!.deck);

describe("pickSession: Quick mix", () => {
  it("takes 5 cards with at least one from every Deck, even when one Deck has all the Practice more cards", () => {
    const cards = [
      ...["b1", "b2", "b3", "b4", "b5", "b6"].map((id) => practiceCard({ id, mark: "practice_more" })),
      practiceCard({ id: "r1", deck: "role", mark: "feels_good" }),
      practiceCard({ id: "c1", deck: "company", mark: "feels_good" }),
      practiceCard({ id: "a1", deck: "ask", mark: "feels_good" }),
    ];
    for (let seed = 1; seed <= 20; seed++) {
      const ids = pickSession(cards, "mix", seeded(seed));
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
      expect(new Set(deckOf(cards, ids))).toEqual(new Set(["behavioral", "role", "company", "ask"]));
    }
  });

  it("favors Practice more, then Not tried yet, over cards that feel good", () => {
    const cards = (["behavioral", "role", "company", "ask"] as const).flatMap((deck) => [
      practiceCard({ id: `${deck}-good`, deck, mark: "feels_good" }),
      practiceCard({ id: `${deck}-new`, deck }),
    ]);
    cards.push(practiceCard({ id: "role-more", deck: "role", mark: "practice_more" }));
    for (let seed = 1; seed <= 20; seed++) {
      expect(new Set(pickSession(cards, "mix", seeded(seed)))).toEqual(
        new Set(["behavioral-new", "role-more", "role-new", "company-new", "ask-new"]),
      );
    }
  });

  it("shuffles the cards it picks", () => {
    const cards = ["a", "b", "c", "d", "e"].map((id) => practiceCard({ id }));
    const orders = new Set(Array.from({ length: 20 }, (_, i) => pickSession(cards, "mix", seeded(i + 1)).join()));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("takes every card with a hint when there are fewer than 5", () => {
    const cards = [
      practiceCard({ id: "a" }),
      practiceCard({ id: "b", deck: "ask", mark: "feels_good" }),
      practiceCard({ id: "c", deck: "role", hint: null, hintStatus: "writing" }),
    ];
    expect(new Set(pickSession(cards, "mix", seeded()))).toEqual(new Set(["a", "b"]));
    expect(pickSession([], "mix", seeded())).toEqual([]);
  });
});

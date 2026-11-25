"use client";

/**
 * What each Interview Prep section shows once it's ready. Plain for now: each
 * section's ticket fills in its own view from variant D of the prototype
 * (branch `prototype/interview-prep-practice`):
 * - `ProcessView`: LAY-120, in `process-view.tsx`
 * - `CompanyView`: LAY-121
 * - `PracticeView`: LAY-122..125 (Decks, marks, More like this, add your own question, Practice session)
 */
import type { PracticeData } from "@/lib/interview-prep/interview-prep";
import { DECK_KEYS, type DeckKey } from "@/lib/interview-prep/interview-prep";

export { ProcessView } from "./process-view";
export { CompanyView } from "./company-view";

const DECK_NAMES: Record<DeckKey, string> = {
  behavioral: "Behavioral",
  role: "Role & technical",
  company: "About this company",
  ask: "Questions to ask them",
};

export function PracticeView({ data }: { data: PracticeData }) {
  return (
    <div className="space-y-6">
      {DECK_KEYS.map((deck) => {
        const cards = data.cards.filter((c) => c.deck === deck);
        if (cards.length === 0) return null;
        return (
          <section key={deck}>
            <h3 className="mb-2 font-medium">{DECK_NAMES[deck]}</h3>
            <ul className="divide-y rounded-lg border text-sm">
              {cards.map((card) => (
                <li key={card.id} className="px-4 py-3">
                  {card.question}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

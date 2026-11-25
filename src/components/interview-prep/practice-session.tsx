"use client";

/**
 * A Practice session (LAY-124): the chosen cards one at a time in an
 * overlay. Tap the card to flip to its hint; Feels good and Practice more
 * mark it and move on, Skip moves on without marking. The end screen counts
 * the marks made in this session, never a score.
 */
import { useState } from "react";
import { ChevronRight, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { Mark, PracticeCard } from "@/lib/interview-prep/interview-prep";
import { markCounts } from "@/lib/interview-prep/practice/cards";
import { cn } from "@/lib/utils";
import { CardBack, DECK_NAMES, MarkButtons } from "./practice-parts";

export function PracticeSession({
  cards,
  ids,
  title,
  onMark,
  onClose,
}: {
  /** The Practice section's cards as they are now, so a mark shows straight away. */
  cards: PracticeCard[];
  /** The session's cards, in order (`pickSession`). */
  ids: string[];
  title: string;
  onMark: (cardId: string, mark: Mark) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // Only the marks made in this session; skipped cards aren't counted.
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  // A card removed while the session is open is passed over.
  const sessionCards = ids.map((id) => cards.find((c) => c.id === id)).filter((c) => c !== undefined);
  const card = sessionCards[index];

  function next() {
    setIndex((i) => i + 1);
    setFlipped(false);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl" aria-describedby={undefined}>
        <DialogTitle className="text-sm font-medium text-muted-foreground">{title}</DialogTitle>
        {card ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5" aria-label={`Card ${index + 1} of ${sessionCards.length}`}>
              {sessionCards.map((c, i) => (
                <span
                  key={c.id}
                  aria-hidden
                  className={cn(
                    "h-2 w-2 rounded-full",
                    i < index ? "bg-primary" : i === index ? "bg-primary/50" : "bg-muted",
                  )}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {DECK_NAMES[card.deck]}
              {card.own && " · your question"}
            </p>
            <button
              type="button"
              aria-pressed={flipped}
              onClick={() => setFlipped((f) => !f)}
              className="min-h-72 rounded-xl border bg-card p-6 text-left shadow-sm transition hover:shadow-md"
            >
              {flipped ? (
                <CardBack card={card} />
              ) : (
                <div className="flex h-full min-h-60 flex-col items-center justify-center gap-4 text-center">
                  <p className="text-xl font-medium">{card.question}</p>
                  <p className="text-xs text-muted-foreground">Think it through, or say it out loud. Tap for a hint.</p>
                </div>
              )}
            </button>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MarkButtons
                mark={card.mark}
                // In a session a mark is always set, never cleared, and moves on.
                onMark={(mark) => {
                  setMarks((m) => ({ ...m, [card.id]: mark }));
                  onMark(card.id, mark);
                  next();
                }}
              />
              <Button size="sm" variant="ghost" onClick={next}>
                Skip <ChevronRight />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Sun className="h-10 w-10 text-amber-500" />
            <p className="text-xl font-medium">Nice work.</p>
            <p className="text-sm text-muted-foreground">
              {markCounts(Object.values(marks).map((mark) => ({ mark }))) || "You looked through them all."}
            </p>
            <Button size="sm" variant="outline" onClick={onClose}>
              Back to the list
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

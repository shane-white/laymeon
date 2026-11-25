"use client";

/**
 * The Practice section, minimal (LAY-122): each Deck's cards, a card's hint
 * when opened, marks, More like this and adding your own question. LAY-123
 * replaces it with the agreed list from variant D of the prototype.
 */
import { useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DECK_KEYS, type DeckKey, type Mark, type PracticeCard, type PracticeData } from "@/lib/interview-prep/interview-prep";
import { hintIsWriting } from "@/lib/interview-prep/practice/cards";
import { usePracticeActions } from "./use-interview-prep";

export const DECK_NAMES: Record<DeckKey, string> = {
  behavioral: "Behavioral",
  role: "Role & technical",
  company: "About this company",
  ask: "Questions to ask them",
};

const MARK_LABELS: Record<Mark, string> = {
  not_tried: "Not tried yet",
  feels_good: "Feels good",
  practice_more: "Practice more",
};

type Actions = ReturnType<typeof usePracticeActions>;

function CardBack({ card, actions }: { card: PracticeCard; actions: Actions }) {
  if (hintIsWriting(card, new Date().toISOString())) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing a hint…
      </p>
    );
  }
  if (!card.hint) {
    return (
      <p className="flex items-center gap-2 text-muted-foreground">
        We couldn&rsquo;t write a hint for this one.
        <Button size="sm" variant="outline" onClick={() => actions.writeHint(card.id)}>
          Try again
        </Button>
      </p>
    );
  }
  const { probing, outline, experiences } = card.hint;
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-medium text-muted-foreground">What they&rsquo;re listening for</h4>
        <p>{probing}</p>
      </div>
      <div>
        <h4 className="text-xs font-medium text-muted-foreground">A rough shape</h4>
        <ol className="list-decimal pl-5">
          {outline.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>
      {experiences.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground">From your experience</h4>
          <ul className="list-disc pl-5">
            {experiences.map((e, i) => (
              <li key={i}>
                {e.text}{" "}
                {e.onResume === false && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                    not on your resume
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function MarkButtons({ card, actions }: { card: PracticeCard; actions: Actions }) {
  const toggle = (mark: Mark) => actions.mark(card.id, card.mark === mark ? "not_tried" : mark);
  return (
    <div className="flex gap-2">
      {(["feels_good", "practice_more"] as const).map((mark) => (
        <Button key={mark} size="sm" variant={card.mark === mark ? "default" : "outline"} onClick={() => toggle(mark)}>
          {MARK_LABELS[mark]}
        </Button>
      ))}
    </div>
  );
}

function AddOwnQuestion({ actions }: { actions: Actions }) {
  const [question, setQuestion] = useState("");
  const [deck, setDeck] = useState<DeckKey>("behavioral");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!question.trim()) return;
        actions.addOwnQuestion(deck, question);
        setQuestion("");
      }}
    >
      <Input
        className="min-w-64 flex-1"
        placeholder="e.g. Why did you leave your last job after a year?"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />
      <select
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={deck}
        onChange={(e) => setDeck(e.target.value as DeckKey)}
        aria-label="Deck"
      >
        {DECK_KEYS.map((key) => (
          <option key={key} value={key}>
            {DECK_NAMES[key]}
          </option>
        ))}
      </select>
      <Button type="submit" variant="outline" disabled={!question.trim()}>
        <Plus /> Add question
      </Button>
    </form>
  );
}

export function PracticeView({ jobId, data }: { jobId: string; data: PracticeData }) {
  const actions = usePracticeActions(jobId);
  return (
    <div className="space-y-6">
      <AddOwnQuestion actions={actions} />
      {DECK_KEYS.map((deck) => {
        const cards = data.cards.filter((c) => c.deck === deck);
        return (
          <section key={deck}>
            <h3 className="mb-2 font-medium">{DECK_NAMES[deck]}</h3>
            <ul className="divide-y rounded-lg border text-sm">
              {cards.map((card) => (
                <li key={card.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer items-center gap-2 px-4 py-3">
                      <span className="flex-1">{card.question}</span>
                      {card.own && <Badge variant="secondary">yours</Badge>}
                      <span className="text-xs text-muted-foreground">{MARK_LABELS[card.mark]}</span>
                    </summary>
                    <div className="space-y-3 bg-muted/30 px-4 py-3">
                      <CardBack card={card} actions={actions} />
                      <MarkButtons card={card} actions={actions} />
                    </div>
                  </details>
                </li>
              ))}
              <li className="px-4 py-2">
                <Button size="sm" variant="ghost" disabled={actions.pending} onClick={() => actions.moreLikeThis(deck)}>
                  <Sparkles /> More like this
                </Button>
              </li>
            </ul>
          </section>
        );
      })}
    </div>
  );
}

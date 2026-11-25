"use client";

/**
 * Pieces of a Practice card shared by the Practice list (LAY-123) and the
 * Practice session (LAY-124): Deck names, tooltip copy, the hint on a card's
 * back, the mark buttons and the mark dot. Tooltips need a `TooltipProvider`
 * above them; `PracticeView` has one.
 */
import type { ReactNode } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DeckKey, Mark, PracticeCard } from "@/lib/interview-prep/interview-prep";
import { hintIsWriting } from "@/lib/interview-prep/practice/cards";
import { cn } from "@/lib/utils";

export const DECK_NAMES: Record<DeckKey, string> = {
  behavioral: "Behavioral",
  role: "Role & technical",
  company: "About this company",
  ask: "Questions to ask them",
};

export const MARK_LABELS: Record<Mark, string> = {
  not_tried: "Not tried yet",
  feels_good: "Feels good",
  practice_more: "Practice more",
};

export const TIPS = {
  feelsGood: "You'd be comfortable answering this.",
  practiceMore: "You'd like another run at this. It comes up first in your next session.",
  quickMix: "Practice 5 cards picked from every deck, one at a time, starting with ones to practice more or not tried yet.",
  practiceDeck: "Go through this deck one card at a time, leaving out cards that already feel good.",
  moreLikeThis: "Add a few more questions like these to this deck.",
  addOwn: "Add a question you want to prepare for. We'll write a hint for it.",
} as const;

/**
 * A tooltip on one control. A disabled button gets no pointer events, so the
 * trigger is a wrapping span to keep the tooltip showing.
 */
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  );
}

/** Empty ring for Not tried yet, green for Feels good, amber for Practice more. */
export function MarkDot({ mark }: { mark: Mark }) {
  return (
    <span
      aria-hidden
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        mark === "not_tried" && "border border-muted-foreground/40",
        mark === "feels_good" && "bg-emerald-500",
        mark === "practice_more" && "bg-amber-500",
      )}
    />
  );
}

const MARK_BUTTONS = [
  { mark: "feels_good", icon: Check, tip: TIPS.feelsGood },
  { mark: "practice_more", icon: RotateCcw, tip: TIPS.practiceMore },
] as const;

/** Feels good and Practice more. `onMark` gets the mark tapped; the caller decides whether tapping the current one clears it. */
export function MarkButtons({ mark, onMark, disabled }: { mark: Mark; onMark: (mark: Mark) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MARK_BUTTONS.map(({ mark: value, icon: Icon, tip }) => (
        <Tip key={value} text={tip}>
          <Button
            size="sm"
            variant={mark === value ? "default" : "outline"}
            aria-pressed={mark === value}
            disabled={disabled}
            onClick={() => onMark(value)}
          >
            <Icon /> {MARK_LABELS[value]}
          </Button>
        </Tip>
      ))}
    </div>
  );
}

function HintHeading({ children }: { children: ReactNode }) {
  return <h4 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h4>;
}

/**
 * A card's hint: what they're listening for, a rough shape and, for most
 * Decks, the user's experiences that fit. While the hint is being written it
 * says so; when writing it failed or stopped, `onRetry` offers another try.
 */
export function CardBack({ card, onRetry }: { card: PracticeCard; onRetry?: () => void }) {
  if (hintIsWriting(card, new Date().toISOString())) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing a hint…
      </p>
    );
  }
  if (!card.hint) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>We couldn&rsquo;t write a hint for this one.</span>
        {onRetry && (
          <Button size="xs" variant="outline" onClick={onRetry}>
            <RotateCcw /> Try again
          </Button>
        )}
      </div>
    );
  }
  const { probing, outline, experiences } = card.hint;
  return (
    <div className="space-y-4 text-sm">
      <section>
        <HintHeading>What they&rsquo;re listening for</HintHeading>
        <p>{probing}</p>
      </section>
      {outline.length > 0 && (
        <section>
          <HintHeading>A rough shape</HintHeading>
          <ol className="list-decimal space-y-0.5 pl-5">
            {outline.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}
      {experiences.length > 0 && (
        <section>
          <HintHeading>From your experience</HintHeading>
          <ul className="space-y-1">
            {experiences.map((e, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span>{e.text}</span>
                {e.onResume === false && (
                  <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400">
                    not on your resume
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

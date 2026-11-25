"use client";

/**
 * The Practice list (LAY-123): every Deck in one list. Each Deck folds up
 * and shows its mark counts; opening a card shows its hint and the mark
 * buttons. More like this and Add your own question add cards. Quick mix and
 * Practice this deck open a Practice session (LAY-124) over the list; its
 * marks go through the same mark action, so the list updates underneath.
 * When the Career Story has changed since some of a Deck's hints were
 * written, a note in that Deck offers Update hints (LAY-125).
 */
import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DECK_KEYS, DECK_NAMES, MARK_NAMES, type DeckKey, type PracticeCard, type PracticeData } from "@/lib/interview-prep/interview-prep";
import { canRemove, hasEarlierHint, hintIsWriting, markCounts } from "@/lib/interview-prep/practice/cards";
import { pickSession, type SessionSource } from "@/lib/interview-prep/practice/session";
import { AddQuestionDialog } from "./add-question-dialog";
import { CardBack, MarkButtons, MarkDot, Tip, TIPS } from "./practice-parts";
import { PracticeSession } from "./practice-session";
import { isSaved, useInterviewPrep, usePracticeActions } from "./use-interview-prep";

/** Whether any of the cards can be practiced: a session only uses cards with a hint. */
const canPractice = (cards: PracticeCard[]) => cards.some((c) => c.hint !== null);

type Actions = ReturnType<typeof usePracticeActions>;

function Blurb() {
  const strong = "font-medium text-foreground";
  return (
    <p className="text-sm text-muted-foreground">
      Read through the questions and open one to see a hint. Mark each one <strong className={strong}>Feels good</strong>{" "}
      or <strong className={strong}>Practice more</strong>. When you&rsquo;re ready to practice out loud, start a{" "}
      <strong className={strong}>Quick mix</strong> or practice one deck.
    </p>
  );
}

/**
 * A small note in a Deck whose hints include some written from an earlier
 * Career Story, offering to write them again. While Update hints runs for the
 * Deck, it says so instead.
 */
function EarlierHintsNote({ count, updating, onUpdate }: { count: number; updating: boolean; onUpdate: () => void }) {
  const one = count === 1;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
      {updating ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Updating hints from your Career Story. Your questions and marks stay as they are.</span>
        </>
      ) : (
        <>
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1">
            {one ? "1 hint is an Earlier version" : `${count} hints are an Earlier version`}: your Career Story has
            changed since {one ? "it was" : "they were"} written. Your questions and marks stay as they are.
          </span>
          <Button size="xs" variant="outline" onClick={onUpdate}>
            <RefreshCw /> Update hints
          </Button>
        </>
      )}
    </div>
  );
}

/** Remove, for the user's own and marked cards, asking once before it goes. */
function RemoveCard({ onRemove }: { onRemove: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setAsking(true)}>
        <Trash2 /> Remove
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      Remove this card?
      <Button size="xs" variant="destructive" onClick={onRemove}>
        Remove
      </Button>
      <Button size="xs" variant="ghost" onClick={() => setAsking(false)}>
        Keep
      </Button>
    </span>
  );
}

function CardRow({
  card,
  open,
  onToggle,
  actions,
}: {
  card: PracticeCard;
  open: boolean;
  onToggle: () => void;
  actions: Actions;
}) {
  // An own question is shown before the server has saved it; it can't be changed until then.
  const saved = isSaved(card);
  const writing = hintIsWriting(card, new Date().toISOString());
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-accent/50"
        onClick={onToggle}
      >
        <MarkDot mark={card.mark} />
        <span className="min-w-0 flex-1">{card.question}</span>
        {card.own && (
          <Badge variant="secondary" className="text-[10px]">
            yours
          </Badge>
        )}
        {!open && writing && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Writing a hint…
          </span>
        )}
        <span className="sr-only shrink-0 text-right text-xs text-muted-foreground sm:not-sr-only sm:w-24">
          {MARK_NAMES[card.mark]}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="space-y-4 bg-muted/30 px-4 py-4 sm:pl-9">
          <CardBack card={card} onRetry={saved ? () => actions.writeHint(card.id) : undefined} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MarkButtons
              mark={card.mark}
              disabled={!saved}
              // Tapping the mark a card has clears it.
              onMark={(mark) => actions.mark(card.id, card.mark === mark ? "not_tried" : mark)}
            />
            {saved && canRemove(card) && <RemoveCard onRemove={() => actions.remove(card.id)} />}
          </div>
        </div>
      )}
    </li>
  );
}

function Deck({
  deck,
  cards,
  actions,
  openCard,
  onOpenCard,
  onStartSession,
  earlier,
}: {
  deck: DeckKey;
  cards: PracticeCard[];
  actions: Actions;
  /** How many of the Deck's hints are an Earlier version. */
  earlier: number;
  openCard: string | null;
  onOpenCard: (id: string | null) => void;
  onStartSession: (source: SessionSource) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const addingMore = actions.addingMore.includes(deck);
  const updatingHints = actions.updatingHints.includes(deck);
  const counts = markCounts(cards);
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-left"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          <h3 className="font-medium">{DECK_NAMES[deck]}</h3>
          {counts && <span className="text-xs text-muted-foreground">{counts}</span>}
        </button>
        <Tip text={TIPS.practiceDeck}>
          <Button
            size="sm"
            variant="outline"
            disabled={!canPractice(cards)}
            onClick={() => onStartSession(deck)}
          >
            Practice this deck
          </Button>
        </Tip>
      </div>
      {(earlier > 0 || updatingHints) && (
        <EarlierHintsNote count={earlier} updating={updatingHints} onUpdate={() => actions.updateHints(deck)} />
      )}
      {!collapsed && (
        <ul className="divide-y rounded-lg border">
          {cards.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No questions in this deck yet.</li>}
          {cards.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              open={openCard === card.id}
              onToggle={() => onOpenCard(openCard === card.id ? null : card.id)}
              actions={actions}
            />
          ))}
          <li>
            <Tip text={TIPS.moreLikeThis}>
              <button
                type="button"
                disabled={addingMore}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs text-muted-foreground hover:bg-accent/50 disabled:pointer-events-none"
                onClick={() => actions.moreLikeThis(deck)}
              >
                {addingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding questions…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" /> More like this
                  </>
                )}
              </button>
            </Tip>
          </li>
        </ul>
      )}
    </section>
  );
}

interface Session {
  ids: string[];
  title: string;
  /** Remounts the session each time one starts. */
  key: number;
}

export function PracticeView({ jobId, data }: { jobId: string; data: PracticeData }) {
  const actions = usePracticeActions(jobId);
  const careerStoryHash = useInterviewPrep(jobId).data?.careerStoryHash ?? null;
  const earlierIn = (deck: DeckKey) =>
    data.cards.filter((c) => c.deck === deck && isSaved(c) && hasEarlierHint(c, careerStoryHash)).length;
  // One card open at a time.
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);

  function startSession(source: SessionSource) {
    const ids = pickSession(data.cards, source);
    if (ids.length === 0) return;
    setSession({ ids, title: source === "mix" ? "Quick mix" : DECK_NAMES[source], key: Date.now() });
  }
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col gap-6 pb-10">
        <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-4">
          <Blurb />
          <div className="flex flex-wrap items-center gap-2">
            <Tip text={TIPS.quickMix}>
              <Button disabled={!canPractice(data.cards)} onClick={() => startSession("mix")}>
                <Sparkles /> Quick mix
              </Button>
            </Tip>
            <AddQuestionDialog onAdd={actions.addOwnQuestion} />
          </div>
        </div>
        {DECK_KEYS.map((deck) => (
          <Deck
            key={deck}
            deck={deck}
            cards={data.cards.filter((c) => c.deck === deck)}
            actions={actions}
            openCard={openCard}
            onOpenCard={setOpenCard}
            onStartSession={startSession}
            earlier={earlierIn(deck)}
          />
        ))}
      </div>
      {session && (
        <PracticeSession
          key={session.key}
          cards={data.cards}
          ids={session.ids}
          title={session.title}
          onMark={actions.mark}
          onClose={() => setSession(null)}
        />
      )}
    </TooltipProvider>
  );
}

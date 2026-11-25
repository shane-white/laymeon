"use client";

/**
 * What each Interview Prep section shows once it's ready. Plain for now: each
 * section's ticket fills in its own view from variant D of the prototype
 * (branch `prototype/interview-prep-practice`):
 * - `ProcessView`: LAY-120
 * - `CompanyView`: LAY-121
 * - `PracticeView`: LAY-122..125 (Decks, marks, More like this, add your own question, Practice session)
 */
import type { PracticeData, ProcessData, Source } from "@/lib/interview-prep/interview-prep";
import { DECK_KEYS, type DeckKey } from "@/lib/interview-prep/interview-prep";

function SourceLinks({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-2">
      {sources.map((s) => (
        <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-2">
          {s.title}
        </a>
      ))}
    </span>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h4>;
}

export function ProcessView({ data }: { data: ProcessData }) {
  return (
    <div className="space-y-6 text-sm">
      {data.stages.length > 0 && (
        <ol className="space-y-3">
          {data.stages.map((stage, i) => (
            <li key={`${i}-${stage.name}`} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{i + 1}</span>
              <div>
                <p className="font-medium">{stage.name}</p>
                <p className="text-muted-foreground">{stage.detail}</p>
                <SourceLinks sources={stage.sources} />
              </div>
            </li>
          ))}
        </ol>
      )}
      {data.tips.length > 0 && (
        <section>
          <Subheading>Tips people shared</Subheading>
          <ul className="space-y-2">
            {data.tips.map((tip, i) => (
              <li key={i}>
                {tip.text} <SourceLinks sources={tip.sources} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.commonForRole && (
        <section>
          <Subheading>Common for this kind of role</Subheading>
          <p className="text-muted-foreground">{data.commonForRole}</p>
        </section>
      )}
    </div>
  );
}

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

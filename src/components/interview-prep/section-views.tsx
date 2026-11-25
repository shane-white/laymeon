"use client";

/**
 * What each Interview Prep section shows once it's ready. Plain for now: each
 * section's ticket fills in its own view from variant D of the prototype
 * (branch `prototype/interview-prep-practice`):
 * - `ProcessView`: LAY-120, in `process-view.tsx`
 * - `CompanyView`: LAY-121
 * - `PracticeView`: LAY-122..125 (Decks, marks, More like this, add your own question, Practice session)
 */
import type { CompanyData, PracticeData, Source } from "@/lib/interview-prep/interview-prep";
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

export { ProcessView } from "./process-view";

export function CompanyView({ data }: { data: CompanyData }) {
  return (
    <div className="space-y-6 text-sm">
      <section>
        <Subheading>What they do</Subheading>
        <p>
          {data.whatTheyDo.text} <SourceLinks sources={data.whatTheyDo.sources} />
        </p>
      </section>
      {data.news.length > 0 && (
        <section>
          <Subheading>Recent news</Subheading>
          <ul className="space-y-3">
            {data.news.map((item, i) => (
              <li key={i}>
                <p>
                  <span className="text-muted-foreground">{item.date} ·</span> {item.headline} <SourceLinks sources={item.sources} />
                </p>
                <p className="text-xs text-muted-foreground">How this might come up: {item.howItMightComeUp}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.values.length > 0 && (
        <section>
          <Subheading>What they say they value</Subheading>
          <ul className="space-y-1">
            {data.values.map((value, i) => (
              <li key={i}>
                {value.text} <SourceLinks sources={value.sources} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

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

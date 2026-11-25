"use client";

/**
 * The Process section once it's ready (LAY-120): the interview stages people
 * reported, in order, and tips they shared, each linked to its source. When
 * nothing turned up, it says so, then shows what's common for this kind of
 * role, clearly labeled as not about this company.
 */
import type { ProcessData, Source } from "@/lib/interview-prep/interview-prep";

function SourceLink({ source }: { source: Source }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      {source.title}
    </a>
  );
}

function SourceLinks({ sources }: { sources: Source[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {sources.map((s) => (
        <SourceLink key={s.url} source={s} />
      ))}
    </span>
  );
}

function Subheading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h4>;
}

export function ProcessView({ data }: { data: ProcessData }) {
  const nothingFound = data.stages.length === 0 && data.tips.length === 0;

  if (nothingFound) {
    return (
      <div className="space-y-4 text-sm">
        <p>We couldn&rsquo;t find reports of this company&rsquo;s process.</p>
        {data.commonForRole && (
          <section className="rounded-lg border border-dashed p-4">
            <Subheading>Common for this kind of role</Subheading>
            <p className="text-muted-foreground">{data.commonForRole}</p>
            <p className="mt-2 text-xs text-muted-foreground">This is general, not about this company.</p>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-sm">
      <p className="text-xs text-muted-foreground">
        From what people have posted online. Processes change, so check the dates.
      </p>
      {data.stages.length > 0 && (
        <ol className="space-y-3">
          {data.stages.map((stage, i) => (
            <li key={`${i}-${stage.name}`} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{i + 1}</span>
              <div className="space-y-0.5">
                <p className="font-medium">{stage.name}</p>
                {stage.detail && <p className="text-muted-foreground">{stage.detail}</p>}
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
                &ldquo;{tip.text}&rdquo; <SourceLinks sources={tip.sources} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

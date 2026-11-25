"use client";

/**
 * The Company section of Interview Prep, once researched: what the company
 * does, its news from the last 6 months and what it says it values, each
 * linked to its sources. A part with nothing sourced says so instead of
 * being padded.
 */
import type { CompanyData, Source } from "@/lib/interview-prep/interview-prep";

function Subheading({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</h4>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

function SourceLink({ source, label }: { source: Source; label?: string }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      {label ?? source.title}
    </a>
  );
}

function SourceLinks({ sources, label }: { sources: Source[]; label?: string }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-x-2">
      {sources.map((s) => (
        <SourceLink key={s.url} source={s} label={label} />
      ))}
    </span>
  );
}

/** "Nov 2026" from an ISO date. News dates can be approximate, so the day isn't shown. */
function newsMonth(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function CompanyView({ data }: { data: CompanyData }) {
  return (
    <div className="space-y-6 text-sm">
      <section>
        <Subheading>What they do</Subheading>
        {data.whatTheyDo ? (
          <p>
            {data.whatTheyDo.text} <SourceLinks sources={data.whatTheyDo.sources} />
          </p>
        ) : (
          <Empty>We couldn&rsquo;t find a reliable description of what they do.</Empty>
        )}
      </section>
      <section>
        <Subheading>Recent news</Subheading>
        {data.news.length > 0 ? (
          <ul className="space-y-3">
            {data.news.map((item) => (
              <li key={item.sources[0]?.url ?? item.headline}>
                <p>
                  <span className="text-muted-foreground">{newsMonth(item.date)} ·</span> {item.headline}{" "}
                  <SourceLinks sources={item.sources} />
                </p>
                <p className="text-xs text-muted-foreground">How this might come up: {item.howItMightComeUp}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>We didn&rsquo;t find any news about them from the last 6 months.</Empty>
        )}
      </section>
      <section>
        <Subheading>What they say they value</Subheading>
        {data.values.length > 0 ? (
          <ul className="space-y-1">
            {data.values.map((value, i) => (
              <li key={i}>
                &ldquo;{value.text}&rdquo; <SourceLinks sources={value.sources} label="From their site" />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>We couldn&rsquo;t find what they value on their own site.</Empty>
        )}
      </section>
    </div>
  );
}

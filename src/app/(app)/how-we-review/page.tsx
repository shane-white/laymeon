import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { GUIDE_SECTIONS, type GuideItem } from "@/lib/resume-review/guide";
import { CHECK_SOURCES, SOURCES, type SourceId } from "@/lib/resume-review/sources";

export const metadata: Metadata = {
  title: "How we review resumes",
  description: "What LayMeOn's resume review checks for, and why.",
};

/** The sources behind a group of checks, once each, in the order they're listed. */
function sourcesFor(items: GuideItem[]): SourceId[] {
  return [...new Set(items.flatMap((i) => i.checks.flatMap((c) => CHECK_SOURCES[c] ?? [])))];
}

export default function HowWeReviewPage() {
  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-6 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">How we review resumes</h1>
          <p className="text-sm text-muted-foreground">
            The resume review looks at your resume the way screening software and recruiters do, without a
            particular job in mind. Some checks are rules that always give the same answer; others are Claude&apos;s
            judgment. Each finding is marked <strong>Good</strong>, <strong>Could improve</strong> or{" "}
            <strong>Fix this</strong>. Suggested rewrites never add anything your resume doesn&apos;t say: they
            leave [placeholders] for details only you know, so use them only if they&apos;re true.
          </p>
          <nav aria-label="Sections" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {GUIDE_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                {s.title}
              </a>
            ))}
          </nav>
        </header>

        {GUIDE_SECTIONS.map((section) => {
          const sources = sourcesFor(section.items);
          return (
            <section key={section.id} id={section.id} className="flex scroll-mt-6 flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">{section.title}</h2>
                <p className="text-sm text-muted-foreground">{section.intro}</p>
              </div>
              <dl className="flex flex-col gap-4">
                {section.items.map((item) => (
                  <div key={item.title} className="flex flex-col gap-1">
                    <dt className="text-sm font-medium">{item.title}</dt>
                    <dd className="text-sm leading-relaxed">{item.text}</dd>
                  </div>
                ))}
              </dl>
              {sources.length > 0 && (
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Read further</p>
                  <ul className="flex flex-col gap-2">
                    {sources.map((id) => {
                      const source = SOURCES[id];
                      return (
                        <li key={id} className="text-sm">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                          >
                            {source.title}
                            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                          <span className="text-muted-foreground">
                            {" "}
                            · {source.publisher}
                            {"year" in source && source.year ? `, ${source.year}` : ""}
                          </span>
                          <p className="text-muted-foreground">{source.shows}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>
          );
        })}
      </article>
    </div>
  );
}
